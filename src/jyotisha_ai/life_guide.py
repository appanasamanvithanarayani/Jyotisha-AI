"""Life Guide: a balance score (3 to 9 out of 10) for Love, Family, Marriage, Career, Wealth and Health, for one Moon sign,
for yesterday, today, tomorrow, this month and this year.

The scores are worked out from the planets' transits counted from the Moon sign (the same conventional Gochara table the
app's rule-based Rashiphal uses). Each life area has its traditional significators (Venus for love and marriage, Jupiter for
family, wealth and marriage, Saturn and the Sun for career, and so on); the more of them are in a favourable house, the
higher the score. Day tabs use every planet at 6 AM, 2 PM and 10 PM India time; the month tab uses the slower planets and the Sun at
four dates of the month; the year tab only Jupiter, Saturn, Rahu and Ketu at twelve dates. The lunar day (tithi) nudges the day tabs by one point (Nanda and Poorna up, Rikta down). The scores are a reflection
aid: no AI, nothing stored.

With the user's own chart, three personal factors are added (only numbers from the chart are sent, never the birth details):
Tarabalam (today's Moon star counted from the birth star: Sampat, Kshema, Sadhana, Mitra and Parama Mitra lift the day, Vipat,
Pratyak and Naidhana lower it), and the running Mahadasha and Antardasha lords (a lord that signifies the area and sits in a
good house of the birth chart lifts it, one in the 6th, 8th or 12th lowers it). So two people with the same Moon sign get
different numbers, and the numbers change with the user's own star every day.
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
PLANETS = ("Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn", "Rahu", "Ketu")
GOOD_HOUSES = (1, 2, 4, 5, 7, 9, 10, 11)   # natal houses where a planet is comfortable
DUSTHANA = (6, 8, 12)
GOOD_TARAS, BAD_TARAS = (2, 4, 6, 8, 9), (3, 5, 7)   # 1 Janma is neutral


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


@lru_cache(maxsize=512)
def _star_at(day: date, hour: int) -> int:
    """The Moon's Nakshatra (1..27) at ``hour`` India time."""
    moment = datetime(day.year, day.month, day.day, hour, 0, tzinfo=IST).astimezone(timezone.utc)
    ayanamsha, _ = true_lahiri_for_utc(moment)
    when = astronomy.Time.Make(moment.year, moment.month, moment.day, moment.hour, moment.minute, 0)
    return division_index("nakshatra", angles_at(when, ayanamsha)["nakshatra"]) + 1


def tara_of(birth_star: int, star: int) -> int:
    """Tara 1..9 of today's star counted from the birth star (1 Janma, 2 Sampat, 3 Vipat, 4 Kshema, 5 Pratyak, 6 Sadhana, 7 Naidhana, 8 Mitra, 9 Parama Mitra)."""
    return (star - birth_star) % 9 + 1


def tara_shift(tara: int) -> int:
    return 1 if tara in GOOD_TARAS else -1 if tara in BAD_TARAS else 0


def _tara_day(birth_star: int, day: date) -> float:
    """The average Tarabalam shift over the day (the Moon changes star within a day)."""
    shifts = [tara_shift(tara_of(birth_star, _star_at(day, hour))) for hour in (6, 14, 22)]
    return sum(shifts) / len(shifts)


def dasha_shift(area: str, dasha: list, limit: int) -> int:
    """+1 for each running dasha lord that signifies the area and sits in a good natal house, -1 for one in the 6th, 8th or 12th."""
    total = 0
    for item in dasha:
        if item["lord"] in WEIGHTS[area]:
            total += 1 if item["house"] in GOOD_HOUSES else -1 if item["house"] in DUSTHANA else 0
    return max(-limit, min(limit, total))


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


def _period(sign: int, samples: list[dict], allowed: set | None = None, skip: set = frozenset(), shift: int = 0, areas: dict | None = None) -> dict:
    found = {area: _area(sign, area, samples, allowed, skip) for area in AREAS}
    for area, item in found.items():   # the lunar day (and, with a chart, Tarabalam and the dasha) nudge the score, within 3..9
        item["score"] = max(LOW, min(HIGH, item["score"] + shift + (areas[area] if areas else 0)))
    return found


def guide(sign: int, today: date, personal: dict | None = None) -> dict:
    """All five tabs for one Moon sign (1..12), counted from ``today``.

    ``personal`` (optional): {'nakshatra': birth star 1..27, 'dasha': [{'lord': planet, 'house': natal house 1..12}, ...]}.
    """
    month = [_where(date(today.year, today.month, day)) for day in (1, 8, 15, 22)]
    year = [_where(date(today.year, month_number, 1)) for month_number in range(1, 13)]

    def day_tab(day: date) -> dict:
        shift = tithi_shift(tithi_of(day))
        areas = None
        if personal:
            shift += round(_tara_day(personal["nakshatra"], day))
            areas = {area: dasha_shift(area, personal["dasha"], 1) for area in AREAS}
        return _period(sign, _day_samples(day), shift=shift, areas=areas)

    long_areas = {area: dasha_shift(area, personal["dasha"], 2) for area in AREAS} if personal else None
    return {
        "yesterday": day_tab(today - timedelta(days=1)),
        "today": day_tab(today),
        "tomorrow": day_tab(today + timedelta(days=1)),
        "month": _period(sign, month, skip=FAST, areas=long_areas),
        "year": _period(sign, year, allowed=SLOW, areas=long_areas),
    }


def _personal(raw: object) -> dict | None:
    """Check the optional chart numbers; ValueError when they are malformed."""
    if raw is None:
        return None
    if not isinstance(raw, dict):
        raise ValueError("personal must be an object")
    star, dasha = raw.get("nakshatra"), raw.get("dasha")
    if not isinstance(star, int) or isinstance(star, bool) or not 1 <= star <= 27:
        raise ValueError("nakshatra must be 1 to 27")
    if not isinstance(dasha, list) or len(dasha) > 2:
        raise ValueError("dasha must be a list of at most two lords")
    clean = []
    for item in dasha:
        if not isinstance(item, dict) or item.get("lord") not in PLANETS:
            raise ValueError("a dasha lord must be a planet name")
        house = item.get("house")
        if not isinstance(house, int) or isinstance(house, bool) or not 1 <= house <= 12:
            raise ValueError("a dasha lord's house must be 1 to 12")
        clean.append({"lord": item["lord"], "house": house})
    return {"nakshatra": star, "dasha": clean}


def status(payload: object) -> dict:
    """The endpoint: {'sign': 1..12, 'date': 'YYYY-MM-DD' (within two days of today), 'personal': optional chart numbers}
    -> {'reading': {tab: {area: {...}}}, 'personal': {'tara': 1..9, 'shift': -1..1} when a chart was sent}."""
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
    personal = _personal(payload.get("personal"))
    result = {"status": "ok", "reading": guide(sign, chosen, personal)}
    if personal:   # today's Tara, for the line "Your star today: Sampat (good)"
        tara = tara_of(personal["nakshatra"], _star_at(chosen, 14))
        result["personal"] = {"tara": tara, "shift": tara_shift(tara)}
    return result
