# OurNakshatra Q&A audit — 2026-10-25

**Decision: SUITABLE AFTER CORRECTIONS.** This is an English secondary Q&A candidate with a publisher-stated CC BY 4.0 license, not a reviewed Jyotisha authority or a multilingual/primary-source corpus. No row was promoted, ingested, or exported for training. The original staged JSONL was not edited.

## Scope and provenance

Audited `data/raw/ournakshatra-vedic-astrology-core-dd1934f.jsonl`, staged from [OurNakshatra's dataset](https://huggingface.co/datasets/OurNakshatra/ournakshatra-vedic-astrology-core/blob/main/README.md) at revision `dd1934fa80f58cdb636f83ca4f8e23b2cfd6aa9e`. The prior [intake assessment](EXTERNAL_DATASET_INTAKE_2026-10-25.md) records the acquisition. File size is **976,314 bytes**; SHA-256 before this audit is **`7ba47270bec807b0e2d943437f787dd31597e69108d731107cf5a70f2b338c3c`**. Row numbers below are one-based JSONL line numbers, not verse/page references.

The publisher's card calls the data expert-curated, practitioner-verified, and “Ground Truth.” Those are **publisher claims**. Its stated upstream is its proprietary content engine; it does not identify the authors, editions, or review evidence behind individual answers. This audit independently checked the *staged file's structure and internal consistency*, not the truth of its Jyotisha interpretations.

## Mechanical findings

| Check | Observed result |
| --- | --- |
| JSONL | 602/602 lines parse as JSON objects; no malformed lines; every object has exactly `question`, `answer`, `source` |
| Field completeness | 0 missing, non-string, or whitespace-only values in any field; all 602 questions end in `?` |
| Source field | 602/602 say `OurNakshatra.com`; this is attribution, not a source edition or passage locator |
| Length | Question characters min/median/max **17/51/120**; answer characters **70/1,351.5/3,823**; 481 answers exceed 1,000 characters; about 139,639 answer words total |
| Exact duplication | 0 duplicate full JSON objects; 0 duplicate exact answers |
| Repeated questions | 7 exact-question groups comprising 15 rows (**8 excess occurrences**); all answers in each group differ |
| Language/script | Publisher labels the dataset English. All 602 questions and answers contain Latin letters; 5 answers also contain Devanagari; 0 questions/answers contain Telugu. This is a **script check**, not a linguistic classifier. Sanskrit transliteration appears in English answers. |
| Corruption | UTF-8 decoding succeeded; 0 U+FFFD replacement characters and 0 NUL characters in Q/A. Console substitution glyphs for em dashes are a PowerShell display limitation, not corruption in the file. |
| Citation locators | All 602 `source` fields lack a locator. Only rows **517** and **527** append a named work plus chapter-and-verse claim; row **74** names BPHS chapter 3 but gives no verse/edition/page. The other 599 have no identified chapter-and-verse locator. Many mention “classical texts” without traceable passages. No URL in an answer serves as a source citation. |

For a *screen* of near-duplicates, lowercased questions were reduced to alphanumeric tokens; pairs with token Jaccard ≥0.70 and `SequenceMatcher` ratio ≥0.82 (excluding exact-question repeats) yielded **659 candidate pairs**. This deliberately overcounts parallel but distinct topics. For example, rows 26/32 ask about Sun/Saturn, rows 35/38 ask about Ashwini/Rohini, and rows 551/552 reverse strong 10th/9th versus 9th/10th houses. Those are **not** duplicates simply because their templates match. Row 1/2 (`Lagna`/`Lagnesh`) illustrates how similar spelling also creates false positives. Split design must keep genuinely related templates together and avoid blindly deleting different Graha/Nakshatra entries.

## Repeated-question groups and conflict review

The answer descriptions below are *paraphrases of publisher text*, not endorsed rules. Each group needs a topic-bearing question, source evidence, and reviewer decision. None has an independently verified source locator.

| Rows | Repeated question | Distinct answer topics; conflict assessment |
| --- | --- | --- |
| 181, 186 | “What changes outcomes?” | Pitru Dosh modifiers vs Grahan Dosh modifiers. **Context collision:** the same question cannot identify which condition is meant. Not a demonstrated factual contradiction. |
| 202, 228 | “How to judge strength in real charts?” | Parivartana yoga vs Vipareeta Raja Yoga. **Context collision**, not interchangeable answers. Row 202's dispositor advice and row 228's Navamsa confirmation require independent checks. |
| 216, 227, 310 | “What tends to be exaggerated online?” | Chandra Mangala Yoga vs Vipareeta Raja Yoga vs Sun Mahadasha. **Three-way context collision**; generic question loses the topic. Classical-text generalizations have no cited passage. |
| 232, 243 | “Cancellation and reduction conditions?” | Pancha Mahapurusha Yoga vs combustion. **Context collision**. Row 243 makes specific claims about combustion offsets and graha-yuddha latitude without a source locator; do not treat them as established. |
| 277, 282 | “The role of the concurrent dasha?” | Sade Sati vs Shani Dhaiya. **Context collision** with different transits and examples; not a proven contradiction. |
| 292, 296 | “The role of the dispositor?” | Rahu Mahadasha vs Ketu Mahadasha. **Context collision**; the differing predictions require source and expert review. |
| 293, 297 | “How to judge the Mahadasha in a real chart?” | Rahu vs Ketu Mahadasha. **Context collision**; not a demonstrated contradiction, but answers are unsafe to use with the question alone. |

**Additional internal conflict requiring correction:** row **527** asks about a *3rd-house effort versus 9th-house fortune* comparison, then appends a purported *Phaladeepika* 24.15 Sanskrit line, transliteration, and English gloss about **11th-house gains versus 12th-house loss**. Even without deciding whether the citation or translation is authentic, that attached example does **not support the answer's central 3rd/9th claim**. Row **517** appends a purported BPHS 66.1 line introducing Ashtakavarga but uses it to frame a much broader “binary code”/degree-by-degree origin story; the appended line alone does not substantiate those claims. Both are unresolved until an identified edition and bilingual reviewer check the text and interpretation. No direct, source-grounded contradiction between the seven exact-question answer groups was established; the primary failure is missing context and provenance.

## Representative factual-quality sample

| Row | Topic and publisher-provided claim | Evidence present | Result/action |
| --- | --- | --- | --- |
| 1 | Defines Lagna as the sign rising at birth. | Publisher attribution only. | **Unresolved Jyotisha claim.** Check a rights-permitted, edition-identified Sanskrit source and reviewed translation. |
| 74 | Says BPHS chapter 3 supports combustion thresholds and a solar “incinerator” explanation. | Work and chapter name, **no verse/edition/page**; mixes astronomy, interpretation, and a word-origin claim. | **Unresolved.** Split the claims and locate each passage; review Sanskrit terminology. |
| 278 | Attributes Sade Sati transit framing to BPHS, Phaladeepika, and Brihat Jataka. | Names works but no edition/chapter/verse. | **Unresolved.** Do not accept cross-text synthesis without specific passages and tradition-specific review. |
| 517 | Explains Ashtakavarga through a “binary code” analogy. | Purported BPHS 66.1 Sanskrit/transliteration/gloss at end. | **Unresolved.** Check exact edition and verse; distinguish passage content from modern analogy and claims about degrees. |
| 527 | Compares 3rd and 9th house strengths. | Purported Phaladeepika 24.15 line/gloss about 11th and 12th houses. | **Internal citation-topic mismatch.** Quarantine until corrected and externally checked. |
| 519 | Recommends the publisher's Ashtakavarga website/tool. | Self-referential product mention, no source for method. | **Promotional content**, not a reviewed knowledge answer; exclude from a factual pilot subset unless rewritten and reviewed. |
| 529 | Uses Steve Jobs's chart as proof of Ashtakavarga accuracy. | No reproducible birth-data source, calculation settings, or evaluation method in the row. | **Unresolved evidentiary claim**; do not use as proof or an evaluation example. |

Rows 517 and 527 reproduce short purported Sanskrit lines from named works **inside the publisher's dataset**. Their accuracy, edition provenance, and whether the publisher can license all embedded third-party material were not independently established. This audit does not quote those lines into the report.

No project source catalog entry presently supplies a **rights-approved, edition-identified Jyotisha text and trustworthy translation** for independent source checking. The two local BPHS PDFs remain `pending_review`/`blocked` with `allowed_uses=["catalog"]`; their contents were not consulted for this audit. This explains why **0/602 rows can be called independently verified here**, not that all 602 are false. Textual claims with exact locators remain unresolved, not validated by the publisher's self-description.

## License, exclusions, and training disposition

The card asserts [CC BY 4.0](https://huggingface.co/datasets/OurNakshatra/ournakshatra-vedic-astrology-core/blob/main/README.md). [CC's deed](https://creativecommons.org/licenses/by/4.0/) permits sharing/adaptation, including commercial purposes, with appropriate credit, license link, and a modification notice; it gives no accuracy warranty and warns that other rights can matter. Retain OurNakshatra attribution, dataset URL, license URL, pinned revision, source-file checksum, and any corrections in any later dataset/model documentation. The card's proprietary-content-engine statement is evidence of claimed publisher provenance, **not** proof of ownership/clearance for every Sanskrit quotation or borrowed interpretation. Confirm the full license/rights chain before public redistribution or commercial use of derived text/weights; obtain qualified advice if needed. No license can turn an unsupported rule into a verified one.

Keep this candidate separate from the **two blocked BPHS PDFs**, the consent-bearing but third-party-book-contaminated **archive (4)**, the unrelated couples/aspects **archive (5)**, existing unreviewed researcher-authored notes, and independent evaluation examples. None was merged or exported. The 602 rows are a single publisher `train` split, not a held-out evaluation set or evidence of multilingual coverage. At about 140k answer words, this is at most a small domain-specific pilot source; it cannot by itself support a useful multilingual language model trained from random weights.

**Proposed reviewed-subset record (format proposal only; no records created):** `dataset_id`, `revision`, `raw_sha256`, `raw_row_number`, `original_question`, `original_answer`, `publisher_attribution`, `license`, `topic`, `corrected_question`, `corrected_answer`, `changes_made`, `evidence[]` (work, edition, exact locator, rights status, passage checked), `claim_kind`, `review_status` (`unreviewed` / `needs_correction` / `reviewed` / `rejected`), `reviewer_id`, `review_date`, `review_notes`, and `split_group_id`. Keep original and corrected text separate. A reviewed status requires an independent qualified reviewer, exact approved-source evidence, and a documented rights decision; no existing row satisfies that gate in this audit.

**Smallest next action:** select **20 distinct, non-promotional fundamentals questions** from the 602, have a Sanskrit/English Jyotisha reviewer check each *against one rights-approved, edition-identified source with exact verse/page and translation*, correct/retain/reject each answer, and write a small independent evaluation set kept outside training. Resolve row 527's mismatch and the seven context-collision groups before selecting from them. Only after enough reviewed, rights-cleared text exists should the project freeze splits and consider a tiny **randomly initialized** tokenizer/model *pipeline experiment*; 20 Q&A items alone would not train a competent Jyotisha model. No tokenizer or model work was performed here.

## Verification performed

Read-only analysis of the original JSONL; no models, embeddings, LLM APIs, or training export. The repository test suite (`.\.venv\Scripts\python.exe -m pytest`) collected **48 tests; 48 passed in 1.53 s** on this audit run. No raw data or source-permission record was modified.
