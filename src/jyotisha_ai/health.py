"""Non-sensitive health checks for the repository foundation."""

from __future__ import annotations

import json
import sys
import tomllib
from dataclasses import dataclass
from pathlib import Path

MINIMUM_PYTHON = (3, 11)
REQUIRED_DIRECTORIES = (
    "configs",
    "data/manifests",
    "data/raw",
    "data/processed",
    "data/tokenized",
    "src/jyotisha_ai",
    "tests",
    "evaluations",
    "scripts",
    "artifacts",
)
REQUIRED_MANIFEST_FIELDS = {
    "schema_version",
    "source_id",
    "title",
    "source_type",
    "languages",
    "original_language",
    "file_format",
    "provenance",
    "permission",
    "processing",
}


@dataclass(frozen=True)
class Check:
    """The result of one health assertion."""

    name: str
    passed: bool
    detail: str


@dataclass(frozen=True)
class HealthReport:
    """All foundation health checks."""

    checks: tuple[Check, ...]

    @property
    def healthy(self) -> bool:
        return all(check.passed for check in self.checks)


def _check_python() -> Check:
    version = sys.version_info[:3]
    return Check(
        "python",
        version >= MINIMUM_PYTHON,
        f"{version[0]}.{version[1]}.{version[2]} (requires >=3.11)",
    )


def _check_directories(root: Path) -> Check:
    missing = [path for path in REQUIRED_DIRECTORIES if not (root / path).is_dir()]
    detail = "all required directories exist" if not missing else f"missing: {', '.join(missing)}"
    return Check("directories", not missing, detail)


def _check_config(root: Path) -> Check:
    path = root / "configs/project.toml"
    try:
        with path.open("rb") as handle:
            config = tomllib.load(handle)
        schema_version = config["versions"]["source_manifest_schema"]
        seed = config["reproducibility"]["default_seed"]
        if not isinstance(seed, int):
            raise TypeError("default_seed must be an integer")
    except (OSError, KeyError, TypeError, tomllib.TOMLDecodeError) as exc:
        return Check("configuration", False, str(exc))
    return Check("configuration", True, f"manifest schema {schema_version}; seed {seed}")


def _check_manifest_contract(root: Path) -> Check:
    schema_path = root / "data/manifests/source_manifest.schema.json"
    example_path = root / "data/manifests/sources.example.jsonl"
    try:
        schema = json.loads(schema_path.read_text(encoding="utf-8"))
        records = [
            json.loads(line)
            for line in example_path.read_text(encoding="utf-8").splitlines()
            if line.strip()
        ]
        if set(schema["required"]) != REQUIRED_MANIFEST_FIELDS:
            raise ValueError("schema required fields do not match the project contract")
        if not records:
            raise ValueError("example manifest has no records")
        for index, record in enumerate(records, start=1):
            missing = REQUIRED_MANIFEST_FIELDS - record.keys()
            if missing:
                raise ValueError(f"example line {index} is missing {sorted(missing)}")
            if record["permission"]["status"] in {"approved", "public_domain"}:
                raise ValueError("example data must not imply that a source is authorized")
    except (OSError, KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
        return Check("manifest contract", False, str(exc))
    return Check("manifest contract", True, f"schema and {len(records)} example record(s) parsed")


def run_health_checks(root: Path) -> HealthReport:
    """Run deterministic checks without reading private corpora."""
    return HealthReport(
        checks=(
            _check_python(),
            _check_directories(root),
            _check_config(root),
            _check_manifest_contract(root),
        )
    )


def format_report(report: HealthReport) -> str:
    """Render a concise human-readable report."""
    lines = [
        f"[{'PASS' if check.passed else 'FAIL'}] {check.name}: {check.detail}"
        for check in report.checks
    ]
    lines.append(f"Overall: {'healthy' if report.healthy else 'unhealthy'}")
    return "\n".join(lines)
