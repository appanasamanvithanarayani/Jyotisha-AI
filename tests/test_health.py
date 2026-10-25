from __future__ import annotations

import json
from pathlib import Path

from jyotisha_ai.cli import main
from jyotisha_ai.health import format_report, run_health_checks


PROJECT_ROOT = Path(__file__).resolve().parents[1]


def test_repository_health_is_good() -> None:
    report = run_health_checks(PROJECT_ROOT)

    assert report.healthy, format_report(report)


def test_health_cli_reports_success(capsys: object) -> None:
    exit_code = main(["health"])
    captured = capsys.readouterr()  # type: ignore[attr-defined]

    assert exit_code == 0
    assert "Overall: healthy" in captured.out


def test_example_manifest_is_explicitly_not_authorized() -> None:
    path = PROJECT_ROOT / "data/manifests/sources.example.jsonl"
    records = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()]

    assert records
    assert all(
        record["permission"]["status"] not in {"approved", "public_domain"}
        for record in records
    )
