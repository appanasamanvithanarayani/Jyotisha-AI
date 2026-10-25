"""Fail-closed, isolated PyJHora 4.8.7 D1 probe. Not a main-app backend.

Only the inspected D1 path is supported. PyJHora discards ``calc_ut`` return
flags, so this probe intercepts every planetary call and checks the actual
Swiss Ephemeris backend. Never run it concurrently with other Swiss users.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
import importlib.metadata
import json
import math
import os
from pathlib import Path
import re
import threading
from types import SimpleNamespace
from typing import Any


class StrictChartError(RuntimeError):
    """No chart can be returned under the required no-fallback policy."""


class EphemerisVerificationError(StrictChartError):
    """Ephemeris provenance or actual planetary backend was not verified."""


_PINNED_SOURCE_HASHES = {
    "charts": "a5058a2e7b6ed711c9b7c7f761da6723333f0e371cabd6ca565fbfc569163497",
    "drik": "7573c487e039a1a8b7cd99e40d671992217ee768a394a008c57cbcef143350ca",
    "utils": "8b592dc026887664780a1f9d26f8a2d0212d41b6fe6128785f4285914b97219b",
    "const": "ae67512342ee810fa812625c67e594b4fa4cc23d4698ae048008703cb8e6d113",
}


def _digest(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def verify_ephemeris(manifest_path: Path, ephe_dir: Path) -> dict[str, Any]:
    """Check a separately approved, exact-file inventory; never grant rights."""
    try:
        manifest_path, ephe_dir = Path(manifest_path), Path(ephe_dir)
        if not manifest_path.is_file() or manifest_path.is_symlink():
            raise EphemerisVerificationError("approved ephemeris manifest is missing or unsafe")
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        if not isinstance(manifest, dict):
            raise EphemerisVerificationError("ephemeris manifest must be an object")
        if manifest.get("manifest_version") != "1.0" or manifest.get("status") != "approved_for_local_calculation":
            raise EphemerisVerificationError("ephemeris manifest is not approved for local calculation")
        for field in ("approved_by", "approval_record", "source_revision", "rights_evidence"):
            if not isinstance(manifest.get(field), str) or not manifest[field].strip():
                raise EphemerisVerificationError(f"ephemeris manifest lacks {field}")
        files = manifest.get("files")
        if not isinstance(files, list) or not files:
            raise EphemerisVerificationError("ephemeris manifest has no files")
        if not ephe_dir.is_dir() or ephe_dir.is_symlink():
            raise EphemerisVerificationError("ephemeris directory is missing or unsafe")
        expected = set()
        for entry in files:
            if not isinstance(entry, dict):
                raise EphemerisVerificationError("invalid ephemeris file record")
            name, digest, size = entry.get("name"), entry.get("sha256"), entry.get("size_bytes")
            if not isinstance(name, str) or not re.fullmatch(r"[A-Za-z0-9_-]+\.se1", name):
                raise EphemerisVerificationError("unsafe or unsupported ephemeris filename")
            if name in expected:
                raise EphemerisVerificationError("duplicate ephemeris filename in manifest")
            expected.add(name)
            if not isinstance(digest, str) or not re.fullmatch(r"[0-9a-f]{64}", digest):
                raise EphemerisVerificationError(f"invalid checksum for {name}")
            if type(size) is not int or size <= 0:
                raise EphemerisVerificationError(f"invalid size for {name}")
            if not isinstance(entry.get("source_url"), str) or not entry["source_url"].strip():
                raise EphemerisVerificationError(f"missing provenance for {name}")
            path = ephe_dir / name
            if path.is_symlink() or not path.is_file():
                raise EphemerisVerificationError(f"required ephemeris file missing or unsafe: {name}")
            if path.stat().st_size != size or _digest(path) != digest:
                raise EphemerisVerificationError(f"ephemeris size/checksum mismatch: {name}")
        present = {p.name for p in ephe_dir.glob("*.se1")}
        if present != expected:
            raise EphemerisVerificationError("ephemeris directory does not match approved inventory")
        return {"manifest_sha256": _digest(manifest_path), "files": sorted(expected), "source_revision": manifest["source_revision"]}
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise EphemerisVerificationError("ephemeris manifest or files are unreadable") from exc


def _real_runtime() -> SimpleNamespace:
    try:
        version = importlib.metadata.version("PyJHora")
    except importlib.metadata.PackageNotFoundError as exc:
        raise StrictChartError("PyJHora is not installed in this isolated environment") from exc
    if version != "4.8.7":
        raise StrictChartError("unsupported PyJHora version; only audited 4.8.7 is allowed")
    try:
        swe_version = importlib.metadata.version("pyswisseph")
    except importlib.metadata.PackageNotFoundError as exc:
        raise EphemerisVerificationError("pyswisseph is unavailable") from exc
    if swe_version != "2.10.3.2":
        raise EphemerisVerificationError("unsupported pyswisseph version; only audited 2.10.3.2 is allowed")
    try:
        import swisseph as swe
        from jhora import const, utils
        from jhora.panchanga import drik
        from jhora.horoscope.chart import charts
    except ImportError as exc:
        raise StrictChartError("pinned PyJHora calculation imports are unavailable") from exc

    for name, module in (("charts", charts), ("drik", drik), ("utils", utils), ("const", const)):
        if _digest(Path(module.__file__)) != _PINNED_SOURCE_HASHES[name]:
            raise StrictChartError(f"unreviewed PyJHora code: {name}")
    if drik.swe is not swe:
        raise StrictChartError("PyJHora uses an uninspectable Swiss module")
    return SimpleNamespace(swe=swe, const=const, utils=utils, drik=drik, charts=charts)


def _validate_input(moment: datetime | str, latitude: float, longitude: float) -> tuple[datetime, float]:
    if isinstance(moment, str):
        try:
            moment = datetime.fromisoformat(moment)
        except ValueError as exc:
            raise StrictChartError("invalid birth date or time; use ISO 8601 with explicit UTC offset") from exc
    if not isinstance(moment, datetime) or type(moment.tzinfo) is not timezone:
        raise StrictChartError("birth time must have an explicit fixed UTC offset")
    if not 1800 <= moment.year <= 2100:
        raise StrictChartError("birth year outside audited 1800-2100 range")
    offset = moment.utcoffset()
    if offset is None or abs(offset) > timedelta(hours=14):
        raise StrictChartError("invalid UTC offset")
    for value, limit, label in ((latitude, 90, "latitude"), (longitude, 180, "longitude")):
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or abs(value) > limit:
            raise StrictChartError(f"invalid {label}")
    return moment, offset.total_seconds() / 3600


def calculate_strict_d1(
    moment: datetime | str,
    latitude: float,
    longitude: float,
    *,
    manifest_path: Path,
    ephe_dir: Path,
    runtime: Any = None,
) -> dict[str, Any]:
    """Return D1 only if each observed planetary calc used Swiss files.

    ``runtime`` exists solely for mocked failure/success tests. It is not a
    production plugin hook. This function must run in an isolated single-thread
    process because it temporarily guards the process-global Swiss function.
    """
    moment, offset_hours = _validate_input(moment, latitude, longitude)
    provenance = verify_ephemeris(manifest_path, ephe_dir)
    # Swiss Ephemeris documentation says this environment variable overrides
    # set_ephe_path. Refuse it instead of trusting the requested directory.
    if os.environ.get("SE_EPHE_PATH"):
        raise EphemerisVerificationError("SE_EPHE_PATH overrides the approved ephemeris directory")
    resolved_ephe_dir = Path(ephe_dir).resolve()
    if len(os.fsencode(str(resolved_ephe_dir))) > 255:
        raise EphemerisVerificationError("ephemeris path is too long for a reliably selected Swiss path")
    if threading.active_count() != 1:
        raise EphemerisVerificationError("backend interception requires a single-threaded process")
    rt = runtime if runtime is not None else _real_runtime()
    swe, const, utils, drik, charts = rt.swe, rt.const, rt.utils, rt.drik, rt.charts
    if drik.swe is not swe:
        raise EphemerisVerificationError("PyJHora Swiss call path cannot be intercepted")
    if const._TROPICAL_MODE:
        raise StrictChartError("tropical mode is not allowed")
    original_calc = swe.calc_ut
    observed: dict[int, int] = {}
    used_files: set[str] = set()
    ephe_mask = swe.FLG_SWIEPH | swe.FLG_MOSEPH | swe.FLG_JPLEPH

    def checked_calc(*args: Any, **kwargs: Any) -> Any:
        if len(args) < 2:
            raise EphemerisVerificationError("uninspectable planetary call")
        requested = kwargs.get("flags", args[2] if len(args) > 2 else 0)
        if (requested & ephe_mask) != swe.FLG_SWIEPH:
            raise EphemerisVerificationError("planetary call did not request Swiss Ephemeris exclusively")
        result = original_calc(*args, **kwargs)
        if not isinstance(result, tuple) or len(result) != 2 or type(result[1]) is not int:
            raise EphemerisVerificationError("planetary backend return flag unavailable")
        actual = result[1]
        if (actual & ephe_mask) != swe.FLG_SWIEPH:
            raise EphemerisVerificationError("unexpected planetary backend (Moshier/JPL/unknown); no chart returned")
        if not callable(getattr(swe, "get_current_file_data", None)):
            raise EphemerisVerificationError("actual Swiss ephemeris file identity unavailable")
        files_this_call = set()
        for file_type in (0, 1):  # Swiss planet and Moon .se1 file categories
            file_data = swe.get_current_file_data(file_type)
            if not isinstance(file_data, tuple) or len(file_data) != 4 or not isinstance(file_data[0], str):
                raise EphemerisVerificationError("actual Swiss ephemeris file identity unavailable")
            if file_data[0]:
                actual_file = Path(file_data[0]).resolve()
                if actual_file.parent != resolved_ephe_dir or actual_file.name not in provenance["files"]:
                    raise EphemerisVerificationError("calculation used a file outside the approved ephemeris inventory")
                files_this_call.add(actual_file.name)
        if not files_this_call:
            raise EphemerisVerificationError("actual Swiss ephemeris file identity unavailable")
        used_files.update(files_this_call)
        observed[int(args[1])] = actual
        return result

    # This exact pinned D1 path uses swe.calc_ut for all planetary positions
    # and swe.houses_ex for Lagna geometry. Other PyJHora APIs are unsupported.
    try:
        const.use_internet_for_location_check = False
        const.get_place_elevation_from_internet = False
        swe.set_ephe_path(str(resolved_ephe_dir))
        const._ephe_path = str(resolved_ephe_dir)
        const.PLANET_POSITIONS_GEOCENTRIC = True
        const.PLANET_POSITIONS_TRUE = False  # apparent, not geometric/true positions
        const.PLANET_POSITIONS_USE_ABERRATION = True
        const.PLANET_POSITIONS_USE_DEFLECTION = True
        const.PLANET_POSITIONS_USE_NUTATION = True
        drik.set_ayanamsa_mode("LAHIRI")
        if const._DEFAULT_AYANAMSA_MODE != "LAHIRI":
            raise StrictChartError("PyJHora did not retain Lahiri ayanamsha")
        drik.set_sideral_planets()
        drik.refresh_planet_flags()
        if (
            (drik.PLANET_FLAGS & ephe_mask) != swe.FLG_SWIEPH
            or not (drik.PLANET_FLAGS & swe.FLG_SIDEREAL)
            or drik.PLANET_FLAGS & (swe.FLG_TOPOCTR | swe.FLG_TRUEPOS)
        ):
            raise EphemerisVerificationError("PyJHora did not select Swiss geocentric apparent sidereal flags")
        swe.calc_ut = checked_calc
        date = drik.Date(moment.year, moment.month, moment.day)
        place = drik.Place("Synthetic/explicit coordinates", latitude, longitude, offset_hours, elevation=0.0)
        jd = utils.julian_day_number(date, (moment.hour, moment.minute, moment.second + moment.microsecond / 1e6))
        chart = charts.rasi_chart(jd, place, calculation_type="drik")
        required = {const._SUN, const._MOON, const._MARS, const._MERCURY, const._JUPITER, const._VENUS, const._SATURN, const._RAHU}
        if not required.issubset(observed):
            raise EphemerisVerificationError("not all required planetary backends were observed")
        if not isinstance(chart, list) or not chart or chart[0][0] != "L":
            raise StrictChartError("invalid PyJHora D1 result")
        if verify_ephemeris(manifest_path, ephe_dir) != provenance:
            raise EphemerisVerificationError("ephemeris provenance changed during calculation")
        return {
            "validation_status": "backend_verified_only_not_astronomically_benchmarked",
            "input": {"local_datetime": moment.isoformat(), "latitude": latitude, "longitude": longitude, "utc_offset_hours": offset_hours},
            "settings": {"pyjhora_version": "4.8.7", "pyswisseph_version": "2.10.3.2", "ayanamsha": "LAHIRI", "zodiac": "sidereal", "frame": "geocentric apparent", "chart": "D1/drik", "elevation_m": 0.0},
            "backend": {"planetary_ephemeris": "Swiss Ephemeris FLG_SWIEPH", "observed_planet_ids": sorted(observed), "returned_flags": observed, "used_files": sorted(used_files), "lagna_method": "Swiss houses_ex; no planetary backend flag"},
            "ephemeris_provenance": provenance,
            "d1": chart,
        }
    except StrictChartError:
        raise
    except Exception as exc:
        raise StrictChartError("PyJHora calculation failed; no chart returned") from exc
    finally:
        swe.calc_ut = original_calc
