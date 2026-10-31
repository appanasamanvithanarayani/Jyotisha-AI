"""Festival rules against dates published in printed/online Panchangs for Bengaluru.

The expected dates were written from memory of published calendars for 2025 and
2026; they are tolerance checks for the rules, not calibration data.
"""
from __future__ import annotations

import re
from datetime import date
from pathlib import Path
from zoneinfo import ZoneInfo

import astronomy
import pytest

from jyotisha_ai.festivals import ALL_KEYS, GAZETTED, HINDU_FESTIVALS, _Calendar, _is_vishti, easter_sunday, festival_events

OBSERVER = astronomy.Observer(12.9716, 77.5946, 0.0)
ZONE = ZoneInfo("Asia/Kolkata")
ROOT = Path(__file__).resolve().parents[1]


def month_events(year: int, month: int) -> dict[str, str]:
    from calendar import monthrange
    events = festival_events(OBSERVER, ZONE, date(year, month, 1), date(year, month, monthrange(year, month)[1]))
    return {event["key"]: event["date"] for event in events}


@pytest.mark.parametrize("year,month,expected", [
    (2026, 1, {"makar_sankranti": "2026-01-14", "vasant_panchami": "2026-01-23", "republic_day": "2026-01-26"}),
    (2026, 3, {"holika_dahan": "2026-03-03", "holi": "2026-03-04", "ugadi": "2026-03-19", "ram_navami": "2026-03-26", "mahavir_jayanti": "2026-03-31"}),
    (2026, 8, {"onam": "2026-08-26", "raksha_bandhan": "2026-08-28"}),
    (2026, 9, {"janmashtami": "2026-09-04", "ganesh_chaturthi": "2026-09-14"}),
    (2026, 11, {"dhanteras": "2026-11-06", "diwali": "2026-11-08", "bhai_dooj": "2026-11-11", "karthika_purnima": "2026-11-24"}),
    (2025, 3, {"holika_dahan": "2025-03-13", "holi": "2025-03-14", "ugadi": "2025-03-30"}),
    (2025, 8, {"raksha_bandhan": "2025-08-09", "janmashtami": "2025-08-16", "ganesh_chaturthi": "2025-08-27"}),
    (2025, 10, {"vijayadashami": "2025-10-02", "diwali": "2025-10-20", "govardhan_puja": "2025-10-22"}),
])
def test_festival_dates_match_published_calendars(year, month, expected):
    found = month_events(year, month)
    for key, day in expected.items():
        assert found.get(key) == day, f"{key}: expected {day}, got {found.get(key)}"


def test_adhika_month_is_detected_and_festivals_are_not_placed_in_it():
    calendar = _Calendar(OBSERVER, ZONE, date(2026, 5, 1), date(2026, 7, 31))
    moments = {name: astronomy.Time.Make(2026, *day, 6, 0, 0) for name, day in {"before": (5, 10), "adhika": (6, 1), "nija": (6, 25)}.items()}
    assert calendar.lunar_month(moments["before"]) == 2   # Vaishakha
    assert calendar.lunar_month(moments["adhika"]) is None  # Adhika Jyeshtha: no Sankranti inside the month
    assert calendar.lunar_month(moments["nija"]) == 3     # Nija Jyeshtha
    assert month_events(2026, 6) == {}  # no festival is placed in Adhika Jyeshtha or early Nija Jyeshtha
    assert month_events(2026, 7)["rath_yatra"] == "2026-07-16" and month_events(2026, 7)["guru_purnima"] == "2026-07-29"


def test_gazetted_holidays_are_flagged_and_other_festivals_are_not():
    events = festival_events(OBSERVER, ZONE, date(2026, 11, 1), date(2026, 11, 30))
    flags = {event["key"]: event["holiday"] for event in events}
    assert flags["diwali"] is True and flags["karthika_purnima"] is True
    assert flags["dhanteras"] is False and flags["chhath"] is False
    assert all(event["key"] in ALL_KEYS for event in events)
    assert [event["date"] for event in events] == sorted(event["date"] for event in events)
    assert {"holi", "diwali", "janmashtami", "christmas"} <= GAZETTED


def test_easter_and_good_friday_follow_the_gregorian_computus():
    assert easter_sunday(2024) == date(2024, 3, 31)
    assert easter_sunday(2025) == date(2025, 4, 20)
    assert easter_sunday(2026) == date(2026, 4, 5)
    april = month_events(2026, 4)
    assert april["easter"] == "2026-04-05" and april["good_friday"] == "2026-04-03" and april["mesha_sankranti"] == "2026-04-14"


def test_bhadra_is_the_seventh_movable_karana():
    assert [_is_vishti(index) for index in (1, 2, 8, 9, 15, 57, 58, 60)] == [False, False, True, False, True, True, False, False]


def test_every_festival_has_an_english_name_in_the_locale_files():
    text = (ROOT / "src/jyotisha_ai/web/locales/en.js").read_text(encoding="utf-8")
    block = text[text.index('"festivals"') if '"festivals"' in text else text.index("festivals"):]
    assert all(f'"{key}"' in block or f"{key}:" in block for key in ALL_KEYS), [key for key in ALL_KEYS if key not in block]
    assert len({key for key, *_ in HINDU_FESTIVALS}) == len(HINDU_FESTIVALS)
    assert all(1 <= month <= 12 and 1 <= tithi <= 30 for _key, month, tithi, _when in HINDU_FESTIVALS)
