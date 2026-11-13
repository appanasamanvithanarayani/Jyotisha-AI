"""Sunrise-based day Panchang: structural invariants plus loose reference sanity.

The reference windows come from reading a public Panchang for Bengaluru on
2026-10-30; they are tolerance checks, not copied data or calibration targets.
"""
from __future__ import annotations

from datetime import datetime
from pathlib import Path

import pytest

from jyotisha_ai.day_panchang import DayPanchangError, day_panchang

ROOT = Path(__file__).resolve().parents[1]


def minutes(stamp: str) -> int:
    value = datetime.fromisoformat(stamp)
    return value.hour * 60 + value.minute


@pytest.fixture(scope="module")
def bengaluru() -> dict:
    return day_panchang(ROOT, "2026-10-30", "Bengaluru")


def test_sunrise_and_sunset_are_close_to_published_values(bengaluru):
    assert abs(minutes(bengaluru["sunrise"]) - (6 * 60 + 13)) <= 2
    assert abs(minutes(bengaluru["sunset"]) - (17 * 60 + 54)) <= 2
    assert bengaluru["timezone"] == "Asia/Kolkata"


def test_panchang_elements_and_transitions_match_expected_names(bengaluru):
    assert [row["index"] for row in bengaluru["tithi"]] == [20, 21]
    assert [row["index"] for row in bengaluru["nakshatra"]] == [5, 6]
    assert [row["index"] for row in bengaluru["yoga"]] == [20, 21]
    assert [row["index"] for row in bengaluru["karana_half_tithi"]] == [39, 40, 41, 42]
    assert [row["index"] for row in bengaluru["moon_rashi"]] == [3]
    assert bengaluru["sun_rashi_index"] == 7
    assert bengaluru["paksha"] == "krishna"
    assert abs(minutes(bengaluru["tithi"][0]["ends_at"]) - (19 * 60 + 24)) <= 3
    assert abs(minutes(bengaluru["nakshatra"][0]["ends_at"]) - (9 * 60 + 4)) <= 3
    assert abs(minutes(bengaluru["yoga"][0]["ends_at"]) - (20 * 60 + 41)) <= 3


def test_every_division_has_a_true_start_and_end_time_even_after_next_sunrise(bengaluru):
    for key in ("tithi", "nakshatra", "yoga", "karana_half_tithi", "moon_rashi"):
        rows = bengaluru[key]
        assert all(row["starts_at"] and row["ends_at"] for row in rows), key
        assert all(row["starts_at"] < row["ends_at"] for row in rows)
        assert [row["ends_at"] for row in rows] == sorted(row["ends_at"] for row in rows)
        # consecutive divisions meet exactly
        assert all(left["ends_at"] == right["starts_at"] for left, right in zip(rows, rows[1:]))
        assert rows[0]["starts_at"] <= bengaluru["sunrise"] < rows[0]["ends_at"]
    # the last Tithi ends after the next sunrise, and says when
    assert bengaluru["tithi"][-1]["ends_at"] > bengaluru["next_sunrise"]


def test_day_division_windows_follow_the_conventional_formulas(bengaluru):
    day = minutes(bengaluru["sunset"]) - minutes(bengaluru["sunrise"])
    rahu_start, rahu_end = (minutes(value) for value in bengaluru["timings"]["rahu_kalam"])
    assert abs((rahu_end - rahu_start) - day / 8) <= 1
    assert abs(rahu_start - (minutes(bengaluru["sunrise"]) + 3 * day / 8)) <= 1  # Friday: 4th eighth
    abhijit_start, abhijit_end = (minutes(value) for value in bengaluru["timings"]["abhijit"])
    assert abs((abhijit_end - abhijit_start) - day / 15) <= 1
    assert bengaluru["weekday_index_sunday_first"] == 6
    assert bengaluru["dinamana_minutes"] + bengaluru["ratrimana_minutes"] == pytest.approx(24 * 60, abs=2)


