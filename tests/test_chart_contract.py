"""Synthetic interface contract; these are not independent chart benchmarks."""

from datetime import datetime, timedelta, timezone
import math

import pytest

from jyotisha_ai.chart import BODIES, calculate_chart


SYNTHETIC_INSTANT = datetime(2000, 1, 1, 12, tzinfo=timezone.utc)


@pytest.mark.parametrize(
    ("latitude", "longitude", "ayanamsha", "label"),
    [
        (math.nan, 0, 24, "test"),
        (0, math.inf, 24, "test"),
        (-90.01, 0, 24, "test"),
        (0, 180.01, 24, "test"),
        (0, 0, math.inf, "test"),
        (0, 0, 40.01, "test"),
        (0, 0, 24, "  "),
    ],
)
def test_contract_rejects_invalid_numeric_settings(latitude, longitude, ayanamsha, label):
    with pytest.raises(ValueError):
        calculate_chart(SYNTHETIC_INSTANT, latitude, longitude, ayanamsha, label)


def test_contract_requires_explicit_utc_offset():
    with pytest.raises(ValueError):
        calculate_chart(datetime(2000, 1, 1, 12), 0, 0, 24, "test")


def test_contract_output_shape_and_unverified_status():
    result = calculate_chart(SYNTHETIC_INSTANT, 0, 0, 0, "synthetic-zero")
    assert result["validation_status"] == "not_independently_benchmarked"
    assert result["input"]["utc_datetime"] == SYNTHETIC_INSTANT.isoformat()
    assert result["input"]["ayanamsha_id"] == "synthetic-zero"
    assert result["conventions"]["houses"] == "whole_sign_from_sidereal_ascendant"
    assert set(result["positions"]) == set(BODIES)
    assert 1 <= result["ascendant"]["rashi_index"] <= 12
    for body in result["positions"].values():
        assert 0 <= body["tropical_longitude"] < 360
        assert 0 <= body["sidereal_longitude"] < 360
        assert 1 <= body["rashi_index"] <= 12
        assert 1 <= body["whole_sign_bhava"] <= 12
    panchanga = result["panchanga_at_birth"]
    assert 1 <= panchanga["tithi_index"] <= 30
    assert 1 <= panchanga["karana_half_tithi_index"] <= 60
    assert 1 <= panchanga["nakshatra_index"] <= 27
    assert 1 <= panchanga["nakshatra_pada"] <= 4
    assert 1 <= panchanga["yoga_index"] <= 27
    assert panchanga["vara_status"] == "sunrise_based_vara_not_calculated"
    dasha = result["vimshottari"]
    assert dasha["full_cycle_years"] == 120
    assert len(dasha["periods"]) == 9
    assert dasha["year_to_days_conversion"] is None
    assert "daily sunrise Panchanga" in result["unsupported"]


def test_contract_same_instant_with_different_offset_has_same_calculations():
    local = SYNTHETIC_INSTANT.astimezone(timezone(timedelta(hours=5, minutes=30)))
    utc_result = calculate_chart(SYNTHETIC_INSTANT, 0, 0, 0, "synthetic-zero")
    local_result = calculate_chart(local, 0, 0, 0, "synthetic-zero")
    assert utc_result["positions"] == local_result["positions"]
    assert utc_result["ascendant"] == local_result["ascendant"]
    assert utc_result["input"]["utc_datetime"] == local_result["input"]["utc_datetime"]
