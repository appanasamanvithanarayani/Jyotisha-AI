"""Synthetic catalog tests; these do not validate real GeoNames or timezone data."""

from datetime import datetime, timedelta, timezone
import hashlib
import json
from zipfile import ZipFile

import pytest

from jyotisha_ai.birth_resolution import BirthResolutionError, OFFICIAL_URL, _pinned_zone, nearby_place, resolve_birth, suggest_places
from jyotisha_ai.webapp import birth_chart_readiness, birth_input_status


def catalog(root, rows, *, approved=True, checksum=None):
    raw = root / "data" / "raw"
    manifests = root / "data" / "manifests"
    raw.mkdir(parents=True, exist_ok=True)
    manifests.mkdir(parents=True, exist_ok=True)
    path = raw / "cities15000.zip"
    with ZipFile(path, "w") as archive:
        archive.writestr("cities15000.txt", "\n".join(rows) + "\n")
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    (manifests / "geonames_cities15000.json").write_text(json.dumps({
        "approved": approved, "filename": path.name, "source_url": OFFICIAL_URL,
        "publisher": "GeoNames", "license": "CC BY 4.0",
        "approval_scope": "local_place_lookup_only",
        "rights_evidence_url": "https://download.geonames.org/export/dump/readme.txt",
        "retrieved_at": "2026-10-28T00:00:00Z", "sha256": checksum or digest,
    }), encoding="utf-8")
    return path


def row(geoname_id, name, country="ZZ", zone="Etc/UTC", admin1="", aliases="", population=0):
    fields = [str(geoname_id), name, name, aliases, "10.0", "20.0", "P", "PPL", country,
              "", admin1, "", "", "", str(population), "", "", zone, "2026-01-01"]
    return "\t".join(fields)


def test_missing_catalog_file_fails_closed(tmp_path):
    with pytest.raises(BirthResolutionError, match="catalog file is missing"):
        resolve_birth(tmp_path, "2000-01-01", "Test City, ZZ", "12:00")


def test_missing_catalog_manifest_fails_closed(tmp_path):
    path = catalog(tmp_path, [row(1, "Test City")])
    path.parent.parent.joinpath("manifests", "geonames_cities15000.json").unlink()
    with pytest.raises(BirthResolutionError, match="manifest is missing"):
        resolve_birth(tmp_path, "2000-01-01", "Test City, ZZ", "12:00")


def test_unapproved_or_corrupt_catalog_fails_closed(tmp_path):
    path = catalog(tmp_path, [row(1, "Test City")], approved=False)
    with pytest.raises(BirthResolutionError, match="not approved"):
        resolve_birth(tmp_path, "2000-01-01", "Test City, ZZ", "12:00")
    catalog(tmp_path, [row(1, "Test City")], checksum="0" * 64)
    with pytest.raises(BirthResolutionError, match="checksum mismatch"):
        resolve_birth(tmp_path, "2000-01-01", "Test City, ZZ", "12:00")
    assert path.is_file()


def test_ambiguous_place_fails_closed(tmp_path):
    catalog(tmp_path, [row(1, "Test City"), row(2, "Test City")])
    with pytest.raises(BirthResolutionError, match="ambiguous"):
        resolve_birth(tmp_path, "2000-01-01", "Test City, ZZ", "12:00")


def test_synthetic_place_and_time_produce_limited_experimental_chart(monkeypatch, tmp_path):
    catalog(tmp_path, [row(1, "Test City")])
    monkeypatch.setattr("jyotisha_ai.birth_resolution._pinned_zone", lambda _: timezone.utc)
    result = birth_input_status({"dob": "2000-01-01", "pob": "Test City, ZZ", "tob": "12:00"}, tmp_path)
    assert result["status"] == "experimental_chart"
    assert result["chart"]["validation_status"] == "limited_two_synthetic_case_comparison_not_general_validation"
    assert result["chart"]["input"]["ayanamsha_id"] == "lahiri_iae1985_true_1956_iau1976_wahr1980_v1"
    assert result["resolved_birth"]["utc_datetime"] == "2000-01-01T12:00:00+00:00"
    assert result["resolved_birth"]["place"]["geoname_id"] == "1"
    assert birth_chart_readiness(tmp_path)["can_calculate"] is True


def test_chart_runtime_failure_returns_no_values(monkeypatch, tmp_path):
    catalog(tmp_path, [row(1, "Test City")])
    monkeypatch.setattr("jyotisha_ai.birth_resolution._pinned_zone", lambda _: timezone.utc)
    from jyotisha_ai.chart_validation import ChartValidationError
    def rejected():
        raise ChartValidationError("synthetic reference mismatch")
    monkeypatch.setattr("jyotisha_ai.webapp.validate_local_chart_runtime", rejected)
    result = birth_input_status({"dob": "2000-01-01", "pob": "Test City, ZZ", "tob": "12:00"}, tmp_path)
    assert result["status"] == "calculation_unavailable"
    assert result["chart"] is None
    assert "synthetic reference mismatch" in result["message"]
    assert birth_chart_readiness(tmp_path)["can_calculate"] is False


