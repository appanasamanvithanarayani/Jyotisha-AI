"""Validation and loading of private source catalog records."""

from __future__ import annotations

import json
import re
from datetime import date
from pathlib import Path
from typing import Any


class ManifestError(ValueError):
    """A source record is invalid or cannot be safely processed."""


SOURCE_ID = re.compile(r"^[a-z0-9][a-z0-9._-]+$")
SHA256 = re.compile(r"^[a-f0-9]{64}$")
LANGUAGE = re.compile(r"^[a-z]{2,3}(?:-[A-Za-z]{4})?(?:-[A-Z]{2})?$")
REQUIRED = {"schema_version", "source_id", "title", "source_type", "languages", "original_language", "file_format", "provenance", "permission", "processing"}
SOURCE_TYPES = {"classical_text", "translation", "commentary", "textbook", "article", "other"}
PERMISSION_STATUSES = {"approved", "public_domain", "restricted", "pending_review", "rejected"}
PROCESSING_STATUSES = {"cataloged", "blocked", "ready", "processing", "processed", "failed"}
USES = {"catalog", "ocr", "research", "training", "redistribution"}


def _date(value: Any, field: str, *, nullable: bool = False) -> None:
    if value is None and nullable:
        return
    if not isinstance(value, str):
        raise ManifestError(f"{field} must be an ISO date")
    try:
        if date.fromisoformat(value).isoformat() != value:
            raise ValueError
    except ValueError as exc:
        raise ManifestError(f"{field} must be an ISO date") from exc


def _text(value: Any, field: str, *, nullable: bool = False) -> None:
    if value is None and nullable:
        return
    if not isinstance(value, str) or not value.strip():
        raise ManifestError(f"{field} must be nonempty text")


def validate_record(record: Any, schema_version: str = "1.1.0") -> list[str]:
    """Validate structure; return nonfatal catalog warnings."""
    if not isinstance(record, dict):
        raise ManifestError("record must be a JSON object")
    missing = REQUIRED - record.keys()
    if missing:
        raise ManifestError(f"missing fields: {', '.join(sorted(missing))}")
    if record["schema_version"] != schema_version:
        raise ManifestError(f"unsupported schema_version: {record['schema_version']}")
    source_id = record["source_id"]
    if not isinstance(source_id, str) or not SOURCE_ID.fullmatch(source_id):
        raise ManifestError("invalid source_id")
    _text(record["title"], "title")
    if record["source_type"] not in SOURCE_TYPES:
        raise ManifestError("invalid source_type")
    if "authors" in record and (not isinstance(record["authors"], list) or any(not isinstance(a, str) or not a.strip() for a in record["authors"])):
        raise ManifestError("authors must be nonempty strings")
    if "edition" in record and record["edition"] is not None:
        _text(record["edition"], "edition")
    if "publication_year" in record and record["publication_year"] is not None and (type(record["publication_year"]) is not int or record["publication_year"] < 1):
        raise ManifestError("invalid publication_year")
    languages = record["languages"]
    if not isinstance(languages, list) or not languages or any(not isinstance(x, str) or not LANGUAGE.fullmatch(x) for x in languages) or len(set(languages)) != len(languages):
        raise ManifestError("languages must contain unique BCP 47 tags")
    if record["original_language"] not in languages:
        raise ManifestError("original_language must be in languages")
    if record["file_format"] not in {"txt", "pdf"}:
        raise ManifestError("unsupported file_format")
    provenance = record["provenance"]
    if not isinstance(provenance, dict):
        raise ManifestError("provenance must be an object")
    _text(provenance.get("acquired_from"), "provenance.acquired_from")
    _date(provenance.get("acquired_at"), "provenance.acquired_at", nullable=True)
    path = provenance.get("local_path")
    if path is not None and (not isinstance(path, str) or not path.strip()):
        raise ManifestError("provenance.local_path must be a path or null")
    digest = provenance.get("sha256")
    if digest is not None and (not isinstance(digest, str) or not SHA256.fullmatch(digest)):
        raise ManifestError("provenance.sha256 must be lowercase hex")
    permission = record["permission"]
    if not isinstance(permission, dict) or permission.get("status") not in PERMISSION_STATUSES:
        raise ManifestError("invalid permission.status")
    uses = permission.get("allowed_uses")
    if not isinstance(uses, list) or any(use not in USES for use in uses) or len(set(uses)) != len(uses):
        raise ManifestError("invalid permission.allowed_uses")
    _date(permission.get("reviewed_at"), "permission.reviewed_at", nullable=True)
    for key in ("license", "evidence_reference", "jurisdiction", "rights_holder"):
        if permission.get(key) is not None:
            _text(permission[key], f"permission.{key}")
    processing = record["processing"]
    if not isinstance(processing, dict) or processing.get("status") not in PROCESSING_STATUSES:
        raise ManifestError("invalid processing.status")
    if "errors" not in processing or "review_notes" not in processing:
        raise ManifestError("processing.errors and processing.review_notes are required")
    if processing["review_notes"] is not None and not isinstance(processing["review_notes"], str):
        raise ManifestError("processing.review_notes must be text or null")
    errors = processing["errors"]
    if not isinstance(errors, list) or any(not isinstance(x, str) for x in errors):
        raise ManifestError("processing.errors must be a list of strings")
    warnings = []
    if not eligible_for_training(record):
        warnings.append("training permission is not documented; source is blocked")
    if path is None:
        warnings.append("local source path is missing")
    if digest is None:
        warnings.append("source checksum is missing")
    return warnings


