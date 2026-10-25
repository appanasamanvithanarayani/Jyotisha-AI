# Deterministic chart engine — validation gate

Version `0.1.0`, 2026-10-25. **Not independently benchmarked as a full Jathakam engine. Do not use its outputs as AI evaluation ground truth yet.** No personal birth data is stored here.

## Implemented conventions

- `astronomy-engine==2.1.19` (MIT): geocentric apparent Sun, Moon, Mars, Mercury, Jupiter, Venus, and Saturn vectors, transformed to true ecliptic of date. No network calls at chart runtime.
- User-provided numeric ayanāṃśa subtracted from those tropical longitudes and the calculated eastern-horizon ascendant. The engine never chooses Lahiri or another named tradition without a supplied degree value and provenance label.
- Whole-sign houses counted from the sidereal ascendant sign. Birth-instant *tithi*, half-*tithi*, *nakṣatra*, *pāda*, and *yoga* are numerical partitions. The civil weekday is **not** labeled traditional sunrise *vāra*.
- Vimshottari uses 27 equal nakshatras and the nine-period table as a configurable convention in code. It outputs the remaining balance of the period operating at birth and the cycle lengths, **not** civil dates or an expert-verified tradition. The [source audit](../data/review/OURNAKSHATRA_VIMSHOTTARI_PANCHANGA_EVIDENCE_2026-10-25.md) does not constitute Sanskrit/Jyotisha sign-off.

## Automated tests run

- Synthetic exact-angle boundary tests for calendar partitions, nakshatra/pāda, and Vimshottari start/balance.
- Repeated-run equality, equivalent UTC offsets, ayanāṃśa shift invariance, and invalid-input rejection.
- An **approximate** independent solar smoke check at J2000 against the [U.S. Naval Observatory's published formula](https://aa.usno.navy.mil/faq/sun_approx). The formula itself has limited precision and checks neither the Moon nor Lagna. Test tolerance is 0.03°.

## Required before use as evaluation truth

1. Obtain licensed/publishable independent ephemeris reference outputs for several synthetic UTC instants and latitudes (including sign/nakshatra boundaries), recording exact coordinate frame, apparent/geometric choice, ayanāṃśa edition/value, source version, and numerical tolerances. Compare each implemented planetary longitude and ascendant, not only the Sun.
2. Check historical local UTC offsets independently for any real birth case. Verify an exact numeric ayanāṃśa and its source for each case; never substitute a rounded value without a sensitivity warning near a boundary.
3. Have a qualified Sanskrit/Jyotisha reviewer approve the nakshatra, Panchanga, whole-sign-house, and Vimshottari conventions. Independently compare a known natal dasha balance; choose and document a period-year convention before emitting dates.
4. Add a separate sunrise-based daily Panchanga, Rahu/Ketu positions, and any additional chart features only with their own independently checked reference cases. Label unavailable fields rather than guessing.

No benchmark pass or human review is claimed by this document. The calculation engine must remain separate from knowledge-record verification and from future model training.
