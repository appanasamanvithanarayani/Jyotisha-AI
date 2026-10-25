# PyJHora MCP local evaluation — 2026-10-25

**Decision: not ready for integration or reference-chart validation.** This is a source audit and attempted isolated setup, not a successful MCP calculation benchmark. No personal birth data, project source permissions, training data, main dependencies, or lockfile were changed.

## Source and dependency snapshot

| Item | Observed version / revision | Evidence and caveat |
| --- | --- | --- |
| Wrapper | `pyjhora-mcp` 0.2.0, `main` commit `8d9c793dc3b678fc49e1354255c02a8cff8aad20`; no Git release tags returned | [source](https://github.com/chinmay-sh/pyjhora-mcp/tree/8d9c793dc3b678fc49e1354255c02a8cff8aad20), `pyproject.toml` SHA-256 `9e93f5849d94b72c6d8a803b3945145ae2ab7b79a7a53d5d2fd8917ec3f2eee4`. No license file or license declaration found in this checkout: obtain maintainer clarification before copying, modifying, redistributing, or integrating wrapper code. |
| PyJHora | Wrapper pins `PyJHora==4.8.7`; inspected tag `V4.8.7` at `ca22995709bd60e371e7820a1a5efc80ce4cf821` | [tag](https://github.com/naturalstupid/PyJHora/tree/V4.8.7). Its `LICENSE` is AGPL-3.0 (`SHA-256 0e768259b18e4bddc6f89a4b8138a28e608b675b45142268cd31bdffbad4ab7c`). Its package metadata simultaneously claims an MIT classifier; **do not rely on that classifier**. Author recorded there: Sundar Sundaresan. Current `main` was `48e57d29b47a3143519910a24866758116467485` when checked, but is not the wrapper's supported pin. |
| Python | Requires >=3.12; isolated venv created with installed Python 3.12.3 | `artifacts/pyjhora-mcp-venv/`, separate from `.venv` (Python 3.11). |
| Other requirements | Wrapper declares `pyswisseph>=2.10.3.2`, `fastmcp>=2`, NumPy, Pydantic, timezonefinder, geopy/geocoder, requests, pytz, dateutil, islam, hijridate; PyJHora's requirements also include PyQt6 and other GUI packages | Several ranges are open-ended. The attempted resolver selected FastMCP 4.1.3, but compatibility with the 0.2.0 wrapper was **not tested**. A complete hash-locked dependency file cannot honestly be produced from a failed installation. |
| Swiss Ephemeris | `pyswisseph` 2.10.3.2 selected as source distribution; build failed | Microsoft Visual C++ 14.0+ Build Tools absent. PyJHora's wheel omits approximately 105 MB of `.se1` ephemeris files; wrapper's `core.initialise()` checks for at least one. The wrapper's `setup-ephe.sh` would fetch them from the upstream `V4.8.7` tag; **not run**. Files and their distribution terms must be reviewed and pinned before use. |

Follow-up wheel check: the [official PyPI release files](https://pypi.org/project/pyswisseph/2.10.3.2/) include a CPython 3.11 Windows x64 wheel (SHA-256 `2b4a24f7954e1456ecbd3bb091b7c2a8a2e9838ff56e0d8af0f9e897fa84eb25`) but no compatible CPython 3.12 Windows wheel. PyPI reports no provenance attestation for that release; the official listing and checksum establish package-index origin/integrity, not independent build provenance. In the isolated 3.12 venv, `pip download --only-binary=:all: --no-deps pyswisseph==2.10.3.2` returned `No matching distribution found`. The 3.11 wheel was **not** installed or relabeled for 3.12. A system-wide C++ toolchain install has not been attempted.

The source snapshot is in ignored `artifacts/pyjhora-mcp-source/` and `artifacts/pyjhora-upstream-source/`. The upstream checkout was sparse; no ephemeris data was acquired. The wrapper contains 26 statically identified `get_*` tools across Panchanga (8), horoscope (5), dasha (6), compatibility (1), yoga/dosha (3), and strength (3). Relevant exposed names are `get_planet_positions`, `get_rasi_chart`, `get_bhava_chart`, `get_panchanga`, `get_vimsottari_dasha`, and `get_running_dasha`. Their existence is **not** evidence of correct results.

## Local-only transport and behavior

The wrapper's `pyjhora-mcp` script invokes `server.main()`, which binds HTTP to `0.0.0.0:8000` by default; do **not** use it here. Its README documents `fastmcp run src/pyjhora_mcp/server.py` for stdio. A prospective local MCP client configuration (not activated or tested) is:

```json
{
  "command": "C:\\Users\\admin\\Desktop\\ai astrologer\\artifacts\\pyjhora-mcp-venv\\Scripts\\fastmcp.exe",
  "args": ["run", "C:\\Users\\admin\\Desktop\\ai astrologer\\artifacts\\pyjhora-mcp-source\\src\\pyjhora_mcp\\server.py", "--transport", "stdio"]
}
```

Run with the wrapper checkout as the working directory if the MCP client requires one. Do not set a public URL or port. Source inspection found explicit disabling of PyJHora's internet location/elevation lookup and an explicit elevation of `0.0` in the place converter; this was not verified by runtime network tracing. Never enter real birth details until local-only operation has been verified.

Inputs are local Gregorian date/time components plus explicit latitude, longitude, and numeric UTC offset; there is no timezone database or historical-DST resolution in `BirthDataInput`. Ayanamsha defaults to `LAHIRI`; select it explicitly for reproducibility. Outputs are sidereal; Rasi houses in `get_rasi_chart` are sign-counted from Lagna, whereas `get_bhava_chart` has a separately selectable `bhava_madhya_method` (default 1) and is **not** equivalent to whole-sign houses. The wrapper does not expose a configurable ephemeris path, topocentric elevation, or a per-call Swiss ephemeris mode; the runtime binds PyJHora's packaged ephemeris directory per thread. Panchanga returns sunrise-relative limb transition times, sometimes greater than 24 hours. Vimshottari depths grow exponentially; use depth 1 initially. Date validation only bounds month 1–12 and day 1–31; an impossible date such as 2024-02-31 is not rejected by the Pydantic model itself. Review Swiss Ephemeris/PyJHora behavior before treating that as a supported date.

## Tests actually run and still pending

- Isolated venv creation: **passed**; `Python 3.12.3`, `pip 24.0`.
- Static syntax compilation of the wrapper's `src/` using Python 3.12.3: **passed**; this does not load dependencies or test behavior.
- `pip install -e artifacts/pyjhora-mcp-source pytest==8.4.2`: **failed** building `pyswisseph`; Microsoft Visual C++ 14.0+ required. The venv still contains only pip; no dependency lock or wheel hashes exist for a completed environment.
- MCP startup, tool listing, synthetic input validation, planetary positions, Lagna, Panchanga, Vimshottari Dasha, and outbound-network check: **not run**, because installation did not complete and `.se1` files are absent.
- Independent reference-case comparison: **not run**. Use synthetic dates/coordinates with documented Lahiri, geocentric and house conventions, and a separately computed/published ephemeris reference; record tolerances, exact results, and discrepancies before calling any output verified. The project's own experimental chart engine is a useful cross-check, not an authoritative reference by itself.
- Existing project tests: `./.venv/Scripts/python.exe -m pytest -q` → **57 passed in 2.66s**.

## Licensing and next gate

[Swiss Ephemeris documentation](https://www.astro.com/swisseph-download/doc/swisseph.pdf) states AGPL or a Professional license must be chosen before distribution or a public service. [pyswisseph's license](https://github.com/astrorigin/pyswisseph/blob/master/LICENSE.txt) is AGPL-3.0. Evaluate the entire combined deployment, network-service obligations, commercial intent, and ephemeris data terms with qualified counsel. Do not infer that local testing clears integration into this project's differently licensed code. The wrapper's absent license is an independent blocker to integration.

Smallest setup next step: install Microsoft C++ Build Tools 14.0+ **or** obtain a provenance-checked Python 3.12 wheel for pinned `pyswisseph==2.10.3.2`; then resolve and hash-lock the complete isolated dependency graph, acquire/checksum the `V4.8.7` `.se1` files under a documented license basis, and run stdio-only synthetic/reference tests. Do not start an HTTP server, copy wrapper code into the main project, or use its outputs as verified charts before those gates.

Cleanup (PowerShell, after confirming these exact ignored targets):

```powershell
Resolve-Path .\artifacts\pyjhora-mcp-source, .\artifacts\pyjhora-upstream-source, .\artifacts\pyjhora-mcp-venv
Remove-Item -LiteralPath .\artifacts\pyjhora-mcp-source, .\artifacts\pyjhora-upstream-source, .\artifacts\pyjhora-mcp-venv -Recurse -Force
```
