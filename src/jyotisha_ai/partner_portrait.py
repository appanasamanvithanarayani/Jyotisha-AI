"""Ideal-partner portrait: a stylized illustration from the user's own 7th house and Venus, derived entirely from
the chart's sign placements (never a photo, never a specific real person).

The client sends only the two sign numbers (1-12, Aries..Pisces); this module looks up a fixed, canonical adjective
phrase per sign and builds the image prompt itself, so no free text from the client ever reaches the AI prompt.
Uses whichever image provider is configured in assistant.image_provider() (Gemini or Flux via fal.ai) — set
independently of the text-chat provider, since Claude/Anthropic has no image generation of its own.
"""

from __future__ import annotations

from jyotisha_ai import assistant, settings_store as store

# Same order and spirit as the client's SIGN_TRAIT_TEXT (chart-ui.js): Aries..Pisces. The exact wording need not
# match since this text never reaches the user; only the picture does.
SIGN_TRAITS = (
    "bold, energetic and quick to act", "steady, warm and dependable", "curious, chatty and quick-witted",
    "caring, intuitive and protective", "warm, confident and generous", "thoughtful, practical and detail-minded",
    "charming, fair-minded and easy to talk to", "intense, loyal and deeply passionate",
    "free-spirited, honest and adventurous", "grounded, ambitious and reliable",
    "independent, original and friendly", "gentle, imaginative and empathetic",
)
PROMPT = (
    "Create a single gentle, stylized illustrated portrait (a soft watercolor-and-ink painting), waist-up, of a "
    "fictional, generic adult person whose vibe suggests these classical astrological traits: {trait_house} (from "
    "the 7th house of partnerships) and {trait_venus} (from Venus, the planet of love). The image must be a clearly "
    "non-photorealistic illustration, not a photo, and must not resemble any specific real or identifiable person, "
    "celebrity or public figure. Depict only an adult. Warm, tasteful, general-audience art style. No text, no "
    "caption, no watermark or signature anywhere in the image."
)


def enabled() -> bool:
    return store.value("JYOTISHA_AI_PARTNER_PORTRAIT", "0") == "1" and assistant.image_provider() is not None


def check_request(payload: object) -> tuple[int, int]:
    """(house7_rashi, venus_rashi), each 1-12, or ValueError."""
    if not isinstance(payload, dict):
        raise ValueError("JSON object required")
    house7, venus = payload.get("house7_rashi"), payload.get("venus_rashi")
    for value in (house7, venus):
        if not isinstance(value, int) or isinstance(value, bool) or not 1 <= value <= 12:
            raise ValueError("house7_rashi and venus_rashi must be integers 1..12")
    return house7, venus


def portrait(payload: object) -> dict:
    """{'status': 'ok'|'off'|'unavailable', 'image': {'mime': str, 'data': str}|None}."""
    house7, venus = check_request(payload)
    if not enabled():
        return {"status": "off", "image": None}
    prompt = PROMPT.format(trait_house=SIGN_TRAITS[house7 - 1], trait_venus=SIGN_TRAITS[venus - 1])
    found = assistant.generate_image(prompt)
    if not found:
        return {"status": "unavailable", "image": None}
    mime, data = found
    return {"status": "ok", "image": {"mime": mime, "data": data}}
