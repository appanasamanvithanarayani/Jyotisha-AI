"""Palm reading: a photo of the user's palm is read by the AI (vision) and explained in the user's language.

The photo is used only for this one request and is never stored (not on disk, not in logs). The AI first checks that
the picture really shows an open palm; if not, the app asks for a clearer photo. Traditional palmistry is described as
guidance for reflection, never as certainty.
"""

from __future__ import annotations

import base64
import binascii

from jyotisha_ai import assistant, settings_store as store
from jyotisha_ai.daily_nudges import BANNED, _parse

MAX_IMAGE_BYTES = 650_000          # after base64 decoding; the app sends a resized JPEG well under this
LINES = ("heart", "head", "life", "fate")
MIN_CHARS, MAX_CHARS = 50, 900
SYSTEM = (
    "You are a warm, experienced palm reader (hast rekha) in a popular Indian astrology app. You look at a photo of the "
    "reader's {hand} palm and explain it in {language}, simply and kindly, addressing the reader as 'you'. Use "
    "traditional palmistry: the heart line, head line, life line and fate line, and the mounts if visible. Describe "
    "what you can actually see (length, depth, curve, branches) and what it traditionally suggests. Be encouraging and "
    "balanced. Never predict death, the length of life, illness, accidents or exact ages or dates; never mention "
    "guarantees, gemstones, money requests, paid rituals, links or contact details. Reply with JSON only."
)
PROMPT = (
    "First decide whether the photo clearly shows the inside of an open human hand (a palm). If it does not, reply "
    "{{\"palm\": false}}. If it does, reply with a JSON object with \"palm\": true and these keys, each 40 to 90 words in "
    "{language}: \"heart\" (heart line: love and emotions), \"head\" (head line: thinking and decisions), \"life\" (life "
    "line: energy and vitality; never about how long one lives), \"fate\" (fate line: work and life path; if faint or "
    "absent, say so gently), \"summary\" (60 to 110 words: overall nature and one kind piece of advice)."
)


def enabled() -> bool:
    return store.value("JYOTISHA_AI_PALM", "1") == "1" and assistant.available()


def check_request(payload: object) -> tuple[str, str, str, str]:
    """(hand, language, mime type, base64 data) or ValueError."""
    if not isinstance(payload, dict):
        raise ValueError("JSON object required")
    hand, language, image = payload.get("hand"), payload.get("language"), payload.get("image")
    if hand not in ("left", "right"):
        raise ValueError("hand must be left or right")
    if language not in assistant.LANGUAGES:
        raise ValueError("unsupported language")
    if not isinstance(image, str) or not image.startswith("data:image/"):
        raise ValueError("a photo is required")
    header, _, data = image.partition(",")
    mime = header[5:].split(";")[0]
    if mime not in ("image/jpeg", "image/png") or ";base64" not in header:
        raise ValueError("the photo must be a JPEG or PNG")
    try:
        raw = base64.b64decode(data, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ValueError("the photo could not be read") from exc
    if not 1_000 <= len(raw) <= MAX_IMAGE_BYTES:
        raise ValueError("the photo is too small or too large")
    if not (raw[:3] == b"\xff\xd8\xff" if mime == "image/jpeg" else raw[:8] == b"\x89PNG\r\n\x1a\n"):
        raise ValueError("the photo does not match its type")
    return hand, language, mime, data


def validate(raw: object) -> dict | None:
    """{'palm': False} when the AI saw no palm; the five sections when it did; None when the reply breaks the rules."""
    if not isinstance(raw, dict) or not isinstance(raw.get("palm"), bool):
        return None
    if raw["palm"] is False:
        return {"palm": False}
    reading = {"palm": True}
    for key in (*LINES, "summary"):
        text = raw.get(key)
        if not isinstance(text, str):
            return None
        text = " ".join(text.split())
        if not MIN_CHARS <= len(text) <= MAX_CHARS or BANNED.search(text):
            return None
        reading[key] = text
    return reading


def reading(payload: object) -> dict:
    """{'status': 'ok'|'not_palm'|'off'|'unavailable', 'reading': {...}|None}. The photo is not kept."""
    hand, language, mime, data = check_request(payload)
    if not enabled():
        return {"status": "off", "reading": None}
    name = assistant.LANGUAGES[language]
    text = assistant.complete(SYSTEM.format(hand=hand, language=name), PROMPT.format(language=name), json_output=True,
                              max_tokens=3000, image=(mime, data))
    found = validate(_parse(text)) if text else None
    if found is None:
        return {"status": "unavailable", "reading": None}
    if not found["palm"]:
        return {"status": "not_palm", "reading": None}
    found.pop("palm")
    return {"status": "ok", "reading": found}
