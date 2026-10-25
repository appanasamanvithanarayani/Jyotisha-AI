# Research verification and training-readiness audit — 2026-10-25

Scope: the seven substantive `reviewer_explanation` rows in `records.jsonl`,
their recorded PDF locators, the source catalog, and the current validators.
"Located" below means the statement was found in the local *English
rendering*, not that the Sanskrit, translation, traditional attribution, or
astrological efficacy has been independently verified. All seven records
remain `needs_review`. The pre-existing ayanamsha row is a source-free
project workflow note, not a verified Jyotisha rule.

| Knowledge ID / topic | Evidence located | Unresolved issue and required review action |
| --- | --- | --- |
| `graha.nine_named_in_bphs_3_10` — nine grahas | Vol. I ch. 3 v. 10, printed p. 27 / PDF p. 26 gives the nine-name sequence. | Names and order match the English rendering; the physical-planet caveat is researcher explanation. Reviewer should compare Sanskrit names and the exact edition before promotion. |
| `graha.benefic_malefic_bphs_3_11` — conditional classification | Vol. I ch. 3 v. 11, printed p. 27 / PDF p. 26 supports the listed grouping and Mercury condition. | "Decreasing"/"waning" Moon and "joins"/"association" are translation and operational-definition questions. Do not merge the following translator's alternate Moon-strength commentary. Reviewer should check Sanskrit and delimit the conditions. |
| `graha.significations_bphs_3_12_13` — significations | Vol. I ch. 3 vv. 12–13, printed p. 28 / PDF p. 27 is the stated location. Sanskrit Wikisource ch. 3 has corresponding verses, but the local English PDF text extraction of this paragraph is badly corrupted. | **Not reliably confirmed in full from the extracted local English text.** In particular "self", Mars "vitality", and Venus "potency" require inspection of the page image and bilingual checking of the Sanskrit terms and Santhanam's printed glosses. Do not turn the list into a verified rule. |
| `rashi.twelve_names_bphs_4_3` — sign sequence | Vol. I ch. 4 v. 3, printed p. 48 / PDF p. 47 visibly lists twelve English sign names in the stated order. | These are English equivalents, not Sanskrit transcriptions. Reviewer should check every Sanskrit-to-English mapping; the passage alone does not specify a chart algorithm. |
| `rashi.three_modalities_bphs_4_5` — movable/fixed/dual cycle | Vol. I ch. 4 passage labeled approximately vv. 5–5½, printed p. 49 / PDF p. 48 gives the repeating classes. The explicit named grouping follows in translator Notes. | Record's `verse="5"` points to the beginning but does not capture the edition's half-verse label. Reviewer should confirm verse boundaries in the printed page/Sanskrit and keep translator enumeration separate from verse content. |
| `bhava.first_house_topics_bphs_11_2` — first-house topics | Vol. I ch. 11 v. 2, printed p. 121 / PDF p. 120 lists body/appearance, intellect, strength, happiness/distress and disposition. | Broad topics match the English rendering; precise meanings of its terms and the ascendant/house formulation need bilingual review. No deterministic outcome follows from this verse alone. |
| `dasha.vimshottari_sequence_bphs_46_12_14` — Dasha-lord order | Combined PDF ch. 46 vv. 12–14, printed p. 507 / PDF p. 498, under Vimshottari Dasha, gives the Krittika-starting sequence and says later periods follow that order. | Sequence is located in the English rendering; Volume II translator, edition and printing are not established in the manifest. Reviewer should check the Sanskrit and edition, plus whether "repeating" has the intended scope. Durations and birth-balance calculation are not established by this note. |

The [Sanskrit Wikisource chapters](https://sa.wikisource.org/wiki/%E0%A4%AC%E0%A5%83%E0%A4%B9%E0%A4%A4%E0%A5%8D%E0%A4%AA%E0%A4%BE%E0%A4%B0%E0%A4%BE%E0%A4%B6%E0%A4%B0%E0%A4%B9%E0%A5%8B%E0%A4%B0%E0%A4%BE%E0%A4%B6%E0%A4%BE%E0%A4%B8%E0%A5%8D%E0%A4%A4%E0%A5%8D%E0%A4%B0%E0%A4%AE%E0%A5%8D)
are a preliminary numbering/content cross-check, not an independent human
review or a proven match to the local edition. Individual Wikisource revision
IDs are not recorded in the knowledge rows.

## Integrity, copying, and provenance

- The PDF SHA-256 hashes match both manifest entries. Each of the seven rows
  has a valid source ID plus chapter, verse, printed page, and PDF page.
- No extended verbatim book passage, Sanskrit verse, or translator paragraph is
  present in the seven explanations. They paraphrase short facts and lists;
  brief terminology and ordered names overlap the sources by necessity. This
  inspection is not a legal non-infringement determination.
- The notes mix a labeled "Source statement" with a labeled "Researcher
  explanation" inside one `english_explanation` field. The labels help, but
  the schema cannot verify the boundary or whether a gloss is justified.
- The source manifest still has filename-derived titles, `edition=null`,
  `publication_year=null`, `languages=["und"]`, and unverified acquisition
  details. Volume I's record-level edition description is supported by its
  cover but has not been reconciled into the manifest. Volume II's bibliographic
  attribution is especially incomplete. The note author's identity, creation
  date, and rights grant are not recorded. These are provenance gaps, not
  reasons to fabricate metadata.
- The validator checks structure and the permission gate, **not** whether
  quoted locators, translations, or assertions are true. No independent
  `reviewer_id` or `reviewed_at` is present, correctly matching `needs_review`.

## Training-readiness decision

**Zero PDF-derived training passages are authorized by this catalog.** Both
sources retain `permission.status=pending_review`, `allowed_uses=["catalog"]`,
`processing.status=blocked`, and no rights evidence. `data/processed` contains
no corpus. Do not export PDF text, verse transcriptions, tables, or the
translation/commentary for training.

The seven researcher-authored summaries are substantive *draft research
material*, not authorized or reviewed training examples. Their authorship and
reuse rights have not been recorded; several claims need bilingual review;
and seven English notes cannot support a multilingual tokenizer or domain
model. The test suite's synthetic fixtures are permitted for testing but are
not genuine Jyotisha training data. There are currently no reviewed rules,
multilingual examples, or independent evaluation set.

Wikisource's [copyright policy](https://wikisource.org/wiki/Help:Copyright)
describes public-domain/CC BY-SA content, but the particular BPHS
transcription's underlying edition and obligations have not been resolved for
this project. Its online availability does not change either local PDF's
status. This is a cautious project-readiness assessment, not legal advice.

**Smallest next step toward a corpus:** obtain and record a written AI-training
grant for one exact edition, or identify one specific public-domain edition
with documented digitization rights. Independently, a Sanskrit/English reviewer
must check the seven specified printed pages against page images and record
corrections/approval. No status promotion or training export should occur
until both rights and content review pass.
