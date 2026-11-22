"""Ideal-partner illustration: sign-number validation, Gemini-only gating, and that no free text reaches the prompt."""

import pytest

from jyotisha_ai import partner_portrait

REQUEST = {"house7_rashi": 4, "venus_rashi": 7}


def test_request_checks():
    for change in ({"house7_rashi": 0}, {"house7_rashi": 13}, {"house7_rashi": 4.5}, {"house7_rashi": True},
                   {"venus_rashi": 0}, {"venus_rashi": 13}, {"venus_rashi": "7"}):
        with pytest.raises(ValueError):
            partner_portrait.check_request({**REQUEST, **change})
    with pytest.raises(ValueError):
        partner_portrait.check_request("not a dict")
    assert partner_portrait.check_request(REQUEST) == (4, 7)


def test_off_by_default_even_with_gemini_configured(monkeypatch):
    monkeypatch.setattr(partner_portrait.assistant, "provider", lambda: "gemini")
    monkeypatch.setattr(partner_portrait.store, "value", lambda name, default="0": default)
    assert partner_portrait.portrait(REQUEST) == {"status": "off", "image": None}


def test_never_available_on_anthropic_even_when_switched_on(monkeypatch):
    monkeypatch.setattr(partner_portrait.assistant, "provider", lambda: "anthropic")
    monkeypatch.setattr(partner_portrait.store, "value", lambda name, default="0": "1" if name == "JYOTISHA_AI_PARTNER_PORTRAIT" else default)
    assert partner_portrait.enabled() is False
    assert partner_portrait.portrait(REQUEST) == {"status": "off", "image": None}


def test_generates_an_image_from_the_sign_numbers_alone_never_from_client_text(monkeypatch):
    seen = {}

    def generate_image(prompt, **kwargs):
        seen["prompt"] = prompt
        return "image/png", "base64data"

    monkeypatch.setattr(partner_portrait.assistant, "provider", lambda: "gemini")
    monkeypatch.setattr(partner_portrait.assistant, "generate_image", generate_image)
    monkeypatch.setattr(partner_portrait.store, "value", lambda name, default="0": "1" if name == "JYOTISHA_AI_PARTNER_PORTRAIT" else default)
    result = partner_portrait.portrait(REQUEST)
    assert result == {"status": "ok", "image": {"mime": "image/png", "data": "base64data"}}
    assert partner_portrait.SIGN_TRAITS[3] in seen["prompt"]       # house7_rashi 4 -> index 3
    assert partner_portrait.SIGN_TRAITS[6] in seen["prompt"]       # venus_rashi 7 -> index 6
    assert "not a photo" in seen["prompt"] and "not resemble any specific real" in seen["prompt"]


def test_unavailable_when_generation_fails(monkeypatch):
    monkeypatch.setattr(partner_portrait.assistant, "provider", lambda: "gemini")
    monkeypatch.setattr(partner_portrait.assistant, "generate_image", lambda prompt, **kwargs: None)
    monkeypatch.setattr(partner_portrait.store, "value", lambda name, default="0": "1" if name == "JYOTISHA_AI_PARTNER_PORTRAIT" else default)
    assert partner_portrait.portrait(REQUEST) == {"status": "unavailable", "image": None}
