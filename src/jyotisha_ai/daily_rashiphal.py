"""Daily Rashiphal paragraphs (one for each of the 12 Moon signs) written by the AI, grounded in the day's transits.

The planets' signs are calculated here (geocentric, sidereal, at 6:00 AM India time); for each sign the AI gets which
house each planet is in and whether that is a favourable transit by the conventional Moon-sign (gochara) table, and is
asked to write a warm, practical paragraph from those facts only. One batch per language per day, cached and shared by
every user. If the AI is off or its text fails the checks, the app shows its rule-based reading instead.
"""

from __future__ import annotations

import json
import re
import threading
import time
from datetime import date, datetime, timedelta, timezone

import astronomy

from jyotisha_ai import assistant, settings_store as store
from jyotisha_ai.ayanamsha import true_lahiri_for_utc
from jyotisha_ai.daily_nudges import BANNED, _parse
from jyotisha_ai.sky_spans import _sidereal

IST = timezone(timedelta(hours=5, minutes=30))
SIGNS = ("Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces")
# Conventional favourable houses for transits counted from the Moon sign (same table as the app's rule-based reading).
GOCHARA_GOOD = {"Sun": (3, 6, 10, 11), "Moon": (1, 3, 6, 7, 10, 11), "Mars": (3, 6, 11), "Mercury": (2, 4, 6, 8, 10, 11),
                "Jupiter": (2, 5, 7, 9, 11), "Venus": (1, 2, 3, 4, 5, 8, 9, 11, 12), "Saturn": (3, 6, 11), "Rahu": (3, 6, 10, 11), "Ketu": (3, 6, 11)}
