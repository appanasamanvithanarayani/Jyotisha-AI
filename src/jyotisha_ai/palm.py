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
    "absent, say so gently), \"summary\" (60 to 110 words: overall nature and one kind piece of advice). "
    "Also add a \"points\" object with one key per line you can actually trace on THIS photo (\"heart\", \"head\", "
    "\"life\", \"fate\"; leave out any line that is too faint or not visible, rather than guess blindly). Each value is "
    "a list of 3 to 6 [x, y] pairs that trace that line's path across the palm in order from where it starts to where "
    "it ends, as fractions of the photo (x: 0 at the photo's left edge to 1 at its right edge; y: 0 at the top to 1 at "
    "the bottom). Give your honest best visual estimate of where that line runs in this exact photo; it will be drawn "
    "over the photo as an approximate guide, not a certified trace, so only include a line you can really see. "
    "Write every value in {language}, in the {language} script; do not write the values in English."
)
# Sent on a second try when the first reply came back in English instead of the user's language.
REMINDER = "\nIMPORTANT: your previous answer was in English. Write all the values in {language} script only."


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


def _line_points(raw: dict) -> dict[str, list[list[float]]]:
    """Up to 6 (x, y) fractions per line, each 0..1; a line that is missing or badly shaped is quietly left out, so a
    drawing mistake never fails the whole reading (the text sections are what matters; the overlay is a bonus)."""
    points = raw.get("points")
    if not isinstance(points, dict):
        return {}
    cleaned: dict[str, list[list[float]]] = {}
    for line in LINES:
        path = points.get(line)
        if not isinstance(path, list) or not 2 <= len(path) <= 8:
            continue
        good = []
        for point in path:
            if not (isinstance(point, list) and len(point) == 2 and all(isinstance(v, (int, float)) and not isinstance(v, bool) and 0 <= v <= 1 for v in point)):
                good = None
                break
            good.append([round(float(point[0]), 4), round(float(point[1]), 4)])
        if good:
            cleaned[line] = good
    return cleaned


def validate(raw: object) -> dict | None:
    """{'palm': False} when the AI saw no palm; the five sections (and any usable line points) when it did; None when
    the reply breaks the rules."""
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
    reading["points"] = _line_points(raw)
    return reading


def reading(payload: object) -> dict:
    """{'status': 'ok'|'not_palm'|'off'|'unavailable', 'reading': {...}|None}. The photo is not kept."""
    hand, language, mime, data = check_request(payload)
    if not enabled():
        return {"status": "off", "reading": None}
    name = assistant.LANGUAGES[language]
    found = None
    for attempt in range(2):
        prompt = PROMPT.format(language=name) + (REMINDER.format(language=name) if attempt else "")
        text = assistant.complete(SYSTEM.format(hand=hand, language=name), prompt, json_output=True,
                                  max_tokens=3000, image=(mime, data))
        found = validate(_parse(text)) if text else None
        # Vision replies sometimes slip into English; ask once more in the user's language (keep the second answer).
        if found and found["palm"] and not attempt and not all(assistant.in_language(found[key], language) for key in (*LINES, "summary")):
            continue
        break
    if found is None:
        return {"status": "unavailable", "reading": None}
    if not found["palm"]:
        return {"status": "not_palm", "reading": None}
    found.pop("palm")
    return {"status": "ok", "reading": found}
