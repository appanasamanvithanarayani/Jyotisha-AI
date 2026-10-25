"""Synthetic, self-authored fixtures; no book material is used."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pytest
from pypdf import PdfWriter
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject

from jyotisha_ai.ingestion.manifest import ManifestError, eligible_for_training, load_manifest
from jyotisha_ai.ingestion.pipeline import IngestionError, ingest, validate_corpus
from jyotisha_ai.cli import main


def _record(source_id: str, content: bytes, file_format: str = "txt") -> dict:
    return {
        "schema_version": "1.1.0",
        "source_id": source_id,
        "title": "Self-authored synthetic fixture",
        "authors": ["Test suite"],
        "source_type": "other",
        "languages": ["en", "sa-Deva", "sa-Latn", "te"],
        "original_language": "sa-Deva",
        "file_format": file_format,
        "edition": "test",
        "provenance": {
            "acquired_from": "Self-authored test suite",
            "acquired_at": "2026-10-24",
            "local_path": f"data/raw/{source_id}.{file_format}",
            "sha256": hashlib.sha256(content).hexdigest(),
        },
        "permission": {
            "status": "approved",
            "allowed_uses": ["catalog", "research", "training"],
            "reviewed_at": "2026-10-24",
            "evidence_reference": "self-authored:test-suite",
            "license": "CC0-1.0",
        },
        "processing": {"status": "ready", "errors": [], "review_notes": "Synthetic fixture"},
    }


def _project(tmp_path: Path, record: dict, content: bytes) -> Path:
    root = tmp_path
    for directory in ("configs", "data/raw", "data/manifests", "data/processed"):
        (root / directory).mkdir(parents=True, exist_ok=True)
    (root / "configs/project.toml").write_text('[versions]\nsource_manifest_schema = "1.1.0"\ncorpus_format = "1.0.0"\n', encoding="utf-8")
    source = root / record["provenance"]["local_path"]
    source.write_bytes(content)
    (root / "data/manifests/sources.jsonl").write_text(json.dumps(record, ensure_ascii=False) + "\n", encoding="utf-8")
    return root


def test_manifest_validation_and_duplicate_ids(tmp_path: Path) -> None:
    record = _record("test.source", b"fixture")
    root = _project(tmp_path, record, b"fixture")
    manifest = root / "data/manifests/sources.jsonl"
    records, warnings = load_manifest(manifest)
    assert list(records) == ["test.source"]
    assert warnings == []
    manifest.write_text(manifest.read_text(encoding="utf-8") * 2, encoding="utf-8")
    with pytest.raises(ManifestError, match="duplicate source_id"):
        load_manifest(manifest)


def test_permission_gate_precedes_file_read(tmp_path: Path) -> None:
    record = _record("test.blocked", b"fixture")
    record["permission"]["status"] = "pending_review"
    root = _project(tmp_path, record, b"fixture")
    (root / "data/raw/test.blocked.txt").unlink()
    assert not eligible_for_training(record)
    with pytest.raises(IngestionError, match="permission"):
        ingest(root, "test.blocked")
    assert not (root / "data/processed/test.blocked").exists()


def test_unicode_preservation_duplicates_and_reproducibility(tmp_path: Path) -> None:
    text = "Chapter 1\nदेवनागरी తెలుగు Sanskrit āśrama.\n\nदेवनागरी తెలుగు Sanskrit āśrama.\n\nदेवनागरी తెలుగు Sanskrit āśrama.\n"
    data = text.encode("utf-8")
    root = _project(tmp_path, _record("test.unicode", data), data)
    first = ingest(root, "test.unicode")
    corpus_file = root / "data/processed/test.unicode/passages.jsonl"
    report_file = root / "data/processed/test.unicode/report.json"
    corpus_bytes, report_bytes = corpus_file.read_bytes(), report_file.read_bytes()
    second = ingest(root, "test.unicode")
    assert first == second
    assert corpus_file.read_bytes() == corpus_bytes
    assert report_file.read_bytes() == report_bytes
    rows = [json.loads(line) for line in corpus_bytes.decode("utf-8").splitlines()]
    assert "".join(row["original_text"] for row in rows) == text
    assert all(row["page_number"] is None for row in rows)
    assert rows[0]["is_chapter_heading"]
    assert first["duplicate_passages"] == 1
    assert validate_corpus(root)["errors"] == []


@pytest.mark.parametrize("content, reason", [
    (b"\xff" * 80, "unreadable UTF-8"),
    (("valid text " * 8 + "\ufffd").encode("utf-8"), "invalid Unicode"),
    (b"short", "insufficient extractable text"),
])
def test_invalid_text_is_rejected(tmp_path: Path, content: bytes, reason: str) -> None:
    root = _project(tmp_path, _record("test.bad", content), content)
    with pytest.raises(IngestionError, match=reason):
        ingest(root, "test.bad")


def test_checksum_and_path_enforcement(tmp_path: Path) -> None:
    content = b"Synthetic content. " * 8
    record = _record("test.guard", content)
    root = _project(tmp_path, record, content + b"changed")
    with pytest.raises(IngestionError, match="checksum"):
        ingest(root, "test.guard")
    record["provenance"]["local_path"] = "../outside.txt"
    (root / "data/manifests/sources.jsonl").write_text(json.dumps(record), encoding="utf-8")
    with pytest.raises(IngestionError, match="inside data/raw"):
        ingest(root, "test.guard")


def test_blank_pdf_reports_ocr_need(tmp_path: Path) -> None:
    pdf = tmp_path / "blank.pdf"
    writer = PdfWriter()
    writer.add_blank_page(width=200, height=200)
    writer.write(str(pdf))
    content = pdf.read_bytes()
    root = _project(tmp_path / "project", _record("test.pdf", content, "pdf"), content)
    with pytest.raises(IngestionError, match="OCR"):
        ingest(root, "test.pdf")


def test_digital_pdf_preserves_page_provenance(tmp_path: Path) -> None:
    pdf = tmp_path / "digital.pdf"
    writer = PdfWriter()
    for page_number in (1, 2):
        page = writer.add_blank_page(width=300, height=300)
        font = DictionaryObject({
            NameObject("/Type"): NameObject("/Font"),
            NameObject("/Subtype"): NameObject("/Type1"),
            NameObject("/BaseFont"): NameObject("/Helvetica"),
        })
        font_ref = writer._add_object(font)
        page[NameObject("/Resources")] = DictionaryObject({
            NameObject("/Font"): DictionaryObject({NameObject("/F1"): font_ref})
        })
        stream = DecodedStreamObject()
        stream.set_data(f"BT /F1 12 Tf 20 250 Td (Synthetic PDF page {page_number} has extractable text for validation.) Tj ET".encode("ascii"))
        page[NameObject("/Contents")] = writer._add_object(stream)
    writer.write(str(pdf))
    content = pdf.read_bytes()
    root = _project(tmp_path / "project", _record("test.digital", content, "pdf"), content)
    report = ingest(root, "test.digital")
    rows = [json.loads(line) for line in (root / "data/processed/test.digital/passages.jsonl").read_text(encoding="utf-8").splitlines()]
    assert report["pages"] == 2
    assert [row["page_number"] for row in rows] == [1, 2]
    assert "page 2" in rows[1]["original_text"]


def test_unreadable_pdf_and_missing_file(tmp_path: Path) -> None:
    corrupt = b"this is not a PDF document"
    root = _project(tmp_path, _record("test.corrupt", corrupt, "pdf"), corrupt)
    with pytest.raises(IngestionError, match="unreadable PDF"):
        ingest(root, "test.corrupt")
    (root / "data/raw/test.corrupt.pdf").unlink()
    with pytest.raises(IngestionError, match="missing"):
        ingest(root, "test.corrupt")


def test_corpus_detects_tampering(tmp_path: Path) -> None:
    content = b"A synthetic page with enough text for extraction and validation.\n"
    root = _project(tmp_path, _record("test.tamper", content), content)
    ingest(root, "test.tamper")
    corpus_file = root / "data/processed/test.tamper/passages.jsonl"
    corpus_file.write_bytes(corpus_file.read_bytes() + b" ")
    assert any("checksum" in error for error in validate_corpus(root)["errors"])


def test_corpus_detects_permission_revocation(tmp_path: Path) -> None:
    content = b"A synthetic page with enough text to support the permission check.\n"
    record = _record("test.revoked", content)
    root = _project(tmp_path, record, content)
    ingest(root, "test.revoked")
    record["permission"]["status"] = "rejected"
    (root / "data/manifests/sources.jsonl").write_text(json.dumps(record), encoding="utf-8")
    assert any("permission" in error for error in validate_corpus(root)["errors"])


def test_cli_commands_and_processing_status(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]) -> None:
    content = b"A synthetic source with sufficient text for reliable extraction and testing.\n"
    root = _project(tmp_path, _record("test.cli", content), content)
    monkeypatch.setattr("jyotisha_ai.cli._project_root", lambda: root)
    assert main(["sources", "validate"]) == 0
    assert '"sources": 1' in capsys.readouterr().out
    assert main(["ingest", "test.cli"]) == 0
    assert '"passages": 1' in capsys.readouterr().out
    assert load_manifest(root / "data/manifests/sources.jsonl")[0]["test.cli"]["processing"]["status"] == "processed"
    assert main(["corpus", "validate"]) == 0
    assert main(["corpus", "report"]) == 0
    assert '"documents": 1' in capsys.readouterr().out
