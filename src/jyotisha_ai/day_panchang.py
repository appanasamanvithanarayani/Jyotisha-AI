"""Sunrise-based daily Panchang arithmetic for one civil date and one catalog city.

Rise/set times and the Sun/Moon longitudes come from Astronomy Engine; the
sidereal offset is the project's true-Lahiri value at local sunrise. Limb and
refraction conventions are the engine defaults (upper limb, standard
refraction, observer at sea level). The Panchang day runs from local sunrise
to the next local sunrise; every Tithi, Nakshatra, Yoga, Karana and Moon-sign
division is reported with its true start and end time, even when that end falls
after the next sunrise.

Muhurta windows, Chandrabalam, Tarabalam and Varjyam use conventional rules
(eighth/fifteenth-of-day divisions, the 1/3/6/7/10/11 Moon rule, the nine-fold
Tara cycle and the traditional per-Nakshatra Varjyam table). They are not
expert-reviewed; the Varjyam table was checked against one published sample only.
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path

import astronomy

from jyotisha_ai.ayanamsha import TRUE_METHOD_ID, true_lahiri_for_utc
from jyotisha_ai.birth_resolution import BirthResolutionError, _approved_catalog, _matching_places, _pinned_zone
from jyotisha_ai.chart_validation import validate_local_chart_runtime
from jyotisha_ai.sky_spans import QUANTITIES, SpanFinder, _sidereal
from jyotisha_ai.festivals import lunar_days

# One-based eighth of the daytime, indexed by Python weekday (Monday=0).
RAHU_PART = (2, 7, 5, 6, 4, 3, 8)
YAMAGANDA_PART = (4, 3, 2, 1, 7, 6, 5)
GULIKA_PART = (6, 5, 4, 3, 2, 1, 7)
# Ghati (of 60 across the Nakshatra's own duration) at which Varjyam begins; it lasts 4 ghatis.
VARJYAM_START_GHATI = (50, 24, 30, 40, 14, 21, 30, 20, 32, 30, 20, 18, 21, 20, 14, 14, 10, 14, 20, 24, 20, 10, 10, 18, 16, 24, 30)
VARJYAM_LENGTH_GHATI = 4
# Mula traditionally has a second Varjyam, starting at the 56th ghati.
VARJYAM_EXTRA_GHATI = {19: 56}
# Ghati at which Amrita kalam begins in each Nakshatra (traditional table); it also lasts 4 ghatis.
AMRITA_START_GHATI = (42, 48, 54, 52, 38, 35, 54, 44, 56, 54, 44, 42, 45, 44, 38, 38, 34, 38, 44, 48, 44, 34, 34, 42, 40, 48, 54)
# Durmuhurtam: which of the 15 day muhurtas (and night muhurtas, from sunset), by Python weekday (Monday=0).
DURMUHURTA_DAY = ((9, 12), (4,), (8,), (6, 12), (4, 9), (1, 2), (14,))
DURMUHURTA_NIGHT = ((), (7,), (), (), (), (), ())
# Simple event muhurtas (conventional rules; no Lagna, Venus/Jupiter combustion or personal checks).
AVOID_TITHIS = frozenset({1, 4, 8, 9, 14, 19, 23, 24, 29, 30})   # Shukla Pratipada, Rikta tithis, Ashtamis, Amavasya
GOOD_WEEKDAYS = frozenset({0, 2, 3, 4})                           # Monday, Wednesday, Thursday, Friday
EVENT_RULES = {
    "marriage": {"nakshatras": {4, 5, 10, 12, 13, 15, 17, 19, 21, 26, 27}, "months": {2, 3, 8, 9, 11, 12}},
    "gruhapravesam": {"nakshatras": {4, 5, 12, 14, 17, 21, 23, 24, 26, 27}, "months": {2, 3, 8, 9, 11, 12}},
    "vehicle": {"nakshatras": {1, 4, 5, 7, 8, 13, 14, 15, 17, 22, 23, 24, 27}, "months": set(range(1, 13))},
}
MIN_EVENT_MINUTES = 30
GOOD_MOON_POSITIONS = (1, 3, 6, 7, 10, 11)
ASHTAMA_MOON_POSITION = 8
GOOD_TARAS = (2, 4, 6, 8, 9)


_EVENT_CACHE: dict[tuple, list | None] = {}


class DayPanchangError(ValueError):
    """The day cannot be calculated; no substitute values are supplied."""


def good_chandrabalam_rashis(moon_rashi: int) -> list[int]:
    """Rashis (1..12) for which the Moon stands in the 1st/3rd/6th/7th/10th/11th from them."""
    return [rashi for rashi in range(1, 13) if (moon_rashi - rashi) % 12 + 1 in GOOD_MOON_POSITIONS]


def ashtama_chandra_rashi(moon_rashi: int) -> int:
    """The rashi from which the Moon stands 8th."""
    return (moon_rashi - (ASHTAMA_MOON_POSITION - 1) - 1) % 12 + 1


def tara_number(current_nakshatra: int, birth_nakshatra: int) -> int:
    """Tara 1..9 counted from the birth Nakshatra to the current one."""
    return ((current_nakshatra - birth_nakshatra) % 27) % 9 + 1


def good_tarabalam_nakshatras(current_nakshatra: int) -> list[int]:
    return [n for n in range(1, 28) if tara_number(current_nakshatra, n) in GOOD_TARAS]


def _astro_time(moment: datetime) -> astronomy.Time:
    utc = moment.astimezone(timezone.utc)
    return astronomy.Time.Make(utc.year, utc.month, utc.day, utc.hour, utc.minute,
                               utc.second + utc.microsecond / 1e6)


def _to_utc(moment: astronomy.Time) -> datetime:
    return moment.Utc().replace(tzinfo=timezone.utc)


def day_panchang(root: Path, iso_date: str, place_query: str) -> dict:
    try:
        selected = date.fromisoformat(iso_date)
    except ValueError as exc:
        raise ValueError("date must be YYYY-MM-DD") from exc
    if not 1970 <= selected.year <= 2100:
        raise ValueError("date must be within 1970..2100")
    if not isinstance(place_query, str) or not 2 <= len(place_query.strip()) <= 200 or any(ord(c) < 32 for c in place_query):
        raise ValueError("place must be a city name without control characters")

    try:
        catalog = _approved_catalog(root)
        place = _matching_places(catalog, place_query)[0]
        zone = _pinned_zone(place["timezone"])
        validate_local_chart_runtime()
        observer = astronomy.Observer(place["latitude"], place["longitude"], 0.0)

        def midnight(day: date) -> astronomy.Time:
            return _astro_time(datetime.combine(day, time(0, 0), tzinfo=zone))

        rise = astronomy.Direction.Rise
        sset = astronomy.Direction.Set
        sunrise = astronomy.SearchRiseSet(astronomy.Body.Sun, observer, rise, midnight(selected), 1.0)
        sunset = astronomy.SearchRiseSet(astronomy.Body.Sun, observer, sset, midnight(selected), 1.0)
        next_sunrise = astronomy.SearchRiseSet(astronomy.Body.Sun, observer, rise, midnight(selected + timedelta(days=1)), 1.0)
        previous_sunset = astronomy.SearchRiseSet(astronomy.Body.Sun, observer, sset, midnight(selected - timedelta(days=1)), 1.0)
        if None in (sunrise, sunset, next_sunrise, previous_sunset) or not sunrise.ut < sunset.ut < next_sunrise.ut:
            raise DayPanchangError("the Sun does not rise and set on this date at this place")
        moonrise = astronomy.SearchRiseSet(astronomy.Body.Moon, observer, rise, midnight(selected), 1.0)
        moonset = astronomy.SearchRiseSet(astronomy.Body.Moon, observer, sset, midnight(selected), 1.0)

        ayanamsha, _ = true_lahiri_for_utc(_to_utc(sunrise))
        span = next_sunrise.ut - sunrise.ut
        day_length = sunset.ut - sunrise.ut
        night_length = next_sunrise.ut - sunset.ut
        previous_night = sunrise.ut - previous_sunset.ut
    except (BirthResolutionError, ValueError, DayPanchangError) as exc:
        raise DayPanchangError(str(exc)) from exc

    def local(offset_days: float | None) -> str | None:
        if offset_days is None:
            return None
        rounded = _to_utc(sunrise.AddDays(offset_days)) + timedelta(seconds=30)
        return rounded.astimezone(zone).replace(second=0, microsecond=0, tzinfo=None).isoformat(timespec="minutes")

    def local_time(moment: astronomy.Time | None) -> str | None:
        return None if moment is None else local(moment.ut - sunrise.ut)

    finder = SpanFinder(sunrise, ayanamsha)
    rows: dict[str, list[dict]] = {}
    for name in QUANTITIES:
        rows[name] = finder.spans(name, 0.0, span)

    def with_times(name: str, extra=None) -> list[dict]:
        result = []
        for row in rows[name]:
            item = {"index": row["index"], "starts_at": local(row["start"]), "ends_at": local(row["end"])}
            if extra:
                item.update(extra(row))
            result.append(item)
        return result

    # Varjyam and Amrita kalam: fixed fractions (in ghatis of 60) of each Nakshatra's own duration.
    def ghati_windows(start_ghatis) -> list[dict]:
        found = []
        for row in rows["nakshatra"]:
            if row["start"] is None or row["end"] is None:
                continue
            duration = row["end"] - row["start"]
            for ghati in start_ghatis(row["index"]):
                begins = row["start"] + ghati / 60.0 * duration
                ends = begins + VARJYAM_LENGTH_GHATI / 60.0 * duration
                if ends > 0 and begins < span:
                    found.append({"nakshatra_index": row["index"], "starts_at": local(begins), "ends_at": local(ends), "_span": (begins, ends)})
        return found

    varjyam = ghati_windows(lambda n: (VARJYAM_START_GHATI[n - 1], *([VARJYAM_EXTRA_GHATI[n]] if n in VARJYAM_EXTRA_GHATI else [])))
    amrita = ghati_windows(lambda n: (AMRITA_START_GHATI[n - 1],))

    sun_longitude = _sidereal(astronomy.Body.Sun, sunrise, ayanamsha)
    planet_signs = _planet_signs(sunrise, ayanamsha)
    weekday = selected.weekday()
    eighth, fifteenth, night_fifteenth = day_length / 8.0, day_length / 15.0, night_length / 15.0

    def window(begin: float, end: float) -> list[str]:
        return [local(begin), local(end)]

    durmuhurtam_spans = [((part - 1) * fifteenth, part * fifteenth) for part in DURMUHURTA_DAY[weekday]]
    durmuhurtam_spans += [(day_length + (part - 1) * night_fifteenth, day_length + part * night_fifteenth) for part in DURMUHURTA_NIGHT[weekday]]
    try:
        lunar = lunar_days(observer, zone, selected, selected).get(selected)
    except (ValueError, ArithmeticError):
        lunar = None
    lunar_month = lunar["lunar_month"] if lunar else None
    adhika = bool(lunar and lunar["adhika"])

    def event_muhurtas() -> dict:
        """Daytime windows that pass simple conventional checks for each event, avoiding the inauspicious periods."""
        if lunar_month is None or adhika:
            return {name: [] for name in EVENT_RULES}
        bad = [((RAHU_PART[weekday] - 1) * eighth, RAHU_PART[weekday] * eighth),
               ((YAMAGANDA_PART[weekday] - 1) * eighth, YAMAGANDA_PART[weekday] * eighth),
               ((GULIKA_PART[weekday] - 1) * eighth, GULIKA_PART[weekday] * eighth), *durmuhurtam_spans,
               *(item["_span"] for item in varjyam)]

        def segments(name: str, allowed) -> list[tuple[float, float]]:
            return [(row["start"] if row["start"] is not None else -1.0, row["end"] if row["end"] is not None else span + 1.0)
                    for row in rows[name] if allowed(row["index"])]

        result = {}
        for event, rule in EVENT_RULES.items():
            if weekday not in GOOD_WEEKDAYS or lunar_month not in rule["months"]:
                result[event] = []
                continue
            windows = []
            for t_start, t_end in segments("tithi", lambda index: index not in AVOID_TITHIS and
                                           # Chaturmasa (Ashadha Shukla Ekadashi to Kartika Shukla Ekadashi): no weddings or housewarmings
                                           not (event != "vehicle" and lunar_month == 8 and index <= 11)):
                for n_start, n_end in segments("nakshatra", lambda index: index in rule["nakshatras"]):
                    begin, end = max(0.0, t_start, n_start), min(day_length, t_end, n_end)
                    pieces = [(begin, end)] if end > begin else []
                    for b_start, b_end in bad:   # cut out the inauspicious periods
                        pieces = [part for p_start, p_end in pieces for part in
                                  ((p_start, min(p_end, b_start)), (max(p_start, b_end), p_end)) if part[1] > part[0]]
                    windows += [window(a, b) for a, b in pieces if (b - a) * 1440.0 >= MIN_EVENT_MINUTES]
            result[event] = sorted(windows)
        return result

    timings = {
        "brahma_muhurta": window(-2 * previous_night / 15.0, -previous_night / 15.0),
        "pratah_sandhya": window(-previous_night / 10.0, 0.0),
        "abhijit": window(7 * fifteenth, 8 * fifteenth),
        "vijaya_muhurta": window(10 * fifteenth, 11 * fifteenth),
        "sayahna_sandhya": window(day_length, day_length + night_length / 10.0),
        "nishita_muhurta": window(day_length + 7 * night_fifteenth, day_length + 8 * night_fifteenth),
        "rahu_kalam": window((RAHU_PART[weekday] - 1) * eighth, RAHU_PART[weekday] * eighth),
        "yamaganda": window((YAMAGANDA_PART[weekday] - 1) * eighth, YAMAGANDA_PART[weekday] * eighth),
        "gulika_kalam": window((GULIKA_PART[weekday] - 1) * eighth, GULIKA_PART[weekday] * eighth),
    }
    return {
        "status": "experimental_sunrise_day",
        "date": selected.isoformat(),
        "place": place["name"],
        "country_code": place["country_code"],
        "timezone": place["timezone"],
        "today_local_date": datetime.now(timezone.utc).astimezone(zone).date().isoformat(),
        "weekday_index_sunday_first": (weekday + 1) % 7 + 1,
        "sunrise": local_time(sunrise),
        "sunset": local_time(sunset),
        "next_sunrise": local_time(next_sunrise),
        "moonrise": local_time(moonrise),
        "moonset": local_time(moonset),
        "madhyahna": local(day_length / 2.0),
        "dinamana_minutes": round(day_length * 1440.0),
        "ratrimana_minutes": round(night_length * 1440.0),
        "paksha": "shukla" if rows["tithi"][0]["index"] <= 15 else "krishna",
        "sun_rashi_index": int(sun_longitude // 30.0) + 1,
        "planet_rashis": planet_signs,
        "tithi": with_times("tithi"),
        "karana_half_tithi": with_times("karana"),
        "nakshatra": with_times("nakshatra", lambda row: {"good_tara_nakshatras": good_tarabalam_nakshatras(row["index"])}),
        "yoga": with_times("yoga"),
        "moon_rashi": with_times("moon_rashi", lambda row: {
            "good_chandrabalam_rashis": good_chandrabalam_rashis(row["index"]),
            "ashtama_chandra_rashi": ashtama_chandra_rashi(row["index"]),
        }),
        "varjyam": [{key: value for key, value in item.items() if key != "_span"} for item in varjyam],
        "amrita_kalam": [{key: value for key, value in item.items() if key != "_span"} for item in amrita],
        "durmuhurtam": [window(a, b) for a, b in durmuhurtam_spans],
        "lunar_month": lunar_month,
        "adhika_month": adhika,
        "samvatsara_index": lunar["samvatsara_index"] if lunar else None,
        "event_muhurtas": event_muhurtas(),
        "timings": timings,
        "method": f"astronomy-engine 2.1.19; {TRUE_METHOD_ID} at sunrise; approved GeoNames and pinned IANA tzdata",
        "message": ("Experimental sunrise-to-sunrise Panchang with each element's true start and end time. Rise/set use "
                    "upper-limb standard refraction at sea level; muhurta, Chandrabalam, Tarabalam and Varjyam use "
                    "conventional rules, not reviewed ones. No lunar month, festival, or prediction is calculated."),
    }


def _planet_signs(moment: astronomy.Time, ayanamsha: float) -> dict[str, int]:
    """Sidereal sign (1..12) of each transiting planet at ``moment``; Rahu is the mean node and Ketu is opposite."""
    from jyotisha_ai.kundli_details import mean_node_longitude

    signs = {name: int(_sidereal(body, moment, ayanamsha) // 30.0) + 1 for name, body in (
        ("Sun", astronomy.Body.Sun), ("Mars", astronomy.Body.Mars), ("Mercury", astronomy.Body.Mercury),
        ("Jupiter", astronomy.Body.Jupiter), ("Venus", astronomy.Body.Venus), ("Saturn", astronomy.Body.Saturn))}
    rahu = (mean_node_longitude(moment.tt) - ayanamsha) % 360.0
    signs["Rahu"] = int(rahu // 30.0) + 1
    signs["Ketu"] = int(((rahu + 180.0) % 360.0) // 30.0) + 1
    return signs


def month_calendar(root: Path, year: int, month: int, place_query: str) -> dict:
    """Tithi and Nakshatra at each local sunrise of one month, for calendar grids.

    The day's Tithi is the one running at sunrise, the usual calendar convention.
    A date with no sunrise (polar regions) carries null values rather than a guess.
    """
    from calendar import monthrange

    if type(year) is not int or type(month) is not int or not 1970 <= year <= 2100 or not 1 <= month <= 12:
        raise ValueError("year must be 1970..2100 and month must be 1..12")
    if not isinstance(place_query, str) or not 2 <= len(place_query.strip()) <= 200 or any(ord(c) < 32 for c in place_query):
        raise ValueError("place must be a city name without control characters")
    from jyotisha_ai.sky_spans import angles_at, division_index

    try:
        catalog = _approved_catalog(root)
        place = _matching_places(catalog, place_query)[0]
        zone = _pinned_zone(place["timezone"])
        validate_local_chart_runtime()
    except (BirthResolutionError, ValueError) as exc:
        raise DayPanchangError(str(exc)) from exc
    observer = astronomy.Observer(place["latitude"], place["longitude"], 0.0)
    days = []
    for day in range(1, monthrange(year, month)[1] + 1):
        current = date(year, month, day)
        start = _astro_time(datetime.combine(current, time(0, 0), tzinfo=zone))
        sunrise = astronomy.SearchRiseSet(astronomy.Body.Sun, observer, astronomy.Direction.Rise, start, 1.0)
        row = {"date": current.isoformat(), "sunrise": None, "tithi_index": None, "nakshatra_index": None, "moon_rashi_index": None, "planet_rashis": None}
        if sunrise is not None:
            ayanamsha, _ = true_lahiri_for_utc(_to_utc(sunrise))
            angles = angles_at(sunrise, ayanamsha)
            rounded = _to_utc(sunrise) + timedelta(seconds=30)
            row.update({
                "sunrise": rounded.astimezone(zone).strftime("%H:%M"),
                "tithi_index": division_index("tithi", angles["tithi"]) + 1,
                "nakshatra_index": division_index("nakshatra", angles["nakshatra"]) + 1,
                "moon_rashi_index": division_index("moon_rashi", angles["moon_rashi"]) + 1,
                "planet_rashis": _planet_signs(sunrise, ayanamsha),
            })
        days.append(row)
    # Lunar month, samvatsara and the sunrise Tithi's end time for each day (one pass for the whole month).
    try:
        lunar = lunar_days(observer, zone, date(year, month, 1), date(year, month, monthrange(year, month)[1]))
    except (ValueError, ArithmeticError):
        lunar = {}
    for row in days:
        info = lunar.get(date.fromisoformat(row["date"]))
        row.update({"tithi_ends_at": info["tithi_ends_at"], "next_tithi_index": info["next_tithi_index"], "lunar_month": info["lunar_month"],
                    "adhika_month": info["adhika"], "samvatsara_index": info["samvatsara_index"]} if info else
                   {"tithi_ends_at": None, "next_tithi_index": None, "lunar_month": None, "adhika_month": False, "samvatsara_index": None})
    cache_key = (place["name"], place["country_code"], year, month)
    if cache_key not in _EVENT_CACHE:
        try:
            from jyotisha_ai.festivals import festival_events
            _EVENT_CACHE[cache_key] = festival_events(observer, zone, date(year, month, 1), date(year, month, monthrange(year, month)[1]))
        except (ValueError, ArithmeticError):
            _EVENT_CACHE[cache_key] = None  # the calendar is still useful without festival dates
        if len(_EVENT_CACHE) > 96:
            _EVENT_CACHE.pop(next(iter(_EVENT_CACHE)))
    return {
        "status": "experimental_sunrise_month", "year": year, "month": month,
        "place": place["name"], "country_code": place["country_code"], "timezone": place["timezone"],
        "today_local_date": datetime.now(timezone.utc).astimezone(zone).date().isoformat(),
        "days": days,
        "events": _EVENT_CACHE[cache_key],
        "method": f"astronomy-engine 2.1.19; {TRUE_METHOD_ID} at each sunrise; approved GeoNames and pinned IANA tzdata",
        "message": ("Experimental Tithi and Nakshatra at local sunrise. Festival dates come from simple conventional rules "
                    "(lunar month, Tithi and time of day) and can differ by a day from a printed Panchang; Islamic and state "
                    "holidays are not included."),
    }
