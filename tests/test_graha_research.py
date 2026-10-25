"""Graha checklist tests use only empty or explicitly synthetic entries."""

from __future__ import annotations

import copy
import json
from pathlib import Path

import pytest

from jyotisha_ai.cli import main
from jyotisha_ai.knowledge.graha_research import GRAHAS, graha_report


PROJECT_ROOT = Path(__file__).resolve().parents[1]


def _fixture(tmp_path: Path) -> tuple[Path, dict]:
    for directory in ("configs", "data/knowledge", "data/manifests"):
        (tmp_path / directory).mkdir(parents=True, exist_ok=True)
    for relative in (
        "configs/project.toml", "data/knowledge/inventory.json",
        "data/knowledge/graha_research.schema.json", "data/manifests/sources.jsonl",
    ):
        (tmp_path / relative).write_bytes((PROJECT_ROOT / relative).read_bytes())
    document = json.loads((PROJECT_ROOT / "data/knowledge/graha_research.json").read_text(encoding="utf-8"))
    return tmp_path, document


def _write(root: Path, document: dict) -> None:
    (root / "data/knowledge/graha_research.json").write_text(json.dumps(document, ensure_ascii=False), encoding="utf-8")


def test_nine_placeholders_are_empty_and_reproducible() -> None:
    document = json.loads((PROJECT_ROOT / "data/knowledge/graha_research.json").read_text(encoding="utf-8"))
    assert [entry["graha_id"] for entry in document["grahas"]] == list(GRAHAS)
    assert all(entry["review_status"] == "not_started" for entry in document["grahas"])
    assert all(all(value is None for value in entry["source_reference"].values()) for entry in document["grahas"])
    first = graha_report(PROJECT_ROOT)
    assert first == graha_report(PROJECT_ROOT)
    assert first["grahas"] == 9
    assert first["by_review_status"] == {"not_started": 9}
    assert first["errors"] == []
    inventory = json.loads((PROJECT_ROOT / "data/knowledge/inventory.json").read_text(encoding="utf-8"))
    assert next(area for area in inventory["areas"] if area["area_id"] == "graha_significations")["status"] == "not_researched"


def test_duplicate_and_missing_grahas(tmp_path: Path) -> None:
    root, document = _fixture(tmp_path)
    document["grahas"][1] = copy.deepcopy(document["grahas"][0])
    _write(root, document)
    assert any("duplicate graha_id" in error for error in graha_report(root)["errors"])
    assert any("missing Graha placeholders" in error for error in graha_report(root)["errors"])
    document["grahas"].pop()
    _write(root, document)
    assert any("expected 9 Graha entries" in error for error in graha_report(root)["errors"])


@pytest.mark.parametrize("field,value,expected", [
    ("review_status", "verified", "unsupported review_status"),
    ("evidence_type", "invented", "unsupported evidence_type"),
    ("original_sanskrit_term", "Synthetic term", "not_started entry must remain"),
    ("source_reference", {"source_id": None}, "source_reference must contain"),
    ("display_name", "Invented", "unknown or mismatched Graha identifier"),
])
def test_invalid_entry(tmp_path: Path, field: str, value: object, expected: str) -> None:
    root, document = _fixture(tmp_path)
    document["grahas"][0][field] = value
    _write(root, document)
    assert any(expected in error for error in graha_report(root)["errors"])


def test_citation_and_review_gate(tmp_path: Path) -> None:
    root, document = _fixture(tmp_path)
    entry = document["grahas"][0]
    entry["review_status"] = "source_identified"
    entry["source_reference"]["source_id"] = "missing.source"
    _write(root, document)
    assert any("not in the source catalog" in error for error in graha_report(root)["errors"])
    entry["source_reference"]["source_id"] = "bphs-vol1-welib-13609f1a"
    entry["review_status"] = "needs_review"
    entry["evidence_type"] = "original_text"
    entry["original_sanskrit_term"] = "Synthetic test term"
    _write(root, document)
    assert any("source-derived Graha text requires" in error for error in graha_report(root)["errors"])
    entry["original_sanskrit_term"] = None
    entry["evidence_type"] = None
    entry["review_status"] = "reviewed"
    _write(root, document)
    assert any("documented training rights" in error for error in graha_report(root)["errors"])


def test_synthetic_unicode_draft_is_preserved(tmp_path: Path) -> None:
    root, document = _fixture(tmp_path)
    synthetic_source = {
        "schema_version": "1.1.0", "source_id": "synthetic.test_source",
        "title": "Self-authored synthetic test source", "source_type": "other",
        "languages": ["en"], "original_language": "en", "file_format": "txt",
        "provenance": {"acquired_from": "Self-authored test fixture", "acquired_at": "2026-10-25", "local_path": None, "sha256": None},
        "permission": {"status": "approved", "allowed_uses": ["catalog", "training"], "reviewed_at": "2026-10-25", "evidence_reference": "synthetic:test", "license": "CC0-1.0"},
        "processing": {"status": "cataloged", "errors": [], "review_notes": "Synthetic fixture"},
    }
    manifest = root / "data/manifests/sources.jsonl"
    manifest.write_text(manifest.read_text(encoding="utf-8") + json.dumps(synthetic_source) + "\n", encoding="utf-8")
    entry = document["grahas"][0]
    entry["review_status"] = "needs_review"
    entry["source_reference"]["source_id"] = "synthetic.test_source"
    entry["evidence_type"] = "reviewer_explanation"
    entry["original_sanskrit_term"] = "परीक्षण"
    entry["sanskrit_transliteration"] = "parīkṣaṇa"
    entry["english_explanation"] = "Synthetic test wording only"
    entry["telugu_explanation"] = "పరీక్ష వాక్యం"
    _write(root, document)
    assert graha_report(root)["errors"] == []
    reloaded = json.loads((root / "data/knowledge/graha_research.json").read_text(encoding="utf-8"))
    assert reloaded["grahas"][0]["telugu_explanation"] == "పరీక్ష వాక్యం"


def test_cli_graha_commands(capsys: pytest.CaptureFixture[str]) -> None:
    assert main(["knowledge", "grahas", "validate"]) == 0
    assert main(["knowledge", "grahas", "report"]) == 0
    output = capsys.readouterr().out
    assert '"grahas": 9' in output
    assert '"not_started": 9' in output
