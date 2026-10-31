"""Festival and holiday dates for a range of civil days at one place.

Hindu festivals are found from the Moon and Sun, not from a stored table:

* The lunar month is the *amanta* month (new moon to new moon), named by the
  sidereal sign the Sun enters during it (Mesha -> Chaitra ... Meena ->
  Phalguna). A month in which the Sun enters no sign is Adhika, and festivals
  are not observed in it.
* Each festival fixes a lunar month, a Tithi and a time of day (sunrise,
  mid-morning, midday, afternoon, evening pradosha or midnight). The civil day
  on which the Tithi covers most of that window is the festival day; for a
  sunrise festival, the first day that has the Tithi at sunrise. If no day
  qualifies (the Tithi falls between the windows), the day the Tithi occurs on
  is used. Raksha Bandhan avoids Bhadra (Vishti Karana).
* Holika Dahan is Purnima at pradosha, moved a day when Bhadra runs on past the
  night; Holi is the day after. Janmashtami moves to the next day when Ashtami
  also holds at that sunrise. Sankrantis and Onam follow the Sun's sign and the Moon's Nakshatra.
* Gazetted fixed-date holidays and Good Friday/Easter come from the Gregorian
  calendar.

These are simple, conventional rules. They are not expert-reviewed and can
differ by a day from a printed Panchang, which may apply regional rules.
Islamic and state-specific holidays are not included.
"""

from __future__ import annotations

from bisect import bisect_right
from datetime import date, datetime, time, timedelta, timezone

import astronomy

from jyotisha_ai.ayanamsha import true_lahiri_for_utc
from jyotisha_ai.sky_spans import SpanFinder, angles_at, division_index

# key, amanta month (1=Chaitra .. 12=Phalguna), tithi (1..15 Shukla, 16..30 Krishna), time of day
HINDU_FESTIVALS = (
    ("ugadi", 1, 1, "sunrise"), ("ram_navami", 1, 9, "madhyahna"), ("mahavir_jayanti", 1, 13, "sunrise"),
    ("hanuman_jayanti", 1, 15, "sunrise"), ("akshaya_tritiya", 2, 3, "morning"), ("buddha_purnima", 2, 15, "sunrise"),
    ("rath_yatra", 4, 2, "sunrise"), ("guru_purnima", 4, 15, "sunrise"), ("nag_panchami", 5, 5, "madhyahna"),
    ("raksha_bandhan", 5, 15, "aparahna"), ("janmashtami", 5, 23, "nishita"), ("ganesh_chaturthi", 6, 4, "madhyahna"),
    ("anant_chaturdashi", 6, 14, "sunrise"), ("navaratri", 7, 1, "sunrise"), ("durga_ashtami", 7, 8, "sunrise"),
    ("maha_navami", 7, 9, "sunrise"), ("vijayadashami", 7, 10, "aparahna"), ("sharad_purnima", 7, 15, "pradosha"),
    ("dhanteras", 7, 28, "pradosha"), ("naraka_chaturdashi", 7, 29, "sunrise"), ("diwali", 7, 30, "pradosha"),
    ("govardhan_puja", 8, 1, "sunrise"), ("bhai_dooj", 8, 2, "aparahna"), ("chhath", 8, 6, "pradosha"),
    ("karthika_purnima", 8, 15, "sunrise"), ("vasant_panchami", 11, 5, "morning"), ("ratha_saptami", 11, 7, "sunrise"),
    ("maha_shivaratri", 11, 29, "nishita"), ("holika_dahan", 12, 15, "pradosha"),
)
AVOID_BHADRA = frozenset({"raksha_bandhan"})
FIXED_HOLIDAYS = {(1, 26): "republic_day", (8, 15): "independence_day", (10, 2): "gandhi_jayanti", (12, 25): "christmas"}
# Holidays on the central government's gazetted list that this module can compute.
GAZETTED = frozenset({
    "holi", "ram_navami", "mahavir_jayanti", "buddha_purnima", "janmashtami", "vijayadashami", "diwali",
    "karthika_purnima", "good_friday", "republic_day", "independence_day", "gandhi_jayanti", "christmas",
})
ALL_KEYS = tuple(sorted({key for key, *_ in HINDU_FESTIVALS} | set(FIXED_HOLIDAYS.values())
                        | {"makar_sankranti", "mesha_sankranti", "onam", "holika_dahan", "easter", "good_friday"}))
