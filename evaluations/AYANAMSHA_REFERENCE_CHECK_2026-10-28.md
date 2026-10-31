# Ayanamsha reference check — 2026-10-28

Initial decision on 2026-10-28: the three-input chart remained blocked.
The 2026-10-29 update below supersedes that decision for the **localhost
experimental preview only**. No personal birth details were used.

## Method actually implemented

`src/jyotisha_ai/ayanamsha.py` implements only a **mean** Lahiri/IAE-style
scalar, anchored at J2000 TT and advanced using the general-precession
polynomial attributed to *Indian Astronomical Ephemeris* 1989, p. 525. The
original IAE page was not inspected; the polynomial and the numeric comparisons
below were checked in the Swiss
Ephemeris documentation, section 2.8 and Appendix E:

<https://www.astro.com/swisseph/swisseph.htm>

The method accepts an explicit Julian date in TT. It does not determine TT
from a civil birth date. It is **not** a true-of-date ayanamsha and is not wired
into the chart calculator. The current chart calculator uses apparent
geocentric positions on the true ecliptic of date; subtracting the mean value
from those positions would mix frames. The documentation also cautions that
scalar subtraction across ecliptics of different epochs is not fully exact.

## Published-number comparison

These are Swiss Ephemeris values in its comparison with *Indian Astronomical
Ephemeris* 2019, p. 429. The published Swiss values are independent of this
project's implementation, but the test validates only this scalar formula,
not the entire chart engine.

| TT Julian date | Published mean ayanamsha | Local calculation | Difference |
| --- | --- | --- | --- |
| 2451545.0 | 23°51′25.5324″ | 23°51′25.5324″ | <0.0001″ |
| 2458485.0 | 24°07′21.1353″ | 24°07′21.1353″ | <0.0001″ |
| 2458850.0 | 24°08′11.3962″ | 24°08′11.3962″ | <0.0001″ |

Two earlier Swiss comparison values at TT JD 2447527.5 and 2447892.5
(*IAE* 1989, p. 512) differ from this J2000-anchored polynomial by about
0.00795″. The tests permit <0.01″ for these points rather than claiming exact
agreement. The anchor itself is a fitted/published starting value, so its
agreement is a reproducibility check; the non-anchor dates are the useful
cross-checks.

The documentation distinguishes multiple Lahiri definitions and notes that
the IAE's own tabulated figures can differ slightly from these Swiss values.
This implementation must therefore be identified by its exact method ID,
not described as a universal Lahiri value.

## Remaining validation gate

The initial remaining work was to select and implement a **true-of-date** ayanamsha
consistent with the chart's position frame, validate the UTC-to-TT conversion,
and compare complete synthetic charts—including Sun, Moon, planets and Lagna—
against an independent reference with matching conventions and defined
tolerances. Rahu/Ketu, sunrise Panchanga, divisional charts, and predictions
remain unsupported in the existing chart calculator. No check in this report
established that the complete chart was correct at that stage.

## 2026-10-29: limited local-preview validation

The true method now implemented is explicitly
`lahiri_iae1985_true_1956_iau1976_wahr1980_v1`: initial **true** ayanamsha
23°15′00.658″ at 1956-03-21 00:00 TT, the IAU1976 general-precession
polynomial, and Wahr1980 longitude nutation via PyERFA `nut80`. This follows
the assumptions described in [Swiss Ephemeris Appendix E](https://www.astro.com/swisseph/swisseph.htm).
The original IAE page and its editorial context were **not** independently
inspected. TT conversion at birth uses pinned Astronomy Engine 2.1.19.

PyERFA 2.0.1.5 and NumPy 1.26.4 were installed from official PyPI wheels.
Their installed license files are BSD-style and permit binary redistribution
provided notices and disclaimers are retained; NumPy's wheel also lists
OpenBLAS/LAPACK notices. The [PyERFA license](https://github.com/liberfa/pyerfa/blob/v2.0.1.5/LICENSE.rst),
[ERFA license](https://github.com/liberfa/erfa/blob/master/LICENSE), and installed
NumPy license must be included in any future distributed product. This is an
engineering license review, not legal advice. No Swiss Ephemeris or PyJHora
code or `.se1` data was integrated.

Astrodienst's online `swetest` 2.10.04 was queried with **synthetic** inputs.
The requested mode was `-eswe`; the response showed no fallback warning, but
the site's internal files/backend could not be inspected independently. The
values are treated as reference outputs, not proof of that server's backend.
The test page is [here](https://www.astro.com/swisseph/swetest.htm).

| Synthetic instant and setting | Reference call options | Result |
| --- | --- | --- |
| 2019-01-01 00:00 UT, true Lahiri | `-sid1 -sidbit8192 -ut0 -pb`; TT JD 2458484.500801161 | 24°07′05.9864″; local formula differs by 0.000027″ |
| 2020-01-01 00:00 UT, true Lahiri | same options; TT JD 2458849.500802792 | 24°07′54.8411″; local formula differs by 0.000066″ |
| 2000-01-01 12:00 UT, 0°N 0°E | `-eswe -sid1 -sidbit8192 -house0,0,P -p0123456 -fTPL` | Seven sidereal planets within 4.1″; Ascendant within 0.2″ |
| 2020-01-01 00:00 UT, 28.6139°N 77.209°E | `-eswe -sid1 -sidbit8192 -house77.209,28.6139,P -p0123456 -fTPL` | Seven sidereal planets within 4.1″; Ascendant within 0.2″ |

The calculation uses the Ascendant longitude only from the Placidus reference;
the app itself assigns **whole-sign houses**, not Placidus cusps. Tests use
wraparound-safe differences and thresholds <10″ for planetary longitudes and
<1″ for Ascendant at these two cases. The live readiness gate repeats these
checks and fails closed on a missing/wrong package or mismatched output.

**Decision:** enable the localhost DOB/POB/TOB **experimental calculation**
when the approved GeoNames catalog and pinned tzdata are present. The app must
retain the experimental label. Two synthetic cases do not establish accuracy
for all dates, locations, or edge cases. GeoNames places below the city-catalog
threshold, ambiguous names, ambiguous/nonexistent local times, and pre-1970
historical time-zone cases remain blocked. Rahu/Ketu, divisional charts,
sunrise Panchanga, complete Vimshottari calendar dates, interpretations, model
training, and public deployment remain outside this result.
