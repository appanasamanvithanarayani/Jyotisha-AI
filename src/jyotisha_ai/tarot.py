"""Tarot readings: the 22 Major Arcana, a three-card spread (past, present, future) on a topic the user picks, and a
warm reading written by the AI in the user's language.

The cards are drawn on the phone; the server only checks them and asks the AI to explain them. The card names and
short meanings below are the traditional ones (public knowledge). If the AI is off, fails or its text breaks the rules,
the app shows these built-in meanings instead. Readings are cached briefly so the same draw is not paid for twice.
"""

from __future__ import annotations

import threading
from collections import OrderedDict

from jyotisha_ai import assistant, settings_store as store
from jyotisha_ai.daily_nudges import BANNED, _parse

# (name, upright meaning, reversed meaning)
CARDS = (
    ("The Fool", "new beginnings, trust and a fresh start", "hesitation and careless choices"),
    ("The Magician", "skill, focus and making things happen", "scattered energy and unused talent"),
    ("The High Priestess", "intuition, inner wisdom and patience", "ignoring your inner voice"),
    ("The Empress", "care, abundance and creativity", "neglecting yourself or others"),
    ("The Emperor", "structure, stability and leadership", "rigidity and control"),
    ("The Hierophant", "tradition, guidance and learning", "breaking from convention"),
    ("The Lovers", "love, harmony and true choices", "imbalance and doubt in a choice"),
    ("The Chariot", "determination and moving forward", "lost direction and delays"),
    ("Strength", "courage, kindness and inner strength", "self-doubt and impatience"),
    ("The Hermit", "reflection, solitude and wisdom", "isolation and withdrawal"),
    ("Wheel of Fortune", "change, cycles and good timing", "resistance to change"),
    ("Justice", "fairness, truth and balance", "imbalance and avoiding responsibility"),
    ("The Hanged Man", "pause, new perspective and surrender", "stalling and indecision"),
    ("Death", "endings that open new beginnings", "fear of change and holding on"),
    ("Temperance", "balance, patience and moderation", "excess and impatience"),
    ("The Devil", "attachments and temptations to notice", "breaking free from what binds you"),
    ("The Tower", "sudden change that clears the way", "avoiding a needed change"),
    ("The Star", "hope, healing and renewal", "losing faith for a while"),
    ("The Moon", "dreams, intuition and uncertainty", "confusion clearing up"),
    ("The Sun", "joy, success and warmth", "temporary clouds over happiness"),
    ("Judgement", "awakening and a fresh calling", "self-doubt and old regrets"),
    ("The World", "completion, fulfilment and wholeness", "unfinished business"),
)
TOPICS = {"love": "love and relationships", "career": "career and work", "money": "money and finances",
          "health": "health and wellbeing", "luck": "luck and opportunities", "family": "family and home"}
POSITIONS = ("past", "present", "future")
MIN_CHARS, MAX_CHARS = 60, 900
CACHE_SIZE = 500
SYSTEM = (
    "You are a warm, wise tarot reader in a popular Indian astrology app. Write in {language}, simply and kindly, "
    "addressing the reader as 'you'. Interpret the three cards for the reader's chosen topic as past, present and "
    "future. Be encouraging and balanced; difficult cards become gentle advice, never fear. Never mention death of a "
    "person, illness, accidents, guarantees, exact dates, gemstones, money requests, paid rituals, links or contact "
    "details. Reply with JSON only."
)
PROMPT = (
    "Topic: {topic}.\nCards:\n{cards}\nReturn a JSON object with exactly these keys, all in {language}: \"past\", "
    "\"present\", \"future\" (each 35 to 70 words about that card for this topic), and \"advice\" (50 to 90 words: an "
    "overall message and one simple, kind step to take)."
)

_cache: OrderedDict = OrderedDict()
_lock = threading.Lock()


def enabled() -> bool:
    return store.value("JYOTISHA_AI_TAROT", "1") == "1" and assistant.available()


def check_draw(payload: object) -> tuple[str, list[tuple[int, bool]], str]:
    """(topic, [(card, reversed) x3], language) from a request, or ValueError."""
    if not isinstance(payload, dict):
        raise ValueError("JSON object required")
    topic, language, cards = payload.get("topic"), payload.get("language"), payload.get("cards")
    if topic not in TOPICS:
        raise ValueError("unknown topic")
    if language not in assistant.LANGUAGES:
        raise ValueError("unsupported language")
    if not isinstance(cards, list) or len(cards) != 3:
        raise ValueError("three cards required")
    draw = []
    for card in cards:
        if not isinstance(card, dict):
            raise ValueError("card must be an object")
        index, reversed_ = card.get("id"), card.get("reversed")
        if not isinstance(index, int) or isinstance(index, bool) or not 0 <= index < len(CARDS) or not isinstance(reversed_, bool):
            raise ValueError("invalid card")
        draw.append((index, reversed_))
    if len({index for index, _ in draw}) != 3:
        raise ValueError("cards must be different")
    return topic, draw, language


def validate(raw: object) -> dict | None:
    if not isinstance(raw, dict):
        return None
    reading = {}
    for key in (*POSITIONS, "advice"):
        text = raw.get(key)
        if not isinstance(text, str):
            return None
        text = " ".join(text.split())
        if not MIN_CHARS <= len(text) <= MAX_CHARS or BANNED.search(text):
            return None
        reading[key] = text
    return reading


def reading(payload: object) -> dict:
    """{'status': 'ok'|'off'|'unavailable', 'reading': {...}|None} for a checked draw."""
    topic, draw, language = check_draw(payload)
    if not enabled():
        return {"status": "off", "reading": None}
    key = (topic, tuple(draw), language)
    with _lock:
        if key in _cache:
            _cache.move_to_end(key)
            return {"status": "ok", "reading": _cache[key]}
    name = assistant.LANGUAGES[language]
    cards = "\n".join(f"- {position}: {CARDS[index][0]}{' (reversed)' if rev else ''}: {CARDS[index][2 if rev else 1]}"
                      for position, (index, rev) in zip(POSITIONS, draw))
    model = store.value("JYOTISHA_NUDGE_MODEL").strip() or None
    text = assistant.complete(SYSTEM.format(language=name), PROMPT.format(topic=TOPICS[topic], cards=cards, language=name),
                              json_output=True, max_tokens=2048, model=model)
    found = validate(_parse(text)) if text else None
    if found is None:
        return {"status": "unavailable", "reading": None}
    with _lock:
        _cache[key] = found
        while len(_cache) > CACHE_SIZE:
            _cache.popitem(last=False)
    return {"status": "ok", "reading": found}
