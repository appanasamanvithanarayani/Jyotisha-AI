"""AI-written daily Rashiphal and calculated lucky factors. The AI is stubbed; no network."""

import json
from datetime import date, datetime, timezone

import pytest

from jyotisha_ai import daily_rashiphal
from jyotisha_ai.webapp import rashiphal_status

PARAGRAPH = "A calm and steady day. " * 12


def test_lucky_factors_follow_the_weekday_lord_and_the_sign_lord():
    lucky = daily_rashiphal.lucky(date(2026, 11, 13))   # a Friday: Venus -> white/pink, south-east, 6 first
    assert set(lucky) == {str(n) for n in range(1, 13)}
    assert {item["planet"] for item in lucky.values()} == {"Venus"}
    # The same as a published Telugu calendar app that day (Mithuna to Meena).
    assert [lucky[str(s)]["numbers"] for s in range(3, 13)] == [
        [6, 5], [6, 2, 7], [6, 1, 4], [6, 5], [6], [6, 9], [6, 3], [6, 8], [6, 8], [6, 3]]
    # The sign's own colour and direction follow its most favourable transit: Jupiter for Mesha, Mercury for Meena.
    assert (lucky["1"]["sign_planet"], lucky["6"]["sign_planet"], lucky["12"]["sign_planet"]) == ("Jupiter", "Venus", "Mercury")
    sunday = daily_rashiphal.lucky(date(2026, 11, 15))
    assert sunday["1"]["planet"] == "Sun" and sunday["1"]["numbers"] == [1, 4, 9]
    assert all(1 <= n <= 9 for item in lucky.values() for n in item["numbers"])


def test_transit_facts_match_the_apps_count():
    facts = daily_rashiphal.facts_for(1, daily_rashiphal.transits(date(2026, 11, 13)))
    assert facts.startswith("1 Aries: 2 of 9 favourable")


def test_validate_needs_all_twelve_clean_paragraphs():
    good = {str(n): PARAGRAPH for n in range(1, 13)}
    assert len(daily_rashiphal.validate(good)) == 12
    report = []
    assert daily_rashiphal.validate({**good, "5": "too short"}, report) is None and "sign 5: length" in " ".join(report)
    report = []
    assert daily_rashiphal.validate({**good, "7": PARAGRAPH + " Wear this gemstone."}, report) is None
    assert "banned word" in " ".join(report)


@pytest.fixture
def ai(monkeypatch):
    calls = []

    def complete(system, prompt, **kwargs):
        calls.append((system, prompt))
        return json.dumps({str(n): PARAGRAPH for n in range(1, 13)})

    monkeypatch.setattr(daily_rashiphal.assistant, "complete", complete)
    monkeypatch.setattr(daily_rashiphal.assistant, "available", lambda: True)
    daily_rashiphal._failed.clear()
    return calls


def test_endpoint_writes_once_per_day_and_language_and_always_gives_lucky_factors(ai, monkeypatch):
    today = datetime.now(timezone.utc).date().isoformat()
    first = rashiphal_status({"date": today, "language": "te"})
    assert first["status"] == "ok" and len(first["readings"]) == 12 and len(first["lucky"]) == 12
    assert "Telugu" in ai[0][0] and "1 Aries:" in ai[0][1]                      # the transit facts reach the AI
    assert rashiphal_status({"date": today, "language": "te"})["readings"] == first["readings"] and len(ai) == 1
    monkeypatch.setenv("JYOTISHA_AI_RASHIPHAL", "0")
    off = rashiphal_status({"date": today, "language": "hi"})
    assert off["status"] == "off" and off["readings"] is None and len(off["lucky"]) == 12
    for bad in ({"date": today, "language": "xx"}, {"date": "2001-01-01", "language": "te"}):
        with pytest.raises(ValueError):
            rashiphal_status(bad)
