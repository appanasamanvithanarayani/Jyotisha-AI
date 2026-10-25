# BPHS research findings (2026-10-25)

This is a research log, not a verified-rule collection or training corpus. The
substantive machine-readable notes are in `records.jsonl`; all seven new notes
are `reviewer_explanation` and `needs_review`. The older
`workflow.ayanamsha_configuration` record remains an unverified project note.
No book passage, Sanskrit verse, translator commentary, or PDF page was copied
into the catalog. Descriptions below refer to Jyotisha textual traditions, not
scientifically established predictions.

## Inspected local editions and coverage

| Manifest source ID | Observed item | Coverage and overlap | Rights |
| --- | --- | --- | --- |
| `bphs-vol1-welib-13609f1a` | 482-page PDF. Cover identifies R. Santhanam's English translation, commentary, annotation and editing, Ranjan Publications, Volume I. Publication year and specific printing are not established. Body has English rendering and Sanskrit-script material whose extracted text is badly corrupted. | Chapters 1–45, including chapter 3 grahas, 4 rashis, 6–7 vargas, 8 and 26 aspects, 11 bhavas, 24 house lords, 35–42 yogas. | `pending_review`; `allowed_uses=["catalog"]`; blocked for ingestion/training. |
| `bphs-2vol-welib-de6cd341` | 1,033-page combined PDF. Its first cover and preface are the same Volume I material. Its Volume II table of contents precedes the Volume I preface; exact Volume II translator/printing remains unconfirmed from inspected pages. | The Volume I text layer matches the separate PDF on all 482 pages after accounting for 13 inserted contents pages following combined PDF page 8. This is overlap, not independent corroboration. The remainder includes chapters 46–97, beginning with Dasha systems at chapter 46; the contents also lists later Nakshatra/Dasha chapters. | Same pending/blocked status. |

The page mapping for Volume I research is separate-PDF page `n` = combined-PDF
page `n+13` for `n >= 9`; PDF pages 1–8 match directly. These are PDF viewer
page numbers, **not** the printed page numbers in `source_references`. The
text layer is adequate to locate short English passages but often corrupts
Sanskrit and some English. No machine-extracted verse or table should be
trusted without page-image inspection and bilingual review.

## What was actually researched

The seven new records contain concise, independently worded observations of:

| Record | Local locator | Source statement distinguished from explanation |
| --- | --- | --- |
| `graha.nine_named_in_bphs_3_10` | Volume I ch. 3 v. 10, printed p. 27, PDF p. 26 | Nine named grahas; the note explains that a traditional graha list is not a list of nine physical planets. |
| `graha.benefic_malefic_bphs_3_11` | Vol. I ch. 3 v. 11, printed p. 27, PDF p. 26 | Benefic/malefic grouping with Moon and Mercury qualifications; translator commentary on Moon strength is excluded. |
| `graha.significations_bphs_3_12_13` | Vol. I ch. 3 vv. 12–13, printed p. 28, PDF p. 27 | Selected significations; notes flag English glosses needing bilingual review. |
| `rashi.twelve_names_bphs_4_3` | Vol. I ch. 4 v. 3, printed p. 48, PDF p. 47 | Twelve-sign sequence, without a chart-calculation claim. |
| `rashi.three_modalities_bphs_4_5` | Vol. I ch. 4 v. 5, printed p. 49, PDF p. 48 | Repeating movable/fixed/dual sequence; translator's enumeration is distinguished. |
| `bhava.first_house_topics_bphs_11_2` | Vol. I ch. 11 v. 2, printed p. 121, PDF p. 120 | First-house topics for consideration, not a prediction. |
| `dasha.vimshottari_sequence_bphs_46_12_14` | Combined PDF ch. 46 vv. 12–14, printed p. 507, PDF p. 498 | Dasha-lord sequence only; no durations, arithmetic, or interpretation implemented. |

