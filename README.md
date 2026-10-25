# Jyotisha AI

Jyotisha AI is a research project for building a multilingual Vedic astrology
language model from randomly initialized weights. The repository now includes
an **experimental deterministic chart calculator**, separate from model work.
Two locally supplied PDFs remain blocked pending training-rights review. The
project has no tokenizer or language model; the chart calculator is not yet
independently benchmarked as a complete Jathakam engine.

## Current scope

This milestone provides:

- a Python package and command-line health check;
- project and data-version configuration;
- a source manifest contract that records provenance and usage permission;
- safe Git exclusions for private data, generated datasets, and checkpoints;
- automated tests for the foundation.
- local UTF-8 text and digital PDF extraction into a versioned passage corpus;
- permission checks, checksums, duplicate flags, quality reports, and CLI validation.
- a versioned Jyotisha concept taxonomy, research inventory, and reviewable knowledge catalog.
- a calculation-only birth-chart CLI with explicit conventions and an independent-validation gate.

## Experimental Jathakam calculation engine

`chart` computes a **birth-instant calculation, not a prediction or a reviewed
Jyotisha rule**. It requires an ISO date/time with an explicit historical UTC
offset, numeric latitude/longitude, and a **named, externally sourced numeric
ayanāṃśa**. It does not infer time zones, geocode places, or choose an
ayanāṃśa silently. A zero ayanāṃśa is suitable only for synthetic tests, not
as a default Jyotisha setting.

```powershell
.\.venv\Scripts\python.exe -m jyotisha_ai chart --datetime "2000-01-01T12:00:00+00:00" --latitude 0 --longitude 0 --ayanamsha-degrees 0 --ayanamsha-id "synthetic-zero-test"
```

The output contains geocentric apparent tropical longitudes from pinned
`astronomy-engine==2.1.19`, sidereal longitudes after subtracting the supplied
ayanāṃśa, the eastern-horizon ascendant, whole-sign house indices, birth-time
*tithi*, half-*tithi*, *nakṣatra*, *pāda*, and *yoga* indices, and a
Vimshottari period sequence with unexpired first-period balance **in abstract
period years**. It does not turn these years into dates because the dasha-year
convention is not yet reviewed. The displayed civil weekday is **not** a
sunrise-based *vāra*, and the birth-instant indices are **not** a daily local
sunrise Panchanga. Rahu/Ketu positions, divisional charts, non-whole-sign
house cusps, interpretive rules, and predictions are not implemented.

The dependency's [MIT license and pinned release](https://pypi.org/project/astronomy-engine/2.1.19/)
permit this separate calculation implementation; it is not a pretrained AI
model. The [validation record](evaluations/CHART_ENGINE_VALIDATION.md) explains
which arithmetic and approximate solar checks pass and which **independent
reference cases still must be obtained** before chart outputs can evaluate the
future language model. Never enter private birth details into tracked test files.

Only sources whose `permission.status` permits training may be ingested. A
catalog entry is not proof of permission.

## Knowledge foundation

The [knowledge guide](data/knowledge/README.md) explains the record schema,
taxonomy, research review process, and citation policy. The taxonomy covers
foundations, nine Grahas, twelve Rashi slots, twelve Bhava slots, 27 Nakshatra
slots and their padas, Drishti and relationships, Yogas, Dashas, Vargas D1–D60,
Gochara, predictive methods, astronomical calculations, and the Jathakam
workflow. These are organizational labels, not validated interpretive rules.

The [knowledge inventory](data/knowledge/inventory.json) lists 13 research
areas with scope, evidence needs, review checks, knowledge type, and status.
Every area currently has status `not_researched`. The linked ayanamsha workflow
note remains `needs_review`; it does not verify the area. Check the inventory:

```powershell
.\.venv\Scripts\python.exe -m jyotisha_ai knowledge inventory validate
.\.venv\Scripts\python.exe -m jyotisha_ai knowledge inventory report
```

The [Graha research checklist](data/knowledge/GRAHA_RESEARCH.md) prepares the
`graha_significations` area with nine empty templates. It has no verified
significations or citations. Check its structure with:

```powershell
.\.venv\Scripts\python.exe -m jyotisha_ai knowledge grahas validate
.\.venv\Scripts\python.exe -m jyotisha_ai knowledge grahas report
```

The live `data/knowledge/records.jsonl` contains one researcher-authored
workflow note, marked `needs_review` and lacking a source citation. Add one
JSON object per line after researching a concept; use `needs_review` until a human checks the
source and interpretation. Run:

```powershell
.\.venv\Scripts\python.exe -m jyotisha_ai knowledge schema
.\.venv\Scripts\python.exe -m jyotisha_ai knowledge validate
.\.venv\Scripts\python.exe -m jyotisha_ai knowledge report
.\.venv\Scripts\python.exe -m jyotisha_ai knowledge search "term"
```

An extracted passage is raw source text with page provenance. A knowledge
record is a separate researcher-authored claim with its own evidence and
review status. Neither a citation nor an extracted passage is automatically a
verified rule. The current PDFs remain blocked for ingestion and training
until their specific edition rights are documented.

## Requirements

- Windows, macOS, or Linux
- Python 3.11 or newer
- Git (recommended)

PDF text extraction uses pinned `pypdf`; development dependencies are pinned in
`requirements-dev.lock`. No pretrained model or external AI service is used.

