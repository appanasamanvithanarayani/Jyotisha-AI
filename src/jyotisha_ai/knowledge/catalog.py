"""Deterministic validation, reporting, and literal search for knowledge records."""

from __future__ import annotations

import json
import re
import tomllib
from collections import Counter
from datetime import date, datetime
from pathlib import Path
from typing import Any

from jyotisha_ai.ingestion.manifest import ManifestError, eligible_for_training, load_manifest


ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9._-]+$")
REQUIRED = {"record_version", "knowledge_id", "concept", "concept_category", "tradition", "evidence_type", "review_status", "source_references"}
OPTIONAL_TEXT = {"tradition_name", "canonical_term", "sanskrit_devanagari", "sanskrit_transliteration", "english_explanation", "telugu_explanation", "rule_statement", "reviewer_id", "review_notes"}
EVIDENCE_TYPES = {"taxonomy_placeholder", "original_text", "translation", "commentary", "reviewer_explanation", "model_hypothesis"}
REVIEW_STATUSES = {"needs_review", "reviewed", "disputed", "rejected"}
LOCATORS = {"chapter", "page", "verse", "passage_id", "locator_note"}
SEARCH_FIELDS = ("knowledge_id", "concept", "canonical_term", "sanskrit_devanagari", "sanskrit_transliteration", "english_explanation", "telugu_explanation", "rule_statement")


