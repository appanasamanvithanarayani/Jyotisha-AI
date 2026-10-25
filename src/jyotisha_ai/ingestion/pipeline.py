"""Deterministic extraction of authorized local documents."""

from __future__ import annotations

import hashlib
import json
import re
import tomllib
import unicodedata
from pathlib import Path
from typing import Any

from jyotisha_ai.ingestion.manifest import ManifestError, eligible_for_training, load_manifest


class IngestionError(ValueError):
    """A source cannot safely produce a corpus."""


def _json_bytes(value: Any) -> bytes:
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n").encode("utf-8")


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _config(root: Path) -> dict[str, Any]:
    with (root / "configs/project.toml").open("rb") as handle:
        return tomllib.load(handle)


def _source_path(root: Path, record: dict[str, Any]) -> Path:
    local_path = record["provenance"].get("local_path")
    if not local_path:
        raise IngestionError("local source path is missing")
    raw_root = (root / "data/raw").resolve()
    path = (root / local_path).resolve()
    if not path.is_relative_to(raw_root):
        raise IngestionError("source path must be inside data/raw")
    if path.suffix.lower() != "." + record["file_format"]:
        raise IngestionError("file extension does not match file_format")
    if not path.is_file():
        raise IngestionError("source file is missing")
    return path


def _valid_text(value: str) -> bool:
    if "\ufffd" in value or "\x00" in value:
        return False
    return not any(unicodedata.category(char) == "Cs" for char in value)


def _read_pages(path: Path, file_format: str) -> list[tuple[int | None, str]]:
    if file_format == "txt":
        try:
            return [(None, path.read_text(encoding="utf-8-sig"))]
        except (OSError, UnicodeError) as exc:
            raise IngestionError(f"unreadable UTF-8 text: {exc}") from exc
    if file_format == "pdf":
        try:
            from pypdf import PdfReader

            reader = PdfReader(str(path), strict=True)
            if reader.is_encrypted:
                raise IngestionError("encrypted PDF is not supported")
            return [(index, page.extract_text() or "") for index, page in enumerate(reader.pages, 1)]
        except ImportError as exc:
            raise IngestionError("PDF support requires the pinned pypdf dependency") from exc
        except IngestionError:
            raise
        except Exception as exc:
            raise IngestionError(f"unreadable PDF: {type(exc).__name__}: {exc}") from exc
    raise IngestionError("unsupported file format")


def _split_passages(text: str) -> list[str]:
    # Keep every character of each segment; paragraph separators remain with
    # the preceding passage so concatenation recovers the extracted page text.
    pieces = re.split(r"(\r?\n(?:[ \t]*\r?\n)+)", text)
    passages: list[str] = []
    for index in range(0, len(pieces), 2):
        segment = pieces[index]
        if index + 1 < len(pieces):
            segment += pieces[index + 1]
        if segment:
            passages.append(segment)
    return passages


def _normalise(text: str) -> str:
    # Search aid only: original text is stored verbatim and remains authoritative.
    return " ".join(text.split())


def _heading(text: str) -> bool:
    first_line = text.strip().splitlines()[0] if text.strip() else ""
    return bool(re.match(r"(?i)^(chapter|adhyaya|अध्याय|అధ్యాయం)\b", first_line))


