"""Short, conventional dosha checks for a calculated chart: Kuja (Manglik) dosha and Saturn's transit over the Moon sign.

These follow common textbook rules and are not expert-reviewed:
- Kuja dosha: Mars in house 1, 2, 4, 7, 8 or 12 counted from the Lagna and, separately, from the Moon (whole signs).
  Mars in its own sign or exaltation is reported as "reduced", a widely used exception; other exceptions are not applied.
- Sade Sati: transiting Saturn in the 12th, 1st or 2nd sign from the natal Moon sign (phases 1, 2, 3).
  Ashtama Shani: Saturn in the 8th sign from the Moon. Ardhashtama Shani: Saturn in the 4th sign from the Moon.
Saturn's sidereal sign is sampled every few days (geocentric apparent, mean Lahiri ayanamsha), so dates are approximate
to within a few days and are shown as month and year only.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from functools import lru_cache

import astronomy

from jyotisha_ai.ayanamsha import mean_lahiri_degrees

KUJA_HOUSES = (1, 2, 4, 7, 8, 12)
STEP_DAYS = 2
LOOK_BACK_YEARS = 12
LOOK_AHEAD_YEARS = 35
# Saturn often re-enters a sign after a retrograde loop; gaps shorter than this are part of the same period.
MERGE_GAP_DAYS = 400
# Sign offsets from the Moon sign (0 = same sign) for each Saturn period.
SADE_SATI_OFFSETS = {11: 1, 0: 2, 1: 3}
ASHTAMA_OFFSET = 7
ARDHASHTAMA_OFFSET = 3


def kuja_dosha(planets: dict) -> dict:
    """Mars house from the Lagna and from the Moon; ``planets`` is the ``planets`` map from ``kundli_details``."""
    mars, moon = planets["Mars"], planets["Moon"]
    from_lagna = int(mars["whole_sign_bhava"])
    from_moon = (int(mars["rashi_index"]) - int(moon["rashi_index"])) % 12 + 1
    lagna_hit, moon_hit = from_lagna in KUJA_HOUSES, from_moon in KUJA_HOUSES
    return {
        "present": lagna_hit or moon_hit,
        "from_lagna": lagna_hit,
        "from_moon": moon_hit,
        "house_from_lagna": from_lagna,
        "house_from_moon": from_moon,
        "reduced": (lagna_hit or moon_hit) and mars.get("dignity") in ("own", "exalted"),
    }


def _saturn_sign(day: date) -> int:
    """Sidereal sign (0 = Aries) of Saturn at 00:00 UTC on ``day``."""
    moment = astronomy.Time.Make(day.year, day.month, day.day, 0, 0, 0)
    tropical = astronomy.Ecliptic(astronomy.GeoVector(astronomy.Body.Saturn, moment, True)).elon
    return int(((tropical - mean_lahiri_degrees(moment.tt + 2451545.0)) % 360.0) // 30.0)


@lru_cache(maxsize=16)
def _saturn_signs(start: date, end: date) -> tuple[tuple[date, date, int], ...]:
    """Consecutive (first_day, last_day, sign) runs of Saturn's sign, sampled every STEP_DAYS."""
    runs: list[list] = []
    day = start
    while day <= end:
        sign = _saturn_sign(day)
        if runs and runs[-1][2] == sign:
            runs[-1][1] = day
        else:
            runs.append([day, day, sign])
        day += timedelta(days=STEP_DAYS)
    return tuple((first, last, sign) for first, last, sign in runs)


def _periods(runs: tuple, moon_sign: int, offsets: set[int]) -> list[dict]:
    periods: list[dict] = []
    for first, last, sign in runs:
        if (sign - moon_sign) % 12 not in offsets:
            continue
        if periods and (first - periods[-1]["end"]).days <= MERGE_GAP_DAYS:
            periods[-1]["end"] = last
        else:
            periods.append({"start": first, "end": last})
    return periods


def _status(periods: list[dict], as_of: date, window: tuple[date, date]) -> dict:
    current = next((p for p in periods if p["start"] <= as_of <= p["end"]), None)
    upcoming = next((p for p in periods if p["start"] > as_of), None)

    def span(period: dict | None) -> dict | None:
        if period is None:
            return None
        # A period touching the edge of the scanned window may extend beyond it; say so rather than invent a date.
        return {"start": period["start"].isoformat()[:7] if period["start"] > window[0] else None,
                "end": period["end"].isoformat()[:7] if period["end"] < window[1] else None}

    return {"active": current is not None, "current": span(current), "next": span(upcoming)}


def saturn_transits(moon_rashi_index: int, as_of: date) -> dict:
    """Sade Sati, Ashtama and Ardhashtama Shani status for a Moon sign (``moon_rashi_index`` is 1..12)."""
    if not 1 <= moon_rashi_index <= 12:
        raise ValueError("moon_rashi_index must be 1..12")
    window = (date(as_of.year - LOOK_BACK_YEARS, 1, 1), date(min(as_of.year + LOOK_AHEAD_YEARS, 2099), 12, 31))
    runs = _saturn_signs(*window)
    moon = moon_rashi_index - 1
    now_sign = _saturn_sign(as_of)
    offset = (now_sign - moon) % 12
    sade_sati = _status(_periods(runs, moon, set(SADE_SATI_OFFSETS)), as_of, window)
    sade_sati["phase"] = SADE_SATI_OFFSETS.get(offset) if sade_sati["active"] else None
    return {
        "as_of": as_of.isoformat(),
        "saturn_rashi_index": now_sign + 1,
        "saturn_house_from_moon": offset + 1,
        "sade_sati": sade_sati,
        "ashtama_shani": _status(_periods(runs, moon, {ASHTAMA_OFFSET}), as_of, window),
        "ardhashtama_shani": _status(_periods(runs, moon, {ARDHASHTAMA_OFFSET}), as_of, window),
    }


def chart_doshas(planets: dict, as_of: date | None = None) -> dict:
    """Both checks for one chart, as returned in the Kundli details."""
    today = as_of or datetime.now(timezone.utc).date()
    return {
        "kuja": kuja_dosha(planets),
        "saturn": saturn_transits(int(planets["Moon"]["rashi_index"]), today),
        "conventions": "Kuja: houses 1,2,4,7,8,12 from Lagna and Moon; Sade Sati: Saturn in 12th/1st/2nd from Moon sign; dates approximate (month)",
    }
