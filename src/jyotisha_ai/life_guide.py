"""Life Guide: a balance score (3 to 9 out of 10) for Love, Family, Marriage, Career, Wealth and Health, for one Moon sign,
for yesterday, today, tomorrow, this month and this year.

The scores are worked out from the planets' transits counted from the Moon sign (the same conventional Gochara table the
app's rule-based Rashiphal uses). Each life area has its traditional significators (Venus for love and marriage, Jupiter for
family, wealth and marriage, Saturn and the Sun for career, and so on); the more of them are in a favourable house, the
higher the score. Day tabs use every planet at 6 AM, 2 PM and 10 PM India time; the month tab uses the slower planets and the Sun at
four dates of the month; the year tab only Jupiter, Saturn, Rahu and Ketu at twelve dates. The lunar day (tithi) nudges the day tabs by one point (Nanda and Poorna up, Rikta down). The scores are a reflection
aid: no AI, no personal data, nothing stored.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from functools import lru_cache

import astronomy

from jyotisha_ai.ayanamsha import true_lahiri_for_utc
from jyotisha_ai.daily_rashiphal import GOCHARA_GOOD, IST, transits
from jyotisha_ai.sky_spans import angles_at, division_index

AREAS = ("love", "family", "marriage", "career", "wealth", "health")
# Planet -> weight, for each life area (traditional significators).
WEIGHTS = {
    "love": {"Venus": 3, "Moon": 2, "Mars": 1, "Jupiter": 1},
    "family": {"Moon": 3, "Jupiter": 2, "Mercury": 1, "Venus": 1},
    "marriage": {"Venus": 3, "Jupiter": 3, "Moon": 1, "Mars": 1},
    "career": {"Saturn": 3, "Sun": 2, "Mercury": 2, "Jupiter": 1, "Mars": 1, "Rahu": 1},
    "wealth": {"Jupiter": 3, "Venus": 2, "Mercury": 2, "Moon": 1, "Rahu": 1},
    "health": {"Sun": 2, "Mars": 2, "Moon": 2, "Saturn": 2, "Rahu": 1, "Ketu": 1},
}
FAST = {"Moon", "Mercury", "Venus"}          # left out of the month tab (they move through a sign in days)
SLOW = {"Jupiter", "Saturn", "Rahu", "Ketu"}  # the only planets of the year tab
LOW, HIGH = 3, 9


@lru_cache(maxsize=512)
def _where(day: date, hour: int = 6) -> dict:
    return dict(transits(day, hour))


def _day_samples(day: date) -> list[dict]:
    """Morning, afternoon and night: the Moon (which changes sign every ~2 days) counts for the part of the day it is there."""
    return [_where(day, hour) for hour in (6, 14, 22)]


@lru_cache(maxsize=512)
def tithi_of(day: date) -> int:
    """The lunar day (1..30) at noon India time."""
    moment = datetime(day.year, day.month, day.day, 12, 0, tzinfo=IST).astimezone(timezone.utc)
    ayanamsha, _ = true_lahiri_for_utc(moment)
    when = astronomy.Time.Make(moment.year, moment.month, moment.day, moment.hour, moment.minute, 0)
    return division_index("tithi", angles_at(when, ayanamsha)["tithi"]) + 1


def tithi_shift(tithi: int) -> int:
    """Classical tithi groups: Nanda (1, 6, 11) and Poorna (5, 10, 15) are favourable, Rikta (4, 9, 14) is not (the same in both fortnights)."""
    position = (tithi - 1) % 15 + 1
    if position in (4, 9, 14):
        return -1
    return 1 if position in (1, 6, 11, 5, 10, 15) else 0


def _favourable(planet: str, sign: int, rashi: int) -> bool:
    return (rashi - sign) % 12 + 1 in GOCHARA_GOOD[planet]


def _area(sign: int, area: str, samples: list[dict], allowed: set | None, skip: set) -> dict:
    """{'score': 3..9, 'support': [planets favourable in at least half of the samples, strongest first]}."""
    total, got, support = 0.0, 0.0, []
    for planet, weight in WEIGHTS[area].items():
        if planet in skip or (allowed is not None and planet not in allowed):
            continue
        share = sum(_favourable(planet, sign, where[planet]) for where in samples) / len(samples)
        total += weight
        got += weight * share
        if share >= 0.5:
            support.append((weight, planet))
    fraction = got / total if total else 0.5
    support.sort(key=lambda item: -item[0])
    return {"score": round(LOW + (HIGH - LOW) * fraction), "support": [planet for _, planet in support[:2]]}


def _period(sign: int, samples: list[dict], allowed: set | None = None, skip: set = frozenset(), shift: int = 0) -> dict:
    found = {area: _area(sign, area, samples, allowed, skip) for area in AREAS}
    for item in found.values():   # the lunar day nudges every area by a point, within 3..9
        item["score"] = max(LOW, min(HIGH, item["score"] + shift))
    return found


def guide(sign: int, today: date) -> dict:
    """All five tabs for one Moon sign (1..12), counted from ``today``."""
    month = [_where(date(today.year, today.month, day)) for day in (1, 8, 15, 22)]
    year = [_where(date(today.year, month_number, 1)) for month_number in range(1, 13)]
    return {
        "yesterday": _period(sign, _day_samples(today - timedelta(days=1)), shift=tithi_shift(tithi_of(today - timedelta(days=1)))),
        "today": _period(sign, _day_samples(today), shift=tithi_shift(tithi_of(today))),
        "tomorrow": _period(sign, _day_samples(today + timedelta(days=1)), shift=tithi_shift(tithi_of(today + timedelta(days=1)))),
        "month": _period(sign, month, skip=FAST),
        "year": _period(sign, year, allowed=SLOW),
    }


def status(payload: object) -> dict:
    """The endpoint: {'sign': 1..12, 'date': 'YYYY-MM-DD' (within two days of today)} -> {'reading': {tab: {area: {...}}}}."""
    if not isinstance(payload, dict):
        raise ValueError("JSON object required")
    sign, text = payload.get("sign"), payload.get("date")
    if not isinstance(sign, int) or isinstance(sign, bool) or not 1 <= sign <= 12:
        raise ValueError("sign must be 1 to 12")
    try:
        chosen = date.fromisoformat(text) if isinstance(text, str) else None
    except ValueError:
        chosen = None
    now = datetime.now(timezone.utc).date()
    if chosen is None or not now - timedelta(days=2) <= chosen <= now + timedelta(days=2):
        raise ValueError("date must be within two days of today")
    return {"status": "ok", "reading": guide(sign, chosen)}
