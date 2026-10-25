"""Mocked no-fallback gate tests; not real Swiss backend correctness tests."""

from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from evaluations.strict_pyjhora_d1 import (
    EphemerisVerificationError, StrictChartError, calculate_strict_d1, verify_ephemeris,
)


MOMENT = datetime(2000, 1, 1, 12, tzinfo=timezone.utc)


def approved_fake_files(tmp_path: Path):
    ephe_dir = tmp_path / "ephe"
    ephe_dir.mkdir()
    data = b"synthetic test bytes, not real Swiss data"
    (ephe_dir / "sepl_18.se1").write_bytes(data)
    manifest = {
        "manifest_version": "1.0",
        "status": "approved_for_local_calculation",
        "approved_by": "MOCK TEST ONLY",
        "approval_record": "MOCK TEST ONLY",
        "source_revision": "MOCK TEST ONLY",
        "rights_evidence": "MOCK TEST ONLY",
        "files": [{
            "name": "sepl_18.se1",
            "sha256": hashlib.sha256(data).hexdigest(),
            "size_bytes": len(data),
            "source_url": "mock://not-a-real-source",
        }],
    }
    manifest_path = tmp_path / "manifest.json"
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
    return manifest_path, ephe_dir


def fake_runtime(*, returned_backend=2, actually_call=True, file_data_available=True):
    swe = SimpleNamespace(FLG_SWIEPH=2, FLG_MOSEPH=4, FLG_JPLEPH=1, FLG_SIDEREAL=65536, FLG_TOPOCTR=32768, FLG_TRUEPOS=16)
    swe.ephe_path = None
    swe.set_ephe_path = lambda path: setattr(swe, "ephe_path", path)
    swe.calc_ut = lambda jd, planet, flags=0: ((1.0,), returned_backend)
    if file_data_available:
        swe.get_current_file_data = lambda kind: (str(Path(swe.ephe_path) / "sepl_18.se1") if kind == 0 else "", 0.0, 0.0, 0)
    const = SimpleNamespace(
        _TROPICAL_MODE=False, _DEFAULT_AYANAMSA_MODE="LAHIRI",
        _SUN=0, _MOON=1, _MARS=2, _MERCURY=3, _JUPITER=4,
        _VENUS=5, _SATURN=6, _RAHU=7,
    )
    drik = SimpleNamespace(swe=swe, PLANET_FLAGS=0)
    drik.set_ayanamsa_mode = lambda mode: None
    drik.set_sideral_planets = lambda: None

    def refresh():
        drik.PLANET_FLAGS = swe.FLG_SWIEPH | swe.FLG_SIDEREAL

    drik.refresh_planet_flags = refresh
    drik.Date = lambda *a: a
    drik.Place = lambda *a, **kw: (a, kw)
    utils = SimpleNamespace(julian_day_number=lambda *a: 2451545.0)

    def chart(jd, place, calculation_type):
        if actually_call:
            for planet in range(8):
                swe.calc_ut(jd, planet, flags=drik.PLANET_FLAGS)
        return [["L", (0, 10.0)], [0, (1, 20.0)]]

    charts = SimpleNamespace(rasi_chart=chart)
    return SimpleNamespace(swe=swe, const=const, utils=utils, drik=drik, charts=charts)


def test_missing_manifest_or_files_fails_before_runtime(tmp_path):
    with pytest.raises(EphemerisVerificationError, match="manifest"):
        calculate_strict_d1(MOMENT, 0, 0, manifest_path=tmp_path / "absent.json", ephe_dir=tmp_path)
    manifest, ephe_dir = approved_fake_files(tmp_path)
    (ephe_dir / "sepl_18.se1").unlink()
    with pytest.raises(EphemerisVerificationError, match="missing"):
        calculate_strict_d1(MOMENT, 0, 0, manifest_path=manifest, ephe_dir=ephe_dir, runtime=fake_runtime())


def test_corrupted_file_and_unlisted_file_fail(tmp_path):
    manifest, ephe_dir = approved_fake_files(tmp_path)
    (ephe_dir / "sepl_18.se1").write_bytes(b"corrupted")
    with pytest.raises(EphemerisVerificationError, match="mismatch"):
        verify_ephemeris(manifest, ephe_dir)
    # Restore the approved bytes, then reject an unexpected extra .se1 file.
    (ephe_dir / "sepl_18.se1").write_bytes(b"synthetic test bytes, not real Swiss data")
    (ephe_dir / "semo_18.se1").write_bytes(b"unlisted")
    with pytest.raises(EphemerisVerificationError, match="inventory"):
        verify_ephemeris(manifest, ephe_dir)


def test_missing_manifest_file_entry_fails(tmp_path):
    manifest, ephe_dir = approved_fake_files(tmp_path)
    data = json.loads(manifest.read_text(encoding="utf-8"))
    data["files"] = []
    manifest.write_text(json.dumps(data), encoding="utf-8")
    with pytest.raises(EphemerisVerificationError, match="no files"):
        verify_ephemeris(manifest, ephe_dir)


