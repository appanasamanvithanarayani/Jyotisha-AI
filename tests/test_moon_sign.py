"""The Moon Sign page's AI-written sections: written once per sign and language, checked, cached. The AI is stubbed."""

import json

import pytest

from jyotisha_ai import moon_sign
from jyotisha_ai.webapp import moon_sign_status

PARAGRAPH = "You feel deeply and quietly, and you find calm in order and small routines. " * 2
GOOD = {key: PARAGRAPH for key in moon_sign.SECTIONS}


@pytest.fixture
def ai(monkeypatch):
    calls = []

    def complete(system, prompt, **kwargs):
        calls.append((system, prompt))
        return json.dumps(GOOD)

    monkeypatch.setattr(moon_sign.assistant, "complete", complete)
    monkeypatch.setattr(moon_sign.assistant, "available", lambda: True)
    moon_sign._failed.clear()
    return calls


def test_validate_needs_all_five_clean_sections():
    assert set(moon_sign.validate(GOOD)) == set(moon_sign.SECTIONS)
    report = []
    assert moon_sign.validate({**GOOD, "love": "short"}, report) is None and "love: length" in " ".join(report)
    report = []
    assert moon_sign.validate({**GOOD, "remedy": PARAGRAPH + " Wear a gemstone."}, report) is None
    assert "banned word" in " ".join(report)
    assert moon_sign.validate({k: v for k, v in GOOD.items() if k != "career"}) is None


def test_written_once_per_sign_and_language_then_shared(ai):
    first = moon_sign_status({"sign": 6, "language": "te"})
    assert first["status"] == "ok" and set(first["readings"]) == set(moon_sign.SECTIONS)
    assert "Telugu" in ai[0][0] and "Virgo (Kanya)" in ai[0][1]
    assert moon_sign_status({"sign": 6, "language": "te"})["readings"] == first["readings"] and len(ai) == 1   # cached
    moon_sign_status({"sign": 6, "language": "hi"})
    assert len(ai) == 2                                                     # another language is written once too


def test_switched_off_and_bad_input(ai, monkeypatch):
    monkeypatch.setenv("JYOTISHA_AI_MOON_SIGN", "0")
    assert moon_sign_status({"sign": 1, "language": "en"}) == {"status": "off", "readings": None}
    for bad in ({"sign": 0, "language": "en"}, {"sign": 13, "language": "en"}, {"sign": "6", "language": "en"},
                {"sign": True, "language": "en"}, {"sign": 6, "language": "xx"}, []):
        with pytest.raises(ValueError):
            moon_sign_status(bad)


def test_a_failed_reply_is_not_retried_for_an_hour(ai, monkeypatch):
    monkeypatch.setattr(moon_sign.assistant, "complete", lambda *a, **k: "not json")
    assert moon_sign_status({"sign": 3, "language": "en"})["status"] == "unavailable"
    assert "not valid JSON" in moon_sign.LAST_REPORT[(3, "en")]
    calls = []
    monkeypatch.setattr(moon_sign.assistant, "complete", lambda *a, **k: calls.append(1) or json.dumps(GOOD))
    assert moon_sign_status({"sign": 3, "language": "en"})["status"] == "unavailable" and not calls
    assert moon_sign.generate(3, "en", force=True) is not None