def eligible_for_training(record: dict[str, Any]) -> bool:
    """Require affirmative training scope and recorded rights review."""
    permission = record["permission"]
    return (
        permission.get("status") in {"approved", "public_domain"}
        and "training" in permission.get("allowed_uses", [])
        and bool(permission.get("reviewed_at"))
        and bool(permission.get("evidence_reference"))
        and bool(permission.get("license"))
        and (permission.get("status") != "public_domain" or bool(permission.get("jurisdiction")))
    )


def load_manifest(path: Path, schema_version: str = "1.1.0") -> tuple[dict[str, dict[str, Any]], list[str]]:
    """Load a UTF-8 JSONL catalog, rejecting malformed and duplicate records."""
    records: dict[str, dict[str, Any]] = {}
    warnings: list[str] = []
    try:
        lines = path.read_text(encoding="utf-8-sig").splitlines()
    except (OSError, UnicodeError) as exc:
        raise ManifestError(f"cannot read manifest: {exc}") from exc
    for number, line in enumerate(lines, 1):
        if not line.strip():
            continue
        try:
            record = json.loads(line)
            record_warnings = validate_record(record, schema_version)
        except (ValueError, TypeError) as exc:
            raise ManifestError(f"line {number}: {exc}") from exc
        source_id = record["source_id"]
        if source_id in records:
            raise ManifestError(f"line {number}: duplicate source_id {source_id}")
        records[source_id] = record
        warnings.extend(f"{source_id}: {message}" for message in record_warnings)
    return records, warnings


def record_processing_result(path: Path, source_id: str, *, status: str, error: str | None = None) -> None:
    """Persist the latest processing result to the private catalog."""
    if status not in {"processed", "failed", "blocked"}:
        raise ManifestError("invalid processing result")
    records, _ = load_manifest(path)
    if source_id not in records:
        raise ManifestError(f"unknown source_id: {source_id}")
    processing = records[source_id]["processing"]
    processing["status"] = status
    processing["errors"] = [error] if error else []
    serialized = "".join(json.dumps(record, ensure_ascii=False, sort_keys=True) + "\n" for record in records.values())
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_text(serialized, encoding="utf-8", newline="\n")
    temporary.replace(path)
