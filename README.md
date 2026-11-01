# Jyotisha AI

Jyotisha AI is a research project for building a multilingual Vedic astrology
language model from randomly initialized weights. The repository now includes
an **experimental deterministic chart calculator**, separate from model work.
Two locally supplied PDFs remain blocked pending training-rights review. The
project has no tokenizer or language model; the chart calculator is not yet
independently benchmarked as a complete Jathakam engine.

## Local research app

Run the original, localhost-only interface with the existing environment:

```powershell
.\.venv\Scripts\python.exe -m jyotisha_ai serve
```

Open `http://127.0.0.1:8765` in your browser. The user-facing form asks only
for DOB, POB, and TOB. It now offers a **local experimental birth-instant chart**
when the approved place catalog and exact calculation dependencies are present.

For phone access without USB, connect the laptop and phone to the
same **trusted private Wi-Fi**, find the laptop's current IPv4 address with
`ipconfig`, and start a separate preview (replace the example address):

```powershell
.\.venv\Scripts\python.exe -m jyotisha_ai serve --lan-ip 192.168.1.35 --port 8766
```

Only an explicit RFC1918 IPv4 address is accepted; `0.0.0.0` and public IPs
are rejected. The terminal prints a one-time access code. On the phone, open
`http://192.168.1.35:8766/` and, when prompted, enter username `preview` and
that code. The code is required for every page and API request. The LAN server
runs until stopped with Ctrl+C (or add `--lan-minutes 30` for a timed session).
The laptop must remain on, and a changed Wi-Fi IP requires restarting with the
new address. The original localhost server on port 8765
can remain running. If Windows Firewall asks, allow Python only on **Private**
networks; do not allow Public networks or open a router port. This is plain
HTTP, not encrypted or production-ready: use **synthetic birth details only**.
The phone's browser location button may be unavailable on this HTTP LAN URL;
type/select a city manually. If an online Ask provider is configured, asking
from the phone sends the question and calculated chart labels to that provider.

