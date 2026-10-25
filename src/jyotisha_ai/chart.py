"""Deterministic birth-time chart arithmetic; no interpretive astrology or model use.

Astronomy Engine supplies geocentric apparent vectors and Earth orientation.
Sidereal conversion deliberately requires an externally selected ayanamsha.
"""

from __future__ import annotations

from datetime import datetime, timezone
import math

import astronomy


ENGINE_VERSION = "0.1.0"
NAKSHATRA_WIDTH = 360.0 / 27.0
DASHA_ORDER = ("Ketu", "Venus", "Sun", "Moon", "Mars", "Rahu", "Jupiter", "Saturn", "Mercury")
DASHA_YEARS = (7, 20, 6, 10, 7, 18, 16, 19, 17)
BODIES = ("Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn")


def _angle(value: float) -> float:
    return value % 360.0


def divisions(moon: float, sun: float, weekday: int) -> dict:
    """Return birth-instant calendar indices; indices are one-based.

    ``weekday`` follows Python convention: Monday=0, Sunday=6.
    Yoga/nakshatra use sidereal longitudes; tithi/karana use their difference.
    """
    if not all(math.isfinite(x) for x in (moon, sun)) or weekday not in range(7):
        raise ValueError("nonfinite longitude or invalid weekday")
    elongation = _angle(moon - sun)
    nakshatra_zero = min(26, int(_angle(moon) / NAKSHATRA_WIDTH))
    return {
        "tithi_index": int(elongation // 12) + 1,
        "karana_half_tithi_index": int(elongation // 6) + 1,
        "nakshatra_index": nakshatra_zero + 1,
        "nakshatra_pada": min(4, int((_angle(moon) % NAKSHATRA_WIDTH) / (NAKSHATRA_WIDTH / 4)) + 1),
        "yoga_index": int(_angle(moon + sun) / NAKSHATRA_WIDTH) + 1,
        "civil_weekday_index_sunday_first": (weekday + 1) % 7 + 1,
        "vara_status": "sunrise_based_vara_not_calculated",
    }


def vimshottari(moon: float) -> dict:
    """Compute conventional period order and unexpired first-period balance.

    This is arithmetic for an explicitly chosen 27-equal-nakshatra scheme,
    not an expert-reviewed tradition or a predictive result.
    """
    if not math.isfinite(moon):
        raise ValueError("moon longitude must be finite")
    position = _angle(moon)
    nakshatra_zero = min(26, int(position / NAKSHATRA_WIDTH))
    first = nakshatra_zero % 9
    fraction_remaining = 1.0 - (position - nakshatra_zero * NAKSHATRA_WIDTH) / NAKSHATRA_WIDTH
    return {
        "starting_lord": DASHA_ORDER[first],
        "balance_years_at_birth": round(fraction_remaining * DASHA_YEARS[first], 8),
        "periods": [
            {"lord": DASHA_ORDER[(first + offset) % 9], "years": DASHA_YEARS[(first + offset) % 9]}
            for offset in range(9)
        ],
        "full_cycle_years": sum(DASHA_YEARS),
        "year_to_days_conversion": None,
    }


def _ascendant(time: astronomy.Time, latitude: float, longitude: float) -> float:
    """True ecliptic-of-date/horizon intersection on the eastern horizon.

    Transform the local zenith into ecliptic coordinates. Its cross product
    with the ecliptic pole is on both the horizon and the ecliptic; select
    the antipode whose equatorial east component is positive.
    """
    phi = math.radians(latitude)
    theta = math.radians(_angle(15.0 * astronomy.SiderealTime(time) + longitude))
    zenith_eqd = astronomy.Vector(math.cos(phi) * math.cos(theta), math.cos(phi) * math.sin(theta), math.sin(phi), time)
    zenith_ect = astronomy.RotateVector(astronomy.Rotation_EQD_ECT(time), zenith_eqd)
    x, y = -zenith_ect.y, zenith_ect.x
    length = math.hypot(x, y)
    if length < 1e-12:
        raise ValueError("ascendant undefined at this geometry")
    candidate_ect = astronomy.Vector(x / length, y / length, 0.0, time)
    candidate_eqd = astronomy.RotateVector(astronomy.Rotation_ECT_EQD(time), candidate_ect)
    east_component = -math.sin(theta) * candidate_eqd.x + math.cos(theta) * candidate_eqd.y
    if east_component < 0:
        x, y = -x, -y
    return _angle(math.degrees(math.atan2(y, x)))


def calculate_chart(moment: datetime, latitude: float, longitude: float, ayanamsha_degrees: float, ayanamsha_id: str) -> dict:
    """Calculate a birth-instant chart from explicit, unambiguous inputs.

    No geocoder, timezone inference, node model, prediction, or AI is used.
    The caller is responsible for sourcing the numeric ayanamsha and UTC offset.
    """
    if moment.tzinfo is None or moment.utcoffset() is None:
        raise ValueError("birth time must include an explicit UTC offset")
    if not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
        raise ValueError("latitude/longitude out of range")
    if not all(math.isfinite(x) for x in (latitude, longitude, ayanamsha_degrees)):
        raise ValueError("coordinates and ayanamsha must be finite")
    if not (-40 <= ayanamsha_degrees <= 40) or not ayanamsha_id.strip():
        raise ValueError("supply a named ayanamsha and value within ±40 degrees")
    if not 1800 <= moment.year <= 2100:
        raise ValueError("supported birth year range is 1800–2100")

    utc = moment.astimezone(timezone.utc)
    time = astronomy.Time.Make(utc.year, utc.month, utc.day, utc.hour, utc.minute, utc.second + utc.microsecond / 1e6)
    positions: dict[str, dict] = {}
    raw_sidereal: dict[str, float] = {}
    for name in BODIES:
        vector = astronomy.GeoVector(getattr(astronomy.Body, name), time, True)
        tropical = _angle(astronomy.Ecliptic(vector).elon)
        sidereal = _angle(tropical - ayanamsha_degrees)
        raw_sidereal[name] = sidereal
        positions[name] = {
            "tropical_longitude": round(tropical, 8),
            "sidereal_longitude": round(sidereal, 8),
            "rashi_index": int(sidereal // 30) + 1,
        }
    asc_tropical = _ascendant(time, latitude, longitude)
    asc_sidereal = _angle(asc_tropical - ayanamsha_degrees)
    rising_sign = int(asc_sidereal // 30) + 1
    for body in positions.values():
        body["whole_sign_bhava"] = (body["rashi_index"] - rising_sign) % 12 + 1

    # Classify on full precision; rounded display values can cross a boundary.
    moon = raw_sidereal["Moon"]
    sun = raw_sidereal["Sun"]
    return {
        "engine_version": ENGINE_VERSION,
        "validation_status": "not_independently_benchmarked",
        "input": {
            "birth_datetime": moment.isoformat(),
            "utc_datetime": utc.isoformat(),
            "latitude_degrees_north": latitude,
            "longitude_degrees_east": longitude,
            "ayanamsha_id": ayanamsha_id,
            "ayanamsha_degrees": ayanamsha_degrees,
        },
        "conventions": {
            "ephemeris": "astronomy-engine 2.1.19, geocentric apparent, true ecliptic of date",
            "houses": "whole_sign_from_sidereal_ascendant",
            "panchanga": "birth_instant_indices; civil weekday is not sunrise-based vara",
            "dasha": "27_equal_nakshatras; period years only; no calendar dates",
        },
        "ascendant": {
            "tropical_longitude": round(asc_tropical, 8),
            "sidereal_longitude": round(asc_sidereal, 8),
            "rashi_index": rising_sign,
        },
        "positions": positions,
        "panchanga_at_birth": divisions(moon, sun, moment.weekday()),
        "vimshottari": vimshottari(moon),
        "unsupported": ["Rahu/Ketu positions", "divisional charts", "house cusps", "interpretations", "daily sunrise Panchanga"],
    }
