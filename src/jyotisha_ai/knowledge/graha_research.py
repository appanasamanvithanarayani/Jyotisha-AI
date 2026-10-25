"""Validation for empty or human-researched Graha checklist entries."""

from __future__ import annotations

import json
import tomllib
from collections import Counter
from pathlib import Path
from typing import Any

from jyotisha_ai.ingestion.manifest import ManifestError, eligible_for_training, load_manifest


GRAHAS = {
    "surya": "Surya", "chandra": "Chandra", "mangala": "Mangala",
    "budha": "Budha", "guru": "Guru", "shukra": "Shukra",
    "shani": "Shani", "rahu": "Rahu", "ketu": "Ketu",
}
EVIDENCE_TYPES = {None, "original_text", "translation", "commentary", "reviewer_explanation"}
STATUSES = {"not_started", "source_identified", "drafted", "needs_review", "reviewed", "blocked"}
TEXT_FIELDS = ("original_sanskrit_term", "sanskrit_transliteration", "english_explanation", "telugu_explanation")
REFERENCE_FIELDS = ("source_id", "edition", "chapter", "page", "verse")
REQUIRED = {"graha_id", "display_name", *TEXT_FIELDS, "source_reference", "evidence_type", "conditions", "qualifications", "review_status", "review_notes"}


def _text_or_null(value: Any, field: str) -> None:
    if value is not None and (not isinstance(value, str) or not value.strip() or "\ufffd" in value):
        raise ValueError(f"{field} must be nonempty Unicode text or null")


def _validate_entry(entry: Any, sources: dict[str, dict[str, Any]]) -> None:
    if not isinstance(entry, dict) or set(entry) != REQUIRED:
        raise ValueError("entry fields do not match checklist schema")
    graha_id = entry["graha_id"]
    if graha_id not in GRAHAS or entry["display_name"] != GRAHAS[graha_id]:
        raise ValueError("unknown or mismatched Graha identifier")
    for field in TEXT_FIELDS:
        _text_or_null(entry[field], field)
    _text_or_null(entry["review_notes"], "review_notes")
    reference = entry["source_reference"]
    if not isinstance(reference, dict) or set(reference) != set(REFERENCE_FIELDS):
        raise ValueError("source_reference must contain source_id, edition, chapter, page, verse")
    for field in REFERENCE_FIELDS:
        _text_or_null(reference[field], f"source_reference.{field}")
    if reference["source_id"] is not None and reference["source_id"] not in sources:
        raise ValueError("source_reference.source_id is not in the source catalog")
    if any(reference[field] is not None for field in REFERENCE_FIELDS[1:]) and reference["source_id"] is None:
        raise ValueError("source locator or edition requires source_id")
    if entry["evidence_type"] not in EVIDENCE_TYPES:
        raise ValueError("unsupported evidence_type")
    if entry["review_status"] not in STATUSES:
        raise ValueError("unsupported review_status")
    for field in ("conditions", "qualifications"):
        values = entry[field]
        if not isinstance(values, list) or any(not isinstance(item, str) or not item.strip() or "\ufffd" in item for item in values):
            raise ValueError(f"{field} must be an array of nonempty Unicode text")
    has_content = any(entry[field] is not None for field in TEXT_FIELDS) or bool(entry["conditions"] or entry["qualifications"])
    if entry["review_status"] == "not_started":
        if has_content or any(reference.values()) or entry["evidence_type"] is not None:
            raise ValueError("not_started entry must remain an empty research placeholder")
    if entry["review_status"] in {"source_identified", "drafted", "needs_review", "reviewed"} and reference["source_id"] is None:
        raise ValueError("research status requires source_id")
    if has_content and (reference["source_id"] is None or entry["evidence_type"] is None):
        raise ValueError("research content requires source_id and evidence_type")
    if has_content and entry["evidence_type"] in {"original_text", "translation", "commentary"} and not eligible_for_training(sources[reference["source_id"]]):
        raise ValueError("source-derived Graha text requires documented training rights")
    if entry["review_status"] == "reviewed":
        if not eligible_for_training(sources[reference["source_id"]]):
            raise ValueError("reviewed Graha entry requires documented training rights")
        if not all(entry[field] is not None for field in TEXT_FIELDS):
            raise ValueError("reviewed Graha entry requires all four language fields")
        if reference["edition"] is None or not any(reference[field] is not None for field in ("chapter", "page", "verse")):
            raise ValueError("reviewed Graha entry requires edition and precise locator")
        if entry["review_notes"] is None:
            raise ValueError("reviewed Graha entry requires review_notes")


def graha_report(root: Path, *, path: Path | None = None) -> dict[str, Any]:
    """Validate exact nine-entry coverage and return a deterministic report."""
    with (root / "configs/project.toml").open("rb") as handle:
        config = tomllib.load(handle)
    version = config["versions"]["graha_research_checklist"]
    errors: list[str] = []
    schema = json.loads((root / "data/knowledge/graha_research.schema.json").read_text(encoding="utf-8"))
    if schema.get("properties", {}).get("checklist_version", {}).get("const") != version:
        errors.append("checklist schema version does not match project configuration")
    inventory = json.loads((root / "data/knowledge/inventory.json").read_text(encoding="utf-8"))
    area = next((item for item in inventory["areas"] if item.get("area_id") == "graha_significations"), None)
    if area is None:
        errors.append("Graha area_id is absent from the knowledge inventory")
    try:
        sources, _ = load_manifest(root / "data/manifests/sources.jsonl", config["versions"]["source_manifest_schema"])
    except ManifestError as exc:
        sources = {}
        errors.append(f"source catalog: {exc}")
    try:
        document = json.loads((path or root / "data/knowledge/graha_research.json").read_text(encoding="utf-8"))
    except (OSError, UnicodeError, ValueError) as exc:
        return {"checklist_version": version, "area_id": "graha_significations", "grahas": 0, "by_review_status": {}, "errors": [f"cannot read Graha checklist: {exc}"]}
    if not isinstance(document, dict) or set(document) != {"checklist_version", "area_id", "grahas"}:
        errors.append("checklist must contain only checklist_version, area_id, grahas")
        entries: list[Any] = []
    else:
        if document["checklist_version"] != version:
            errors.append("unsupported checklist_version")
        if document["area_id"] != "graha_significations":
            errors.append("checklist area_id does not match Graha inventory area")
        entries = document["grahas"] if isinstance(document["grahas"], list) else []
        if not isinstance(document["grahas"], list):
            errors.append("grahas must be an array")
    seen: set[str] = set()
    valid: list[dict[str, Any]] = []
    for index, entry in enumerate(entries, 1):
        try:
            _validate_entry(entry, sources)
            if entry["graha_id"] in seen:
                raise ValueError(f"duplicate graha_id: {entry['graha_id']}")
            seen.add(entry["graha_id"])
            valid.append(entry)
        except (ValueError, TypeError, KeyError) as exc:
            errors.append(f"graha {index}: {exc}")
    missing = sorted(set(GRAHAS) - seen)
    if missing:
        errors.append(f"missing Graha placeholders: {', '.join(missing)}")
    if len(entries) != len(GRAHAS):
        errors.append(f"expected {len(GRAHAS)} Graha entries, found {len(entries)}")
    return {
        "checklist_version": version,
        "area_id": "graha_significations",
        "grahas": len(entries),
        "by_review_status": dict(sorted(Counter(entry["review_status"] for entry in valid).items())),
        "errors": sorted(errors),
    }