def test_moon_events_are_reported_or_explicitly_absent(bengaluru):
    assert bengaluru["moonrise"] and bengaluru["moonset"]


def test_daylight_saving_day_still_orders_sunrise_before_sunset():
    day = day_panchang(ROOT, "2026-10-04", "Sydney, AU")
    assert day["sunrise"] < day["sunset"] < day["next_sunrise"]


def test_polar_day_returns_no_invented_times():
    with pytest.raises(DayPanchangError):
        day_panchang(ROOT, "2026-06-21", "Murmansk, RU")


@pytest.mark.parametrize("date", ["2026-13-01", "not-a-date", "1969-12-31", "2101-01-01"])
def test_invalid_or_unsupported_dates_are_rejected(date):
    with pytest.raises(ValueError):
        day_panchang(ROOT, date, "Bengaluru")


def test_chandrabalam_and_tarabalam_follow_the_conventional_rules(bengaluru):
    moon = bengaluru["moon_rashi"][0]
    assert moon["index"] == 3
    assert moon["good_chandrabalam_rashis"] == [1, 3, 5, 6, 9, 10]  # Mesha, Mithuna, Simha, Kanya, Dhanu, Makara
    assert moon["ashtama_chandra_rashi"] == 8  # Vrischika
    assert bengaluru["nakshatra"][0]["good_tara_nakshatras"] == [2, 4, 6, 7, 9, 11, 13, 15, 16, 18, 20, 22, 24, 25, 27]
    assert bengaluru["nakshatra"][1]["good_tara_nakshatras"] == [1, 3, 5, 7, 8, 10, 12, 14, 16, 17, 19, 21, 23, 25, 26]


def test_tara_cycle_and_chandrabalam_helpers():
    from jyotisha_ai.day_panchang import ashtama_chandra_rashi, good_chandrabalam_rashis, tara_number
    assert tara_number(5, 5) == 1  # Janma
    assert tara_number(5, 4) == 2  # Sampat
    assert tara_number(5, 6) == 9  # Parama Mitra (one before)
    assert all(len(good_chandrabalam_rashis(r)) == 6 for r in range(1, 13))
    assert [ashtama_chandra_rashi(r) for r in (1, 2, 3, 12)] == [6, 7, 8, 5]


def test_varjyam_and_extra_muhurtas_are_close_to_published_values(bengaluru):
    (varjyam,) = bengaluru["varjyam"]
    assert varjyam["nakshatra_index"] == 6
    assert abs(minutes(varjyam["starts_at"]) - (16 * 60 + 49)) <= 3
    assert abs(minutes(varjyam["ends_at"]) - (18 * 60 + 17)) <= 3
    timings = bengaluru["timings"]
    for key, (begin, end) in {"pratah_sandhya": (4 * 60 + 59, 6 * 60 + 13), "vijaya_muhurta": (14 * 60, 14 * 60 + 47),
                              "sayahna_sandhya": (17 * 60 + 54, 19 * 60 + 8)}.items():
        assert abs(minutes(timings[key][0]) - begin) <= 2 and abs(minutes(timings[key][1]) - end) <= 2, key
    assert timings["nishita_muhurta"][1] > timings["nishita_muhurta"][0]
    assert timings["nishita_muhurta"][1].startswith("2026-10-31")


def test_day_panchang_reports_planet_signs_for_the_transit_outlook():
    from pathlib import Path

    day = day_panchang(Path(__file__).resolve().parents[1], "2026-10-31", "Bengaluru, IN")
    signs = day["planet_rashis"]
    assert set(signs) == {"Sun", "Mars", "Mercury", "Jupiter", "Venus", "Saturn", "Rahu", "Ketu"}
    assert all(1 <= value <= 12 for value in signs.values())
    assert signs["Sun"] == 7          # Libra at this date (sidereal)
    assert (signs["Rahu"] - signs["Ketu"]) % 12 == 6   # the nodes are always opposite


