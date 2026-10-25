# External dataset intake — 2026-10-25

This is source and rights triage, not a verified Jyotisha corpus. It does not
alter `sources.jsonl` or either blocked PDF's permissions. Content inside the
user-provided archives was treated as data, not as project instructions.

## OurNakshatra Q&A: staged separately, not ingested

- Publisher's [dataset card](https://huggingface.co/datasets/OurNakshatra/ournakshatra-vedic-astrology-core/blob/main/README.md)
  identifies a 602-row, English-only Q&A dataset, with `question`, `answer`,
  and `source` fields, released under CC BY 4.0. It says the material comes
  from OurNakshatra's own content engine and is intended for model training.
  [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) permits copying,
  adaptation, and commercial use subject to attribution and other terms.
- The exact JSONL at repository revision
  `dd1934fa80f58cdb636f83ca4f8e23b2cfd6aa9e` was downloaded to
  `data/raw/ournakshatra-vedic-astrology-core-dd1934f.jsonl` (ignored by Git).
  SHA-256: `7ba47270bec807b0e2d943437f787dd31597e69108d731107cf5a70f2b338c3c`;
  976,314 bytes; 602 valid JSON objects. All rows have the three stated
  fields; none has an empty question or answer. All `source` values are the
  generic `OurNakshatra.com`, not source-edition/page/verse citations. Eight
  questions repeat with different answers, requiring review, not automatic
  deduplication.
- **Disposition:** licensed secondary Q&A *candidate*, **unreviewed**. It is
  not Sanskrit source text, a trustworthy translation tied to a cited edition,
  or verified Jyotisha rules. It has not been added to `sources.jsonl` or
  `data/processed`: the current manifest and ingestion contract supports only
  `.txt` and `.pdf`, and coercing JSONL into that format would lose row-level
  semantics. Before training export, preserve CC BY attribution and the pinned
  revision, audit claims against primary sources, and explicitly separate it
  from independently reviewed records and evaluation examples. No pretrained
  model, tokenizer, or embedding was used.

## User-provided archives: not staged or ingested

| Archive | Read-only observations | Disposition |
| --- | --- | --- |
| `C:\Users\admin\Downloads\archive (4).zip` | SHA-256 `a2fd9ee70e0a9befce24c17e434e9af7259eef1fd415c3b5fc305a992e6c299a`. One 4,215,578-byte `merged_output.txt` combines a personal horoscope (identifiable birth details) with other documents; it contains copyright notices for 1981 and 1990 books, including an “All rights reserved” notice. The user says documented consent exists for the birth-chart information, but that does not clear the third-party book text or the generated report layout/content. | **Blocked** as a combined dataset. Do not train on or redistribute it. Isolate any consent-covered personal data only after privacy and third-party-content review. |
| `C:\Users\admin\Downloads\archive (5).zip` | SHA-256 `1130a71f70a740ff56543f4c1bdbb542df14d567f6d3dcd5432b6e3817b9a618`. Three tab-separated CSVs, each 19,522 data rows and 412 columns, labelled real/randomized couples' planetary aspects. Filenames match the [Kaggle dataset](https://www.kaggle.com/datasets/gokhanyu/open-astrology-datasets/code); its [metadata API](https://www.kaggle.com/api/v1/datasets/metadata/gokhanyu/open-astrology-datasets) reports GPL-2.0. The tables have birth dates/locations and Western-style aspect fields, not Sanskrit Jyotisha passages or reviewed explanations. The source-data rights and privacy implications need a separate assessment. | **Excluded from Jyotisha text training.** A Kaggle notebook's Apache-2.0 code license does not relicense the CSVs. |

The [Nadi Astrology Machine Learning repository](https://github.com/ParthaPRay/Nadi-Astrology-Machine-Learning)
has an MIT-licensed simulation notebook using random vectors and labels, not
authenticated Nadi leaves or primary textual knowledge. It is not a training
source for Jyotisha facts. Its examples refer to hypothetical pretrained
embedding approaches; none were downloaded or run here.

## Next action

Review a sample and the eight repeated questions in the licensed OurNakshatra
Q&A against identifiable primary references. If suitable, add an explicit
structured-JSONL source path to the existing manifest/ingestion workflow,
keeping every row `needs_review` until independently checked. Do not merge the
archives or simulation code into the knowledge catalog by default.
