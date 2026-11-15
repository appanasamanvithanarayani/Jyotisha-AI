"""Life Guide: balance scores from planet transits and the lunar day. Calculated, no AI."""

import json
from datetime import date, timedelta

import pytest

from jyotisha_ai import life_guide
from tests.test_webapp import local_server, request  # noqa: F401 - pytest fixture reused

GOOD_HOUSES = {"Sun": 3, "Moon": 1, "Mars": 3, "Mercury": 2, "Jupiter": 2, "Venus": 1, "Saturn": 3, "Rahu": 3, "Ketu": 3}
BAD_HOUSES = {"Sun": 1, "Moon": 4, "Mars": 1, "Mercury": 1, "Jupiter": 1, "Venus": 6, "Saturn": 1, "Rahu": 1, "Ketu": 1}


def at_houses(houses, sign=6):
    return {planet: (sign + house - 2) % 12 + 1 for planet, house in houses.items()}   # the rashi that is `house` from `sign`


@pytest.fixture(autouse=True)
def fresh_cache():
    original = life_guide._where
    original.cache_clear()
    yield
    life_guide._where = original
    original.cache_clear()


def test_every_planet_favourable_scores_high_and_every_planet_unfavourable_scores_low(monkeypatch):
    monkeypatch.setattr(life_guide, "_where", lambda day, hour=6: at_houses(GOOD_HOUSES))
    monkeypatch.setattr(life_guide, "tithi_of", lambda day: 2)               # a neutral lunar day
    best = life_guide.guide(6, date(2026, 11, 14))
    assert all(item["score"] == life_guide.HIGH for tab in best.values() for item in tab.values())
    assert best["today"]["love"]["support"] == ["Venus", "Moon"]             # the strongest supporting planets, first
    monkeypatch.setattr(life_guide, "_where", lambda day, hour=6: at_houses(BAD_HOUSES))
    worst = life_guide.guide(6, date(2026, 11, 14))
    assert all(item["score"] == life_guide.LOW for tab in worst.values() for item in tab.values())
    assert worst["today"]["love"]["support"] == []


def test_the_lunar_day_nudges_only_the_day_tabs(monkeypatch):
    monkeypatch.setattr(life_guide, "_where", lambda day, hour=6: at_houses({**BAD_HOUSES, "Venus": 1}))
    monkeypatch.setattr(life_guide, "tithi_of", lambda day: 2)                # a neutral lunar day
    mid = life_guide.guide(6, date(2026, 11, 14))
    monkeypatch.setattr(life_guide, "tithi_of", lambda day: 5)                # Poorna: +1
    up = life_guide.guide(6, date(2026, 11, 14))
    monkeypatch.setattr(life_guide, "tithi_of", lambda day: 4)                # Rikta: -1
    down = life_guide.guide(6, date(2026, 11, 14))
    assert up["today"]["love"]["score"] == mid["today"]["love"]["score"] + 1 == down["today"]["love"]["score"] + 2
    assert up["month"] == down["month"] == mid["month"] and up["year"] == down["year"]
    assert [life_guide.tithi_shift(n) for n in (1, 4, 5, 9, 14, 19, 30, 2)] == [1, -1, 1, -1, -1, -1, 1, 0]


def test_real_transits_give_scores_in_range_for_every_sign_and_tab():
    result = life_guide.guide(3, date.today())
    assert set(result) == {"yesterday", "today", "tomorrow", "month", "year"}
    for tab in result.values():
        assert set(tab) == set(life_guide.AREAS)
        assert all(life_guide.LOW <= item["score"] <= life_guide.HIGH and len(item["support"]) <= 2 for item in tab.values())
    assert 1 <= life_guide.tithi_of(date.today()) <= 30


def test_the_year_tab_uses_only_the_slow_planets(monkeypatch):
    monkeypatch.setattr(life_guide, "tithi_of", lambda day: 2)
    houses = {**GOOD_HOUSES, "Jupiter": 1, "Saturn": 1, "Rahu": 1, "Ketu": 1}   # the slow planets unfavourable, the rest favourable
    monkeypatch.setattr(life_guide, "_where", lambda day, hour=6: at_houses(houses))
    result = life_guide.guide(6, date(2026, 11, 14))
    assert all(item["score"] == life_guide.LOW for item in result["year"].values())
    assert result["today"]["love"]["score"] > life_guide.LOW                      # the fast planets still lift the day


def test_endpoint_checks_input_and_answers(local_server):
    headers = {"Content-Type": "application/json"}
    today = date.today()
    status, _, body = request(local_server, "POST", "/api/life-guide", json.dumps({"sign": 6, "date": today.isoformat()}), headers)
    assert status == 200 and json.loads(body)["reading"]["today"]["wealth"]["score"] in range(3, 10)
    for bad in ({"sign": 0, "date": today.isoformat()}, {"sign": 13, "date": today.isoformat()}, {"sign": True, "date": today.isoformat()},
                {"sign": "6", "date": today.isoformat()}, {"sign": 6, "date": "nope"}, {"sign": 6, "date": (today + timedelta(days=5)).isoformat()}, [1]):
        status, _, _ = request(local_server, "POST", "/api/life-guide", json.dumps(bad), headers)
        assert status == 400