NAKSHATRA_SHRAVANA = 22
SIGN_MESHA, SIGN_SIMHA, SIGN_MAKARA = 1, 5, 10
# Sample points per time of day: fractions of the daytime, or minutes from a reference instant.
DAY_FRACTIONS = {
    "sunrise": (0.0,), "morning": (0.0, 0.1, 0.2, 0.3, 0.4), "madhyahna": (0.4, 0.45, 0.5, 0.55, 0.6), "aparahna": (0.6, 0.65, 0.7, 0.75, 0.8),
}
EVENING_MINUTES = (0, 36, 72, 108, 144)  # after sunset
MIDNIGHT_MINUTES = (-24, -12, 0, 12, 24)  # around the middle of the night
ALL_CRITERIA = ("sunrise", "morning", "madhyahna", "aparahna", "pradosha", "nishita")


def easter_sunday(year: int) -> date:
    """Western Easter by the Anonymous Gregorian algorithm."""
    a, b, c = year % 19, year // 100, year % 100
    d, e = b // 4, b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = c // 4, c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    month, day = divmod(h + l - 7 * m + 114, 31)
    return date(year, month, day + 1)


def _astro_time(moment: datetime) -> astronomy.Time:
    utc = moment.astimezone(timezone.utc)
    return astronomy.Time.Make(utc.year, utc.month, utc.day, utc.hour, utc.minute, utc.second + utc.microsecond / 1e6)


def _is_vishti(karana_index: int) -> bool:
    """Bhadra: the seventh movable Karana (half-Tithi 2..57 repeating every seven)."""
    return 2 <= karana_index <= 57 and (karana_index - 2) % 7 == 6


