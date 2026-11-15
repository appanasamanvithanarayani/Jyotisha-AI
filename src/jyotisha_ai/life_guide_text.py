"""Fresh wording for the Life Guide, written by the AI once a day per language, checked, cached and shared by everyone.

For each of the six life areas and each score band (low, middle, high) the AI writes four short sentences. The app picks
one by the day, the tab and the user's own birth star, so the same score does not read the same every day. No birth
details are involved. If the AI is off, fails, or a sentence breaks the rules, the app uses its built-in sentences.
"""

from __future__ import annotations

import json
import re
import threading
import time
from datetime import date, datetime, timedelta, timezone

from jyotisha_ai import assistant, settings_store as store
from jyotisha_ai.daily_nudges import BANNED, _parse

AREAS = ("love", "family", "marriage", "career", "wealth", "health")
BANDS = ("low", "mid", "high")
VARIANTS = 4
MIN_VARIANTS = 2
MIN_CHARS, MAX_CHARS = 20, 150
DAILY_GENERATION_CAP = 40
RETRY_AFTER_FAILURE = 3600.0
SYSTEM = (
    "You write short guidance lines for the Life Guide of Jyotirmaya AstroChat, a Vedic astrology app. Tone: warm, calm and "
    "practical, never frightening. Never mention planets, houses, dates or numbers, guarantees, death, illness or accidents, "
    "gemstones, money requests, paid rituals, links or contact details. Be respectful of deities and traditions. Write "
    "naturally in {language}. Reply with JSON only."
)
PROMPT = (
    "Today is {weekday}. Write {count} different short sentences (8 to 18 words each) for every life area and every band, in "
    "{language}. Areas: love, family, marriage, career, wealth, health. Bands: \"low\" (a day to go gently and take care), "
    "\"mid\" (steady and ordinary), \"high\" (favourable, a good time to act). Each sentence gives one practical tip for that "
    "area and band; the {count} sentences of a cell must be worded differently from each other. Return a JSON object like "
    "{{\"love\": {{\"low\": [..], \"mid\": [..], \"high\": [..]}}, \"family\": {{...}}, ...}} with exactly the six areas."
)

_lock = threading.Lock()
_failed: dict = {}
_running: set = set()
LAST_REPORT: dict = {}


def enabled() -> bool:
    return store.value("JYOTISHA_AI_LIFEGUIDE_TEXT", "1") == "1" and assistant.available()


def _path(day: date, language: str):
    return store.data_dir() / "lifeguide" / f"{day.isoformat()}-{language}.json"


def validate(raw: object, report: list | None = None) -> dict | None:
    """Keep only the sentences that follow the rules; cells with fewer than two good ones are dropped; None if nothing is left."""
    report = report if report is not None else []
    if not isinstance(raw, dict):
        report.append("the reply was not a JSON object")
        return None
    kept: dict = {}
    for area in AREAS:
        cells = raw.get(area)
        if not isinstance(cells, dict):
            report.append(f"{area}: missing")
            continue
        for band in BANDS:
            good = []
            for text in cells.get(band) if isinstance(cells.get(band), list) else []:
                if not isinstance(text, str):
                    continue
                text = " ".join(text.split())
                if not MIN_CHARS <= len(text) <= MAX_CHARS or BANNED.search(text) or re.search(r"\d", text) or re.search(r"[{}]", text):
                    report.append(f"{area}.{band}: dropped a sentence ({len(text)} characters)")
                    continue
                if text not in good:
                    good.append(text)
            if len(good) >= MIN_VARIANTS:
                kept.setdefault(area, {})[band] = good[:VARIANTS]
            else:
                report.append(f"{area}.{band}: fewer than {MIN_VARIANTS} usable sentences")
    return kept or None


def _generations_today() -> int:
    today = datetime.now(timezone.utc).date().isoformat()
    try:
        return sum(1 for path in (store.data_dir() / "lifeguide").glob("*.json")
                   if datetime.fromtimestamp(path.stat().st_mtime, timezone.utc).date().isoformat() == today)
    except OSError:
        return 0


def cached(day: date, language: str) -> dict | None:
    try:
        return json.loads(_path(day, language).read_text(encoding="utf-8")).get("variants")
    except (OSError, ValueError, AttributeError):
        return None


def generate(day: date, language: str, force: bool = False) -> dict | None:
    """Write, check and save the day's sentences for one language (once); None when nothing usable came back."""
    key = (day.isoformat(), language)
    with _lock:
        if key in _running or (not force and time.monotonic() - _failed.get(key, -1e9) < RETRY_AFTER_FAILURE):
            return None
        _running.add(key)
    try:
        if _generations_today() >= DAILY_GENERATION_CAP:
            LAST_REPORT[key] = f"daily limit of {DAILY_GENERATION_CAP} batches reached"
            return None
        name = assistant.LANGUAGES[language]
        model = store.value("JYOTISHA_NUDGE_MODEL").strip() or None
        text = assistant.complete(SYSTEM.format(language=name), PROMPT.format(weekday=day.strftime("%A"), language=name, count=VARIANTS),
                                  json_output=True, max_tokens=8192, model=model)
        report: list = []
        variants = validate(_parse(text), report) if text else None
        if variants is None:
            with _lock:
                _failed[key] = time.monotonic()
                LAST_REPORT[key] = " | ".join(report)[:400] or (assistant.LAST_ERROR["text"] or "no reply from the AI")
            return None
        LAST_REPORT.pop(key, None)
        path = _path(day, language)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps({"date": day.isoformat(), "language": language, "variants": variants}, ensure_ascii=False), encoding="utf-8")
        for old in path.parent.glob("*.json"):   # keep about a week
            if old.name[:10] < (day - timedelta(days=7)).isoformat():
                old.unlink(missing_ok=True)
        return variants
    finally:
        with _lock:
            _running.discard(key)


def status(payload: object) -> dict:
    """The endpoint: {'language', 'date' (yesterday..tomorrow)} -> {'status': 'ok'|'off'|'unavailable', 'variants': {...}|None}."""
    if not isinstance(payload, dict):
        raise ValueError("JSON object required")
    language, text = payload.get("language"), payload.get("date")
    if language not in assistant.LANGUAGES:
        raise ValueError("unsupported language")
    try:
        chosen = date.fromisoformat(text) if isinstance(text, str) else None
    except ValueError:
        chosen = None
    today = datetime.now(timezone.utc).date()
    if chosen is None or not today - timedelta(days=1) <= chosen <= today + timedelta(days=1):
        raise ValueError("date must be within a day of today")
    if not enabled():
        return {"status": "off", "variants": None}
    found = cached(chosen, language) or generate(chosen, language)
    return {"status": "ok" if found else "unavailable", "variants": found}
