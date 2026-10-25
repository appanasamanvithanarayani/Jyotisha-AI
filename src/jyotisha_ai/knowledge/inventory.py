"""Versioned research inventory; it contains plans, not verified Jyotisha rules."""

from __future__ import annotations

import json
import re
import tomllib
from collections import Counter
from pathlib import Path
from typing import Any

from jyotisha_ai.knowledge.catalog import load_knowledge


ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9._-]+$")
STATUSES = {"not_researched", "sources_identified", "evidence_collected", "drafted", "needs_review", "reviewed", "blocked"}
KINDS = {"astronomical_calculation", "classical_textual_statement", "traditional_interpretation", "modern_explanation", "project_workflow_note"}
REQUIRED = {"area_id", "title", "taxonomy_categories", "knowledge_kinds", "scope", "evidence_needed", "review_requirements", "status", "linked_knowledge_ids"}


def _nonempty(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _strings(value: Any, field: str, *, allow_empty: bool = False) -> list[str]:
    if not isinstance(value, list) or (not allow_empty and not value) or any(not _nonempty(item) for item in value):
        raise ValueError(f"{field} must contain nonempty strings")
    return value


def _validate_area(area: Any, taxonomy: dict[str, Any], knowledge: dict[str, dict[str, Any]]) -> None:
    if not isinstance(area, dict):
        raise ValueError("area must be an object")
    missing = REQUIRED - area.keys()
    if missing:
        raise ValueError(f"missing fields: {', '.join(sorted(missing))}")
    unknown = area.keys() - REQUIRED
    if unknown:
        raise ValueError(f"unknown fields: {', '.join(sorted(unknown))}")
    if not _nonempty(area["area_id"]) or not ID_PATTERN.fullmatch(area["area_id"]):
        raise ValueError("invalid area_id")
    for field in ("title", "scope"):
        if not _nonempty(area[field]):
            raise ValueError(f"{field} must be nonempty")
    categories = _strings(area["taxonomy_categories"], "taxonomy_categories")
    if len(categories) != len(set(categories)) or any(category not in taxonomy["categories"] for category in categories):
        raise ValueError("taxonomy_categories must be unique recognized categories")
    kinds = _strings(area["knowledge_kinds"], "knowledge_kinds")
    if len(kinds) != len(set(kinds)) or any(kind not in KINDS for kind in kinds):
        raise ValueError("knowledge_kinds must be unique recognized kinds")
    _strings(area["evidence_needed"], "evidence_needed")
    _strings(area["review_requirements"], "review_requirements")
    if area["status"] not in STATUSES:
        raise ValueError("unsupported status")
    linked = _strings(area["linked_knowledge_ids"], "linked_knowledge_ids", allow_empty=True)
    if len(linked) != len(set(linked)):
        raise ValueError("linked_knowledge_ids must be unique")
    for knowledge_id in linked:
        if knowledge_id not in knowledge:
            raise ValueError(f"unknown linked knowledge_id: {knowledge_id}")
    if area["status"] == "reviewed" and (not linked or any(knowledge[item]["review_status"] != "reviewed" for item in linked)):
        raise ValueError("reviewed inventory area requires linked reviewed knowledge records")


def inventory_report(root: Path, *, path: Path | None = None) -> dict[str, Any]:
    """Validate the full inventory and return a stable, timestamp-free report."""
    errors: list[str] = []
    with (root / "configs/project.toml").open("rb") as handle:
        config = tomllib.load(handle)
    expected_version = config["versions"]["knowledge_inventory"]
    taxonomy = json.loads((root / "configs/knowledge_taxonomy.json").read_text(encoding="utf-8"))
    schema = json.loads((root / "data/knowledge/inventory.schema.json").read_text(encoding="utf-8"))
    if schema.get("properties", {}).get("inventory_version", {}).get("const") != expected_version:
        errors.append("inventory schema version does not match project configuration")
    try:
        inventory = json.loads((path or root / "data/knowledge/inventory.json").read_text(encoding="utf-8"))
    except (OSError, UnicodeError, ValueError) as exc:
        return {"inventory_version": expected_version, "areas": 0, "by_status": {}, "by_knowledge_kind": {}, "linked_knowledge_records": 0, "errors": [f"cannot read inventory: {exc}"]}
    if not isinstance(inventory, dict) or set(inventory) != {"inventory_version", "areas"}:
        errors.append("inventory requires only inventory_version and areas")
        areas: list[Any] = []
    else:
        if inventory["inventory_version"] != expected_version:
            errors.append("unsupported inventory_version")
        areas = inventory["areas"] if isinstance(inventory["areas"], list) else []
        if not isinstance(inventory["areas"], list):
            errors.append("areas must be an array")
    knowledge, knowledge_report = load_knowledge(root)
    if knowledge_report["errors"]:
        errors.append("knowledge catalog has validation errors")
    seen: set[str] = set()
    valid: list[dict[str, Any]] = []
    for index, area in enumerate(areas, 1):
        try:
            _validate_area(area, taxonomy, knowledge)
            if area["area_id"] in seen:
                raise ValueError(f"duplicate area_id: {area['area_id']}")
            seen.add(area["area_id"])
            valid.append(area)
        except (ValueError, TypeError, KeyError) as exc:
            errors.append(f"area {index}: {exc}")
    return {
        "inventory_version": expected_version,
        "areas": len(areas),
        "by_status": dict(sorted(Counter(area["status"] for area in valid).items())),
        "by_knowledge_kind": dict(sorted(Counter(kind for area in valid for kind in area["knowledge_kinds"]).items())),
        "linked_knowledge_records": len({knowledge_id for area in valid for knowledge_id in area["linked_knowledge_ids"]}),
        "errors": sorted(errors),
    }