def _nonempty(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _date(value: Any, label: str) -> None:
    if value is None:
        return
    if not isinstance(value, str):
        raise ValueError(f"{label} must be an ISO date")
    try:
        if date.fromisoformat(value).isoformat() != value:
            raise ValueError
    except ValueError as exc:
        raise ValueError(f"{label} must be an ISO date") from exc


def _timestamp(value: Any, label: str) -> None:
    if value is None:
        return
    if not isinstance(value, str):
        raise ValueError(f"{label} must be an ISO timestamp with timezone")
    try:
        parsed = datetime.fromisoformat(value)
        if parsed.tzinfo is None or parsed.utcoffset() is None:
            raise ValueError
    except ValueError as exc:
        raise ValueError(f"{label} must be an ISO timestamp with timezone") from exc


def _read_context(root: Path) -> tuple[dict[str, Any], dict[str, Any]]:
    with (root / "configs/project.toml").open("rb") as handle:
        config = tomllib.load(handle)
    taxonomy = json.loads((root / "configs/knowledge_taxonomy.json").read_text(encoding="utf-8"))
    if taxonomy.get("taxonomy_version") != config["versions"]["taxonomy"]:
        raise ValueError("taxonomy version does not match project configuration")
    return config, taxonomy


def validate_record(record: Any, *, version: str, taxonomy: dict[str, Any], sources: dict[str, dict[str, Any]]) -> list[str]:
    """Validate a record and return review warnings; errors raise ValueError."""
    if not isinstance(record, dict):
        raise ValueError("record must be an object")
    missing = REQUIRED - record.keys()
    if missing:
        raise ValueError(f"missing required fields: {', '.join(sorted(missing))}")
    allowed = REQUIRED | OPTIONAL_TEXT | {"conditions", "exceptions", "examples", "conflicts_with", "reviewed_at", "created_at", "updated_at"}
    unknown = record.keys() - allowed
    if unknown:
        raise ValueError(f"unknown fields: {', '.join(sorted(unknown))}")
    if record["record_version"] != version:
        raise ValueError("unsupported record_version")
    if not _nonempty(record["knowledge_id"]) or not ID_PATTERN.fullmatch(record["knowledge_id"]):
        raise ValueError("invalid knowledge_id")
    if not _nonempty(record["concept"]):
        raise ValueError("concept must be nonempty")
    if record["concept_category"] not in taxonomy["categories"]:
        raise ValueError("unsupported concept_category")
    if record["tradition"] not in taxonomy["traditions"]:
        raise ValueError("unsupported tradition")
    if record["tradition"] == "other_identified" and not _nonempty(record.get("tradition_name")):
        raise ValueError("other_identified tradition requires tradition_name")
    if record["evidence_type"] not in EVIDENCE_TYPES:
        raise ValueError("unsupported evidence_type")
    if record["review_status"] not in REVIEW_STATUSES:
        raise ValueError("unsupported review_status")
    for field in OPTIONAL_TEXT:
        if field in record and record[field] is not None and not _nonempty(record[field]):
            raise ValueError(f"{field} must be nonempty text or null")
    _date(record.get("reviewed_at"), "reviewed_at")
    _timestamp(record.get("created_at"), "created_at")
    _timestamp(record.get("updated_at"), "updated_at")
    if record.get("created_at") and record.get("updated_at") and datetime.fromisoformat(record["created_at"]) > datetime.fromisoformat(record["updated_at"]):
        raise ValueError("updated_at cannot precede created_at")
    warnings: list[str] = []
    references = record["source_references"]
    if not isinstance(references, list):
        raise ValueError("source_references must be an array")
    for index, reference in enumerate(references):
        if not isinstance(reference, dict) or not _nonempty(reference.get("source_id")):
            raise ValueError(f"source_references[{index}] requires source_id")
        if set(reference) - ({"source_id", "edition"} | LOCATORS):
            raise ValueError(f"source_references[{index}] has unknown fields")
        for field in {"edition"} | LOCATORS:
            if field in reference and reference[field] is not None and not _nonempty(reference[field]):
                raise ValueError(f"source_references[{index}].{field} must be text or null")
        if reference["source_id"] not in sources:
            raise ValueError(f"source_references[{index}] has unknown source_id")
        if not any(_nonempty(reference.get(field)) for field in LOCATORS):
            warnings.append(f"source_references[{index}] has no precise locator")
        if not eligible_for_training(sources[reference["source_id"]]):
            if record["evidence_type"] in {"original_text", "translation", "commentary"}:
                raise ValueError(f"source_references[{index}] lacks documented training rights for source-derived text")
            warnings.append(f"source_references[{index}] cites a source with pending or restricted training rights")
    for field in ("conditions", "exceptions"):
        values = record.get(field, [])
        if not isinstance(values, list) or any(not _nonempty(value) for value in values):
            raise ValueError(f"{field} must be an array of nonempty strings")
    examples = record.get("examples", [])
    if not isinstance(examples, list):
        raise ValueError("examples must be an array")
    for index, example in enumerate(examples):
        if not isinstance(example, dict) or set(example) - {"text", "kind", "source_reference_index"} or not _nonempty(example.get("text")) or example.get("kind") not in {"reviewer_illustration", "source_example"}:
            raise ValueError(f"examples[{index}] requires labeled text and kind")
        ref_index = example.get("source_reference_index")
        if ref_index is not None and (type(ref_index) is not int or not 0 <= ref_index < len(references)):
            raise ValueError(f"examples[{index}] has invalid source_reference_index")
        if example["kind"] == "source_example" and ref_index is None:
            raise ValueError(f"examples[{index}] needs a source_reference_index")
        if example["kind"] == "source_example" and not eligible_for_training(sources[references[ref_index]["source_id"]]):
            raise ValueError(f"examples[{index}] lacks documented training rights for source-derived text")
    conflicts = record.get("conflicts_with", [])
    if not isinstance(conflicts, list) or any(not isinstance(item, str) or not ID_PATTERN.fullmatch(item) for item in conflicts) or len(conflicts) != len(set(conflicts)):
        raise ValueError("conflicts_with must contain unique knowledge IDs")
    if record["knowledge_id"] in conflicts:
        raise ValueError("record cannot conflict with itself")
    if record["review_status"] == "reviewed":
        if not references or not _nonempty(record.get("reviewer_id")) or not record.get("reviewed_at"):
            raise ValueError("reviewed record needs source, reviewer_id and reviewed_at")
        if not all(any(_nonempty(ref.get(field)) for field in LOCATORS) for ref in references):
            raise ValueError("reviewed record needs a precise locator for every source")
        if record["evidence_type"] in {"taxonomy_placeholder", "model_hypothesis"}:
            raise ValueError("placeholder or model hypothesis cannot be reviewed evidence")
    if record.get("rule_statement") and record["review_status"] != "reviewed":
        warnings.append("rule_statement is unverified; do not export as a verified rule")
    if record.get("rule_statement") and not references:
        warnings.append("rule_statement lacks source provenance")
    if record["evidence_type"] == "taxonomy_placeholder" and any(record.get(field) for field in ("rule_statement", "english_explanation", "telugu_explanation", "conditions", "exceptions", "examples", "source_references")):
        raise ValueError("taxonomy_placeholder cannot carry assertions or source content")
    if record["evidence_type"] in {"original_text", "translation", "commentary"} and not references:
        raise ValueError("source-derived evidence requires source_references")
    if not references and record["evidence_type"] != "taxonomy_placeholder":
        warnings.append("missing source provenance")
    if conflicts and record["review_status"] != "disputed":
        warnings.append("conflicts_with is set but review_status is not disputed")
    return warnings


def load_knowledge(root: Path) -> tuple[dict[str, dict[str, Any]], dict[str, Any]]:
    """Load all rows; report invalid rows without hiding valid ones."""
    config, taxonomy = _read_context(root)
    errors: list[str] = []
    warnings: list[str] = []
    try:
        sources, _ = load_manifest(root / "data/manifests/sources.jsonl", config["versions"]["source_manifest_schema"])
    except ManifestError as exc:
        sources = {}
        errors.append(f"source catalog: {exc}")
    records: dict[str, dict[str, Any]] = {}
    path = root / "data/knowledge/records.jsonl"
    try:
        lines = path.read_text(encoding="utf-8-sig").splitlines()
    except (OSError, UnicodeError) as exc:
        return {}, {"records": 0, "errors": [f"cannot read knowledge catalog: {exc}"], "warnings": [], "conflict_pairs": []}
    for line_number, line in enumerate(lines, 1):
        if not line.strip():
            continue
        try:
            record = json.loads(line)
            row_warnings = validate_record(record, version=config["versions"]["knowledge_schema"], taxonomy=taxonomy, sources=sources)
            knowledge_id = record["knowledge_id"]
            if knowledge_id in records:
                raise ValueError(f"duplicate knowledge_id {knowledge_id}")
            records[knowledge_id] = record
            warnings.extend(f"line {line_number} ({knowledge_id}): {message}" for message in row_warnings)
        except (ValueError, TypeError, KeyError) as exc:
            errors.append(f"line {line_number}: {exc}")
    pairs: set[tuple[str, str]] = set()
    for knowledge_id, record in records.items():
        for target in record.get("conflicts_with", []):
            if target not in records:
                errors.append(f"{knowledge_id}: conflicts_with target {target} is missing")
            else:
                pairs.add(tuple(sorted((knowledge_id, target))))
                if knowledge_id not in records[target].get("conflicts_with", []):
                    warnings.append(f"{knowledge_id}: conflict link to {target} is not reciprocal")
    status_counts = dict(sorted(Counter(row["review_status"] for row in records.values()).items()))
    category_counts = dict(sorted(Counter(row["concept_category"] for row in records.values()).items()))
    report = {
        "knowledge_schema": config["versions"]["knowledge_schema"],
        "taxonomy_version": taxonomy["taxonomy_version"],
        "records": len(records),
        "by_category": category_counts,
        "by_review_status": status_counts,
        "conflict_pairs": [list(pair) for pair in sorted(pairs)],
        "warnings": sorted(warnings),
        "errors": sorted(errors),
    }
    return records, report


def search_records(records: dict[str, dict[str, Any]], term: str) -> list[dict[str, str]]:
    """Literal Unicode casefold search; never emits source text or explanations."""
    needle = term.casefold().strip()
    if not needle:
        raise ValueError("search term must be nonempty")
    results = []
    for record in records.values():
        if any(needle in (record.get(field) or "").casefold() for field in SEARCH_FIELDS):
            results.append({key: record[key] for key in ("knowledge_id", "concept", "concept_category", "review_status", "evidence_type")})
    return sorted(results, key=lambda item: item["knowledge_id"])


def schema_summary(root: Path) -> dict[str, Any]:
    """Return the configured schema and taxonomy scope without reading books."""
    config, taxonomy = _read_context(root)
    schema = json.loads((root / "data/knowledge/knowledge_record.schema.json").read_text(encoding="utf-8"))
    if schema.get("properties", {}).get("record_version", {}).get("const") != config["versions"]["knowledge_schema"]:
        raise ValueError("knowledge schema version does not match project configuration")
    return {
        "knowledge_schema": config["versions"]["knowledge_schema"],
        "taxonomy_version": taxonomy["taxonomy_version"],
        "categories": taxonomy["categories"],
        "traditions": taxonomy["traditions"],
        "numbered_slots": taxonomy["numbered_slots"],
        "record_path": "data/knowledge/records.jsonl",
    }