MIN_CHARS, MAX_CHARS = 200, 2200
SIGN_LORDS = ("Mars", "Venus", "Mercury", "Moon", "Sun", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Saturn", "Jupiter")
# Traditional numerology numbers of each planet (the Sun also rules 4 and the Moon 7) and the lord of each weekday, Monday first.
PLANET_NUMBERS = {"Sun": (1, 4), "Moon": (2, 7), "Jupiter": (3,), "Rahu": (4,), "Mercury": (5,), "Venus": (6,), "Ketu": (7,),
                  "Saturn": (8,), "Mars": (9,)}
WEEKDAY_LORDS = ("Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn", "Sun")
# For the sign's own colour and direction: the first planet in this order whose transit is favourable for the sign.
SIGN_LUCKY_ORDER = ("Jupiter", "Venus", "Mercury", "Moon", "Sun", "Mars", "Saturn", "Rahu", "Ketu")
RETRY_AFTER_FAILURE = 3600.0
SYSTEM = (
    "You are a warm, experienced Vedic astrologer writing the daily Rashiphal (Moon-sign horoscope) for a popular app. "
    "For each sign write one flowing, detailed paragraph of 120 to 170 words in {language}: how the day feels, work and money, "
    "family and relationships, a gentle wellbeing habit, and end with one simple traditional remedy (such as a prayer to a deity, "
    "a mantra, a lamp or a small charity). Base every "
    "paragraph ONLY on the transit facts given for that sign; favourable transits lean positive, unfavourable ones suggest care. "
    "Be encouraging and concrete, never frightening. Never mention exact dates, numbers of days, guarantees, death, illness or "
    "accidents, gemstones, money requests, paid rituals, links or contact details. Do not list planets or houses; speak plainly. "
    "Reply with JSON only."
)
PROMPT = (
    "Write today's Rashiphal for {weekday}. Return a JSON object whose keys are the sign numbers \"1\" (Aries) to \"12\" (Pisces) "
    "and whose values are the paragraphs, all in {language}.\nTransit facts for each sign (house counted from that Moon sign; "
    "good = favourable transit):\n{facts}"
)

_lock = threading.Lock()
_failed: dict = {}
_running: set = set()
LAST_REPORT: dict = {}


def enabled() -> bool:
    return store.value("JYOTISHA_AI_RASHIPHAL", "1") == "1" and assistant.available()


def _path(day: date, language: str):
    return store.data_dir() / "rashiphal" / f"{day.isoformat()}-{language}.json"


def transits(day: date) -> dict[str, int]:
    """Sidereal sign (1..12) of the Moon and planets at 6:00 AM India time on ``day``; Rahu is the mean node."""
    from jyotisha_ai.kundli_details import mean_node_longitude

    moment = datetime(day.year, day.month, day.day, 6, 0, tzinfo=IST).astimezone(timezone.utc)
    when = astronomy.Time.Make(moment.year, moment.month, moment.day, moment.hour, moment.minute, 0)
    ayanamsha, _ = true_lahiri_for_utc(moment)
    signs = {name: int(_sidereal(getattr(astronomy.Body, name), when, ayanamsha) // 30.0) + 1
             for name in ("Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn")}
    rahu = (mean_node_longitude(when.tt) - ayanamsha) % 360.0
    signs["Rahu"] = int(rahu // 30.0) + 1
    signs["Ketu"] = int(((rahu + 180.0) % 360.0) // 30.0) + 1
    return signs


def facts_for(sign: int, where: dict[str, int]) -> str:
    parts = []
    for planet, rashi in where.items():
        house = (rashi - sign) % 12 + 1
        parts.append(f"{planet} house {house} ({'good' if house in GOCHARA_GOOD[planet] else 'not good'})")
    good = sum(1 for planet, rashi in where.items() if (rashi - sign) % 12 + 1 in GOCHARA_GOOD[planet])
    return f"{sign} {SIGNS[sign - 1]}: {good} of 9 favourable — " + ", ".join(parts)


def lucky(day: date) -> dict[str, dict]:
    """Lucky factors for each sign (1..12) on ``day``, as Telugu Panchang apps give them: the colour and direction of the
    weekday's lord (the same for every sign that day), and the numbers (different per sign) of the weekday's lord followed by the sign lord's.
    ``sign_planet`` is extra, for the sign's own colour and direction: its most favourable transiting planet today (in
    SIGN_LUCKY_ORDER; the sign's lord if none is favourable)."""
    planet = WEEKDAY_LORDS[day.weekday()]
    where = transits(day)
    result = {}
    for sign in range(1, 13):
        lord = SIGN_LORDS[sign - 1]
        numbers = list(dict.fromkeys(PLANET_NUMBERS[planet] + PLANET_NUMBERS[lord]))
        good = [name for name in SIGN_LUCKY_ORDER if (where[name] - sign) % 12 + 1 in GOCHARA_GOOD[name]]
        result[str(sign)] = {"planet": planet, "lord": lord, "numbers": numbers, "sign_planet": good[0] if good else lord}
    return result


def validate(raw: object, report: list | None = None) -> dict | None:
    """All 12 paragraphs, each a sensible length and free of banned content; otherwise None (with reasons in ``report``)."""
    report = report if report is not None else []
    if not isinstance(raw, dict):
        report.append("the reply was not a JSON object")
        return None
    readings = {}
    for sign in range(1, 13):
        text = raw.get(str(sign))
        if not isinstance(text, str):
            report.append(f"sign {sign}: missing")
            continue
        text = " ".join(text.split())
        banned = BANNED.search(text)
        if not MIN_CHARS <= len(text) <= MAX_CHARS:
            report.append(f"sign {sign}: length {len(text)}")
        elif banned:
            report.append(f"sign {sign}: banned word {banned.group(0)!r}")
        elif re.search(r"\d{3,}", text):
            report.append(f"sign {sign}: looks like a date or long number")
        else:
            readings[str(sign)] = text
    if len(readings) < 12:
        report.insert(0, f"only {len(readings)} of 12 paragraphs usable")
        return None
    return readings


def generate(day: date, language: str, force: bool = False) -> dict | None:
    key = (day.isoformat(), language)
    with _lock:
        if key in _running or (not force and time.monotonic() - _failed.get(key, -1e9) < RETRY_AFTER_FAILURE):
            return None
        _running.add(key)
    try:
        name = assistant.LANGUAGES[language]
        where = transits(day)
        prompt = PROMPT.format(weekday=day.strftime("%A"), language=name, facts="\n".join(facts_for(sign, where) for sign in range(1, 13)))
        model = store.value("JYOTISHA_NUDGE_MODEL").strip() or None
        text = assistant.complete(SYSTEM.format(language=name), prompt, json_output=True, max_tokens=8192, model=model)
        report: list = []
        readings = None
        if text is None:
            report.append(assistant.LAST_ERROR["text"] or "no reply from the AI")
        else:
            parsed = _parse(text)
            readings = validate(parsed, report) if parsed is not None else None
            if parsed is None:
                report.append(f"the reply was not valid JSON: {text[:120]!r}")
        if readings is None:
            with _lock:
                _failed[key] = time.monotonic()
                LAST_REPORT[key] = " | ".join(report)[:600] or "unknown"
            return None
        LAST_REPORT.pop(key, None)
        path = _path(day, language)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps({"date": day.isoformat(), "language": language, "readings": readings}, ensure_ascii=False), encoding="utf-8")
        for old in path.parent.glob("*.json"):
            if old.name[:10] < (day - timedelta(days=10)).isoformat():
                old.unlink(missing_ok=True)
        return readings
    finally:
        with _lock:
            _running.discard(key)


def cached(day: date, language: str) -> dict | None:
    try:
        return json.loads(_path(day, language).read_text(encoding="utf-8"))["readings"]
    except (OSError, ValueError, KeyError, TypeError):
        return None


def readings(day: date, language: str) -> dict | None:
    """Today's 12 paragraphs: from the cache, or written now (the first visitor of the day waits a few seconds)."""
    found = cached(day, language)
    if found is not None or not enabled():
        return found
    return generate(day, language)