class _Calendar:
    """Sunrise/sunset, Tithis, Karanas and lunar months for a window of civil days."""

    def __init__(self, observer: astronomy.Observer, zone, first: date, last: date):
        self.days = [first + timedelta(days=offset) for offset in range(-3, (last - first).days + 5)]
        self.sun: dict[date, tuple[astronomy.Time, astronomy.Time]] = {}
        for day in self.days:
            start = _astro_time(datetime.combine(day, time(0, 0), tzinfo=zone))
            rise = astronomy.SearchRiseSet(astronomy.Body.Sun, observer, astronomy.Direction.Rise, start, 1.0)
            sset = astronomy.SearchRiseSet(astronomy.Body.Sun, observer, astronomy.Direction.Set, start, 1.0)
            if rise is not None and sset is not None and rise.ut < sset.ut:
                self.sun[day] = (rise, sset)
        self.origin = _astro_time(datetime.combine(self.days[0], time(0, 0), tzinfo=zone))
        # The ayanamsha moves by under 0.01 degree over this window; evaluate it exactly at both ends and interpolate.
        self._line = []
        for end_day in (self.days[0], self.days[-1] + timedelta(days=45)):
            moment = _astro_time(datetime.combine(end_day, time(0, 0), tzinfo=timezone.utc))
            self._line.append((moment.ut, true_lahiri_for_utc(moment.Utc().replace(tzinfo=timezone.utc))[0]))
        total = (self.days[-1] - self.days[0]).days + 2
        finder = SpanFinder(self.origin, 0.0, step_days=2.0 / 24.0)  # Tithi and Karana never last under ~9 hours
        self._tithi = self._table(finder.spans("tithi", 0.0, total))
        self._karana = self._table(finder.spans("karana", 0.0, total))
        window_start = _astro_time(datetime.combine(self.days[0] - timedelta(days=40), time(0, 0), tzinfo=timezone.utc))
        self.new_moons: list[tuple[float, int]] = []
        found = astronomy.SearchMoonPhase(0.0, window_start, 40.0)
        end_ut = _astro_time(datetime.combine(self.days[-1] + timedelta(days=45), time(0, 0), tzinfo=timezone.utc)).ut
        while found is not None and found.ut < end_ut:
            self.new_moons.append((found.ut, self.sun_sign(found)))
            found = astronomy.SearchMoonPhase(0.0, found.AddDays(1.0), 40.0)
        self._cache: dict[tuple[date, str], list[tuple[int, int | None, int]]] = {}

    def ayanamsha(self, moment: astronomy.Time) -> float:
        (ut0, value0), (ut1, value1) = self._line
        return value0 + (value1 - value0) * (moment.ut - ut0) / (ut1 - ut0)

    def sun_sign(self, moment: astronomy.Time) -> int:
        vector = astronomy.GeoVector(astronomy.Body.Sun, moment, True)
        return int(((astronomy.Ecliptic(vector).elon - self.ayanamsha(moment)) % 360.0) // 30.0) + 1

    @staticmethod
    def _table(spans: list[dict]) -> tuple[list[float], list[int]]:
        return [float("inf") if row["end"] is None else row["end"] for row in spans], [row["index"] for row in spans]

    def _lookup(self, table: tuple[list[float], list[int]], moment: astronomy.Time) -> int:
        ends, indices = table
        return indices[min(bisect_right(ends, moment.ut - self.origin.ut), len(indices) - 1)]

    def lunar_month(self, moment: astronomy.Time) -> int | None:
        """Amanta month number (1=Chaitra) at ``moment``; None in an Adhika month."""
        position = bisect_right([ut for ut, _ in self.new_moons], moment.ut)
        if position == 0 or position >= len(self.new_moons):
            return None
        previous_sign, next_sign = self.new_moons[position - 1][1], self.new_moons[position][1]
        return None if previous_sign == next_sign else next_sign

    def instants(self, day: date, criterion: str) -> list[astronomy.Time]:
        if day not in self.sun or day + timedelta(days=1) not in self.sun:
            return []
        sunrise, sunset = self.sun[day]
        next_sunrise = self.sun[day + timedelta(days=1)][0]
        length = sunset.ut - sunrise.ut
        if criterion in DAY_FRACTIONS:
            return [sunrise.AddDays(fraction * length) for fraction in DAY_FRACTIONS[criterion]]
        if criterion == "pradosha":
            return [sunset.AddDays(minutes / 1440.0) for minutes in EVENING_MINUTES]
        middle = sunset.AddDays((next_sunrise.ut - sunset.ut) / 2.0)
        return [middle.AddDays(minutes / 1440.0) for minutes in MIDNIGHT_MINUTES]

    def karana_end_ut(self, moment: astronomy.Time) -> float:
        """When the Karana running at ``moment`` ends, as a UT day number."""
        ends, _ = self._karana
        return self.origin.ut + ends[min(bisect_right(ends, moment.ut - self.origin.ut), len(ends) - 1)]

    def samples(self, day: date, criterion: str) -> list[tuple[int, int | None, int]]:
        """(tithi, lunar month, karana) at the sample instants of one time of day."""
        key = (day, criterion)
        if key not in self._cache:
            self._cache[key] = [(self._lookup(self._tithi, moment), self.lunar_month(moment), self._lookup(self._karana, moment))
                                for moment in self.instants(day, criterion)]
        return self._cache[key]


def festival_events(observer: astronomy.Observer, zone, first: date, last: date) -> list[dict]:
    """Events for each civil day in [first, last]: ``[{date, key, holiday}]`` sorted by date."""
    calendar = _Calendar(observer, zone, first, last)
    found: dict[date, set[str]] = {}

    def add(day: date, key: str) -> None:
        if first <= day <= last:
            found.setdefault(day, set()).add(key)

    usable = calendar.days[:-1]
    for key, month, tithi, criterion in HINDU_FESTIVALS:
        presence, scores = [], {}
        for day in usable:
            hits = sum(1 for t, m, _k in calendar.samples(day, criterion) if t == tithi and m == month)
            if hits:
                scores[day] = hits
            if hits or any(t == tithi and m == month for name in ALL_CRITERIA for t, m, _k in calendar.samples(day, name)):
                presence.append(day)
        clusters, current = [], []
        for day in presence:
            if current and (day - current[-1]).days > 1:
                clusters.append(current); current = []
            current.append(day)
        if current:
            clusters.append(current)
        for cluster in clusters:
            scored = [day for day in cluster if day in scores]
            if scored:
                chosen = scored[0] if criterion in ("sunrise", "morning") else max(scored, key=lambda day: (scores[day], -(day - scored[0]).days))
                if key in AVOID_BHADRA:
                    rows = [row for row in calendar.samples(chosen, criterion) if row[0] == tithi and row[1] == month]
                    if rows and all(_is_vishti(row[2]) for row in rows):  # the whole window is Bhadra: use the next morning
                        following = day_after = chosen + timedelta(days=1)
                        if any(t == tithi and m == month for t, m, _k in calendar.samples(day_after, "sunrise")):
                            chosen = following
            else:
                chosen = next((day for day in cluster if any(t == tithi and m == month for t, m, _k in calendar.samples(day, "sunrise"))), cluster[0])
            if key == "janmashtami" and any(row[0] == tithi for row in calendar.samples(chosen + timedelta(days=1), "sunrise")):
                chosen += timedelta(days=1)  # Ashtami also holds at the next sunrise: that morning carries the festival
            if key == "holika_dahan":
                evening = calendar.instants(chosen, "pradosha")
                night = calendar.instants(chosen, "nishita")
                if evening and night and _is_vishti(calendar.samples(chosen, "pradosha")[0][2])                         and calendar.karana_end_ut(evening[0]) > night[2].ut + 60.0 / 1440.0:
                    chosen += timedelta(days=1)  # Bhadra runs on past the night: perform it at the next pradosha
                add(chosen + timedelta(days=1), "holi")
            add(chosen, key)

    days = calendar.days
    for index in range(1, len(days)):
        day, before = days[index], days[index - 1]
        if day in calendar.sun and before in calendar.sun:
            sign_before, sign_after = calendar.sun_sign(calendar.sun[before][1]), calendar.sun_sign(calendar.sun[day][1])
            if sign_before != sign_after:  # Sankranti between the two sunsets
                if sign_after == SIGN_MAKARA:
                    add(day, "makar_sankranti")
                elif sign_after == SIGN_MESHA:
                    add(day, "mesha_sankranti")
    previous_onam = None
    for day in days:
        if day in calendar.sun:
            sunrise = calendar.sun[day][0]
            moon = angles_at(sunrise, calendar.ayanamsha(sunrise))["nakshatra"]
            if calendar.sun_sign(sunrise) == SIGN_SIMHA and division_index("nakshatra", moon) + 1 == NAKSHATRA_SHRAVANA:
                if previous_onam is None or (day - previous_onam).days > 1:
                    add(day, "onam")
                previous_onam = day
    for year in {first.year, last.year}:
        easter = easter_sunday(year)
        add(easter, "easter")
        add(easter - timedelta(days=2), "good_friday")
        for (month, day_number), key in FIXED_HOLIDAYS.items():
            add(date(year, month, day_number), key)

    events = []
    for day in sorted(found):
        for key in sorted(found[day]):
            events.append({"date": day.isoformat(), "key": key, "holiday": key in GAZETTED})
    return events
