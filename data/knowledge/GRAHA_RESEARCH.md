# Graha research checklist

The inventory area is `graha_significations` (read from `inventory.json`).
`graha_research.json` contains nine research placeholders named by the project
brief: Surya, Chandra, Mangala, Budha, Guru, Shukra, Shani, Rahu, and Ketu.
The names identify checklist slots only. Their Sanskrit wording,
transliteration, meanings, and traditional significations have **not** been
verified. The checklist version is `1.0.0`; its contract is
`graha_research.schema.json`.

Each Graha row has fields for:

- `original_sanskrit_term` and `sanskrit_transliteration`;
- `english_explanation` and `telugu_explanation`;
- `source_reference.source_id`, `edition`, `chapter`, `page`, and `verse`;
- `evidence_type`, `conditions`, `qualifications`, `review_status`, and
  `review_notes`.

All research fields are currently `null` or empty arrays. All statuses are
`not_started`. This is intentionally different from a verified knowledge
record. The separate `records.jsonl` catalog remains unchanged.

## Research steps for each Graha

1. Identify a source and its exact edition. Check the source catalog and
   document rights before copying wording or preparing training material.
2. Locate the relevant chapter, page, or verse in an authorized source. Record
   only locators you actually checked. The two local PDFs remain blocked for
   ingestion and AI training until their rights are established.
3. Decide whether the evidence is original text, translation, commentary, or
   an independently authored researcher explanation. Do not merge them.
4. Record original Sanskrit terminology exactly as verified. Record the
   transliteration scheme used; do not silently repair uncertain text.
5. Draft English and Telugu explanations separately. Leave either field null
   when no qualified review is available.
6. List conditions and qualifications only when supported by the cited
   evidence. Keep tradition-specific variants in separate knowledge records.
7. Mark the checklist row `source_identified`, `drafted`, or `needs_review` as
   work progresses. Use `reviewed` only after documented source rights,
   edition and locator verification, all language fields, and review notes.
8. Add detailed, source-grounded assertions as separate entries in
   `records.jsonl`. A checklist row is an overview, not a container for every
   claim about a Graha. Do not advance the inventory area status merely because
   the nine rows exist.

Run the checks from the project root:

```powershell
.\.venv\Scripts\python.exe -m jyotisha_ai knowledge grahas validate
.\.venv\Scripts\python.exe -m jyotisha_ai knowledge grahas report
```

The validator requires the exact nine IDs, unique entries, complete template
fields, valid statuses, and source IDs known to the catalog. `not_started`
entries must stay empty. It blocks a `reviewed` row when training rights,
language fields, edition, locator, or review notes are missing. Passing these
structural checks does not independently verify astrology content.
It also rejects source-derived draft text from sources without documented
training rights.
