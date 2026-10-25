# Structured knowledge catalog (version 1.0.0)

`knowledge_record.schema.json` documents one JSON object per line in
`records.jsonl`. The live catalog is ignored by Git; it currently contains one
researcher-authored workflow note marked `needs_review`. `configs/knowledge_taxonomy.json` is a map of
research topics and numbered slots, not a collection of astrology claims.

## Research inventory

`inventory.json` is a tracked, versioned plan of knowledge areas. Its contract
is `inventory.schema.json`; the version also appears in
`configs/project.toml`. Each area has a unique `area_id`, scope,
`taxonomy_categories`, `knowledge_kinds`, `evidence_needed`,
`review_requirements`, `status`, and `linked_knowledge_ids`. The kinds keep
astronomical calculation, classical textual statements, traditional
interpretation, modern explanation, and project workflow notes distinct.

Current status `not_researched` means the area is a placeholder. Other valid
statuses are `sources_identified`, `evidence_collected`, `drafted`,
`needs_review`, `reviewed`, and `blocked`. Change status only when the stated
evidence has actually been gathered. `reviewed` requires linked knowledge
records that are themselves reviewed; adding a link alone cannot promote an
area. The ayanamsha workflow note is linked under Jathakam settings but remains
`needs_review`, so that whole area remains `not_researched`.

Researchers should choose an inventory area, locate a permitted exact
edition, document the relevant locator and permission, then add separate
knowledge records for source statements, interpretations, translations, and
calculations. Fill in each language only after review. Update the inventory
status when the evidence and review work warrant it. The inventory is not a
source of astrology rules, quotes, or predictions.

```powershell
.\.venv\Scripts\python.exe -m jyotisha_ai knowledge inventory validate
.\.venv\Scripts\python.exe -m jyotisha_ai knowledge inventory report
```

Inventory reports are stable and contain no timestamps. They count areas by
status and knowledge kind and reject malformed entries, duplicate IDs,
unsupported statuses, unknown taxonomy categories, and broken knowledge links.

## Graha research

The first area prepared for research is `graha_significations`. Follow the
[Graha checklist](GRAHA_RESEARCH.md) and fill its nine entries only from
evidence you can identify and review. The checklist lives in
`graha_research.json` and has a separate versioned schema. It currently
contains no sourced significations, quotations, translations, or citations.
Its presence does not change the inventory area's `not_researched` status.

## Adding a record

Start with only fields you know. A safe placeholder contains:

```json
{"record_version":"1.0.0","knowledge_id":"draft.your-id","concept":"Your topic label","concept_category":"foundation","tradition":"unknown","evidence_type":"taxonomy_placeholder","review_status":"needs_review","source_references":[]}
```

This is an illustrative shape, not a Jyotisha assertion. Use a stable, unique
lowercase `knowledge_id`. Choose `concept_category` and `tradition` from the
taxonomy. Numbered slots cover Rashi 1–12, Bhava 1–12, Nakshatra 1–27 with
four padas each, and Varga D1–D60. A slot does not imply a rule, mathematical
definition, or verified name.

When evidence exists, make a separate record for each distinct assertion or
tradition. Record Sanskrit/Devanagari, Sanskrit transliteration, English, and
Telugu in their respective fields only when the wording is known and lawful to
store. Keep `rule_statement`, `conditions`, and `exceptions` tied to what the
source actually supports. An example must have `kind` set to
`reviewer_illustration` or `source_example`; a source example also needs a
`source_reference_index`.

Each source reference uses a `source_id` already in
`data/manifests/sources.jsonl`, plus an exact `page`, `chapter`, `verse`,
`passage_id`, or `locator_note` when available. Record `edition` if verified.
A citation points to a source; it does not itself prove any assertion or grant
permission to copy source text into a dataset. A record may cite a blocked
source for bibliographic research, but such a reference produces a warning and
does not change the source's permission status. Records classified as copied
`original_text`, `translation`, or `commentary` are rejected if the cited
source lacks documented training rights, as are copied `source_example` items;
independently authored
`reviewer_explanation` records may retain a citation with a warning.

`evidence_type` distinguishes `original_text`, `translation`, `commentary`,
`reviewer_explanation`, `model_hypothesis`, and `taxonomy_placeholder`.
`review_status` is one of `needs_review`, `reviewed`, `disputed`, or `rejected`.
Only a human-reviewed record with source references, precise locators,
`reviewer_id`, and `reviewed_at` may use `reviewed`. A model hypothesis or
placeholder cannot be marked reviewed. Rules outside `reviewed` are warned as
unverified. The validator checks record structure and source IDs; it cannot
prove that a citation or interpretation is correct.

Use `conflicts_with` to link IDs of records with documented disagreements.
Keep each tradition's assertion separate. The validator reports explicit
conflict pairs and warns about one-sided links; it cannot infer semantic
contradictions automatically.

## Research and review workflow

1. Identify the exact source, edition, and rights terms in the source catalog.
2. Read the relevant passage and record a precise chapter/page/verse locator.
3. Preserve original wording only where copying and later use are permitted.
4. Draft your own explanation separately from original text and translation.
5. Record only conditions, exceptions, and examples supported by evidence.
6. Compare other sources or traditions; link actual disagreements with
   `conflicts_with`.
7. Keep `review_status` as `needs_review` until another human checks evidence,
   interpretation, and rights. Record the reviewer and review date before
   setting `reviewed`.

Where full-text copying or training is not authorized, retain only lawful
bibliographic references and independently authored notes. Whether such notes
may enter a future training dataset requires a separate rights decision.

## Commands

From the repository root:

```powershell
.\.venv\Scripts\python.exe -m jyotisha_ai knowledge schema
.\.venv\Scripts\python.exe -m jyotisha_ai knowledge validate
.\.venv\Scripts\python.exe -m jyotisha_ai knowledge report
.\.venv\Scripts\python.exe -m jyotisha_ai knowledge search "term"
```

Reports are deterministic JSON: counts by category and review status, explicit
conflict pairs, sorted warnings, and sorted errors. Search is literal Unicode
casefold matching; it returns IDs and metadata only, not book passages.
JSON uses Unicode escapes where needed so commands also work in Windows
terminals that cannot print Devanagari or Telugu directly.

## Future use

A future exporter must select only appropriately licensed, reviewed material
and preserve provenance. A custom tokenizer can then be trained on permitted
text. A decoder-only Transformer with random initial weights can be trained
and evaluated separately. Retrieval may serve authorized passages and
structured rules, while a deterministic Jathakam engine calculates chart
facts. Evaluation must test attribution, multilingual output, consistency, and
unsupported claims. None of those components is implemented here.
