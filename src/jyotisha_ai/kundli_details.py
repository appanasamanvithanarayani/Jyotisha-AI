"""Extra Kundli details derived from a calculated chart: nodes, Navamsa, Nakshatra
details, dignity, retrograde status, birth-moment Panchang spans and Vimshottari dates.

Conventions chosen here (not expert-reviewed):
- Rahu/Ketu use the *mean* lunar node (Meeus polynomial), not the true node.
- Navamsa: each sign is split into nine parts of 3°20′; Fire signs start from
  Aries, Earth from Capricorn, Air from Libra and Water from Cancer.
- Dignity uses the traditional exaltation, debilitation and own-sign tables.
- Vimshottari years are converted at 365.25 days; the dates are approximate.
"""

from __future__ import annotations

import math
from datetime import date, datetime, timedelta, timezone

import astronomy

from jyotisha_ai.chart import DASHA_ORDER, DASHA_YEARS, NAKSHATRA_WIDTH
from jyotisha_ai.sky_spans import SpanFinder

NODE_MODEL = "mean_node_meeus"
DAYS_PER_DASHA_YEAR = 365.25
SIGN_LORDS = ("Mars", "Venus", "Mercury", "Moon", "Sun", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Saturn", "Jupiter")
EXALTATION_SIGN = {"Sun": 1, "Moon": 2, "Mars": 10, "Mercury": 6, "Jupiter": 4, "Venus": 12, "Saturn": 7}
OWN_SIGNS = {"Sun": (5,), "Moon": (4,), "Mars": (1, 8), "Mercury": (3, 6), "Jupiter": (9, 12), "Venus": (2, 7), "Saturn": (10, 11)}
RETROGRADE_CAPABLE = ("Mars", "Mercury", "Jupiter", "Venus", "Saturn")


def _angle(value: float) -> float:
    return value % 360.0


def mean_node_longitude(tt_days_since_j2000: float) -> float:
    """Tropical longitude of the mean ascending lunar node, degrees (Meeus, Astronomical Algorithms ch. 47)."""
    t = tt_days_since_j2000 / 36525.0
    return _angle(125.0445479 - 1934.1362891 * t + 0.0020754 * t * t + t ** 3 / 467441.0 - t ** 4 / 60616000.0)


def navamsa_sign(sidereal_longitude: float) -> int:
    """One-based Navamsa sign for a sidereal longitude."""
    longitude = _angle(sidereal_longitude)
    sign_zero = int(longitude // 30.0)
    part = min(8, int((longitude % 30.0) / (30.0 / 9.0)))
    start_zero = {0: 0, 1: 9, 2: 6, 3: 3}[sign_zero % 4]  # Fire, Earth, Air, Water -> Aries, Capricorn, Libra, Cancer
    return (start_zero + part) % 12 + 1


def dignity(body: str, rashi_index: int) -> str | None:
    if body not in EXALTATION_SIGN:
        return None
    if rashi_index == EXALTATION_SIGN[body]:
        return "exalted"
    if rashi_index == (EXALTATION_SIGN[body] + 5) % 12 + 1:
        return "debilitated"
    if rashi_index in OWN_SIGNS[body]:
        return "own"
    return None


def _nakshatra(sidereal: float) -> dict:
    position = _angle(sidereal)
    zero = min(26, int(position / NAKSHATRA_WIDTH))
    pada = min(4, int((position - zero * NAKSHATRA_WIDTH) / (NAKSHATRA_WIDTH / 4.0)) + 1)
    return {"nakshatra_index": zero + 1, "nakshatra_pada": pada, "nakshatra_lord": DASHA_ORDER[zero % 9]}


def _is_retrograde(body: astronomy.Body, moment: astronomy.Time) -> bool:
    def longitude(offset: float) -> float:
        return astronomy.Ecliptic(astronomy.GeoVector(body, moment.AddDays(offset), True)).elon
    delta = (longitude(0.5) - longitude(-0.5) + 540.0) % 360.0 - 180.0
    return delta < 0.0


def _astro_time(moment: datetime) -> astronomy.Time:
    utc = moment.astimezone(timezone.utc)
    return astronomy.Time.Make(utc.year, utc.month, utc.day, utc.hour, utc.minute, utc.second + utc.microsecond / 1e6)


def _row(sidereal: float, lagna_rashi: int) -> dict:
    rashi = int(_angle(sidereal) // 30.0) + 1
    return {
        "sidereal_longitude": round(_angle(sidereal), 8),
        "rashi_index": rashi,
        "degree_in_sign": round(_angle(sidereal) % 30.0, 6),
        "whole_sign_bhava": (rashi - lagna_rashi) % 12 + 1,
        "sign_lord": SIGN_LORDS[rashi - 1],
        "navamsa_rashi_index": navamsa_sign(sidereal),
        **_nakshatra(sidereal),
    }


def _birth_spans(moment: datetime, ayanamsha: float, zone_moment: datetime) -> dict:
    finder = SpanFinder(_astro_time(moment), ayanamsha)
    origin = zone_moment

    def local(offset: float | None) -> str | None:
        if offset is None:
            return None
        rounded = origin + timedelta(days=offset, seconds=30)
        return rounded.replace(second=0, microsecond=0, tzinfo=None).isoformat(timespec="minutes")

    result = {}
    for key, name in (("tithi", "tithi"), ("nakshatra", "nakshatra"), ("yoga", "yoga"), ("karana", "karana")):
        row = finder.spans(name, 0.0, 0.0)[0]
        result[key] = {"index": row["index"], "starts_at": local(row["start"]), "ends_at": local(row["end"])}
    return result


def _dasha(chart: dict, moment: datetime, as_of: date) -> dict:
    vim = chart["vimshottari"]
    periods = vim["periods"]
    balance = float(vim["balance_years_at_birth"])
    first_years = periods[0]["years"]
    nominal_start = moment - timedelta(days=(first_years - balance) * DAYS_PER_DASHA_YEAR)
    rows = []
    cursor = nominal_start
    for index, period in enumerate(periods):
        end = cursor + timedelta(days=period["years"] * DAYS_PER_DASHA_YEAR)
        rows.append({"lord": period["lord"], "years": period["years"],
                     "start": (moment if index == 0 else cursor).date().isoformat(), "end": end.date().isoformat(),
                     "_nominal_start": cursor, "_end": end})
        cursor = end
    as_of_moment = datetime.combine(as_of, datetime.min.time(), tzinfo=moment.tzinfo)
    current = next((row for row in rows if as_of_moment < row["_end"]), None)
    antardasha = []
    if current is not None:
        mahadasha_years = current["years"]
        order = DASHA_ORDER.index(current["lord"])
        point = current["_nominal_start"]
        for step in range(9):
            lord_index = (order + step) % 9
            length = mahadasha_years * DASHA_YEARS[lord_index] / 120.0
            end = point + timedelta(days=length * DAYS_PER_DASHA_YEAR)
            if end > moment:
                antardasha.append({"lord": DASHA_ORDER[lord_index], "start": max(point, moment).date().isoformat(), "end": end.date().isoformat(),
                                   "current": point <= as_of_moment < end})
            point = end
    cleaned = [{key: value for key, value in row.items() if not key.startswith("_")} for row in rows]
    for row, source in zip(cleaned, rows):
        row["current"] = source is current
    return {
        "convention": "365.25-day years; approximate calendar dates",
        "as_of": as_of.isoformat(),
        "mahadasha": cleaned,
        "current_mahadasha": current["lord"] if current else None,
        "antardasha": antardasha,
    }


def kundli_details(chart: dict, moment: datetime, as_of: date | None = None) -> dict:
    """Derived, display-oriented details for a chart from ``calculate_chart``."""
    if moment.tzinfo is None:
        raise ValueError("birth moment must be timezone-aware")
    ayanamsha = float(chart["input"]["ayanamsha_degrees"])
    lagna_rashi = chart["ascendant"]["rashi_index"]
    astro_time = _astro_time(moment)

    planets = {}
    for name, position in chart["positions"].items():
        row = _row(position["sidereal_longitude"], lagna_rashi)
        row["dignity"] = dignity(name, row["rashi_index"])
        row["retrograde"] = _is_retrograde(getattr(astronomy.Body, name), astro_time) if name in RETROGRADE_CAPABLE else False
        planets[name] = row

    rahu_sidereal = _angle(mean_node_longitude(astro_time.tt) - ayanamsha)
    planets["Rahu"] = {**_row(rahu_sidereal, lagna_rashi), "dignity": None, "retrograde": True}
    planets["Ketu"] = {**_row(rahu_sidereal + 180.0, lagna_rashi), "dignity": None, "retrograde": True}

    lagna = _row(chart["ascendant"]["sidereal_longitude"], lagna_rashi)
    navamsa_lagna = lagna["navamsa_rashi_index"]
    return {
        "node_model": NODE_MODEL,
        "lagna": lagna,
        "planets": planets,
        "navamsa": {
            "lagna_rashi_index": navamsa_lagna,
            "positions": {name: row["navamsa_rashi_index"] for name, row in planets.items()},
        },
        "birth_panchang": _birth_spans(moment, ayanamsha, moment),
        "dasha": _dasha(chart, moment, as_of or datetime.now(timezone.utc).astimezone(moment.tzinfo).date()),
        "conventions": "mean lunar node; Navamsa by element start; traditional dignity table; Vimshottari at 365.25-day years",
    }
