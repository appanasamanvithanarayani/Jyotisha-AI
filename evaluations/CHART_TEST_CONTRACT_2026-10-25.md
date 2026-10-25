# Jathakam chart validation contract — 2026-10-25

This contract is for the project's **experimental deterministic calculator**, not the future language model. Passing shape and arithmetic tests does not establish astronomical or Jyotisha correctness. All case inputs below are synthetic.

## Inputs and conventions

- Accept an ISO/Gregorian date and time with an explicit numeric UTC offset. The caller must establish the historical offset; no place-name geocoding or timezone/DST lookup occurs. Supported years: 1800–2100. Reject nonexistent civil dates at parsing, naive datetimes, nonfinite values, and latitude/longitude outside ±90/±180 degrees.
- Require latitude north-positive and longitude east-positive in degrees. The calculator presently uses zero elevation; that is a limitation for horizon quantities.
- Require a sourced ayanamsha **name and numeric value** within ±40 degrees. `synthetic-zero` is only a mathematical test setting; it is **not Lahiri**. A future Lahiri comparison must record the precise authority, epoch, numeric value, and interpolation convention before execution.
- Existing astronomy engine: `astronomy-engine==2.1.19`, geocentric apparent tropical longitudes in true ecliptic of date; sidereal values subtract the supplied numeric ayanamsha. Ascendant uses the eastern horizon. Houses are whole-sign from sidereal Lagna. These conventions must be matched before comparing another engine's output.
- Birth-instant tithi, half-tithi, nakshatra, pada, and yoga are numerical indices; the civil weekday is not sunrise-based vara. The output does not contain a daily sunrise Panchanga. Vimshottari reports nine period lengths and the remaining first-period balance in abstract years, not calendar dates. Rahu/Ketu and bhava cusps are unsupported.

## Expected output interface

`calculate_chart()` returns `engine_version`, `validation_status`, `input`, `conventions`, `ascendant`, `positions`, `panchanga_at_birth`, `vimshottari`, and `unsupported`. Each supported body's position has tropical/sidereal longitude in `[0,360)`, `rashi_index` in `1..12`, and `whole_sign_bhava` in `1..12`. Ascendant has analogous longitudes and sign. Panchanga indices have tithi `1..30`, half-tithi `1..60`, nakshatra/yoga `1..27`, and pada `1..4`. Vimshottari has a nine-item period list and total 120 abstract years; `year_to_days_conversion` remains null. The validation status must remain `not_independently_benchmarked` until the external reference gate passes.

`tests/test_chart_contract.py` enforces input bounds, required UTC offset, shape/ranges, explicit unsupported features, and instant equivalence across UTC offsets. These tests use calculated outputs for structural assertions only; they do not supply independent expected planetary positions.

## Independent case register and acceptance gate

| Case | Synthetic input / purpose | Independent reference | Status |
| --- | --- | --- | --- |
| J2000 solar smoke | 2000-01-01 12:00 UTC, lat 0°, lon 0°, synthetic zero ayanamsha | Existing [USNO approximate solar formula](https://aa.usno.navy.mil/faq/sun_approx) with 0.03° tolerance in `tests/test_chart.py`; applies **only to Sun** and is approximate | Existing smoke check only; not a chart benchmark |
| Full seven-body positions + Lagna | Several synthetic UTC instants, latitudes and longitudes; explicitly sourced Lahiri value per instant | Obtain an independently generated reference table with software/edition, version, coordinate frame, ephemeris, ayanamsha, precision and redistribution terms | Not acquired; no expected longitudes entered |
| Sign/nakshatra boundary | Synthetic instants selected *after* an independent reference identifies distances to boundaries | Same independent source plus unrounded reference values | Not acquired; no pass claim |
| Sunrise Panchanga | Synthetic location/date with independently calculated sunrise and five limb transitions | Independent almanac or verified calculation source; distinguish daily sunrise result from birth-instant indices | Not acquired; daily feature unsupported |
| Vimshottari balance | Synthetic Moon longitude and a separately reviewed tradition/year-length convention | Qualified Jyotisha review and independent calculation of initial lord/balance; no date comparison until year convention set | Arithmetic-only synthetic tests; not tradition-verified |

Before accepting a numeric comparison, record each reference's exact source version and locator, legal reuse basis, timestamp and UTC offset, lat/lon/elevation, zodiac/ayanamsha, apparent versus geometric frame, ephemeris, house convention, raw outputs, comparison code, and discrepancies. Set tolerances **from reference precision and algorithm differences**, not from observed agreement. No universal tolerance has yet been justified for Moon, Lagna, Panchanga transitions, or dasha dates. The project's own engine and an eventual PyJHora MCP call may cross-check each other but cannot independently certify one another.

Keep the reference data and reviewer sign-off separate from both training material and model evaluation examples. Do not promote these synthetic contract cases to verified Jyotisha knowledge records.
