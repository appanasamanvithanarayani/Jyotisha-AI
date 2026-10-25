"""Inventory checks use only project-authored planning text."""

from __future__ import annotations

import copy
import json
from pathlib import Path

import pytest

from jyotisha_ai.cli import main
from jyotisha_ai.knowledge.inventory import inventory_report


PROJECT_ROOT = Path(__file__).resolve().parents[1]


def _fixture(tmp_path: Path) -> tuple[Path, dict]:
    for directory in ("configs", "data/knowledge", "data/manifests"):
        (tmp_path / directory).mkdir(parents=True, exist_ok=True)
    for relative in (
        "configs/project.toml", "configs/knowledge_taxonomy.json",
        "data/knowledge/inventory.schema.json", "data/knowledge/knowledge_record.schema.json",
        "data/knowledge/records.jsonl",
    ):
        (tmp_path / relative).write_bytes((PROJECT_ROOT / relative).read_bytes())
    (tmp_path / "data/manifests/sources.jsonl").write_text("", encoding="utf-8")
    inventory = json.loads((PROJECT_ROOT / "data/knowledge/inventory.json").read_text(encoding="utf-8"))
    return tmp_path, inventory


def _write(root: Path, inventory: dict) -> None:
    (root / "data/knowledge/inventory.json").write_text(json.dumps(inventory, ensure_ascii=False), encoding="utf-8")


def test_inventory_structure_and_reproducibility() -> None:
    first = inventory_report(PROJECT_ROOT)
    assert first == inventory_report(PROJECT_ROOT)
    assert first["inventory_version"] == "1.0.0"
    assert first["areas"] == 13
    assert first["by_status"] == {"not_researched": 13}
    assert first["linked_knowledge_records"] == 1
    assert first["errors"] == []
    assert set(first["by_knowledge_kind"]) == {
        "astronomical_calculation", "classical_textual_statement", "traditional_interpretation",
        "modern_explanation", "project_workflow_note",
    }


@pytest.mark.parametrize("change,expected", [
    ({"area_id": "Bad ID"}, "invalid area_id"),
    ({"status": "learned"}, "unsupported status"),
    ({"scope": ""}, "scope must be nonempty"),
    ({"evidence_needed": []}, "evidence_needed must contain"),
    ({"knowledge_kinds": ["invented_kind"]}, "knowledge_kinds must be unique recognized"),
    ({"taxonomy_categories": ["invented_category"]}, "taxonomy_categories must be unique recognized"),
    ({"linked_knowledge_ids": ["missing.record"]}, "unknown linked knowledge_id"),
    ({"status": "reviewed"}, "reviewed inventory area requires"),
])
def test_invalid_area_fields(tmp_path: Path, change: dict, expected: str) -> None:
    root, inventory = _fixture(tmp_path)
    inventory["areas"][0].update(change)
    _write(root, inventory)
    assert any(expected in error for error in inventory_report(root)["errors"])


def test_duplicate_id_and_version_mismatch(tmp_path: Path) -> None:
    root, inventory = _fixture(tmp_path)
    inventory["areas"].append(copy.deepcopy(inventory["areas"][0]))
    _write(root, inventory)
    assert any("duplicate area_id" in error for error in inventory_report(root)["errors"])
    inventory["areas"].pop()
    inventory["inventory_version"] = "9.9.9"
    _write(root, inventory)
    assert "unsupported inventory_version" in inventory_report(root)["errors"]


def test_cli_inventory_commands(capsys: pytest.CaptureFixture[str]) -> None:
    assert main(["knowledge", "inventory", "validate"]) == 0
    assert main(["knowledge", "inventory", "report"]) == 0
    output = capsys.readouterr().out
    assert '"areas": 13' in output
    assert '"not_researched": 13' in output
