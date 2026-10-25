"""Synthetic knowledge fixtures; no astrology assertions or book quotations."""

from __future__ import annotations

import copy
import json
from pathlib import Path

import pytest

from jyotisha_ai.cli import main
from jyotisha_ai.knowledge.catalog import load_knowledge, schema_summary, search_records


PROJECT_ROOT = Path(__file__).resolve().parents[1]


def _source(source_id: str) -> dict:
    return {
        "schema_version": "1.1.0", "source_id": source_id,
        "title": "Self-authored synthetic research fixture", "source_type": "other",
        "languages": ["en"], "original_language": "en", "file_format": "txt",
        "provenance": {"acquired_from": "Test suite", "acquired_at": "2026-10-25", "local_path": None, "sha256": None},
        "permission": {"status": "approved", "allowed_uses": ["catalog", "training"], "reviewed_at": "2026-10-25", "evidence_reference": "self-authored:test", "license": "CC0-1.0"},
        "processing": {"status": "cataloged", "errors": [], "review_notes": "Synthetic fixture"},
    }


def _record(knowledge_id: str = "synthetic.concept") -> dict:
    return {
        "record_version": "1.0.0", "knowledge_id": knowledge_id,
        "concept": "Synthetic concept", "concept_category": "foundation",
        "tradition": "unknown", "evidence_type": "reviewer_explanation",
        "review_status": "needs_review", "source_references": [],
        "canonical_term": "परीक्षण", "sanskrit_devanagari": "परीक्षण",
        "sanskrit_transliteration": "parīkṣaṇa", "english_explanation": "Self-authored test text",
        "telugu_explanation": "పరీక్ష కోసం వాక్యం",
        "review_notes": "Synthetic fixture, not Jyotisha knowledge.",
    }


def _project(tmp_path: Path, records: list[dict]) -> Path:
    for directory in ("configs", "data/knowledge", "data/manifests"):
        (tmp_path / directory).mkdir(parents=True, exist_ok=True)
    for relative in ("configs/project.toml", "configs/knowledge_taxonomy.json", "data/knowledge/knowledge_record.schema.json"):
        (tmp_path / relative).write_bytes((PROJECT_ROOT / relative).read_bytes())
    (tmp_path / "data/manifests/sources.jsonl").write_text(
        "".join(json.dumps(_source(source_id), ensure_ascii=False) + "\n" for source_id in ("synthetic.one", "synthetic.two")), encoding="utf-8"
    )
    (tmp_path / "data/knowledge/records.jsonl").write_text(
        "".join(json.dumps(record, ensure_ascii=False) + "\n" for record in records), encoding="utf-8"
    )
    return tmp_path


def test_schema_and_research_note() -> None:
    summary = schema_summary(PROJECT_ROOT)
    assert summary["knowledge_schema"] == "1.0.0"
    assert summary["numbered_slots"]["nakshatra"]["last"] == 27
    assert summary["numbered_slots"]["varga"]["last"] == 60
    records, report = load_knowledge(PROJECT_ROOT)
    assert report["records"] == 8
    assert records["workflow.ayanamsha_configuration"]["review_status"] == "needs_review"
    researched = {knowledge_id: row for knowledge_id, row in records.items() if knowledge_id != "workflow.ayanamsha_configuration"}
    assert len(researched) == 7
    assert all(row["evidence_type"] == "reviewer_explanation" and row["review_status"] == "needs_review" for row in researched.values())
    assert all(row.get("english_explanation") and row["source_references"][0].get("verse") for row in researched.values())
    assert sum("pending or restricted training rights" in warning for warning in report["warnings"]) == 7
    assert report["errors"] == []


@pytest.mark.parametrize("mutation,expected", [
    ({"knowledge_id": "Bad ID"}, "invalid knowledge_id"),
    ({"review_status": "verified"}, "unsupported review_status"),
    ({"concept_category": "unknown_category"}, "unsupported concept_category"),
])
def test_invalid_fields_are_rejected(tmp_path: Path, mutation: dict, expected: str) -> None:
    record = _record()
    record.update(mutation)
    root = _project(tmp_path, [record])
    report = load_knowledge(root)[1]
    assert any(expected in error for error in report["errors"])


def test_duplicate_identifiers_are_rejected(tmp_path: Path) -> None:
    root = _project(tmp_path, [_record(), _record()])
    assert any("duplicate knowledge_id" in error for error in load_knowledge(root)[1]["errors"])


