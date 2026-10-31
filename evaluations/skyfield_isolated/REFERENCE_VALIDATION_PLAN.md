# Reference validation plan — not run

All inputs will be synthetic. No kernel, Skyfield runtime, outside chart service, or benchmark result has been used in Phase 2A.

## Gate A: astronomical positions

After approval of the exact kernel *and* time-scale inputs, fix Skyfield/dependency versions and hashes in an isolated offline environment. Record the UTC timestamp, coordinate frame/equinox, geocentric versus topocentric origin, apparent versus geometric convention, kernel file SHA-256/coverage, ΔT/UT1/leap-second data identity, and every body identifier. Compare against a separately sourced, versioned JPL/observatory reference table whose reuse terms permit this validation. Do not treat another output from the same Skyfield+kernel path as an independent reference. Use `abs(((candidate-reference+180) % 360)-180)` for longitudes; report raw values and differences. Derive tolerances from reference precision and conventions **before** viewing candidate results. Include missing/corrupt data, wrong backend, missing dependency, no-network, out-of-range and boundary cases. On any failure, return no result.

## Gate B: Jyotisha-specific calculations

Only after Gate A passes, independently select and review a named ayanamsha and numerical convention. Then validate sidereal longitudes and node definitions. Validate Lagna/house system separately against independently sourced charts using identical location, UTC and settings. Validate rashi/D9 boundaries, Panchanga limbs and their sunrise/instant convention, and Vimshottari start/balance/year-length convention against their own traceable Jyotisha references. Source review and mathematical validation are distinct; one does not certify the other. No astrology interpretations, training examples or model-evaluation labels may be derived from an unreviewed calculation.

The current [chart contract](../CHART_TEST_CONTRACT_2026-10-25.md) is shape/arithmetic evidence only. Its `synthetic-zero` ayanamsha and approximate Sun smoke test are not astronomical ground truth for Skyfield.
