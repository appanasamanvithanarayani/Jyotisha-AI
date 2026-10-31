"""Synthetic-byte admission tests; no astronomy data or Skyfield installation."""

import hashlib
import json
from pathlib import Path
import socket

import pytest

from evaluations.skyfield_isolated.offline_gate import EvaluationBlocked, check_local_kernel


INSTANT = "2005-01-01T12:00:00+00:00"
BYTES = b"synthetic fixture, not an ephemeris kernel"


def fixture(tmp_path: Path):
    kernel = tmp_path / "synthetic.bsp"
    kernel.write_bytes(BYTES)
    manifest = {
        "schema_version": "1.0",
        "filename": kernel.name,
        "publisher": "SYNTHETIC TEST ONLY",
        "official_source_url": "https://example.invalid/synthetic-only",
        "retrieved_at_utc": "2005-01-01T00:00:00+00:00",
        "size_bytes": len(BYTES),
        "sha256": hashlib.sha256(BYTES).hexdigest(),
        "publisher_checksum": {
            "algorithm": "MD5",
            "value": hashlib.md5(BYTES).hexdigest(),  # noqa: S324 - synthetic fixture only
            "source_url": "https://example.invalid/synthetic-checksum",
        },
        "coverage": {
            "publisher_timescale": "SYNTHETIC",
            "publisher_start": "2000",
            "publisher_end": "2010",
            "approved_utc_start": "2000-01-01T00:00:00+00:00",
            "approved_utc_end": "2010-01-01T00:00:00+00:00",
        },
        "terms_review": {
            "status": "approved_for_isolated_evaluation",
            "terms_url": "https://example.invalid/synthetic-terms",
            "reviewer": "SYNTHETIC TEST ONLY",
            "review_record": "SYNTHETIC TEST ONLY",
        },
        "approval": {
            "status": "approved_for_isolated_evaluation",
            "approved_by": "SYNTHETIC TEST ONLY",
            "approval_record": "SYNTHETIC TEST ONLY",
        },
    }
    manifest_path = tmp_path / "local-manifest.json"
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
    return manifest_path, kernel, manifest


def admit(manifest_path, kernel_path, instant=INSTANT):
    return check_local_kernel(manifest_path=manifest_path, kernel_path=kernel_path, instant_utc=instant)


def test_synthetic_bytes_yield_admission_receipt_not_chart(tmp_path):
    manifest_path, kernel, _ = fixture(tmp_path)
    receipt = admit(manifest_path, kernel)
    assert receipt["status"] == "local_bytes_admitted_not_backend_or_accuracy_verified"
    assert "positions" not in receipt and "chart" not in receipt


def test_missing_manifest_is_blocked(tmp_path):
    _, kernel, _ = fixture(tmp_path)
    with pytest.raises(EvaluationBlocked, match="manifest"):
        admit(tmp_path / "missing.json", kernel)


def test_missing_kernel_is_blocked(tmp_path):
    manifest_path, kernel, _ = fixture(tmp_path)
    kernel.unlink()
    with pytest.raises(EvaluationBlocked, match="kernel"):
        admit(manifest_path, kernel)


def test_hash_mismatch_is_blocked(tmp_path):
    manifest_path, kernel, _ = fixture(tmp_path)
    kernel.write_bytes(b"altered same? no")
    with pytest.raises(EvaluationBlocked, match="mismatch"):
        admit(manifest_path, kernel)


@pytest.mark.parametrize("section", ["terms_review", "approval"])
def test_pending_review_or_approval_is_blocked(tmp_path, section):
    manifest_path, kernel, manifest = fixture(tmp_path)
    manifest[section]["status"] = "pending"
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
    with pytest.raises(EvaluationBlocked, match="not approved"):
        admit(manifest_path, kernel)


def test_out_of_range_date_is_blocked(tmp_path):
    manifest_path, kernel, _ = fixture(tmp_path)
    with pytest.raises(EvaluationBlocked, match="outside approved UTC coverage"):
        admit(manifest_path, kernel, "2011-01-01T00:00:00+00:00")


def test_url_attempt_is_blocked_before_any_network_call(tmp_path, monkeypatch):
    manifest_path, _, _ = fixture(tmp_path)
    calls = []

    def forbidden_network(*args, **kwargs):
        calls.append((args, kwargs))
        raise AssertionError("network attempted")

    monkeypatch.setattr(socket, "create_connection", forbidden_network)
    with pytest.raises(EvaluationBlocked, match="URL/network path"):
        admit(manifest_path, "https://example.invalid/synthetic.bsp")
    assert calls == []


def test_template_is_not_approved(tmp_path):
    template = Path(__file__).resolve().parents[1] / "kernel_manifest.template.json"
    _, kernel, _ = fixture(tmp_path)
    with pytest.raises(EvaluationBlocked):
        admit(template, kernel)
