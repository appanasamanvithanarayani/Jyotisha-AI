"""Offline, fail-closed birthplace and civil-time resolution.

GeoNames is a place catalog, not proof of a historical birth location. The
catalog and IANA timezone data must both be present and pinned locally.
"""

from __future__ import annotations

from datetime import datetime, timezone
import hashlib
from importlib.resources import files
import json
import math
from pathlib import Path
from zoneinfo import ZoneInfo
from zipfile import BadZipFile, ZipFile


CATALOG_NAME = "cities15000.zip"
MANIFEST_NAME = "geonames_cities15000.json"
OFFICIAL_URL = "https://download.geonames.org/export/dump/cities15000.zip"
PINNED_TZDATA_VERSION = "2026.5"
# Exact administrative aliases documented by GeoNames. Do not treat this as
# a worldwide place-name translator or infer unlisted regions.
COUNTRY_ALIASES = {"india": "in"}
ADMIN1_ALIASES = {("in", "telangana"): "40"}


class BirthResolutionError(ValueError):
    """No chart may be calculated from an unresolved birth input."""


def _approved_catalog(root: Path) -> Path:
    path = root / "data" / "raw" / CATALOG_NAME
    manifest_path = root / "data" / "manifests" / MANIFEST_NAME
    if not path.is_file():
        raise BirthResolutionError("official GeoNames catalog file is missing; install it before creating an approval manifest")
    if not manifest_path.is_file():
        raise BirthResolutionError("approved GeoNames catalog manifest is missing")
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise BirthResolutionError("GeoNames manifest is unreadable") from exc
    if not isinstance(manifest, dict) or manifest.get("approved") is not True:
        raise BirthResolutionError("GeoNames catalog is not approved")
    if manifest.get("source_url") != OFFICIAL_URL or manifest.get("filename") != CATALOG_NAME:
        raise BirthResolutionError("GeoNames provenance does not match the official catalog")
    if manifest.get("publisher") != "GeoNames" or manifest.get("license") != "CC BY 4.0" or not manifest.get("retrieved_at"):
        raise BirthResolutionError("GeoNames attribution or retrieval provenance is incomplete")
    if manifest.get("approval_scope") != "local_place_lookup_only" or manifest.get("rights_evidence_url") != "https://download.geonames.org/export/dump/readme.txt":
        raise BirthResolutionError("GeoNames lookup approval scope or rights evidence is incomplete")
    expected = manifest.get("sha256")
    if not isinstance(expected, str) or len(expected) != 64 or any(c not in "0123456789abcdef" for c in expected):
        raise BirthResolutionError("GeoNames manifest needs a lowercase SHA-256")
    try:
        with path.open("rb") as stream:
            digest = hashlib.file_digest(stream, "sha256").hexdigest()
    except OSError as exc:
        raise BirthResolutionError("GeoNames catalog is unreadable") from exc
    if digest != expected:
        raise BirthResolutionError("GeoNames catalog checksum mismatch")
    return path


def _matching_places(path: Path, query: str) -> list[dict]:
    parts = [part.strip().casefold() for part in query.split(",")]
    if not 1 <= len(parts) <= 3 or not all(parts):
        raise BirthResolutionError("place must be 'City', 'City, country', or 'City, region, country'")
    country = COUNTRY_ALIASES.get(parts[-1], parts[-1]) if len(parts) > 1 else None
    if country is not None and (len(country) != 2 or not country.isascii() or not country.isalpha()):
        raise BirthResolutionError("country name is not in the reviewed local alias list; use its ISO code")
    region = None
    if len(parts) == 3:
        region = ADMIN1_ALIASES.get((country, parts[1]))
        if region is None:
            raise BirthResolutionError("region name is not in the reviewed local alias list; it cannot be ignored")
    matches = []
    try:
        with ZipFile(path) as archive, archive.open("cities15000.txt") as stream:
            for raw in stream:
                row = raw.decode("utf-8").rstrip("\n\r").split("\t")
                if len(row) < 18:
                    raise BirthResolutionError("GeoNames catalog row is malformed")
                names = {name.casefold() for name in (row[1], row[2], *row[3].split(",")) if name}
                if parts[0] not in names or (country is not None and row[8].casefold() != country) or (region is not None and row[10] != region):
                    continue
                try:
                    latitude, longitude = float(row[4]), float(row[5])
                except ValueError as exc:
                    raise BirthResolutionError("GeoNames coordinates are malformed") from exc
                if not (-90 <= latitude <= 90 and -180 <= longitude <= 180) or not row[17]:
                    raise BirthResolutionError("GeoNames location or timezone is invalid")
                matches.append({"geoname_id": row[0], "name": row[1], "country_code": row[8],
                                "latitude": latitude, "longitude": longitude, "timezone": row[17]})
                if len(matches) > 1:
                    raise BirthResolutionError("place is ambiguous; use a more precise place catalog before calculating")
    except (BadZipFile, KeyError, OSError, UnicodeError) as exc:
        raise BirthResolutionError("GeoNames catalog is unreadable or malformed") from exc
    if not matches:
        raise BirthResolutionError("place not found in the approved offline catalog")
    return matches