When changing the local app code, restart the Python server process before
reloading the page. Templates are read from disk on each request, but API and
JavaScript-file routes are defined when the process starts. An old process can
therefore serve new HTML while returning 404 for a new script. Check that
`/locales.js`, `/chart-ui.js`, `/calendar-ui.js`, `/panchang-names.js`, `/app.js` and `/app.css` all return HTTP 200
on the **same port** as the page.
The true-Lahiri method and two complete synthetic reference-chart comparisons
are documented in
[`evaluations/AYANAMSHA_REFERENCE_CHECK_2026-10-28.md`](evaluations/AYANAMSHA_REFERENCE_CHECK_2026-10-28.md).
The result page displays an experimental South Indian fixed-sign D1 Rashi
diagram with Lagna, seven calculated planets, and whole-sign house numbers.
The numerical positions remain available under “Show numerical positions.”
The “Ask about this chart” box answers a small set of questions from the
calculated JSON in the browser (for example, Lagna or a planet's Rashi), in the
selected language; keyword matching understands English plus each locale's own
terms, and the quick-question buttons work in every language. The result page also
shows **Janma Rashi**, the sign of the calculated Moon (not the Lagna).

The Kundli result is a full chart view: the Lagna, Janma Rashi and Nakshatra at a
glance; a **South Indian or North Indian** chart style; the **Rashi (D1)** and
**Navamsa (D9)** charts; a planetary table with sign, degree, Nakshatra, Pada and
Nakshatra lord, bhava, exaltation/debilitation/own-sign status and retrograde
marks; **Rahu and Ketu** from the **mean** lunar node (not the true node); the
Panchang at the birth moment with each element's start and end time; and the
Vimshottari Mahadasha and current Antardasha with approximate dates (365.25-day
years). The Lagna cell is marked with a Lagna badge and the Moon-sign cell with a
moon badge so the two are never confused. These details are derived by
`kundli_details.py` from the validated chart; only D1 and D9 are drawn, no house
cusps or interpretations are given, and the whole result stays experimental.
It is not a trained Jyotisha AI model and its interpretations are not
independently reviewed. Ask stays local without an API key; with an optional
online provider enabled, chart questions and calculated labels leave the
computer. Use synthetic birth details while validation is limited.
The phone-first, light-themed app now opens in three separate steps: welcome,
language, then calendar location. The location step requests browser
geolocation **only after the user taps Allow location**. Coordinates are sent
only to the local `127.0.0.1` process for a nearest-city suggestion from the
approved offline catalog; this app does not save them, send them to a public
geocoder, or treat them as the user's birthplace. The browser or operating
system's geolocation provider may have separate network and privacy behavior.
The user must confirm the suggested city or
type another one. If permission is denied or no catalog city lies within
25 km, manual entry remains available. The main interface has separate Home,
Kundli, and Ask tabs instead of a single long scrolling page. The language can
be changed at any time from the dropdown in the header, in place. After
onboarding, the **Home** tab opens with a **sunrise-based Daily Panchang** for the
selected city and date: sunrise, sunset, moonrise, moonset, Tithi, Nakshatra,
Yoga, Karana and Moon sign **with end times** (sunrise to next sunrise), Paksha,
Vara, day/night length, and the conventional Brahma Muhurta, Abhijit, Rahu Kalam,
Yamaganda and Gulika Kalam windows, Pratah/Sayahna Sandhya, Vijaya and Nishita
Muhurta, **Varjyam**, and **Chandrabalam and Tarabalam** (the favourable rashis
and Nakshatras for each Moon-sign and Nakshatra period). Every Tithi, Nakshatra,
Yoga, Karana and Moon-sign period is shown with its end time, including ends
after the next sunrise. A **month calendar** on Home shows each day's Tithi at
sunrise and marks Ekadashi, Purnima and Amavasya; tapping a day loads that day's
full Panchang. Chandrabalam, Tarabalam, Varjyam and the muhurta windows use
conventional rules that are not expert-reviewed (the Varjyam table was checked
against one published sample). Times use Astronomy Engine rise/set (upper
limb, standard refraction, sea level) and the project's true-Lahiri value at
sunrise; a date with no sunrise or sunset returns no result. The muhurta windows
are conventional eighth/fifteenth-of-daytime divisions, not reviewed rules. On a spot check against a public
Panchang for Bengaluru the sunrise/sunset and all Panchang transitions agreed
within about a minute, while moonrise/moonset differed by about four minutes
(a topocentric/limb convention difference); this is not a validation. The
The interface is available in English and 16 Indian languages: Hindi, Telugu,
Tamil, Kannada, Malayalam, Marathi, Bengali, Gujarati, Punjabi, Odia, Assamese,
Urdu (right-to-left), Nepali, Sanskrit, Konkani (Devanagari) and Maithili. Each
locale file in `src/jyotisha_ai/web/locales/` supplies the interface copy,
Panchang names, sign and planet names, and factual chart-answer templates, and a
test (`tests/locales.test.cjs`) requires every locale to define the full key set.
**All of this non-English wording was written without review by native-speaker
experts**, the Sanskrit-origin names for several scripts were derived by script
transliteration, and every locale is marked `"review": "unreviewed"`. Method
identifiers (ayanamsha ID, ephemeris string, validation status) stay in their
original form. Bodo, Dogri, Kashmiri, Santali, Sindhi and Manipuri (Meitei) are
**not included**; an unsupported language is not silently presented as translated,
and adding one means adding one locale file. Typing at least
two letters in the city or birthplace field offers
matches from the locally approved GeoNames catalog; select a listed value or
enter an exact supported place name. Suggestions never use an online geocoder
and may omit smaller places or ambiguous names. Name order and Romanized
spellings follow the
[IMD Rashtriya Panchang list](https://packolkata.imd.gov.in/panchang/en/tithi-nakshatra);
these names label experimental indices and do not validate the calculation. The
month calendar verifies the approved offline place catalog and pinned time zone
once per request and returns no results on missing or ambiguous data.

**Festivals and holidays** appear on the calendar (a ✦ on the day, a list under
the month, and chips on the selected day). They are computed from the sky by
`festivals.py`, not stored: the amanta lunar month (named by the sign the Sun
enters, with Adhika months detected so no festival lands in them), the Tithi at
the festival's time of day (sunrise, forenoon, midday, afternoon, pradosha or
midnight), Bhadra avoidance for Raksha Bandhan and Holika Dahan, Sankrantis, Onam
from the Moon's Nakshatra, Good Friday and Easter, and the fixed Gregorian
gazetted holidays. Gazetted holidays on the central list are tagged "Public
holiday". The rules were checked against published 2025 and 2026 dates for
Bengaluru (including Holi, Raksha Bandhan, Janmashtami, Diwali and the Adhika
Jyeshtha year 2026), but they are simple conventional rules, not expert-reviewed:
a printed Panchang can differ by a day, regional practice varies, and Islamic and
state-specific holidays are not included. The Love tab provides an unreviewed,
relationship-focused reading from the existing chart-reading code and a
**descriptive chart-overlap count** for two calculated birth charts. Enter your
own DOB/POB/TOB in Kundli first, then the other person's details in Love with
their consent. The comparison counts exact agreement of Moon sign, birth
Nakshatra, Lagna sign, and Venus sign (one point each). The displayed percentage
is 0–100% in 25-point steps, with the 0–4 breakdown underneath. This
project-defined overlap is **not** Ashtakoota/Guna Milan, a
validated Jyotisha compatibility score, or a prediction of relationship
success. The other person's details are sent to this chart server for the
calculation but are not stored in browser localStorage by this feature. If
optional ads are enabled, their third-party script may run on the same page;
do not assume the form is private from that script. Both charts remain
experimental, and the relationship reading requires expert review. The new
Love screen is translated into English and Telugu; other interface languages
currently fall back to English on this screen, while the underlying reading
uses the translations available in `chart-ui.js`. Do not use the displayed
overlap to decide whether to marry or end a relationship.

**Optional online Ask provider.** Without a key, Ask uses limited offline keyword
answers; this is not general multilingual understanding. To use
Gemini, create an API key in [Google AI Studio](https://aistudio.google.com/apikey)
and add these lines to the git-ignored `.env` file in the project root (replace
the example with your own key; do not paste the real key into chat or source code):

```text
JYOTISHA_ASSISTANT_PROVIDER=gemini
GEMINI_API_KEY=YOUR_KEY_HERE
```

Restart with `.\.venv\Scripts\python.exe -m jyotisha_ai serve`. The startup notice
must say `Chat assistant ON (gemini)`. The default model is
`gemini-3.5-flash-lite`; set `JYOTISHA_GEMINI_MODEL` only to a model available to
your AI Studio project. The server calls Google's text-generation REST API without
adding a runtime dependency. If the request fails or reaches a quota, Ask falls
back to the local limited answer. My Jathakam and preset buttons remain offline.

The free API tier is model- and project-limited; verify the current tier and limits
in AI Studio before use. On Google's unpaid tier, submitted questions and chart
facts may be used to improve Google products and reviewed by humans. Do not use
real personal birth details or sensitive questions in this local prototype.
The browser never receives the API key. The API receives the user's question and
calculated chart labels (signs, houses, period), but not the name or birth place;
the question itself can contain personal information. Generated answers are not
verified Jyotisha knowledge or evidence for training the from-scratch model.
See Google's [pricing](https://ai.google.dev/gemini-api/docs/pricing) and
[API terms](https://ai.google.dev/gemini-api/terms).

The existing optional Anthropic provider remains available by setting
`JYOTISHA_ASSISTANT_PROVIDER=anthropic` and `ANTHROPIC_API_KEY`. If both keys are
present and no provider is chosen, online Ask stays off to avoid an accidental
external request. `JYOTISHA_ASSISTANT_PROVIDER=offline` forces offline Ask.

**Deploying to the internet.** `python -m jyotisha_ai serve --public` (what the
`Dockerfile` runs) listens on `$PORT`, checks the `Host` header against
`JYOTISHA_ALLOWED_HOSTS` (comma separated; set it to your domain), rate-limits every
`/api/` call per visitor, caps chat questions per visitor and per day
(`JYOTISHA_ASK_DAILY_LIMIT`, default 1000), and serves `/healthz` and `/privacy`
(set `JYOTISHA_CONTACT` to your support email). HTTPS must be provided by the
platform in front (Cloud Run, Render, Railway, Fly.io all do this). Set the AI
provider key (`GEMINI_API_KEY` or `ANTHROPIC_API_KEY`, plus
`JYOTISHA_ASSISTANT_PROVIDER`) as a secret in the platform, never in the image.
Only the GeoNames place list under `data/raw` is shipped; the research source books
are git-ignored and excluded from the image. Place data © GeoNames, CC BY 4.0.
Example (Google Cloud Run): `gcloud run deploy jyotisha --source . --region asia-south1
--allow-unauthenticated --set-env-vars JYOTISHA_ALLOWED_HOSTS=<your-domain>,JYOTISHA_CONTACT=<email>`.

**Installable app (PWA) and Play Store.** The site ships a web app manifest, icons and a
service worker, so Chrome offers "Install app" / "Add to Home screen". The Android
wrapper (Trusted Web Activity, built with PWABuilder or Bubblewrap) opens your HTTPS
domain; to verify it, set `JYOTISHA_ANDROID_PACKAGE` (your package name) and
`JYOTISHA_ANDROID_SHA256` (the app-signing certificate fingerprint(s) from Play Console,
comma separated) and the server then serves `/.well-known/assetlinks.json`.

**DigitalOcean.** Easiest: App Platform, which builds the `Dockerfile` from GitHub and
gives HTTPS (`.do/app.yaml` is a ready spec; set the secret `GEMINI_API_KEY` and
`JYOTISHA_ALLOWED_HOSTS` in the console). Cheaper/more control: a Droplet with Docker;
copy `deploy/digitalocean/env.example` to `.env`, fill it in, and run
`docker compose -f deploy/digitalocean/docker-compose.yml --env-file .env up -d --build`
(Caddy fetches the HTTPS certificate for `DOMAIN`; a free `<ip>.sslip.io` name works
if you have no domain).

**Ads (off by default).** Set `JYOTISHA_ADSENSE_CLIENT=ca-pub-...` to turn on Google AdSense:
the page then loads Google's ad script, the Content-Security-Policy allows Google's ad domains,
`/ads.txt` is served, and `/privacy` describes advertising. Without it none of this is active.
Use a domain you own (AdSense does not accept shared hostnames such as sslip.io), switch on
Google's consent message in AdSense (Privacy & messaging), and keep ads out of the installed
Android wrapper unless Google's policies for your setup allow it.

**Settings are remembered** on the device (`localStorage`: language, city, and
whether the city follows your location). Onboarding (welcome, language, city)
runs only on a fresh install and the app defaults to English; afterwards it opens
straight to Home. Location is requested only when you tap a location button; the
browser shows its own allow-while-using / this-time / don't-allow choice and
remembers it. If you allowed it and chose location, later visits quietly update
the city from your position, but only when the browser already granted
permission, so the app never re-prompts. If you declined, or typed a city, the
saved city is used. The city can be changed at any time from **Change city** on
Home, and the language from the header dropdown. The page is a localhost web interface, not a native
mobile application or public production deployment. Its styling is plain CSS
(`app.css`) because the page's content-security policy blocks external fonts and
images.
This is limited validation, not a verified general-purpose Jathakam. A pinned
`tzdata==2026.5` runtime dependency provides
historical IANA civil-time rules; the resolver refuses missing or different
versions, ambiguous or nonexistent DST times, ambiguous places, and pre-1970
local-time histories. No guessed offset, zero-ayanamsha chart, or fallback
backend is returned. The page checks `/api/birth-readiness` on load and
disables the birth form if any prerequisite or synthetic runtime check fails.
The old explicit-input experimental calculator remains at `/research`; it
requires an historical UTC offset, coordinates, and a sourced numeric
ayanamsha. Neither page saves birth details; the optional Ask provider may call
an external model when configured. Use synthetic data until the chart validation gate is complete. Stop
the local server with Ctrl+C.

The offline place resolver accepts an exact `City` or `City, ISO country code`
name and exact alternate names recorded in the approved GeoNames
`cities15000.zip` catalog. For example, the catalog records `BLR` for
Bengaluru; the resolver still rejects ambiguous aliases. A reviewed alias also
accepts `City, Telangana, India`, matching GeoNames' [India subdivision code
40](https://www.geonames.org/IN/administrative-division-india.html). Unlisted
region names are rejected, not silently ignored; a broader administrative-name
dataset is still needed for general human place input. The catalog is not
bundled. GeoNames [permits reuse with attribution](https://www.geonames.org/export/),
but its coordinates are provided as-is and places below its population threshold
may be absent. After obtaining the file directly from
`https://download.geonames.org/export/dump/cities15000.zip`, keep it at
`data/raw/cities15000.zip` (ignored by Git). Verify its origin and
compute its SHA-256 with `Get-FileHash data/raw/cities15000.zip -Algorithm SHA256`.
Only after reviewing provenance, create the ignored local file
`data/manifests/geonames_cities15000.json` with `approved: true`,
`filename: "cities15000.zip"`, `publisher: "GeoNames"`,
`source_url` set to the exact official URL above,
`license: "CC BY 4.0"` (confirmed by GeoNames' official
[download readme](https://download.geonames.org/export/dump/readme.txt)),
`rights_evidence_url` set to that readme URL,
`approval_scope: "local_place_lookup_only"`,
`retrieved_at` as an ISO timestamp, and the computed lowercase `sha256`.
The hash detects later replacement; it is not a publisher-signed checksum or
proof that every entry is historically correct. The catalog now available
locally was checked for ZIP integrity and download origin and approved for
local place lookup only, not model training. A research-only **mean** ayanamsha
method remains separate; the birth form uses the documented **true** method.
PyERFA and NumPy are pinned runtime dependencies for that calculation; their
BSD-style and bundled-library notices must be retained in any distribution.

This is an English-only interface, not an AI that understands arbitrary human
languages. Sanskrit, Telugu, and multilingual explanations require a separate
reviewed corpus, language evaluation, and a trained model. The read-only
`/api/deployment-readiness` endpoint intentionally returns HTTP 503 with the
current public-launch blockers. The local server now rejects unexpected Host
headers, but it is still **not a production web server**. Do not expose its port
to a LAN or the internet or use it with real people's birth details. Public
deployment requires an independently benchmarked chart engine, a reviewed
privacy/consent and retention design, production TLS/authentication/rate
limiting, and security testing. A passing unit-test suite is not clearance for
that launch.

The interface takes only a general modular separation cue from the linked
[AI-Powered Astrology App](https://github.com/amarskdev/AI-Powered-Astrology-App).
That project's [restrictive license](https://raw.githubusercontent.com/amarskdev/AI-Powered-Astrology-App/master/LICENSE)
does not authorize copying its code into this proprietary repository, and its
pretrained-model approach is outside this project's random-initialization goal.

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
