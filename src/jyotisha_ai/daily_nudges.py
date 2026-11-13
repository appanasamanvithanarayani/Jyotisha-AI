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

# What we ask for each day: about what one user sees (one evening question, two muhurta alerts), with a little choice.
COUNTS = {"questions": 3, "dasha": 1, "sign": 1, "good": 1, "bad": 1}
MINIMUM = {"questions": 2, "good": 1, "bad": 1}   # below this the batch is not used
MAX_TITLE, MAX_BODY, MAX_ASK = 70, 170, 220
DAILY_GENERATION_CAP = 60
RETRY_AFTER_FAILURE = 3600.0
PAGES = ("chat", "kundli", "relationship", "rashi", "calendar", "home")
# Words that must never appear (promises, gemstones, money requests, fear) in any of the supported scripts.
BANNED = re.compile(
    r"guarantee|100\s*%|gemstone|\bgem\b|ratna|payment|pay now|death|die\b|accident|cancer|http|www\.|@|"
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


def _clean(text: object, limit: int, allowed: set) -> str | None:
    if not isinstance(text, str):
        return None
    text = " ".join(text.split())
    if not 2 <= len(text) <= limit or BANNED.search(text) or re.search(r"\d{3,}", text):
        return None
    if any(name not in allowed for name in PLACEHOLDER.findall(text)) or "{" in PLACEHOLDER.sub("", text):
        return None
    return text


def validate(raw: object) -> dict | None:
    """Keep only well-formed, rule-following lines; None if too few remain to use."""
    if not isinstance(raw, dict):
        return None
    batch: dict = {}
    rules = {
        "questions": ({"t": set(), "b": set(), "ask": set()}, ()),
        "dasha": ({"t": {"dasha"}, "b": {"dasha"}, "ask": {"dasha"}}, ("t", "ask")),
        "sign": ({"t": {"sign"}, "b": {"sign"}, "ask": {"sign"}}, ("t", "ask")),
        "good": ({"t": set(), "b": {"end"}}, ("b",)),
        "bad": ({"t": set(), "b": {"end"}}, ("b",)),
    }
    limits = {"t": MAX_TITLE, "b": MAX_BODY, "ask": MAX_ASK}
    for key, (fields, must_have_placeholder) in rules.items():
        items = raw.get(key)
        kept = []
        for item in items if isinstance(items, list) else []:
            if not isinstance(item, dict):
                continue
            cleaned = {field: _clean(item.get(field), limits[field], allowed) for field, allowed in fields.items()}
            if any(value is None for value in cleaned.values()):
                continue
            if any(not PLACEHOLDER.search(cleaned[field]) for field in must_have_placeholder):
                continue
            if cleaned["t"] not in {other["t"] for other in kept}:
                kept.append(cleaned)
        batch[key] = kept[:COUNTS[key]]
    if any(len(batch[key]) < count for key, count in MINIMUM.items()):
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
            titles += [item["t"] for item in data.get("questions", [])][:3]
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


def generate(day: date, language: str) -> dict | None:
    """Write, check and save the batch for one day and language (once); returns the saved batch or None."""
    key = (day.isoformat(), language)
    with _lock:
        if key in _running or time.monotonic() - _failed.get(key, -1e9) < RETRY_AFTER_FAILURE:
            return None
        _running.add(key)
    try:
        if _generations_today() >= DAILY_GENERATION_CAP:
            return None
        name = assistant.LANGUAGES[language]
        prompt = PROMPT.format(weekday=day.strftime("%A"), month=day.strftime("%B"), recent=json.dumps(_recent_titles(day, language), ensure_ascii=False),
                               language=name, **COUNTS)
        model = store.value("JYOTISHA_NUDGE_MODEL").strip() or None   # empty: the same model as the chat
        batch = validate(_parse(assistant.complete(SYSTEM.format(language=name), prompt, json_output=True, max_tokens=2048, model=model)))
        if batch is None:
            with _lock:
                _failed[key] = time.monotonic()
            return None
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
