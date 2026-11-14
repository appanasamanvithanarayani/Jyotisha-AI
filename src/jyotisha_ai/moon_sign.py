"""The Moon Sign page: five warm sections about a Vedic Moon sign (rashi), written by the AI once per sign and language.

The text describes the sign in general (temperament, love, work, wellbeing, a simple remedy), so it is the same for
everyone with that Moon sign: it is written the first time someone opens it, checked, cached for good and shared.
There are at most 12 signs x 17 languages, so the AI cost is tiny. If the AI is off or its text fails the checks, the
app shows its own short built-in description instead.
"""

from __future__ import annotations

import json
import re
import threading
import time

from jyotisha_ai import assistant, settings_store as store
from jyotisha_ai.daily_nudges import BANNED, _parse

SIGNS = ("Aries (Mesha)", "Taurus (Vrishabha)", "Gemini (Mithuna)", "Cancer (Karka)", "Leo (Simha)", "Virgo (Kanya)",
         "Libra (Tula)", "Scorpio (Vrischika)", "Sagittarius (Dhanu)", "Capricorn (Makara)", "Aquarius (Kumbha)", "Pisces (Meena)")
SECTIONS = ("emotional", "love", "career", "wellbeing", "remedy")
MIN_CHARS, MAX_CHARS = 120, 1400
RETRY_AFTER_FAILURE = 3600.0
SYSTEM = (
    "You are a warm, experienced Vedic astrologer writing a gentle, beautiful profile of a Moon sign (Chandra rashi) for "
    "a popular app. Write in {language}, simply and personally, addressing the reader as 'you'. Use the classical "
    "Vedic nature of the sign and its lord. Be encouraging and balanced, never frightening. Never mention death, illness, "
    "accidents, guarantees, gemstones, money requests, paid rituals, links or contact details, exact dates or ages. "
    "Reply with JSON only."
)
PROMPT = (
    "Moon sign: {sign}. Return a JSON object with exactly these keys, each a flowing paragraph of 60 to 110 words in "
    "{language}:\n"
    '- "emotional": how you feel and process emotions; what calms you.\n'
    '- "love": how you love and what you need from a partner and family.\n'
    '- "career": how you work best, your strengths at work and with money.\n'
    '- "wellbeing": a gentle daily habit that suits your mind and body.\n'
    '- "remedy": one simple traditional remedy (a prayer, a mantra, a day to light a lamp, or a small charity).'
)

_lock = threading.Lock()
_failed: dict = {}
_running: set = set()
LAST_REPORT: dict = {}


def enabled() -> bool:
    return store.value("JYOTISHA_AI_MOON_SIGN", "1") == "1" and assistant.available()


def _path(sign: int, language: str):
    return store.data_dir() / "moon_sign" / f"{sign:02d}-{language}.json"


def validate(raw: object, report: list | None = None) -> dict | None:
    """All five sections, each a sensible length and free of banned content; otherwise None (reasons in ``report``)."""
    report = report if report is not None else []
    if not isinstance(raw, dict):
        report.append("the reply was not a JSON object")
        return None
    sections = {}
    for key in SECTIONS:
        text = raw.get(key)
        if not isinstance(text, str):
            report.append(f"{key}: missing")
            continue
        text = " ".join(text.split())
        banned = BANNED.search(text)
        if not MIN_CHARS <= len(text) <= MAX_CHARS:
            report.append(f"{key}: length {len(text)}")
        elif banned:
            report.append(f"{key}: banned word {banned.group(0)!r}")
        elif re.search(r"\d{3,}", text):
            report.append(f"{key}: looks like a date or long number")
        else:
            sections[key] = text
    if len(sections) < len(SECTIONS):
        report.insert(0, f"only {len(sections)} of {len(SECTIONS)} sections usable")
        return None
    return sections


def cached(sign: int, language: str) -> dict | None:
    try:
        return json.loads(_path(sign, language).read_text(encoding="utf-8"))["sections"]
    except (OSError, ValueError, KeyError, TypeError):
        return None


def generate(sign: int, language: str, force: bool = False) -> dict | None:
    key = (sign, language)
    with _lock:
        if key in _running or (not force and time.monotonic() - _failed.get(key, -1e9) < RETRY_AFTER_FAILURE):
            return None
        _running.add(key)
    try:
        name = assistant.LANGUAGES[language]
        model = store.value("JYOTISHA_NUDGE_MODEL").strip() or None
        text = assistant.complete(SYSTEM.format(language=name), PROMPT.format(sign=SIGNS[sign - 1], language=name),
                                  json_output=True, max_tokens=4096, model=model)
        report: list = []
        sections = None
        if text is None:
            report.append(assistant.LAST_ERROR["text"] or "no reply from the AI")
        else:
            parsed = _parse(text)
            sections = validate(parsed, report) if parsed is not None else None
            if parsed is None:
                report.append(f"the reply was not valid JSON: {text[:120]!r}")
        if sections is None:
            with _lock:
                _failed[key] = time.monotonic()
                LAST_REPORT[key] = " | ".join(report)[:600] or "unknown"
            return None
        LAST_REPORT.pop(key, None)
        path = _path(sign, language)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps({"sign": sign, "language": language, "sections": sections}, ensure_ascii=False), encoding="utf-8")
        return sections
    finally:
        with _lock:
            _running.discard(key)


def sections_for(sign: int, language: str) -> dict | None:
    """The five sections: from the cache, or written now (the first visitor for this sign and language waits a moment)."""
    found = cached(sign, language)
    if found is not None or not enabled():
        return found
    return generate(sign, language)
