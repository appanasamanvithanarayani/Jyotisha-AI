"""Stdlib-only admission checks. No Skyfield import or astronomy calculation."""

from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re


class EvaluationBlocked(RuntimeError):
    """No dependency or kernel may be used when the local evidence gate fails."""


def _local_file(value: str | Path, label: str) -> Path:
    raw = str(value)
    if "://" in raw or raw.startswith("\\\\"):
        raise EvaluationBlocked(f"{label} must be an explicit local file, not a URL/network path")
    path = Path(raw)
    if not path.is_absolute() or path.is_symlink() or not path.is_file():
        raise EvaluationBlocked(f"{label} is missing, unsafe, or not absolute")
    return path


def _utc(value: str, label: str) -> datetime:
    try:
        parsed = datetime.fromisoformat(value)
    except (TypeError, ValueError) as exc:
        raise EvaluationBlocked(f"invalid {label}") from exc
    if parsed.tzinfo is None or parsed.utcoffset() != timezone.utc.utcoffset(None):
        raise EvaluationBlocked(f"{label} must have an explicit UTC offset")
    return parsed


def _required_text(record: dict, key: str) -> str:
    value = record.get(key)
    if not isinstance(value, str) or not value.strip():
        raise EvaluationBlocked(f"missing {key}")
    return value


def _digest(path: Path, algorithm: str) -> str:
    hasher = hashlib.new(algorithm)
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            hasher.update(block)
    return hasher.hexdigest()


def check_local_kernel(
    *, manifest_path: str | Path, kernel_path: str | Path, instant_utc: str
) -> dict[str, str | int]:
    """Return an admission receipt, never positions or a chart.

    A manifest approval is a project workflow claim, not legal verification by
    this code. The caller must review the actual approval record externally.
    """
    manifest_file = _local_file(manifest_path, "manifest")
    requested_time = _utc(instant_utc, "requested instant")
    try:
        manifest = json.loads(manifest_file.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise EvaluationBlocked("manifest is unreadable or malformed") from exc
    if not isinstance(manifest, dict) or manifest.get("schema_version") != "1.0":
        raise EvaluationBlocked("unsupported manifest")
    filename = _required_text(manifest, "filename")
    if not re.fullmatch(r"[A-Za-z0-9_-]+\.bsp", filename):
        raise EvaluationBlocked("unsafe kernel filename")
    _required_text(manifest, "publisher")
    source_url = _required_text(manifest, "official_source_url")
    if not source_url.startswith("https://"):
        raise EvaluationBlocked("official source URL must use HTTPS")
    _utc(_required_text(manifest, "retrieved_at_utc"), "retrieval timestamp")
    size = manifest.get("size_bytes")
    sha256 = manifest.get("sha256")
    if type(size) is not int or size <= 0 or not isinstance(sha256, str) or not re.fullmatch(r"[0-9a-f]{64}", sha256):
        raise EvaluationBlocked("missing or invalid size/SHA-256")
    for section, status in (("terms_review", "approved_for_isolated_evaluation"), ("approval", "approved_for_isolated_evaluation")):
        review = manifest.get(section)
        if not isinstance(review, dict) or review.get("status") != status:
            raise EvaluationBlocked(f"{section} is not approved")
        for field in (("terms_url", "reviewer", "review_record") if section == "terms_review" else ("approved_by", "approval_record")):
            _required_text(review, field)
    checksum = manifest.get("publisher_checksum")
    if not isinstance(checksum, dict) or checksum.get("algorithm") not in ("MD5", "SHA-256"):
        raise EvaluationBlocked("publisher checksum is missing or unsupported")
    published_value = _required_text(checksum, "value")
    expected_length = 32 if checksum["algorithm"] == "MD5" else 64
    if not re.fullmatch(rf"[0-9a-f]{{{expected_length}}}", published_value):
        raise EvaluationBlocked("invalid publisher checksum")
    if not _required_text(checksum, "source_url").startswith("https://"):
        raise EvaluationBlocked("publisher checksum source URL must use HTTPS")
    coverage = manifest.get("coverage")
    if not isinstance(coverage, dict):
        raise EvaluationBlocked("missing coverage")
    for field in ("publisher_timescale", "publisher_start", "publisher_end"):
        _required_text(coverage, field)
    start = _utc(_required_text(coverage, "approved_utc_start"), "UTC coverage start")
    end = _utc(_required_text(coverage, "approved_utc_end"), "UTC coverage end")
    if start > end or not start <= requested_time <= end:
        raise EvaluationBlocked("requested instant is outside approved UTC coverage")
    kernel_file = _local_file(kernel_path, "kernel")
    if kernel_file.name != filename:
        raise EvaluationBlocked("kernel filename differs from approved manifest")
    try:
        if kernel_file.stat().st_size != size or _digest(kernel_file, "sha256") != sha256:
            raise EvaluationBlocked("kernel size or SHA-256 mismatch")
        if _digest(kernel_file, checksum["algorithm"].lower().replace("-", "")) != published_value:
            raise EvaluationBlocked("kernel publisher checksum mismatch")
    except OSError as exc:
        raise EvaluationBlocked("kernel is unreadable") from exc
    return {
        "status": "local_bytes_admitted_not_backend_or_accuracy_verified",
        "kernel_path": str(kernel_file.resolve()),
        "filename": filename,
        "size_bytes": size,
        "sha256": sha256,
        "manifest_sha256": _digest(manifest_file, "sha256"),
    }
