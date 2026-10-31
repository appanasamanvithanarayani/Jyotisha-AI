"""Fail-closed runtime checks for the limited localhost chart preview.

The reference numbers are synthetic Astrodienst swetest 2.10.04 outputs
recorded in evaluations/AYANAMSHA_REFERENCE_CHECK_2026-10-28.md.
They do not validate dates or locations outside these cases.
"""

from __future__ import annotations

from datetime import datetime, timezone
from importlib.metadata import PackageNotFoundError, version

from jyotisha_ai.ayanamsha import TRUE_METHOD_ID, true_lahiri_degrees, true_lahiri_for_utc
from jyotisha_ai.chart import calculate_chart


class ChartValidationError(RuntimeError):
    """Runtime packages or known synthetic checks do not match approval."""


def _degrees(dms: tuple[int, int, float]) -> float:
    d, m, s = dms
    return d + m / 60 + s / 3600


def _arcsecond_gap(actual: float, expected: float) -> float:
    return abs((actual - expected + 180) % 360 - 180) * 3600


_TRUE_AYANAMSHA_REFERENCES = (
    (2458484.500801161, (24, 7, 5.9864)),
    (2458849.500802792, (24, 7, 54.8411)),
)

_CHART_REFERENCES = (
    (
        datetime(2000, 1, 1, 12, tzinfo=timezone.utc), 0.0, 0.0,
        (23, 51, 11.6091),
        {"Sun": (256, 30, 56.5063), "Moon": (199, 28, 13.9015),
         "Mercury": (248, 2, 9.7964), "Venus": (217, 42, 45.2365),
         "Mars": (304, 6, 36.2875), "Jupiter": (1, 23, 59.5121),
         "Saturn": (16, 32, 32.7863)},
        (347, 31, 14.4408),
    ),
    (
        datetime(2020, 1, 1, 0, tzinfo=timezone.utc), 28.6139, 77.209,
        (24, 7, 54.8411),
        {"Sun": (255, 52, 39.4526), "Moon": (322, 0, 23.5163),
         "Mercury": (250, 15, 5.2172), "Venus": (290, 16, 39.4554),
         "Mars": (214, 15, 9.8670), "Jupiter": (252, 32, 18.4936),
         "Saturn": (267, 15, 47.1212)},
        (231, 17, 28.0851),
    ),
)


def validate_local_chart_runtime() -> None:
    """Check exact pins and two full synthetic cases; never switch backends."""
    try:
        for package, expected in (
            ("astronomy-engine", "2.1.19"), ("pyerfa", "2.0.1.5"), ("numpy", "1.26.4")
        ):
            if version(package) != expected:
                raise ChartValidationError(f"{package} does not match the approved local pin")
    except PackageNotFoundError as exc:
        raise ChartValidationError("a pinned chart dependency is missing") from exc
    for jd_tt, expected in _TRUE_AYANAMSHA_REFERENCES:
        if _arcsecond_gap(true_lahiri_degrees(jd_tt), _degrees(expected)) >= 0.001:
            raise ChartValidationError("true-Lahiri reference check failed")
    for moment, latitude, longitude, expected_ayanamsha, positions, ascendant in _CHART_REFERENCES:
        ayanamsha, _ = true_lahiri_for_utc(moment)
        if _arcsecond_gap(ayanamsha, _degrees(expected_ayanamsha)) >= 0.01:
            raise ChartValidationError("UTC-to-TT ayanamsha reference check failed")
        chart = calculate_chart(moment, latitude, longitude, ayanamsha, TRUE_METHOD_ID)
        for body, expected in positions.items():
            if _arcsecond_gap(chart["positions"][body]["sidereal_longitude"], _degrees(expected)) >= 10:
                raise ChartValidationError(f"{body} synthetic position reference check failed")
        if _arcsecond_gap(chart["ascendant"]["sidereal_longitude"], _degrees(ascendant)) >= 1:
            raise ChartValidationError("synthetic ascendant reference check failed")