def ingest(root: Path, source_id: str, *, manifest_path: Path | None = None) -> dict[str, Any]:
    """Ingest one authorized source and write deterministic JSONL and report."""
    config = _config(root)
    records, _ = load_manifest(manifest_path or root / "data/manifests/sources.jsonl", config["versions"]["source_manifest_schema"])
    if source_id not in records:
        raise IngestionError(f"unknown source_id: {source_id}")
    record = records[source_id]
    if not eligible_for_training(record):
        raise IngestionError("training permission is missing or unauthorized; source quarantined")
    path = _source_path(root, record)
    try:
        raw = path.read_bytes()
    except OSError as exc:
        raise IngestionError(f"cannot read source: {exc}") from exc
    digest = _sha256(raw)
    if record["provenance"].get("sha256") != digest:
        raise IngestionError("source checksum missing or mismatch")
    pages = _read_pages(path, record["file_format"])
    if not pages:
        raise IngestionError("empty source: no pages")
    warnings: list[str] = []
    if any(not _valid_text(text) for _, text in pages):
        raise IngestionError("invalid Unicode or replacement characters in extracted text")
    if sum(len(text.strip()) for _, text in pages) < 40:
        raise IngestionError("empty or insufficient extractable text; OCR or manual review needed")
    if record["file_format"] == "pdf":
        for page_number, text in pages:
            if len(text.strip()) < 20:
                warnings.append(f"page {page_number}: little extractable text; OCR may be needed")
    rows: list[dict[str, Any]] = []
    seen: dict[str, str] = {}
    version = config["versions"]["corpus_format"]
    for page_number, page_text in pages:
        for paragraph_index, original in enumerate(_split_passages(page_text), 1):
            if not original.strip():
                continue
            page_label = str(page_number) if page_number is not None else "text"
            passage_id = f"{source_id}:p{page_label}:{paragraph_index:05d}"
            normalized = _normalise(original)
            key = _sha256(normalized.encode("utf-8"))
            duplicate_of = seen.get(key)
            if duplicate_of is None:
                seen[key] = passage_id
            else:
                warnings.append(f"{passage_id}: duplicate of {duplicate_of}")
            rows.append({
                "corpus_version": version,
                "document_id": source_id,
                "passage_id": passage_id,
                "source_id": source_id,
                "source_sha256": digest,
                "page_number": page_number,
                "paragraph_index": paragraph_index,
                "original_language": record["original_language"],
                "original_text": original,
                "normalized_text": normalized,
                "is_chapter_heading": _heading(original),
                "extraction_status": "extracted",
                "quality_status": "duplicate" if duplicate_of else "needs_review",
                "duplicate_of": duplicate_of,
                "processing_version": "ingestion-1.0.0",
            })
    if not rows:
        raise IngestionError("no nonempty passages extracted")
    output = root / "data/processed" / source_id
    output.mkdir(parents=True, exist_ok=True)
    corpus_bytes = b"".join(_json_bytes(row) for row in rows)
    report = {
        "corpus_version": version,
        "source_id": source_id,
        "source_sha256": digest,
        "passages": len(rows),
        "pages": len(pages),
        "duplicate_passages": sum(row["quality_status"] == "duplicate" for row in rows),
        "warnings": warnings,
        "errors": [],
        "corpus_sha256": _sha256(corpus_bytes),
    }
    (output / "passages.jsonl").write_bytes(corpus_bytes)
    (output / "report.json").write_bytes(_json_bytes(report))
    return report


def validate_corpus(root: Path) -> dict[str, Any]:
    """Validate generated corpus integrity and source linkage."""
    config = _config(root)
    expected_version = config["versions"]["corpus_format"]
    errors: list[str] = []
    warnings: list[str] = []
    try:
        records, catalog_warnings = load_manifest(root / "data/manifests/sources.jsonl", config["versions"]["source_manifest_schema"])
        warnings.extend(catalog_warnings)
    except ManifestError as exc:
        records = {}
        errors.append(f"source catalog: {exc}")
    documents = 0
    passages = 0
    for file in sorted((root / "data/processed").glob("*/passages.jsonl")):
        documents += 1
        source_record = records.get(file.parent.name)
        if source_record is None:
            errors.append(f"{file.parent.name}: missing source provenance")
        elif not eligible_for_training(source_record):
            errors.append(f"{file.parent.name}: training permission is no longer approved")
        try:
            report = json.loads((file.parent / "report.json").read_text(encoding="utf-8"))
            raw = file.read_bytes()
            if _sha256(raw) != report["corpus_sha256"]:
                errors.append(f"{file.parent.name}: corpus checksum mismatch")
            if source_record is not None and report.get("source_sha256") != source_record["provenance"].get("sha256"):
                errors.append(f"{file.parent.name}: source catalog checksum mismatch")
            rows = [json.loads(line) for line in raw.decode("utf-8").splitlines() if line]
            if len(rows) != report["passages"]:
                errors.append(f"{file.parent.name}: passage count mismatch")
            ids: set[str] = set()
            for row in rows:
                passages += 1
                if row.get("corpus_version") != expected_version or row.get("source_id") != file.parent.name or row.get("document_id") != file.parent.name or not row.get("original_text") or not _valid_text(row["original_text"]):
                    errors.append(f"{file.parent.name}: invalid passage metadata or text")
                if row.get("source_sha256") != report.get("source_sha256"):
                    errors.append(f"{file.parent.name}: source checksum mismatch in passage")
                if row.get("passage_id") in ids:
                    errors.append(f"{file.parent.name}: duplicate passage ID")
                ids.add(row.get("passage_id"))
            warnings.extend(f"{file.parent.name}: {item}" for item in report.get("warnings", []))
        except (OSError, UnicodeError, ValueError, KeyError, TypeError) as exc:
            errors.append(f"{file.parent.name}: unreadable corpus or report: {exc}")
    return {"documents": documents, "passages": passages, "warnings": warnings, "errors": errors}