def test_month_calendar_rows_carry_moon_and_planet_signs_for_the_month_outlook():
    from jyotisha_ai.day_panchang import month_calendar

    month = month_calendar(Path(__file__).resolve().parents[1], 2026, 11, "Bengaluru, IN")
    first = month["days"][0]
    assert 1 <= first["moon_rashi_index"] <= 12
    assert set(first["planet_rashis"]) == {"Sun", "Mars", "Mercury", "Jupiter", "Venus", "Saturn", "Rahu", "Ketu"}
    day = day_panchang(Path(__file__).resolve().parents[1], first["date"], "Bengaluru, IN")
    assert day["planet_rashis"] == first["planet_rashis"] and day["moon_rashi"][0]["index"] == first["moon_rashi_index"]


@pytest.fixture(scope="module")
def hyderabad_nov13() -> dict:
    return day_panchang(ROOT, "2026-11-13", "Hyderabad, IN")


def test_new_windows_are_close_to_a_published_telugu_calendar(hyderabad_nov13):
    """Reference: a Telugu calendar app's Hyderabad page for 2026-11-13 (tolerance checks, not copied data)."""
    day = hyderabad_nov13
    durmuhurtam = [(minutes(a), minutes(b)) for a, b in day["durmuhurtam"]]          # Friday: 4th and 9th day muhurtas
    assert len(durmuhurtam) == 2
    assert abs(durmuhurtam[0][0] - (8 * 60 + 38)) <= 4 and abs(durmuhurtam[1][0] - (12 * 60 + 22)) <= 4
    varjyam = day["varjyam"]                                                          # Mula's second Varjyam, then Purva Ashadha's
    assert [item["nakshatra_index"] for item in varjyam] == [19, 20]
    assert abs(minutes(varjyam[0]["starts_at"]) - (15 * 60 + 29)) <= 3 and abs(minutes(varjyam[1]["starts_at"]) - (4 * 60 + 8)) <= 3
    (amrita,) = day["amrita_kalam"]
    assert amrita["nakshatra_index"] == 19 and abs(minutes(amrita["starts_at"]) - (10 * 60 + 11)) <= 8
    assert abs(minutes(day["timings"]["abhijit"][0]) - (11 * 60 + 38)) <= 3


def test_lunar_month_samvatsara_and_event_muhurtas(hyderabad_nov13):
    day = hyderabad_nov13
    assert (day["lunar_month"], day["adhika_month"], day["samvatsara_index"]) == (8, False, 40)   # Kartika, Parabhava
    assert set(day["event_muhurtas"]) == {"marriage", "gruhapravesam", "vehicle"}
    assert all(windows == [] for windows in day["event_muhurtas"].values())          # Chaturthi: no muhurtas
    thursday = day_panchang(ROOT, "2026-11-26", "Hyderabad, IN")
    windows = thursday["event_muhurtas"]["vehicle"]
    assert windows and all(minutes(b) - minutes(a) >= 30 for a, b in windows)
    rahu = [minutes(x) for x in thursday["timings"]["rahu_kalam"]]
    assert all(minutes(b) <= rahu[0] or minutes(a) >= rahu[1] for a, b in windows)   # never inside Rahu Kalam


def test_samvatsara_changes_at_ugadi_and_adhika_month_is_flagged():
    from jyotisha_ai.festivals import samvatsara_index
    from datetime import date
    assert samvatsara_index(date(2026, 3, 18), 12) == 39 and samvatsara_index(date(2026, 3, 20), 1) == 40
    assert samvatsara_index(date(1987, 4, 1), 1) == 1                                 # Prabhava
    adhika = day_panchang(ROOT, "2026-05-21", "Hyderabad, IN")
    assert adhika["adhika_month"] is True and adhika["lunar_month"] == 3              # Adhika Jyeshtha 2026
    assert all(windows == [] for windows in adhika["event_muhurtas"].values())        # no muhurtas in an Adhika month