def test_missing_source_provenance_and_unverified_rule_are_flagged(tmp_path: Path) -> None:
    record = _record()
    record["rule_statement"] = "If invented input A, then invented output B (test only)."
    root = _project(tmp_path, [record])
    report = load_knowledge(root)[1]
    assert report["errors"] == []
    assert any("unverified" in warning for warning in report["warnings"])
    assert any("missing source provenance" in warning for warning in report["warnings"])


def test_unknown_source_and_review_requirements_are_rejected(tmp_path: Path) -> None:
    record = _record()
    record["source_references"] = [{"source_id": "missing.source", "page": "1"}]
    root = _project(tmp_path, [record])
    assert any("unknown source_id" in error for error in load_knowledge(root)[1]["errors"])
    record["source_references"] = [{"source_id": "synthetic.one"}]
    record["review_status"] = "reviewed"
    (root / "data/knowledge/records.jsonl").write_text(json.dumps(record, ensure_ascii=False), encoding="utf-8")
    assert any("reviewed record needs" in error for error in load_knowledge(root)[1]["errors"])


def test_blocked_source_allows_citation_but_not_source_text(tmp_path: Path) -> None:
    record = _record()
    record["source_references"] = [{"source_id": "synthetic.one", "page": "synthetic-page-1"}]
    root = _project(tmp_path, [record])
    manifest = root / "data/manifests/sources.jsonl"
    sources = [json.loads(line) for line in manifest.read_text(encoding="utf-8").splitlines()]
    sources[0]["permission"]["status"] = "pending_review"
    manifest.write_text("".join(json.dumps(source) + "\n" for source in sources), encoding="utf-8")
    report = load_knowledge(root)[1]
    assert report["errors"] == []
    assert any("pending or restricted" in warning for warning in report["warnings"])
    record["evidence_type"] = "original_text"
    (root / "data/knowledge/records.jsonl").write_text(json.dumps(record, ensure_ascii=False), encoding="utf-8")
    assert any("lacks documented training rights" in error for error in load_knowledge(root)[1]["errors"])
    record["evidence_type"] = "reviewer_explanation"
    record["examples"] = [{"text": "Synthetic source example", "kind": "source_example", "source_reference_index": 0}]
    (root / "data/knowledge/records.jsonl").write_text(json.dumps(record, ensure_ascii=False), encoding="utf-8")
    assert any("examples[0] lacks documented training rights" in error for error in load_knowledge(root)[1]["errors"])


def test_unicode_is_preserved_and_searchable(tmp_path: Path) -> None:
    record = _record()
    root = _project(tmp_path, [record])
    records, report = load_knowledge(root)
    assert report["errors"] == []
    assert records["synthetic.concept"]["telugu_explanation"] == "పరీక్ష కోసం వాక్యం"
    assert search_records(records, "పరీక్ష")[0]["knowledge_id"] == "synthetic.concept"
    assert search_records(records, "परीक्षण")[0]["knowledge_id"] == "synthetic.concept"
    assert search_records(records, "PARĪKṢAṆA")[0]["knowledge_id"] == "synthetic.concept"
    assert search_records(records, "self-authored")[0]["knowledge_id"] == "synthetic.concept"
    assert search_records(records, "not present") == []


def test_explicit_conflicting_records_and_reproducible_report(tmp_path: Path) -> None:
    first = _record("synthetic.a")
    second = copy.deepcopy(first)
    second["knowledge_id"] = "synthetic.b"
    for record, source_id, target, statement in (
        (first, "synthetic.one", "synthetic.b", "Synthetic test statement A"),
        (second, "synthetic.two", "synthetic.a", "Synthetic test statement B"),
    ):
        record.update({
            "source_references": [{"source_id": source_id, "page": "synthetic-page-1"}],
            "rule_statement": statement,
            "review_status": "disputed",
            "conflicts_with": [target],
        })
    root = _project(tmp_path, [first, second])
    first_report = load_knowledge(root)[1]
    second_report = load_knowledge(root)[1]
    assert first_report == second_report
    assert first_report["conflict_pairs"] == [["synthetic.a", "synthetic.b"]]
    assert first_report["by_review_status"] == {"disputed": 2}
    assert first_report["errors"] == []


def test_cli_knowledge_commands(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]) -> None:
    root = _project(tmp_path, [_record()])
    monkeypatch.setattr("jyotisha_ai.cli._project_root", lambda: root)
    for command in (["knowledge", "schema"], ["knowledge", "validate"], ["knowledge", "report"], ["knowledge", "search", "परीक्षण"]):
        assert main(command) == 0
    output = capsys.readouterr().out
    assert '"matches": 1' in output
