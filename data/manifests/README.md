# Source manifests

`source_manifest.schema.json` defines version `1.1.0` of one catalog record. Store active records
as UTF-8 JSON Lines in `sources.jsonl` (one JSON object per line). That local
file is ignored by Git because it may contain private bibliographic or rights
information. Commit only deliberately sanitized examples.

Each source receives a stable `source_id`. Record all applicable languages
using BCP 47 tags, for example `en`, `sa-Deva`, `sa-Latn`, and `te`. The
`permission.status` field is a processing gate:

- `approved`: documented permission covers the intended processing/training;
- `public_domain`: a documented jurisdictional review supports that status;
- `restricted`: cataloging is allowed but processing/training is not;
- `pending_review`: rights review is incomplete;
- `rejected`: the source must not be processed.

Do not place copyrighted book files or permission documents in this directory.
Use `permission.evidence_reference` to point to a controlled record. Populate
`sha256` once a local file is authorized and acquired; it makes future pipeline
runs auditable and reproducible. `file_format` is `txt` or `pdf`;
`original_language` must appear in `languages`. Keep `local_path` inside
`data/raw/`. Record `processing.errors` and `processing.review_notes` without
putting book text or private permission evidence into the catalog. The CLI
updates the latest processing status and error after an ingest attempt.

Use `und` for language and `null` for `acquired_at` when those details are
unknown. A filename or PDF metadata field is not proof of authorship, edition,
license, or AI-training permission. Pending records may be cataloged, but the
ingestion command blocks them until the rights review is documented.

