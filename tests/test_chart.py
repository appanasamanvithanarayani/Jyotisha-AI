"""Synthetic chart tests and one independent solar-reference smoke check."""

from datetime import datetime, timezone, timedelta
import json
import math

import pytest

from jyotisha_ai.chart import calculate_chart, divisions, vimshottari
from jyotisha_ai.cli import main


def test_panchanga_geometric_boundaries():
    # Exact synthetic angles test the documented 12°, 6°, and 13°20′ partitions.
    result = divisions(moon=12.0, sun=0.0, weekday=5)
    assert result == {
        "tithi_index": 2, "karana_half_tithi_index": 3,
        "nakshatra_index": 1, "nakshatra_pada": 4,
        "yoga_index": 1, "civil_weekday_index_sunday_first": 7,
        "vara_status": "sunrise_based_vara_not_calculated",
    }
    assert divisions(0.0, 0.0, 6)["civil_weekday_index_sunday_first"] == 1
    assert divisions(360.0, 0.0, 6)["nakshatra_index"] == 1
    assert divisions(359.999, 0.0, 6)["nakshatra_index"] == 27


def test_vimshottari_synthetic_nakshatras_and_balance():
    first = vimshottari(0.0)
    assert first["starting_lord"] == "Ketu"
    assert first["balance_years_at_birth"] == 7.0
    assert first["full_cycle_years"] == 120
    assert [period["lord"] for period in first["periods"]] == [
        "Ketu", "Venus", "Sun", "Moon", "Mars", "Rahu", "Jupiter", "Saturn", "Mercury"
    ]
    half = vimshottari(20.0)  # midpoint of second 13°20′ nakshatra
    assert half["starting_lord"] == "Venus"
    assert half["balance_years_at_birth"] == 10.0
    assert vimshottari(360.0)["starting_lord"] == "Ketu"


def test_chart_is_reproducible_and_timezone_equivalent():
    utc = datetime(2000, 1, 1, 12, tzinfo=timezone.utc)
    local = utc.astimezone(timezone(timedelta(hours=5, minutes=30)))
    a = calculate_chart(utc, 0, 0, 0, "synthetic-zero")
    b = calculate_chart(local, 0, 0, 0, "synthetic-zero")
    assert a == calculate_chart(utc, 0, 0, 0, "synthetic-zero")
    assert a["positions"] == b["positions"]
    assert a["ascendant"] == b["ascendant"]
    assert a["ascendant"] != calculate_chart(utc, 0, 90, 0, "synthetic-zero")["ascendant"]
    assert a["validation_status"] == "not_independently_benchmarked"
    assert "Rahu/Ketu positions" in a["unsupported"]


def test_ayanamsha_changes_sidereal_not_tropical():
    when = datetime(2000, 1, 1, 12, tzinfo=timezone.utc)
    zero = calculate_chart(when, 0, 0, 0, "synthetic-zero")
    shifted = calculate_chart(when, 0, 0, 24, "synthetic-24")
    assert zero["positions"]["Sun"]["tropical_longitude"] == shifted["positions"]["Sun"]["tropical_longitude"]
    assert shifted["positions"]["Sun"]["sidereal_longitude"] == pytest.approx(
        (zero["positions"]["Sun"]["sidereal_longitude"] - 24) % 360, abs=1e-7
    )
    assert zero["panchanga_at_birth"]["tithi_index"] == shifted["panchanga_at_birth"]["tithi_index"]


def test_usno_approximate_solar_reference_at_j2000():
    # US Naval Observatory, "Computing Approximate Solar Coordinates":
    # q=280.459+0.98564736 D, g=357.529+0.98560028 D,
    # L=q+1.915 sin(g)+0.020 sin(2g). At D=0: ~280.376°.
    # This is an *approximate* independent solar check, not a chart benchmark.
    g = math.radians(357.529)
    usno_approx = 280.459 + 1.915 * math.sin(g) + 0.020 * math.sin(2 * g)
    chart = calculate_chart(datetime(2000, 1, 1, 12, tzinfo=timezone.utc), 0, 0, 0, "synthetic-zero")
    assert chart["positions"]["Sun"]["tropical_longitude"] == pytest.approx(usno_approx, abs=0.03)


@pytest.mark.parametrize("moment, latitude, longitude, reference, ascendant", [
    (
        datetime(2000, 1, 1, 12, tzinfo=timezone.utc), 0.0, 0.0,
        {"Sun": (280, 22, 8.1072), "Moon": (223, 19, 25.5052),
         "Mercury": (271, 53, 21.3974), "Venus": (241, 33, 56.8382),
         "Mars": (327, 57, 47.8891), "Jupiter": (25, 15, 11.1138),
         "Saturn": (40, 23, 44.3886)}, (11, 22, 26.0386),
    ),
    (
        datetime(2020, 1, 1, 0, tzinfo=timezone.utc), 28.6139, 77.209,
        {"Sun": (280, 0, 34.2261), "Moon": (346, 8, 18.2932),
         "Mercury": (274, 22, 59.9908), "Venus": (314, 24, 34.2298),
         "Mars": (238, 23, 4.6406), "Jupiter": (276, 40, 13.2671),
         "Saturn": (291, 23, 41.8947)}, (255, 25, 22.9389),
    ),
])
def test_synthetic_tropical_chart_against_online_swetest(moment, latitude, longitude, reference, ascendant):
    # Astrodienst swetest online 2.10.04, queried 2026-10-29:
    # -ut12/-ut0 -eswe -house{lon},{lat},P -p0123456 -fTPL.
    # The site returned no fallback warning, but actual server files are not
    # independently inspectable. This is a limited comparison, not certification.
    chart = calculate_chart(moment, latitude, longitude, 0, "synthetic-zero")
    def degrees(parts):
        d, m, s = parts
        return d + m / 60 + s / 3600
    def arcsecond_gap(actual, expected):
        return abs((actual - expected + 180) % 360 - 180) * 3600
    for body, expected in reference.items():
        assert arcsecond_gap(chart["positions"][body]["tropical_longitude"], degrees(expected)) < 10
    assert arcsecond_gap(chart["ascendant"]["tropical_longitude"], degrees(ascendant)) < 1


@pytest.mark.parametrize("invalid", [datetime(2000, 1, 1, 12), datetime(1799, 1, 1, tzinfo=timezone.utc)])
def test_invalid_time_is_rejected(invalid):
    with pytest.raises(ValueError):
        calculate_chart(invalid, 0, 0, 24, "test")


def test_invalid_location_and_ayanamsha_rejected():
    when = datetime(2000, 1, 1, tzinfo=timezone.utc)
    for lat, lon, value, name in [(91, 0, 24, "test"), (0, 181, 24, "test"), (0, 0, float("nan"), "test"), (0, 0, 24, "")]:
        with pytest.raises(ValueError):
            calculate_chart(when, lat, lon, value, name)


def test_chart_cli_is_json_and_requires_explicit_inputs(capsys):
    assert main([
        "chart", "--datetime", "2000-01-01T12:00:00+00:00",
        "--latitude", "0", "--longitude", "0",
        "--ayanamsha-degrees", "0", "--ayanamsha-id", "synthetic-zero",
    ]) == 0
    output = json.loads(capsys.readouterr().out)
    assert output["engine_version"] == "0.1.0"
    assert output["input"]["ayanamsha_id"] == "synthetic-zero"
    assert output["panchanga_at_birth"]["vara_status"] == "sunrise_based_vara_not_calculated"
