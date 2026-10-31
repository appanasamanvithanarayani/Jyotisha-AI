"""Published-number checks for the research-only mean ayanamsha."""

import pytest

from jyotisha_ai.ayanamsha import (
    AyanamshaUnavailableError, METHOD_ID, TRUE_METHOD_ID, mean_lahiri_degrees,
    true_lahiri_degrees, true_lahiri_for_utc,
)
from datetime import datetime, timezone


@pytest.mark.parametrize(
    "julian_date_tt, degrees, minutes, seconds",
    [
        (2451545.0, 23, 51, 25.5324),
        (2458485.0, 24, 7, 21.1353),
        (2458850.0, 24, 8, 11.3962),
    ],
)
def test_reproduces_published_swiss_iae_mean_comparison(julian_date_tt, degrees, minutes, seconds):
    # Swiss Ephemeris documentation, Appendix E, IAE 2019 p.429 comparison.
    # These are independent published values for the scalar MEAN ayanamsha,
    # not tests of true ayanamsha, planets, ascendant, or a complete chart.
    expected = degrees + minutes / 60 + seconds / 3600
    assert abs(mean_lahiri_degrees(julian_date_tt) - expected) * 3600 < 0.0001


@pytest.mark.parametrize(
    "julian_date_tt, degrees, minutes, seconds",
    [
        (2447527.5, 23, 42, 12.3717),
        (2447892.5, 23, 43, 2.6259),
    ],
)
def test_earlier_published_mean_values_are_close_not_identical(julian_date_tt, degrees, minutes, seconds):
    # Swiss Ephemeris documentation, Appendix E, IAE 1989 p.512 comparison.
    # Different anchor/model implementation: record the discrepancy honestly.
    expected = degrees + minutes / 60 + seconds / 3600
    assert abs(mean_lahiri_degrees(julian_date_tt) - expected) * 3600 < 0.01


def test_requires_explicit_finite_tt_and_research_method_identity():
    assert METHOD_ID == "iae1989_lahiri_mean_precession_j2000_v1"
    for value in (float("nan"), float("inf"), "2451545", 0, 3000000):
        with pytest.raises(ValueError):
            mean_lahiri_degrees(value)


@pytest.mark.parametrize("julian_date_tt, seconds", [
    (2458484.500801161, 5.9864),
    (2458849.500802792, 54.8411),
])
def test_true_lahiri_matches_published_synthetic_reference(julian_date_tt, seconds):
    # Swiss Ephemeris documentation Appendix E, IAE 2019 p.427 comparison,
    # and online swetest 2.10.04 with -sid1 -sidbit8192 at 0 UT.
    expected_arcseconds = 24 * 3600 + 7 * 60 + seconds
    assert abs(true_lahiri_degrees(julian_date_tt) * 3600 - expected_arcseconds) < 0.001
    assert TRUE_METHOD_ID == "lahiri_iae1985_true_1956_iau1976_wahr1980_v1"


def test_true_lahiri_uses_explicit_utc_to_tt_not_mean_fallback():
    degrees, jd_tt = true_lahiri_for_utc(datetime(2000, 1, 1, 12, tzinfo=timezone.utc))
    assert jd_tt == pytest.approx(2451545.000738971, abs=0.000001)
    assert degrees == pytest.approx(23 + 51 / 60 + 11.6091 / 3600, abs=0.0001 / 3600)
    for value in (float("nan"), float("inf"), "2451545", 0, 3000000):
        with pytest.raises(ValueError):
            true_lahiri_degrees(value)
    with pytest.raises(ValueError, match="timezone-aware"):
        true_lahiri_for_utc(datetime(2000, 1, 1, 12))


def test_missing_erfa_fails_closed_without_mean_or_zero_fallback(monkeypatch):
    import sys
    monkeypatch.setitem(sys.modules, "erfa", None)
    with pytest.raises(AyanamshaUnavailableError, match="no ayanamsha fallback"):
        true_lahiri_degrees(2458484.500801161)