def suggest_places(root: Path, query: str, limit: int = 10) -> list[dict]:
    """Suggest only unambiguous exact values from the approved offline catalog."""
    if not isinstance(query, str) or len(query) > 80 or any(ord(c) < 32 for c in query):
        raise BirthResolutionError("place search must be printable text under 81 characters")
    prefix = query.split(",", 1)[0].strip().casefold()
    if len(prefix) < 2:
        return []
    path = _approved_catalog(root)
    groups: dict[tuple[str, str], list[tuple[str, str, int, bool]]] = {}
    try:
        with ZipFile(path) as archive, archive.open("cities15000.txt") as stream:
            for raw in stream:
                row = raw.decode("utf-8").rstrip("\n\r").split("\t")
                if len(row) < 18:
                    raise BirthResolutionError("GeoNames catalog row is malformed")
                variants = {name.casefold() for name in (row[1], row[2], *row[3].split(",")) if name}
                if not any(name.startswith(prefix) for name in variants):
                    continue
                try:
                    population = int(row[14])
                except ValueError:
                    population = 0
                key = (row[1].casefold(), row[8].casefold())
                groups.setdefault(key, []).append((row[1], row[10], population, prefix in variants))
    except (BadZipFile, KeyError, OSError, UnicodeError) as exc:
        raise BirthResolutionError("GeoNames catalog is unreadable or malformed") from exc
    suggestions = []
    for (_, country), group in groups.items():
        if len(group) == 1:
            name, _admin1, population, exact = group[0]
            value = f"{name}, {country.upper()}"
            suggestions.append((exact, population, value))
        elif country == "in":
            telangana = [item for item in group if item[1] == "40"]
            if len(telangana) == 1:
                name, _admin1, population, exact = telangana[0]
                suggestions.append((exact, population, f"{name}, Telangana, India"))
    suggestions.sort(key=lambda item: (-item[0], -item[1], item[2].casefold()))
    return [{"label": value, "value": value} for _exact, _population, value in suggestions[:limit]]


def nearby_place(root: Path, latitude: float, longitude: float) -> dict | None:
    """Suggest, never assert, the nearest catalog city within 25 km."""
    if (isinstance(latitude, bool) or isinstance(longitude, bool)
            or not all(isinstance(v, (int, float)) and math.isfinite(v) for v in (latitude, longitude))
            or not -90 <= latitude <= 90 or not -180 <= longitude <= 180):
        raise BirthResolutionError("location coordinates are invalid")
    path = _approved_catalog(root)
    closest = None
    try:
        with ZipFile(path) as archive, archive.open("cities15000.txt") as stream:
            for raw in stream:
                row = raw.decode("utf-8").rstrip("\n\r").split("\t")
                if len(row) < 18:
                    raise BirthResolutionError("GeoNames catalog row is malformed")
                try:
                    city_lat, city_lon = float(row[4]), float(row[5])
                except ValueError as exc:
                    raise BirthResolutionError("GeoNames coordinates are malformed") from exc
                if not (math.isfinite(city_lat) and math.isfinite(city_lon)
                        and -90 <= city_lat <= 90 and -180 <= city_lon <= 180):
                    raise BirthResolutionError("GeoNames coordinates are malformed")
                phi1, phi2 = math.radians(latitude), math.radians(city_lat)
                dphi, dlambda = phi2 - phi1, math.radians(city_lon - longitude)
                arc = 2 * math.asin(min(1, math.sqrt(
                    math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2)))
                distance = 6371.0088 * arc
                if distance <= 25 and (closest is None or distance < closest[0]):
                    closest = (distance, row[1], row[8])
    except (BadZipFile, KeyError, OSError, UnicodeError) as exc:
        raise BirthResolutionError("GeoNames catalog is unreadable or malformed") from exc
    if closest is None:
        return None
    distance, name, country = closest
    value = f"{name}, {country.upper()}"
    # A nearby entry is not useful if its name resolves to multiple cities.
    try:
        _matching_places(path, value)
    except BirthResolutionError:
        return None
    return {"value": value, "distance_km": round(distance, 1), "status": "approximate_nearby_city"}


def _pinned_zone(key: str) -> ZoneInfo:
    """Load the exact Python tzdata release, never the host's implicit database."""
    try:
        import tzdata
        if tzdata.__version__ != PINNED_TZDATA_VERSION:
            raise BirthResolutionError("installed IANA tzdata version is not the approved pin")
        if not key or any(part in ("", ".", "..") for part in key.split("/")):
            raise BirthResolutionError("catalog time-zone identifier is invalid")
        resource = files("tzdata.zoneinfo").joinpath(*key.split("/"))
        with resource.open("rb") as stream:
            return ZoneInfo.from_file(stream, key=key)
    except (ImportError, FileNotFoundError, OSError) as exc:
        raise BirthResolutionError("pinned IANA time-zone data is unavailable") from exc


def resolve_birth(root: Path, dob: str, pob: str, tob: str) -> dict:
    """Return provenance-bearing location and UTC instant, never chart values."""
    if int(dob[:4]) < 1970:
        raise BirthResolutionError("pre-1970 local-time history needs independent confirmation")
    path = _approved_catalog(root)
    place = _matching_places(path, pob)[0]
    zone = _pinned_zone(place["timezone"])
    local_naive = datetime.fromisoformat(f"{dob}T{tob}")
    candidates = [local_naive.replace(tzinfo=zone, fold=fold) for fold in (0, 1)]
    valid = [moment for moment in candidates
             if moment.astimezone(timezone.utc).astimezone(zone).replace(tzinfo=None) == local_naive]
    if not valid:
        raise BirthResolutionError("local birth time does not exist in this time zone")
    if len(valid) == 2 and valid[0].utcoffset() != valid[1].utcoffset():
        raise BirthResolutionError("local birth time is ambiguous because clocks moved; offset confirmation is required")
    moment = valid[0]
    return {"place": place, "local_datetime": moment.isoformat(),
            "utc_datetime": moment.astimezone(timezone.utc).isoformat(),
            "catalog": "GeoNames cities15000, approved local SHA-256 manifest",
            "timezone_source": f"Python tzdata {PINNED_TZDATA_VERSION} (IANA tzdb 2026e)"}
