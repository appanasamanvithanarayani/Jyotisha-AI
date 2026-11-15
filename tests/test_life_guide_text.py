"""AI-written Life Guide wording: checks, caching once a day per language, and the endpoint. The AI is stubbed; no network."""

import json
from datetime import datetime, timedelta, timezone

import pytest

from jyotisha_ai import life_guide_text
from tests.test_webapp import local_server, request  # noqa: F401 - pytest fixture reused


def clean(_unused=None):
    """Four sentences per area and band; letters only (the rules refuse digits)."""
    letters = {"A": "alpha", "B": "bravo", "C": "charlie", "D": "delta"}
    return {area: {band: [f"Take a calm practical step here today, wording {letters[chr(65 + i)]} for {area} {band}." for i in range(4)] for band in life_guide_text.BANDS} for area in life_guide_text.AREAS}


@pytest.fixture
def ai(monkeypatch, tmp_path):
    monkeypatch.setenv("JYOTISHA_DATA_DIR", str(tmp_path / "data"))
    calls = []

    def complete(system, prompt, **kwargs):
        calls.append((system, prompt, kwargs))
        return json.dumps(clean(None))

    monkeypatch.setattr(life_guide_text.assistant, "complete", complete)
    monkeypatch.setattr(life_guide_text.assistant, "available", lambda: True)
    life_guide_text._failed.clear()
    return calls


def test_validate_keeps_good_sentences_and_drops_rule_breakers():
    raw = clean(None)
    raw["love"]["low"] = ["Be gentle today and listen more than you speak, kindly.", "Guaranteed luck is waiting, trust the gemstone completely.",
                          "On 2026 you will meet someone special, so stay open.", "x", 7]
    raw["family"]["mid"] = ["Only one good sentence here, so this whole cell is dropped."]
    raw["health"] = "not an object"
    kept = life_guide_text.validate(raw)
    assert "low" not in kept["love"]                                          # one usable sentence is below the minimum of two
    assert "mid" not in kept["family"] and "health" not in kept
    assert all(len(cells) == 3 for area, cells in kept.items() if area in ("career", "wealth", "marriage"))
    assert life_guide_text.validate({"love": {}}) is None and life_guide_text.validate("x") is None


def test_the_day_is_written_once_per_language_then_served_from_the_cache(ai):
    today = datetime.now(timezone.utc).date()
    first = life_guide_text.status({"language": "te", "date": today.isoformat()})
    assert first["status"] == "ok" and set(first["variants"]) == set(life_guide_text.AREAS)
    assert len(ai) == 1 and "Telugu" in ai[0][0] and "4 different" in ai[0][1] and ai[0][2]["json_output"] is True
    again = life_guide_text.status({"language": "te", "date": today.isoformat()})
    assert again == first and len(ai) == 1                                   # the cache
    life_guide_text.status({"language": "hi", "date": today.isoformat()})
    assert len(ai) == 2 and "Hindi" in ai[1][0]


def test_off_failures_and_input_checks(ai, monkeypatch):
    today = datetime.now(timezone.utc).date().isoformat()
    monkeypatch.setenv("JYOTISHA_AI_LIFEGUIDE_TEXT", "0")
    assert life_guide_text.status({"language": "en", "date": today}) == {"status": "off", "variants": None} and not ai
    monkeypatch.delenv("JYOTISHA_AI_LIFEGUIDE_TEXT")
    monkeypatch.setattr(life_guide_text.assistant, "complete", lambda *a, **k: "not json at all")
    assert life_guide_text.status({"language": "en", "date": today}) == {"status": "unavailable", "variants": None}
    assert life_guide_text.LAST_REPORT                                        # why it failed, for the admin
    for bad in ({"language": "xx", "date": today}, {"language": "en", "date": "nope"}, {"language": "en", "date": "2020-01-01"}, [1]):
        with pytest.raises(ValueError):
            life_guide_text.status(bad)


def test_endpoint(ai, local_server):
    today = datetime.now(timezone.utc).date().isoformat()
    status, _, body = request(local_server, "POST", "/api/life-guide-text", json.dumps({"language": "en", "date": today}), {"Content-Type": "application/json"})
    assert status == 200 and json.loads(body)["status"] == "ok"
    status, _, _ = request(local_server, "POST", "/api/life-guide-text", json.dumps({"language": "zz", "date": today}), {"Content-Type": "application/json"})
    assert status == 400