def test_natural_india_region_name_matches_only_documented_admin_code(monkeypatch, tmp_path):
    catalog(tmp_path, [row(1, "Test City", "IN", admin1="40"),
                       row(2, "Test City", "IN", admin1="02")])
    monkeypatch.setattr("jyotisha_ai.birth_resolution._pinned_zone", lambda _: timezone.utc)
    resolved = resolve_birth(tmp_path, "2000-01-01", "Test City, Telangana, India", "12:00")
    assert resolved["place"]["geoname_id"] == "1"


def test_unknown_region_is_not_silently_ignored(tmp_path):
    catalog(tmp_path, [row(1, "Test City", "IN", admin1="40")])
    with pytest.raises(BirthResolutionError, match="cannot be ignored"):
        resolve_birth(tmp_path, "2000-01-01", "Test City, Unknown Region, India", "12:00")


def test_offline_prefix_suggestions_are_resolvable_and_omit_ambiguity(tmp_path):
    catalog(tmp_path, [row(1, "Test City"), row(2, "Test City"),
                       row(3, "Testville"), row(4, "Another City")])
    assert suggest_places(tmp_path, "te") == [{"label": "Testville, ZZ", "value": "Testville, ZZ"}]
    assert suggest_places(tmp_path, "t") == []
    assert suggest_places(tmp_path, "another") == [{"label": "Another City, ZZ", "value": "Another City, ZZ"}]
    with pytest.raises(BirthResolutionError, match="printable"):
        suggest_places(tmp_path, "bad\ncity")


def test_place_suggestions_require_approved_catalog(tmp_path):
    catalog(tmp_path, [row(1, "Test City")], approved=False)
    with pytest.raises(BirthResolutionError, match="not approved"):
        suggest_places(tmp_path, "test")


def test_catalog_alternate_name_resolves_to_canonical_place(tmp_path):
    catalog(tmp_path, [row(1, "Bengaluru", "IN", aliases="BLR,Bangalore")])
    assert suggest_places(tmp_path, "blr") == [
        {"label": "Bengaluru, IN", "value": "Bengaluru, IN"}]
    assert resolve_birth(tmp_path, "2000-01-01", "blr", "12:00")["place"]["name"] == "Bengaluru"
    assert resolve_birth(tmp_path, "2000-01-01", "Bangalore", "12:00")["place"]["name"] == "Bengaluru"


def test_exact_alternate_name_ranks_ahead_of_larger_prefix_match(tmp_path):
    catalog(tmp_path, [row(1, "Bengaluru", "IN", aliases="BLR"),
                       row(2, "Larger City", "ZZ", aliases="BLRtown", population=1_000_000)])
    assert suggest_places(tmp_path, "blr")[0]["value"] == "Bengaluru, IN"


def test_ambiguous_alternate_name_is_rejected(tmp_path):
    catalog(tmp_path, [row(1, "One City", aliases="XYZ"), row(2, "Another City", aliases="XYZ")])
    with pytest.raises(BirthResolutionError, match="ambiguous"):
        resolve_birth(tmp_path, "2000-01-01", "XYZ", "12:00")


def test_nearby_city_is_only_an_approximate_candidate(tmp_path):
    catalog(tmp_path, [row(1, "Test City"), row(2, "Far City")])
    candidate = nearby_place(tmp_path, 10.0, 20.0)
    assert candidate == {"value": "Test City, ZZ", "distance_km": 0.0,
                         "status": "approximate_nearby_city"}
    assert nearby_place(tmp_path, 11.0, 20.0) is None
    with pytest.raises(BirthResolutionError, match="coordinates"):
        nearby_place(tmp_path, float("nan"), 20.0)


def test_nearby_city_requires_approved_catalog(tmp_path):
    catalog(tmp_path, [row(1, "Test City")], approved=False)
    with pytest.raises(BirthResolutionError, match="not approved"):
        nearby_place(tmp_path, 10.0, 20.0)


def test_pre_1970_history_requires_confirmation(tmp_path):
    with pytest.raises(BirthResolutionError, match="pre-1970"):
        resolve_birth(tmp_path, "1950-01-01", "Test City, ZZ", "12:00")


def test_pinned_tzdata_is_available_and_utc_is_exact():
    assert datetime(2024, 1, 1, tzinfo=_pinned_zone("Etc/UTC")).utcoffset() == timedelta(0)


def test_dst_overlap_fails_closed(tmp_path):
    catalog(tmp_path, [row(1, "Test City", "ZZ", "America/New_York")])
    with pytest.raises(BirthResolutionError, match="ambiguous"):
        resolve_birth(tmp_path, "2024-11-03", "Test City, ZZ", "01:30")


def test_dst_gap_fails_closed(tmp_path):
    catalog(tmp_path, [row(1, "Test City", "ZZ", "America/New_York")])
    with pytest.raises(BirthResolutionError, match="does not exist"):
        resolve_birth(tmp_path, "2024-03-10", "Test City, ZZ", "02:30")
