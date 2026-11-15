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


def test_tarabalam_counts_today_star_from_the_birth_star():
    assert [life_guide.tara_of(10, star) for star in (10, 11, 12, 13, 14, 15, 16, 17, 18, 19)] == [1, 2, 3, 4, 5, 6, 7, 8, 9, 1]
    assert [life_guide.tara_shift(n) for n in range(1, 10)] == [0, 1, -1, 1, -1, 1, -1, 1, 1]
    assert life_guide.tara_of(27, 1) == 2 and life_guide.tara_of(1, 27) == (27 - 1) % 9 + 1


def test_the_running_dasha_lifts_or_lowers_only_the_areas_it_signifies():
    good = [{"lord": "Venus", "house": 5}, {"lord": "Saturn", "house": 10}]
    bad = [{"lord": "Venus", "house": 8}, {"lord": "Saturn", "house": 12}]
    assert life_guide.dasha_shift("love", good, 1) == 1 and life_guide.dasha_shift("love", bad, 1) == -1   # Venus signifies love
    assert life_guide.dasha_shift("career", good, 2) == 1 and life_guide.dasha_shift("career", bad, 2) == -1   # Saturn signifies career
    assert life_guide.dasha_shift("love", [{"lord": "Ketu", "house": 5}], 1) == 0                             # Ketu signifies neither
    assert life_guide.dasha_shift("health", [{"lord": "Saturn", "house": 12}, {"lord": "Mars", "house": 8}], 1) == -1   # limited to one point
    assert life_guide.dasha_shift("health", [{"lord": "Saturn", "house": 12}, {"lord": "Mars", "house": 8}], 2) == -2


def test_a_chart_makes_the_numbers_personal(monkeypatch):
    monkeypatch.setattr(life_guide, "_where", lambda day, hour=6: at_houses({**BAD_HOUSES, "Venus": 1, "Jupiter": 2}))
    monkeypatch.setattr(life_guide, "tithi_of", lambda day: 2)                # a neutral lunar day
    monkeypatch.setattr(life_guide, "_star_at", lambda day, hour: 12)         # the Moon is in star 12 all day
    plain = life_guide.guide(6, date(2026, 11, 14))
    for star, shift in ((11, 1), (10, -1), (12, 0)):                           # Tara 2 Sampat, 3 Vipat, 1 Janma
        mine = life_guide.guide(6, date(2026, 11, 14), {"nakshatra": star, "dasha": []})
        for area in life_guide.AREAS:
            assert mine["today"][area]["score"] == min(life_guide.HIGH, max(life_guide.LOW, plain["today"][area]["score"] + shift)), (star, area)
        assert mine["month"] == plain["month"] and mine["year"] == plain["year"]   # the star only moves the day tabs
    lords = {"nakshatra": 12, "dasha": [{"lord": "Venus", "house": 5}]}
    with_dasha = life_guide.guide(6, date(2026, 11, 14), lords)
    assert with_dasha["today"]["love"]["score"] == plain["today"]["love"]["score"] + 1       # Venus, well placed, lifts love
    assert with_dasha["today"]["career"]["score"] == plain["today"]["career"]["score"]       # but not career
    assert with_dasha["year"]["love"]["score"] == min(life_guide.HIGH, plain["year"]["love"]["score"] + 1)   # the year tab counts the dasha too (9 is the ceiling)


def test_endpoint_takes_the_chart_numbers_and_refuses_bad_ones(local_server):
    headers = {"Content-Type": "application/json"}
    today = date.today().isoformat()
    personal = {"nakshatra": 20, "dasha": [{"lord": "Venus", "house": 8}, {"lord": "Saturn", "house": 3}]}
    status, _, body = request(local_server, "POST", "/api/life-guide", json.dumps({"sign": 6, "date": today, "personal": personal}), headers)
    result = json.loads(body)
    assert status == 200 and 1 <= result["personal"]["tara"] <= 9 and result["personal"]["shift"] in (-1, 0, 1)
    status, _, body = request(local_server, "POST", "/api/life-guide", json.dumps({"sign": 6, "date": today}), headers)
    assert status == 200 and "personal" not in json.loads(body)
    for bad in ({"nakshatra": 0, "dasha": []}, {"nakshatra": 28, "dasha": []}, {"nakshatra": True, "dasha": []}, {"nakshatra": 5, "dasha": "x"},
                {"nakshatra": 5, "dasha": [{"lord": "Pluto", "house": 3}]}, {"nakshatra": 5, "dasha": [{"lord": "Sun", "house": 13}]},
                {"nakshatra": 5, "dasha": [{"lord": "Sun", "house": 3}] * 3}, [1]):
        status, _, _ = request(local_server, "POST", "/api/life-guide", json.dumps({"sign": 6, "date": today, "personal": bad}), headers)
        assert status == 400