def test_unreadable_or_unapproved_file_fails(tmp_path, monkeypatch):
    manifest, ephe_dir = approved_fake_files(tmp_path)
    data = json.loads(manifest.read_text(encoding="utf-8"))
    data["status"] = "pending"
    manifest.write_text(json.dumps(data), encoding="utf-8")
    with pytest.raises(EphemerisVerificationError, match="not approved"):
        verify_ephemeris(manifest, ephe_dir)
    data["status"] = "approved_for_local_calculation"
    manifest.write_text(json.dumps(data), encoding="utf-8")
    original_open = Path.open

    def deny_data_file(path, *args, **kwargs):
        if path.name == "sepl_18.se1":
            raise OSError("simulated unreadable file")
        return original_open(path, *args, **kwargs)

    monkeypatch.setattr(Path, "open", deny_data_file)
    with pytest.raises(EphemerisVerificationError, match="unreadable"):
        verify_ephemeris(manifest, ephe_dir)


@pytest.mark.parametrize("moment,lat,lon", [
    (datetime(2000, 1, 1, 12), 0, 0),
    ("2000-02-30T12:00:00+00:00", 0, 0),
    ("2000-01-01T25:00:00+00:00", 0, 0),
    ("2000-01-01T12:00:00+15:00", 0, 0),
    (MOMENT, 91, 0),
    (MOMENT, 0, float("nan")),
])
def test_invalid_input_fails_without_chart(tmp_path, moment, lat, lon):
    manifest, ephe_dir = approved_fake_files(tmp_path)
    with pytest.raises(StrictChartError, match="birth time|birth date|UTC offset|latitude|longitude"):
        calculate_strict_d1(moment, lat, lon, manifest_path=manifest, ephe_dir=ephe_dir, runtime=fake_runtime())


@pytest.mark.parametrize("backend", [4, 1, 0])
def test_unexpected_backend_fails_and_restores_hook(tmp_path, backend):
    manifest, ephe_dir = approved_fake_files(tmp_path)
    runtime = fake_runtime(returned_backend=backend)
    original = runtime.swe.calc_ut
    with pytest.raises(EphemerisVerificationError, match="unexpected planetary backend"):
        calculate_strict_d1(MOMENT, 0, 0, manifest_path=manifest, ephe_dir=ephe_dir, runtime=runtime)
    assert runtime.swe.calc_ut is original


def test_no_observed_planetary_calls_fails(tmp_path):
    manifest, ephe_dir = approved_fake_files(tmp_path)
    with pytest.raises(EphemerisVerificationError, match="not all required"):
        calculate_strict_d1(MOMENT, 0, 0, manifest_path=manifest, ephe_dir=ephe_dir, runtime=fake_runtime(actually_call=False))


def test_backend_return_flag_unavailable_fails(tmp_path):
    manifest, ephe_dir = approved_fake_files(tmp_path)
    with pytest.raises(EphemerisVerificationError, match="return flag unavailable"):
        calculate_strict_d1(MOMENT, 0, 0, manifest_path=manifest, ephe_dir=ephe_dir, runtime=fake_runtime(returned_backend=None))


def test_backend_file_identity_unavailable_fails(tmp_path):
    manifest, ephe_dir = approved_fake_files(tmp_path)
    with pytest.raises(EphemerisVerificationError, match="file identity unavailable"):
        calculate_strict_d1(MOMENT, 0, 0, manifest_path=manifest, ephe_dir=ephe_dir, runtime=fake_runtime(file_data_available=False))


def test_environment_ephemeris_override_fails(tmp_path, monkeypatch):
    manifest, ephe_dir = approved_fake_files(tmp_path)
    monkeypatch.setenv("SE_EPHE_PATH", "C:\\unapproved")
    with pytest.raises(EphemerisVerificationError, match="SE_EPHE_PATH"):
        calculate_strict_d1(MOMENT, 0, 0, manifest_path=manifest, ephe_dir=ephe_dir, runtime=fake_runtime())


def test_mocked_swiss_backend_success_is_labelled_not_benchmarked(tmp_path):
    manifest, ephe_dir = approved_fake_files(tmp_path)
    result = calculate_strict_d1(MOMENT, 0, 0, manifest_path=manifest, ephe_dir=ephe_dir, runtime=fake_runtime())
    assert result["backend"]["planetary_ephemeris"] == "Swiss Ephemeris FLG_SWIEPH"
    assert result["backend"]["observed_planet_ids"] == list(range(8))
    assert result["backend"]["used_files"] == ["sepl_18.se1"]
    assert result["settings"]["ayanamsha"] == "LAHIRI"
    assert result["validation_status"] == "backend_verified_only_not_astronomically_benchmarked"
    assert result["d1"][0][0] == "L"


@pytest.mark.skip(reason="PENDING: no rights-approved .se1 manifest/files or independent reference case")
def test_real_swiss_backend_and_reference_case_pending():
    """Activate only after rights approval and independent astronomical benchmark."""
