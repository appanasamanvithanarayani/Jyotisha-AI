# PyJHora standalone synthetic probe — 2026-10-25

**Outcome:** PyJHora 4.8.7 executed standalone in a separate Python 3.11.2 environment. This is an exploratory calculation, **not** an independently verified Jathakam or an MCP test. No real birth details, training data, source permissions, main project dependencies, or existing lockfile were changed.

## Environment and input

- Isolated, ignored venv: `artifacts/pyjhora-standalone-venv/` (not the project's `.venv` and not the separate Python 3.12 MCP venv).
- Installed from the configured package index: `PyJHora==4.8.7`, official Windows CPython 3.11 `pyswisseph==2.10.3.2` wheel, plus pinned calculation imports (`numpy==2.1.1`, `pytz==2024.1`, `geocoder==1.38.1`, `geopy==2.4.1`, `requests==2.32.3`, `timezonefinder==6.5.2`, `python-dateutil==2.9.0.post0`, `certifi==2024.8.30`). `pip check` reported no broken requirements. The PyJHora wheel itself declares no dependencies, so that check alone is not evidence of a complete supported install.
- Synthetic case: 2000-01-01 12:00 UTC, latitude 0°, longitude 0°, elevation 0 m, UTC offset 0, `LAHIRI` ayanamsha. No place lookup or real person. PyJHora computed ayanamsha `23.8570923254552°` at JD `2451545.0`.
- `const.use_internet_for_location_check=False` and `const.get_place_elevation_from_internet=False` were set before calculation. No network monitoring was performed, so absence of outbound traffic is **not** independently proven. Importing PyJHora printed messages that it added user-directory paths to `sys.path`; this deserves review before any service deployment.
- The package ephemeris folder contained **zero `.se1` files**. A direct `swisseph.calc_ut(JD, SUN, FLG_SWIEPH)` returned ephemeris flag `4` (`FLG_MOSEPH`), showing Moshier fallback for that diagnostic. PyJHora's position code requests Swiss flags, but this probe did not trace every internal call; do not call these full Swiss-file results. The MCP wrapper separately rejects missing `.se1` files, so this success does **not** unblock MCP.

## Observed calculations

PyJHora D1 output encodes Rashi as zero-based index plus degrees within Rashi. These values are reported as **tool outputs**, not verified facts:

| Item | PyJHora output |
| --- | ---: |
| Lagna | Rashi index `11`, `17.520677°` within sign; total sidereal longitude `347.520677°` |
| Sun | Rashi index `8`, `16.521487°`; total `256.521487°` |
| Moon | Rashi index `6`, `19.470740°`; total `199.470740°` |
| Mars | Rashi index `10`, `4.118376°`; total `304.118376°` |
| Mercury | Rashi index `8`, `8.048781°`; total `248.048781°` |
| Jupiter | Rashi index `0`, `1.400897°`; total `1.400897°` |
| Venus | Rashi index `7`, `7.720521°`; total `217.720521°` |
| Saturn | Rashi index `0`, `16.541422°`; total `16.541422°` |

Other outputs: `drik.tithi` index `26`; `drik.nakshatra` index `15`, pada `4`; depth-1 Vimshottari returned balance `(0 years, 8 months, 17 days)` and nine periods, with first listed lord ID `7`. Those civil dates and period conversions use PyJHora's own conventions and have not had Jyotisha review.

As a limited independent **solar smoke check**, adding the computed Lahiri ayanamsha to PyJHora's Sun value yielded tropical longitude `280.378579°`; the [U.S. Naval Observatory approximate solar formula](https://aa.usno.navy.mil/faq/sun_approx) gives `280.374714°` at this instant, an absolute difference of `0.003865°`. That approximate formula is not a precise ephemeris or validation of the Moon, Lagna, Panchanga, or dasha. The project's own experimental engine produced `256.511646°` sidereal Sun, `199.466799°` Moon, and `347.516777°` Lagna when supplied the same numeric ayanamsha. These cross-engine differences remain unexplained; neither engine serves as ground truth for the other.

## Reproduce locally

```powershell
& '.\artifacts\pyjhora-standalone-venv\Scripts\python.exe' -c "from jhora import const,utils; from jhora.panchanga import drik; from jhora.horoscope.chart import charts; from jhora.horoscope.dhasa.graha import vimsottari; const.use_internet_for_location_check=False; const.get_place_elevation_from_internet=False; drik.set_ayanamsa_mode('LAHIRI'); d=drik.Date(2000,1,1); p=drik.Place('Synthetic equator',0,0,0,elevation=0); jd=utils.julian_day_number(d,(12,0,0)); print(charts.rasi_chart(jd,p)); print(drik.tithi(jd,p)); print(drik.nakshatra(jd,p)); print(vimsottari.get_vimsottari_dhasa_bhukthi(jd,p,dhasa_level_index=1))"
```

Use only synthetic inputs until local network behavior and data handling are reviewed. Before relying on PyJHora for project evaluation, obtain versioned `.se1` files with a documented rights basis, record their hashes, verify actual ephemeris flags, compare several independently generated cases under matched conventions, and resolve the AGPL/Swiss Ephemeris distribution decision. Do not integrate PyJHora or promote this output to verified knowledge yet.