## Setup (PowerShell)

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements-dev.lock
```

If PowerShell blocks activation, either adjust the policy for the current
process or invoke `.venv\Scripts\python.exe` directly.

## Verify the project

Run the health check:

```powershell
python -m jyotisha_ai health
```

Run all automated tests:

```powershell
python -m pytest
```

The health check verifies the supported Python version, required directories,
project configuration, and the source-manifest schema and example. It never
reads raw books or prints private source content.

## Register and ingest a local source

1. Put an authorized `.txt` (UTF-8) or digitally generated `.pdf` file under
   `data/raw/`. No download operation is provided.
2. Create `data/manifests/sources.jsonl` using
   [the example](data/manifests/sources.example.jsonl) as a shape reference.
   Replace **all** example metadata. Set a unique `source_id`, title, authors,
   edition if known, language tags (`en`, `sa-Deva`, `sa-Latn`, `te`),
   `original_language`, `file_format`, provenance `local_path` (relative to the
   project and inside `data/raw/`), and the lowercase SHA-256 of the exact
   file bytes. Record the license, rights evidence reference, review date,
   and `training` in `allowed_uses` only when the actual grant supports it.
   For public domain, record the reviewed jurisdiction.
3. Check and ingest from the project folder:

```powershell
.\.venv\Scripts\python.exe -m jyotisha_ai sources validate
.\.venv\Scripts\python.exe -m jyotisha_ai ingest YOUR_SOURCE_ID
.\.venv\Scripts\python.exe -m jyotisha_ai corpus validate
.\.venv\Scripts\python.exe -m jyotisha_ai corpus report
```

To calculate a local file checksum in PowerShell, use
`(Get-FileHash -Algorithm SHA256 data/raw/YOUR_FILE.txt).Hash.ToLowerInvariant()`.

Ingestion requires `permission.status` of `approved` or `public_domain`, an
explicit `training` use, review date, evidence reference, license, and matching
file checksum. An example record, unknown permission, or rights limited to
research is blocked. The CLI records `processed`, `blocked`, or `failed` and
the latest error in the private manifest. Rights evidence itself stays outside
Git.

Output is `data/processed/SOURCE_ID/passages.jsonl` and `report.json`. Each
JSONL row contains the source and document ID, page number (1-based for PDFs;
`null` for plain text), paragraph order, verbatim extracted text, separate
whitespace-normalized search text, language, checksum, format/processing
versions, and extraction/quality status. A duplicate passage is retained and
flagged; it is not silently removed. `report.json` separates warnings from
fatal errors and contains a corpus checksum. Repeating ingestion on unchanged
inputs produces byte-identical corpus and report files.

The extractor preserves text returned by the PDF parser. Sources with fewer
than 40 non-whitespace characters fail the quality gate; PDF pages with fewer
than 20 are reported as warnings. Corpus validation also checks that current
training permission remains approved. PDF text order
and page layout can be imperfect. Image-only and low-text PDFs require OCR or
manual review, which is outside this milestone. Extracted passages are marked
`needs_review`; they are **not** verified astrology rules. Mixed-language
passages retain their original source language tag and original characters.

## Source catalog

The catalog format is documented in
`data/manifests/README.md`. Its machine-readable contract is
`data/manifests/source_manifest.schema.json`, with a non-authorized placeholder
record in `data/manifests/sources.example.jsonl`.

Before processing a source, record its identity, languages, provenance,
checksum, permission status, and processing state. Keep permission evidence in
a private location; record only a reference to it in the manifest.

## Repository layout

```text
configs/                 Versioned project configuration
data/manifests/          Source catalog schema and examples (tracked)
data/knowledge/           Knowledge record schema and local catalog
data/raw/                Original source files (ignored)
data/processed/          Reproducible processed corpus (ignored)
data/tokenized/          Generated token data (ignored)
src/jyotisha_ai/         Python package
tests/                   Automated tests
evaluations/             Future evaluation definitions and reports
scripts/                 Future reproducible task entry points
artifacts/               Generated tokenizers/checkpoints/reports (ignored)
```

Modules for tokenization, modeling, training, and APIs will be introduced only
in the milestones that implement them. The experimental calculation module is
independent of those future modules.

## Reproducibility and safety decisions

- Package metadata and tools live in `pyproject.toml`; the development
  dependency graph is pinned in `requirements-dev.lock`.
- Dataset and model format versions are explicit in `configs/project.toml`.
- The default random seed is recorded now; future training code must seed each
  library it uses and record the complete run configuration.
- Logs go to standard error and default to `INFO`. Source text and credentials
  must never be logged.
- Raw books, processed corpora, tokenized data, local manifests, secrets, and
  checkpoints are excluded from Git.
- No pretrained language models, embeddings, tokenizers, or remote AI services
  are dependencies of this milestone.

## Next milestone (not implemented)

The next stage is to obtain and review permitted sources, populate reviewed
knowledge records, and only then prepare a tokenizer training corpus. The
inventory and existing workflow note are not verified astrology rules or a
training corpus.

## First BPHS research notes

The [research findings](data/knowledge/RESEARCH_FINDINGS.md) document a
read-only inspection of the two local PDFs, their overlap, seven substantive
source-located draft notes, rights blockers, and a staged path toward a
training corpus and scratch-built model. The notes live in the local
`data/knowledge/records.jsonl` catalog and remain `needs_review`; neither PDF
has been ingested or cleared for AI training. Run:

```powershell
.\.venv\Scripts\python.exe -m jyotisha_ai knowledge report
```
