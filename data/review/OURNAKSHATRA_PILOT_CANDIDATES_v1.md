# OurNakshatra quality review and proposed pilot candidates — v1

**Disposition: local review candidates only; 0 independently verified, 0 training-eligible.** This is not a training corpus or an evaluation set. The 602-row original at `data/raw/ournakshatra-vedic-astrology-core-dd1934f.jsonl` was not changed. The companion [`ournakshatra_pilot_candidates_v1.jsonl`](ournakshatra_pilot_candidates_v1.jsonl) holds 12 original Q&A pairs verbatim plus traceability and quality flags; it is intentionally outside `data/processed` and `data/tokenized`.

## Selection and quality findings

The [full-dataset audit](../manifests/OURNAKSHATRA_QA_AUDIT_2026-10-25.md) found 602 parseable rows, no exact duplicate objects, and **7 identical-question groups spanning 15 rows**, with differing answers and missing question context. It also flagged row 527's appended citation about houses 11/12 as irrelevant to its answer about houses 3/9. The prior **659 high-similarity question pairs** are a broad *screen*, not 659 semantic duplicates: parallel Graha/Nakshatra templates frequently describe distinct subjects. No source-grounded contradiction was established for the seven repeated-question groups. The publisher-attribution field provides no edition/chapter/verse locator.

This proposed subset selects rows **1, 2, 3, 4, 7, 10, 11, 13, 14, 18, 21, 24** from the existing [20-question review gate](../manifests/OURNAKSHATRA_20_QUESTION_REVIEW_GATE_2026-10-25.md). Criteria: distinct, topic-bearing, non-promotional introductory questions; short answers; no known identical-question collisions or known row-527-style citation mismatch. **“Clean” here means mechanically traceable and screened for obvious collision/promotion, not factually established.** Claims within each answer remain unverified, and `quality_flags` identify specific concerns. No answer was rewritten or corrected.

| Topic / rows | Automated and editorial review result | Remaining issue |
| --- | --- | --- |
| Lagna / 1, 2 | Different questions, exact originals retained. | House-system convention and “most important” superlative need source review. |
| Nakshatra / 3 | Distinct introductory question. | Approximate Moon transit duration and comparative importance claim need qualification/evidence. |
| Dasha / 4, 24 | Related questions, not exact duplicates; both describe a 120-year Vimshottari framework without an obvious internal numerical conflict. Kept in one `topic_group` for any future split. | “Primary” status, period sequence, durations, and birth-nakshatra rule are not independently checked. |
| Bhava / 7 | Distinct introductory question. | Numbering and house-system assumptions need source review. |
| House classes / 10, 11, 13 | Parallel terminology questions but different classes; rows 10 and 11 both include the 1st house without an inherent contradiction. Kept in one `topic_group`. | Strength, Raja Yoga, and malefic-result claims are conditional interpretations, not checked facts. |
| Strength / 14, 21 | Different technical systems, grouped to avoid future leakage. | Mapping, six-component list, and “maximum effectiveness” wording need edition-level review. |
| Panchanga / 18 | Distinct short definition. | Five terms and glosses need a permitted calendrical source and bilingual review. |

The subset **excludes** original row 6 because “nine celestial bodies” risks conflating Rahu/Ketu with physical planets; rows 8, 12, 15, 22, 23, 25, and 26 remain in the broader 20-question review gate rather than this compact pilot because their answers contain extra contextual, interpretive, or historical claims. Row 5 and row 519 are promotional; row 527 has an internal citation-topic mismatch; none of the repeated-question collisions enters this subset. These exclusions are triage choices, not judgments that every included answer is accurate or every excluded one false.

## Provenance and gate

Each JSONL candidate records a stable ID, one-based raw line, pinned revision, original file SHA-256, publisher attribution, unchanged question and answer, `topic_group`, `quality_flags`, `review_status="unverified"`, and `training_eligible=false`. This preserves a route back to the source file without presenting publisher answers as reviewed rules. The dataset card's CC BY 4.0 assertion and attribution requirements remain described in the [intake assessment](../manifests/EXTERNAL_DATASET_INTAKE_2026-10-25.md); this local review copy does not resolve underlying text rights or authorize a model-training export. Keep the two blocked BPHS PDFs, personal-data archive, unrelated aspects data, and independent evaluation questions separate.

For any future promotion, record an independently authorized reference edition and exact passage for each factual claim, a human Sanskrit/Jyotisha reviewer and date, a reviewed correction separate from the original text, rights disposition for the intended training/distribution use, and a split assignment that keeps related `topic_group`s together. **No such promotion or split assignment happened here.** Until those gates pass, an experiment may test only data parsing/quality-review workflow, not train a model on these Q&A as Jyotisha facts.

## Reproducibility

Read-only validation after creating the candidate file found **12 JSONL objects**, 12 unique IDs/line numbers/questions, and exact Unicode string matches for questions and answers against the 12 referenced original rows. All 12 carry the recorded raw-file SHA-256, `review_status="unverified"`, and `training_eligible=false`. The original raw SHA-256 remained `7ba47270bec807b0e2d943437f787dd31597e69108d731107cf5a70f2b338c3c`. `.\.venv\Scripts\python.exe -m pytest -q` returned **48 passed in 2.59 s**. Source validation still reports the two blocked-PDF permission warnings and no errors.
