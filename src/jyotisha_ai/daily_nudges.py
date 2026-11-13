"""Fresh notification copy written by the AI once a day per language, checked, cached, and shared by every user.

The phone fills the blanks ({dasha}, {sign}, {end}) from the user's own chart and the day's Panchang, so no birth details
are sent for this. If the AI is off, fails, or a line breaks the rules, the app uses its built-in library instead.
"""

from __future__ import annotations

import json
import re
import threading
import time
from datetime import date, datetime, timedelta, timezone

from jyotisha_ai import assistant, settings_store as store

COUNTS = {"questions": 10, "dasha": 2, "sign": 2, "good": 3, "bad": 3}   # what we ask for each day
MINIMUM = {"questions": 3, "good": 1, "bad": 1}                            # below this the batch is not used
MAX_TITLE, MAX_BODY, MAX_ASK = 70, 170, 220
DAILY_GENERATION_CAP = 60
RETRY_AFTER_FAILURE = 3600.0
PAGES = ("chat", "kundli", "relationship", "rashi", "calendar", "home")
# Words that must never appear (promises, gemstones, money requests, fear) in any of the supported scripts.
BANNED = re.compile(
    r"guarantee|100\s*%|gemstone|\bgem\b|ratna|pay (?:us|now|money)|send money|death|\bdie\b|accident|cancer|http|www\.|@|"
    r"గ్యారంటీ|రత్నం|రత్నాలు|మరణం|చావు|ప్రమాదం|"
    r"गारंटी|रत्न|मृत्यु|मौत|दुर्घटना",
    re.IGNORECASE)
PLACEHOLDER = re.compile(r"\{(\w+)\}")
SYSTEM = (
    "You write push-notification copy for Jyotisha AI, a Vedic astrology app. Style: playful, teasing and curiosity-led, like the "
    "best food-delivery app notifications: a short hook title with one emoji, then a body that creates curiosity and makes the "
    "reader want to tap and ask the app's AI astrologer. Warm, never scary. Be respectful whenever deities, festivals or "
    "worship are mentioned (no jokes about them). Never mention dates, numbers of days, guarantees, death, illness or accidents, "
    "gemstones, money requests or paid rituals, links or contact details. Write naturally and colloquially in {language} "
    "(common English words are fine, as people speak). Reply with JSON only."
)
PROMPT = (
    "Write today's notifications. Today is {weekday}, {month}. Make every line new and different from these recent titles: "
    "{recent}.\n"
    "Return a JSON object with exactly these keys:\n"
    '- "questions": {questions} items, each on a different topic of everyday life (money, career, love and marriage, family, mood, health habits, '
    "studies, travel, property, business, luck, decisions, spirituality) — each {{\"t\": title, \"b\": body, \"ask\": the full "
    "question the user would ask the AI astrologer about their own chart, in first person}}.\n"
    '- "dasha": {dasha} item(s) about the user\'s current planetary period; title and ask MUST contain the exact text {{dasha}} '
    "where the period name goes.\n"
    '- "sign": {sign} item(s) about the user\'s Moon sign; title and ask MUST contain the exact text {{sign}}.\n'
    '- "good": {good} item(s) announcing that an auspicious muhurta (Abhijit) has just started; body MUST contain the exact text '
    "{{end}} where its end time goes. Urge doing important work now.\n"
    '- "bad": {bad} item(s) announcing that Rahu Kalam has just started; body MUST contain the exact text {{end}}. Urge pausing '
    "important work until then.\n"
    "Titles under 45 characters, bodies under 110, asks under 150. Every item in {language}."
)

_lock = threading.Lock()
_failed: dict = {}
_running: set = set()


def enabled() -> bool:
    return store.value("JYOTISHA_AI_NUDGES", "1") == "1" and assistant.available()


def _path(day: date, language: str):
    return store.data_dir() / "nudges" / f"{day.isoformat()}-{language}.json"


def _check(text: object, limit: int, allowed: set) -> tuple[str | None, str]:
    """(cleaned text, '') or (None, why it was rejected)."""
    if not isinstance(text, str):
        return None, "missing"
    text = " ".join(text.split())
    if not 2 <= len(text) <= limit:
        return None, f"length {len(text)} (max {limit})"
    banned = BANNED.search(text)
    if banned:
        return None, f"banned word {banned.group(0)!r}"
    if re.search(r"\d{3,}", text):
        return None, "looks like a date or long number"
    unknown = [name for name in PLACEHOLDER.findall(text) if name not in allowed]
    if unknown or "{" in PLACEHOLDER.sub("", text) or "}" in PLACEHOLDER.sub("", text):
        return None, f"unexpected blank {unknown[0] if unknown else '{…}'}"
    return text, ""


def _clean(text: object, limit: int, allowed: set) -> str | None:
    return _check(text, limit, allowed)[0]


LAST_REPORT: dict = {}   # (date, language) -> why the last attempt failed, for the admin panel


