"""Start and end times of Panchang divisions from sidereal Sun and Moon longitudes.

Used for both the sunrise-based day Panchang and the birth-moment Panchang in
the Kundli. Positions come from Astronomy Engine (geocentric apparent, true
ecliptic of date); the sidereal offset is an explicit argument held constant
over the few days scanned (it moves far less than a second of time per day).
"""

from __future__ import annotations

import math

import astronomy

# name: (angular width in degrees, number of divisions)
QUANTITIES = {
    "tithi": (12.0, 30),
    "karana": (6.0, 60),
    "nakshatra": (360.0 / 27.0, 27),
    "yoga": (360.0 / 27.0, 27),
    "moon_rashi": (30.0, 12),
}
# Extra scan beyond the requested window so the true start and end are found;
# each exceeds the longest possible duration of one division.
PADDING_DAYS = {"tithi": 1.4, "karana": 0.8, "nakshatra": 1.3, "yoga": 1.3, "moon_rashi": 3.0}
STEP_DAYS = 20.0 / 1440.0


def _sidereal(body: astronomy.Body, moment: astronomy.Time, ayanamsha: float) -> float:
    vector = astronomy.GeoVector(body, moment, True)
    return (astronomy.Ecliptic(vector).elon - ayanamsha) % 360.0


def angles_at(moment: astronomy.Time, ayanamsha: float) -> dict[str, float]:
    moon = _sidereal(astronomy.Body.Moon, moment, ayanamsha)
    sun = _sidereal(astronomy.Body.Sun, moment, ayanamsha)
    elongation = (moon - sun) % 360.0
    return {"tithi": elongation, "karana": elongation, "nakshatra": moon,
            "yoga": (moon + sun) % 360.0, "moon_rashi": moon}


def division_index(name: str, angle: float) -> int:
    width, count = QUANTITIES[name]
    return min(count - 1, int(angle // width))


class SpanFinder:
    """Find divisions around ``origin``; offsets are days after ``origin``."""

    def __init__(self, origin: astronomy.Time, ayanamsha: float, step_days: float = STEP_DAYS):
        self.origin = origin
        self.ayanamsha = ayanamsha
        self.step = step_days
        self._grid: dict[int, dict[str, float]] = {}

    def _index_exact(self, name: str, offset: float) -> int:
        return division_index(name, angles_at(self.origin.AddDays(offset), self.ayanamsha)[name])

    def _index_on_grid(self, name: str, step: int) -> int:
        if step not in self._grid:
            self._grid[step] = angles_at(self.origin.AddDays(step * self.step), self.ayanamsha)
        return division_index(name, self._grid[step][name])

    def spans(self, name: str, begin: float, finish: float) -> list[dict]:
        """Divisions overlapping [begin, finish]; start/end are offsets in days.

        ``start`` or ``end`` is None only if it lies beyond the padded scan.
        """
        if name not in QUANTITIES or not (math.isfinite(begin) and math.isfinite(finish) and begin <= finish):
            raise ValueError("invalid division or window")
        pad = PADDING_DAYS[name]
        first = math.floor((begin - pad) / self.step)
        last = math.ceil((finish + pad) / self.step)
        current = self._index_on_grid(name, first)
        found = [{"index": current + 1, "start": None, "end": None}]
        for step in range(first, last):
            following = self._index_on_grid(name, step + 1)
            if following == current:
                continue
            low, high = step * self.step, (step + 1) * self.step
            for _ in range(32):
                middle = (low + high) / 2.0
                if self._index_exact(name, middle) == current:
                    low = middle
                else:
                    high = middle
            found[-1]["end"] = high
            found.append({"index": following + 1, "start": high, "end": None})
            current = following
        return [row for row in found
                if (row["end"] is None or row["end"] > begin) and (row["start"] is None or row["start"] < finish)]