Chapter/verse alignment and some source statements in chapters 3, 4, and 11
were compared with the [Sanskrit Wikisource BPHS index](https://sa.wikisource.org/wiki/%E0%A4%AC%E0%A5%83%E0%A4%B9%E0%A4%A4%E0%A5%8D%E0%A4%AA%E0%A4%BE%E0%A4%B0%E0%A4%BE%E0%A4%B6%E0%A4%B0%E0%A4%B9%E0%A5%8B%E0%A4%B0%E0%A4%BE%E0%A4%B6%E0%A4%BE%E0%A4%B8%E0%A5%8D%E0%A4%A4%E0%A5%8D%E0%A4%B0%E0%A4%AE%E0%A5%8D).
That transcription has not been tied to a verified printed edition, so it is
only a cross-check, not a second established authority or an approved training
source. Nakshatra, yoga, varga, aspect, dignity, and other Dasha *coverage* was
located in contents/pages, but substantive notes for those topics have not
yet been researched or reviewed.

## Rights and potential sources

Neither local PDF has evidence of AI-training permission. Its `permission`
fields remain unchanged and both PDFs remain blocked by the source catalog.
Possession, a WeLib filename, and a citation do not grant reproduction or
training rights. Do not ingest their text or add their passages to datasets.

[Wikisource's copyright policy](https://wikisource.org/wiki/Help:Copyright)
requires hosted works to be public domain or available under CC BY-SA, and
the Sanskrit BPHS pages display a CC BY-SA notice. This is a **candidate for
an edition-specific rights review**, not automatic approval: identify the
transcription's source edition, contributors' licensing, applicable
jurisdictions, attribution/share-alike obligations, and whether the intended
training workflow complies. No Wikisource text has been downloaded or
registered as a source here.

The [Sanskrit Documents FAQ](https://www.sanskritdocuments.org/faq/) says its
volunteer-prepared files are for personal study/research and restrict copying
or reposting for other purposes without permission. An online Sanskrit file
there is not treated as a training source. An independent, genuinely
public-domain printed Sanskrit edition with documented digitization rights
could be another route; none has been verified here. The modern English
Santhanam translation/commentary must be assessed separately from an older
Sanskrit base text.

## Dataset boundaries and next technical stages

Keep these as five different stores with explicit provenance, version, rights,
and split membership:

1. **Permitted raw sources:** only source-catalog entries whose exact edition
   and intended training uses pass rights review, with immutable checksums.
   Current local PDFs contribute zero training passages.
2. **Researcher-authored explanations:** `data/knowledge/records.jsonl` is the
   current draft store. The seven new records are substantive but unreviewed;
   the workflow note is not an astrology rule. Authorship/rights of these
   explanations should be recorded before any training export.
3. **Reviewed rules and examples:** a future export must require independent
   source/translation review, precise locators, rights approval, and a
   `reviewed` status. No such records exist now.
4. **Multilingual training examples:** future independently authored and
   reviewed Sanskrit/transliteration/English/Telugu pairs or tasks, derived
   only from rights-cleared material. None exist now.
5. **Independent evaluation examples:** hold out source works/chapters and
   author independent answers before model training; prevent near-duplicate
   and cross-translation leakage. None exist now.

After rights clearance and enough diverse, quality-controlled multilingual
text, freeze source/split manifests; train a new tokenizer on training-only
permitted text; initialize a modest decoder-only Transformer with random
weights; pretrain with reproducible compute/data logs; then run separate
astrology-domain training on reviewed material. Evaluate on held-out factual,
multilingual, citation, and abstention tasks against simple baselines. A
deterministic Jathakam engine should separately compute chart quantities from
recorded birth inputs, location/time-zone, ephemeris, ayanamsha, and house
conventions; test numeric boundaries against independent references. Model
prose must not substitute for those calculations. Model size and compute
budget should be chosen only after the permitted corpus is measured. No
tokenizer, model, exporter, or chart engine was built in this research step.

**Next action:** obtain and record written rights terms for a specific source
edition and intended AI-training uses (or document a demonstrably public-domain
edition and digitization), then have an independent Sanskrit/English reviewer
check the seven notes and locators. Only then consider promotion and a
training-corpus export.