def validate(raw: object, report: list | None = None) -> dict | None:
    """Keep only well-formed, rule-following lines; None if too few remain to use. Rejections go into ``report``."""
    report = report if report is not None else []
    if not isinstance(raw, dict):
        report.append("the reply was not a JSON object")
        return None
    batch: dict = {}
    # fields and their allowed blanks; which blank must appear somewhere (title, body or ask) for the line to be usable
    rules = {
        "questions": ({"t": set(), "b": set(), "ask": set()}, None),
        "dasha": ({"t": {"dasha"}, "b": {"dasha"}, "ask": {"dasha"}}, "dasha"),
        "sign": ({"t": {"sign"}, "b": {"sign"}, "ask": {"sign"}}, "sign"),
        "good": ({"t": {"end"}, "b": {"end"}}, "end"),
        "bad": ({"t": {"end"}, "b": {"end"}}, "end"),
    }
    limits = {"t": MAX_TITLE, "b": MAX_BODY, "ask": MAX_ASK}
    for key, (fields, needed) in rules.items():
        items = raw.get(key)
        kept = []
        for item in items if isinstance(items, list) else []:
            if not isinstance(item, dict):
                report.append(f"{key}: an item was not an object")
                continue
            cleaned, problems = {}, []
            for field, allowed in fields.items():
                value, why = _check(item.get(field), limits[field], allowed)
                cleaned[field] = value
                if why:
                    problems.append(f"{field} {why}")
            if not problems and needed and all("{" + needed + "}" not in cleaned[field] for field in fields if field != "ask"):
                problems.append(f"no {{{needed}}} in title or body")
            if not problems and needed in ("dasha", "sign") and "{" + needed + "}" not in cleaned["ask"]:
                problems.append(f"no {{{needed}}} in ask")
            if problems:
                report.append(f"{key}: {'; '.join(problems)} — {str(item.get('t', ''))[:60]!r}")
                continue
            if cleaned["t"] not in {other["t"] for other in kept}:
                kept.append(cleaned)
        batch[key] = kept[:COUNTS[key]]
    short = [f"{key} {len(batch[key])}/{count}" for key, count in MINIMUM.items() if len(batch[key]) < count]
    if short:
        report.insert(0, "too few usable lines: " + ", ".join(short))
        return None
    return batch


def _parse(text: str | None) -> object:
    if not text:
        return None
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip())
    try:
        return json.loads(text)
    except ValueError:
        match = re.search(r"\{.*\}", text, re.S)
        try:
            return json.loads(match.group(0)) if match else None
        except ValueError:
            return None


def _recent_titles(day: date, language: str) -> list[str]:
    titles = []
    for back in range(1, 8):
        try:
            data = json.loads(_path(day - timedelta(days=back), language).read_text(encoding="utf-8"))
            titles += [item["t"] for item in data.get("questions", [])][:5]
        except (OSError, ValueError, KeyError, TypeError):
            continue
    return titles[:30]


def _generations_today() -> int:
    today = datetime.now(timezone.utc).date().isoformat()
    folder = store.data_dir() / "nudges"
    try:
        return sum(1 for path in folder.glob(f"*.json") if datetime.fromtimestamp(path.stat().st_mtime, timezone.utc).date().isoformat() == today)
    except OSError:
        return 0


def generate(day: date, language: str, force: bool = False) -> dict | None:
    """Write, check and save the batch for one day and language (once); returns the saved batch or None.

    After a failure it is not tried again for an hour unless ``force`` (the admin's "Try again now").
    """
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
        prompt = PROMPT.format(weekday=day.strftime("%A"), month=day.strftime("%B"), recent=json.dumps(_recent_titles(day, language), ensure_ascii=False),
                               language=name, **COUNTS)
        model = store.value("JYOTISHA_NUDGE_MODEL").strip() or None   # empty: the same model as the chat
        # Room for the reply (and any "thinking" newer models do first); only the tokens actually used are paid for.
        text = assistant.complete(SYSTEM.format(language=name), prompt, json_output=True, max_tokens=8192, model=model)
        report: list = []
        if text is None:
            report.append(assistant.LAST_ERROR["text"] or "no reply from the AI")
            batch = None
        else:
            parsed = _parse(text)
            if parsed is None:
                report.append(f"the reply was not valid JSON: {text[:120]!r}")
            batch = validate(parsed, report) if parsed is not None else None
        if batch is None:
            with _lock:
                _failed[key] = time.monotonic()
                LAST_REPORT[key] = " | ".join(report)[:600] or "unknown"
            return None
        LAST_REPORT.pop(key, None)
        path = _path(day, language)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps({"date": day.isoformat(), "language": language, **batch}, ensure_ascii=False), encoding="utf-8")
        for old in path.parent.glob("*.json"):   # keep about a month
            if old.name[:10] < (day - timedelta(days=35)).isoformat():
                old.unlink(missing_ok=True)
        return batch
    finally:
        with _lock:
            _running.discard(key)


def cached(day: date, language: str) -> dict | None:
    try:
        data = json.loads(_path(day, language).read_text(encoding="utf-8"))
        return {key: data.get(key, []) for key in COUNTS}
    except (OSError, ValueError, AttributeError):
        return None


def batches(start: date, days: int, language: str, wait_seconds: float = 25.0) -> dict:
    """Batches for start..start+days-1: cached ones at once, missing ones written now (within a time budget) or in the background."""
    result, missing = {}, []
    for offset in range(days):
        day = start + timedelta(days=offset)
        batch = cached(day, language)
        if batch is not None:
            result[day.isoformat()] = batch
        else:
            missing.append(day)
    if not missing or not enabled():
        return result
    deadline = time.monotonic() + wait_seconds
    for index, day in enumerate(missing):
        if time.monotonic() >= deadline:
            threading.Thread(target=lambda rest=missing[index:]: [generate(d, language) for d in rest], daemon=True).start()
            break
        batch = generate(day, language)
        if batch is not None:
            result[day.isoformat()] = batch
    return result
