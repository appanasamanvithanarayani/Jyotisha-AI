"""Research-only IAE 1989 mean-precession ayanamsha calculation.

This is a *mean* ayanamsha, not a drop-in offset for the chart calculator's
true-ecliptic-of-date longitudes. It must not be used to unlock birth charts.

The precession polynomial is attributed to Indian Astronomical Ephemeris 1989,
p. 525, in the Swiss Ephemeris documentation, section 2.8. The IAE original
page has not been inspected by this project.
The J2000 anchor is the documented Swiss Ephemeris/IAE comparison in
Appendix E, not a claim that this implementation reproduces all editions.
"""

from __future__ import annotations

import math
from datetime import datetime, timezone
from functools import lru_cache

import astronomy


J2000_TT_JD = 2451545.0
J2000_MEAN_ARCSECONDS = 23 * 3600 + 51 * 60 + 25.5324
METHOD_ID = "iae1989_lahiri_mean_precession_j2000_v1"
TRUE_METHOD_ID = "lahiri_iae1985_true_1956_iau1976_wahr1980_v1"
INITIAL_TT_JD = 2435553.5  # 1956-03-21 00:00 TT
INITIAL_TRUE_ARCSECONDS = 23 * 3600 + 15 * 60 + 0.658


class AyanamshaUnavailableError(RuntimeError):
    """The selected method cannot execute; no substitute is permitted."""


@lru_cache(maxsize=1)
def _verify_pins() -> None:
    """Check the pinned PyERFA/NumPy versions once; a failure raises every time and is never cached."""
    from importlib.metadata import version
    if version("pyerfa") != "2.0.1.5" or version("numpy") != "1.26.4":
        raise AyanamshaUnavailableError("pinned PyERFA/NumPy versions are unavailable")


def _wahr1980_nutation_arcseconds(julian_date_tt: float) -> float:
    try:
        import erfa
        _verify_pins()
        return float(erfa.nut80(julian_date_tt, 0.0)[0]) * (180.0 / math.pi) * 3600.0
    except (ImportError, ModuleNotFoundError) as exc:
        raise AyanamshaUnavailableError("pinned PyERFA is unavailable; no ayanamsha fallback is allowed") from exc


def true_lahiri_degrees(julian_date_tt: float) -> float:
    """IAE 1985 Lahiri true ayanamsha using IAU1976/Wahr1980 conventions.

    The initial true value is 23°15′00.658″ at 1956-03-21 00:00 TT.
    The formula and numeric tests are documented in the evaluation report.
    """
    if not isinstance(julian_date_tt, (int, float)) or not math.isfinite(julian_date_tt):
        raise ValueError("supply a finite Julian date in Terrestrial Time")
    if not 2378496.5 <= julian_date_tt <= 2488434.5:
        raise ValueError("true ayanamsha evaluation is limited to 1800-2100 TT")
    centuries = (julian_date_tt - INITIAL_TT_JD) / 36525.0
    start_centuries = (INITIAL_TT_JD - J2000_TT_JD) / 36525.0
    precession_arcseconds = (
        (5029.0966 + 2.22226 * start_centuries - 0.000042 * start_centuries**2) * centuries
        + (1.11161 - 0.000127 * start_centuries) * centuries**2
        - 0.000113 * centuries**3
    )
    return (
        INITIAL_TRUE_ARCSECONDS
        - _wahr1980_nutation_arcseconds(INITIAL_TT_JD)
        + precession_arcseconds
        + _wahr1980_nutation_arcseconds(julian_date_tt)
    ) / 3600.0


def true_lahiri_for_utc(moment: datetime) -> tuple[float, float]:
    """Return (degrees, TT Julian date) from explicit UTC civil time.

    UTC-to-TT uses pinned Astronomy Engine's Delta-T model; this is separately
    checked against reference TT instants in the synthetic chart tests.
    """
    if moment.tzinfo is None or moment.utcoffset() is None:
        raise ValueError("UTC moment must be timezone-aware")
    utc = moment.astimezone(timezone.utc)
    astro_time = astronomy.Time.Make(
        utc.year, utc.month, utc.day, utc.hour, utc.minute,
        utc.second + utc.microsecond / 1e6,
    )
    julian_date_tt = J2000_TT_JD + astro_time.tt
    return true_lahiri_degrees(julian_date_tt), julian_date_tt


def mean_lahiri_degrees(julian_date_tt: float) -> float:
    """Return the documented J2000-anchored mean ayanamsha in degrees.

    ``julian_date_tt`` must be a Julian date on the Terrestrial Time scale.
    This function deliberately does not guess TT from a civil date or UTC.
    """
    if not isinstance(julian_date_tt, (int, float)) or not math.isfinite(julian_date_tt):
        raise ValueError("supply a finite Julian date in Terrestrial Time")
    if not 2378496.5 <= julian_date_tt <= 2488434.5:
        raise ValueError("mean ayanamsha evaluation is limited to 1800-2100 TT")
    centuries = (julian_date_tt - J2000_TT_JD) / 36525.0
    precession_arcseconds = (
        5029.0966 * centuries
        + 1.11161 * centuries**2
        - 0.000113 * centuries**3
    )
    return (J2000_MEAN_ARCSECONDS + precession_arcseconds) / 3600.0
