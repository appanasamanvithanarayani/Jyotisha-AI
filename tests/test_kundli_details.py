from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

import pytest

from jyotisha_ai.ayanamsha import TRUE_METHOD_ID, true_lahiri_for_utc
from jyotisha_ai.chart import calculate_chart
from jyotisha_ai.kundli_details import dignity, kundli_details, mean_node_longitude, navamsa_sign

IST = timezone(timedelta(hours=5, minutes=30))


@pytest.fixture(scope="module")
def sample():
    moment = datetime(1990, 5, 15, 6, 30, tzinfo=IST)
    ayanamsha, _ = true_lahiri_for_utc(moment)
    chart = calculate_chart(moment, 13.0827, 80.2707, ayanamsha, TRUE_METHOD_ID)
    return chart, moment, kundli_details(chart, moment, date(2026, 10, 31))


def test_mean_node_anchor_at_j2000():
    assert mean_node_longitude(0.0) == pytest.approx(125.0445479, abs=1e-9)
    # one Julian century later the node has regressed by about 1934.14 degrees
    assert mean_node_longitude(36525.0) == pytest.approx((125.0445479 - 1934.1362891 + 0.0020754) % 360, abs=1e-3)


def test_navamsa_follows_the_element_start_rule():
    assert navamsa_sign(0.0) == 1            # Aries 0° -> Aries
    assert navamsa_sign(3.4) == 2            # second ninth of Aries -> Taurus
    assert navamsa_sign(29.9) == 9           # ninth of Aries -> Sagittarius
    assert navamsa_sign(30.0) == 10          # Taurus (earth) starts at Capricorn
    assert navamsa_sign(60.0) == 7           # Gemini (air) starts at Libra
    assert navamsa_sign(90.0) == 4           # Cancer (water) starts at Cancer
    assert navamsa_sign(359.99) == 12 and navamsa_sign(120.0) == 1


def test_dignity_table():
    assert dignity("Sun", 1) == "exalted" and dignity("Sun", 7) == "debilitated" and dignity("Sun", 5) == "own"
    assert dignity("Moon", 2) == "exalted" and dignity("Moon", 8) == "debilitated"
    assert dignity("Venus", 12) == "exalted" and dignity("Venus", 6) == "debilitated"
    assert dignity("Mars", 10) == "exalted" and dignity("Mars", 4) == "debilitated"
    assert dignity("Mercury", 9) is None and dignity("Rahu", 1) is None


def test_planet_details_are_consistent_with_the_chart(sample):
    chart, _moment, details = sample
    assert set(details["planets"]) == {"Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn", "Rahu", "Ketu"}
    for name, position in chart["positions"].items():
        row = details["planets"][name]
        assert row["rashi_index"] == position["rashi_index"] and row["whole_sign_bhava"] == position["whole_sign_bhava"]
        assert row["degree_in_sign"] == pytest.approx(position["sidereal_longitude"] % 30, abs=1e-4)
        assert 1 <= row["nakshatra_pada"] <= 4 and 1 <= row["nakshatra_index"] <= 27
    assert details["planets"]["Sun"]["retrograde"] is False and details["planets"]["Moon"]["retrograde"] is False
    rahu, ketu = details["planets"]["Rahu"], details["planets"]["Ketu"]
    assert rahu["retrograde"] and ketu["retrograde"]
    assert (ketu["sidereal_longitude"] - rahu["sidereal_longitude"]) % 360 == pytest.approx(180.0, abs=1e-6)
    assert details["navamsa"]["lagna_rashi_index"] == details["lagna"]["navamsa_rashi_index"]


def test_birth_panchang_spans_contain_the_birth_moment(sample):
    _chart, moment, details = sample
    birth = moment.replace(tzinfo=None).isoformat(timespec="minutes")
    for key, row in details["birth_panchang"].items():
        assert row["starts_at"] <= birth < row["ends_at"], key


def test_vimshottari_dates_are_continuous_and_mark_the_current_period(sample):
    chart, moment, details = sample
    dasha = details["dasha"]
    rows = dasha["mahadasha"]
    assert rows[0]["lord"] == chart["vimshottari"]["starting_lord"] and rows[0]["start"] == moment.date().isoformat()
    assert all(left["end"] == right["start"] for left, right in zip(rows, rows[1:]))
    assert [row["lord"] for row in rows if row["current"]] == ["Rahu"] == [dasha["current_mahadasha"]]
    assert sum(1 for row in dasha["antardasha"] if row["current"]) == 1
    assert dasha["antardasha"][0]["lord"] == "Rahu"
    span_years = sum(row["years"] for row in [r for r in rows if r["lord"] == "Rahu"])
    assert span_years == 18
