"""Local-only research app with optional server-side external chat."""

from __future__ import annotations

from calendar import monthrange
import base64
import binascii
from datetime import date, datetime, time, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from importlib.resources import files
import hmac
import ipaddress
import html
import json
import math
import re
import time as clock_time
from collections import deque
from threading import Lock
import os
from pathlib import Path
import secrets
from threading import Timer
from urllib.parse import urlsplit

from jyotisha_ai import assistant
from jyotisha_ai.ayanamsha import AyanamshaUnavailableError, TRUE_METHOD_ID, true_lahiri_for_utc
from jyotisha_ai.birth_resolution import BirthResolutionError, _approved_catalog, _matching_places, _pinned_zone, nearby_place, resolve_birth, suggest_places
from jyotisha_ai.chart import calculate_chart
from jyotisha_ai.kundli_details import kundli_details
from jyotisha_ai.day_panchang import DayPanchangError, day_panchang, month_calendar
from jyotisha_ai.chart_validation import ChartValidationError, validate_local_chart_runtime
from jyotisha_ai.knowledge.catalog import load_knowledge
from jyotisha_ai.knowledge.inventory import inventory_report


MAX_REQUEST_BYTES = 8192
PUBLIC_API_PER_MINUTE = 120
PUBLIC_ASK_PER_MINUTE = 8
PUBLIC_ASK_PER_DAY = 60


class TTLCache:
    """Small in-memory cache of finished calculations (the same date and city always gives the same Panchang)."""

    def __init__(self, max_entries: int = 4000, ttl_seconds: float = 1800.0) -> None:
        self._items: dict[object, tuple[float, object]] = {}
        self._max, self._ttl = max_entries, ttl_seconds
        self._lock = Lock()

    def get(self, key: object, now: float | None = None):
        now = clock_time.monotonic() if now is None else now
        with self._lock:
            hit = self._items.get(key)
            if hit is None or now - hit[0] >= self._ttl:
                self._items.pop(key, None)
                return None
            return hit[1]

    def put(self, key: object, value: object, now: float | None = None) -> None:
        now = clock_time.monotonic() if now is None else now
        with self._lock:
            if len(self._items) >= self._max:
                self._items.pop(next(iter(self._items)))   # drop the oldest entry
            self._items[key] = (now, value)


_RESULT_CACHE = TTLCache()


class RateLimiter:
    """Small in-memory sliding-window limiter; fine for one instance, use one per process."""

    def __init__(self) -> None:
        self._hits: dict[str, deque] = {}
        self._lock = Lock()

    def allow(self, key: str, limit: int, window_seconds: float, now: float | None = None) -> bool:
        now = clock_time.monotonic() if now is None else now
        with self._lock:
            hits = self._hits.setdefault(key, deque())
            while hits and now - hits[0] >= window_seconds:
                hits.popleft()
            if len(hits) >= limit:
                return False
            hits.append(now)
            if len(self._hits) > 20000:   # forget idle clients so memory stays bounded
                for stale in [name for name, queue in self._hits.items() if not queue or now - queue[-1] >= window_seconds][:10000]:
                    self._hits.pop(stale, None)
            return True
MAX_ASK_BYTES = 49152  # chart facts for the optional assistant
DEFAULT_PORT = 8765
PRIVATE_LAN_RANGES = tuple(ipaddress.IPv4Network(value) for value in ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"))


def _validated_bind_host(host: str) -> str:
    """Permit only loopback or an exact RFC1918 IPv4 address, never a wildcard."""
    if host == "127.0.0.1":
        return host
    try:
        address = ipaddress.IPv4Address(host)
    except ipaddress.AddressValueError as exc:
        raise ValueError("LAN IP must be an explicit private IPv4 address") from exc
    if not any(address in network for network in PRIVATE_LAN_RANGES):
        raise ValueError("LAN IP must be an explicit private IPv4 address")
    return str(address)


BASE_CSP = ("default-src 'none'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data:; manifest-src 'self'; "
            "worker-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'")
ADS_SCRIPT = "https://pagead2.googlesyndication.com https://*.googlesyndication.com https://www.googletagservices.com https://partner.googleadservices.com https://fundingchoicesmessages.google.com https://*.adtrafficquality.google"
ADS_FRAME = "https://googleads.g.doubleclick.net https://*.googlesyndication.com https://tpc.googlesyndication.com https://www.google.com https://fundingchoicesmessages.google.com https://*.adtrafficquality.google"
ADS_CONNECT = "https://pagead2.googlesyndication.com https://*.googlesyndication.com https://*.doubleclick.net https://*.google.com https://fundingchoicesmessages.google.com https://*.adtrafficquality.google"


def _adsense_client() -> str:
    """Google AdSense publisher id (ca-pub-...) from JYOTISHA_ADSENSE_CLIENT, or '' while ads are off (the default)."""
    value = os.environ.get("JYOTISHA_ADSENSE_CLIENT", "").strip()
    return value if re.fullmatch(r"ca-pub-\d{10,20}", value) else ""


TEST_BANNER_ID = "ca-app-pub-3940256099942544/6300978111"   # Google's public test banner unit


def _app_ads() -> dict | None:
    """Settings for the banner shown by the native Android app (AdMob), or None while it is switched off (the default).

    JYOTISHA_APP_ADS=1 switches it on and 0/unset off, with no app update needed. JYOTISHA_ADMOB_BANNER_ID is your own
    banner unit (ca-app-pub-<16 digits>/<10 digits>); without it Google's test banner is used and the ads are test ads.
    """
    if os.environ.get("JYOTISHA_APP_ADS", "").strip() != "1":
        return None
    unit = os.environ.get("JYOTISHA_ADMOB_BANNER_ID", "").strip()
    if re.fullmatch(r"ca-app-pub-\d{16}/\d{10}", unit) and unit != TEST_BANNER_ID:
        return {"enabled": True, "banner_id": unit, "testing": os.environ.get("JYOTISHA_ADMOB_TESTING", "").strip() == "1"}
    return {"enabled": True, "banner_id": TEST_BANNER_ID, "testing": True}


def _content_security_policy() -> str:
    if not _adsense_client():
        return BASE_CSP
    return (BASE_CSP.replace("script-src 'self' 'unsafe-inline'", f"script-src 'self' 'unsafe-inline' {ADS_SCRIPT}")
            .replace("img-src 'self' data:", "img-src 'self' data: https:")
            .replace("connect-src 'self'", f"connect-src 'self' {ADS_CONNECT}") + f"; frame-src {ADS_FRAME}")


def _privacy_ads_item() -> str:
    if not _adsense_client() and _app_ads():
        return ("<li><b>Advertising.</b> The Android app shows ads from Google AdMob. Google and its partners may use an advertising identifier or similar technologies "
                "to serve and measure ads and, where you agree, to personalise them. You can reset or opt out of ad personalisation in your Android settings "
                "(Settings → Google → Ads), and manage consent in the app when asked. We do not run our own analytics and do not sell data. Our hosting provider may keep "
                "standard technical request records (such as IP address and time) for a short period for security.</li>")
    if not _adsense_client():
        return "<li>We do not run advertising or analytics and do not sell data. Our hosting provider may keep standard technical request records (such as IP address and time) for a short period for security.</li>"
    return ("<li><b>Advertising.</b> This site shows ads from Google AdSense. Google and its partners may use cookies or similar technologies to serve and measure ads, "
            "and, where you agree, to personalise them. You can manage this through the consent message shown to you, and see or change your ad settings at "
            "<a href=\"https://adssettings.google.com\">adssettings.google.com</a>; see also <a href=\"https://policies.google.com/technologies/ads\">how Google uses data from sites that use its services</a>. "
            "We do not run our own analytics and do not sell data. Our hosting provider may keep standard technical request records (such as IP address and time) for a short period for security.</li>")


def _asset_links() -> list | None:
    """Digital Asset Links for the Android wrapper (Trusted Web Activity); None until it is configured.

    Set JYOTISHA_ANDROID_PACKAGE (e.g. com.example.jyotisha) and JYOTISHA_ANDROID_SHA256 (the app signing
    certificate fingerprint(s) from Play Console, comma separated, like AB:CD:...).
    """
    package = os.environ.get("JYOTISHA_ANDROID_PACKAGE", "").strip()
    prints = [item.strip().upper() for item in os.environ.get("JYOTISHA_ANDROID_SHA256", "").split(",") if item.strip()]
    if not package or not prints or not re.fullmatch(r"[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+", package) or not all(re.fullmatch(r"([0-9A-F]{2}:){31}[0-9A-F]{2}", item) for item in prints):
        return None
    return [{"relation": ["delegate_permission/common.handle_all_urls"], "target": {"namespace": "android_app", "package_name": package, "sha256_cert_fingerprints": prints}}]


def _project_root() -> Path:
    """Folder holding data/. JYOTISHA_HOME wins (installed images); otherwise the source checkout."""
    configured = os.environ.get("JYOTISHA_HOME")
    return Path(configured).resolve() if configured else Path(__file__).resolve().parents[2]


def research_status(root: Path) -> dict:
    """Return review metadata, not unreviewed claims or source text."""
    inventory = inventory_report(root)
    _, knowledge = load_knowledge(root)
    return {
        "inventory_areas": inventory.get("areas", 0),
        "inventory_by_status": inventory.get("by_status", {}),
        "knowledge_records": knowledge.get("records", 0),
        "knowledge_by_review_status": knowledge.get("by_review_status", {}),
        "chart_validation_status": "limited_two_synthetic_case_comparison",
        "ai_model_status": "not_trained",
        "predictions_available": False,
    }


def _interface_languages() -> list[str]:
    """Locale codes shipped with the page; only English has been reviewed."""
    names = sorted(item.name[:-3] for item in files("jyotisha_ai.web").joinpath("locales").iterdir() if item.name.endswith(".js"))
    return ["en"] + [code for code in names if code != "en"]


def deployment_readiness() -> dict:
    """Public-launch gate; liveness and local usability do not imply readiness."""
    return {
        "public_deployment_ready": False,
        "blockers": [
            "The local HTTP server has no production TLS, authentication, or rate limiting.",
            "Birth-data privacy and retention controls have not been reviewed for public use.",
            "Only two synthetic chart cases have been compared; production accuracy is not established.",
            "No reviewed multilingual Jyotisha model or interpretation service exists.",
        ],
        "supported_interface_languages": _interface_languages(),
        "reviewed_interface_languages": ["en"],
        "arbitrary_language_support": False,
    }


def birth_chart_readiness(root: Path) -> dict:
    """Tell the UI its blockers before collecting any birth details."""
    blockers = []
    try:
        _approved_catalog(root)
    except BirthResolutionError as exc:
        blockers.append(str(exc))
    try:
        _pinned_zone("Etc/UTC")
    except BirthResolutionError as exc:
        blockers.append(str(exc))
    try:
        validate_local_chart_runtime()
    except (ChartValidationError, AyanamshaUnavailableError) as exc:
        blockers.append(str(exc))
    return {
        "can_calculate": not blockers,
        "blockers": blockers,
        "message": (
            "Local experimental chart calculation is available; results are not verified for general use."
            if not blockers else "Birth-chart calculation is unavailable. Do not enter personal birth details yet."
        ),
        "validation_scope": "two synthetic sidereal chart comparisons; not all dates, places, or Jathakam features",
    }


def birth_input_status(payload: object, root: Path | None = None) -> dict:
    """Validate the three user inputs; never infer missing chart settings."""
    if not isinstance(payload, dict):
        raise ValueError("request must be a JSON object")
    if set(payload) != {"dob", "pob", "tob"}:
        raise ValueError("provide only dob, pob, and tob")
    dob, pob, tob = (payload[key] for key in ("dob", "pob", "tob"))
    if not isinstance(dob, str) or len(dob) != 10:
        raise ValueError("dob must be an ISO date (YYYY-MM-DD)")
    if not isinstance(tob, str) or len(tob) not in (5, 8):
        raise ValueError("tob must be a 24-hour local time (HH:MM or HH:MM:SS)")
    if not isinstance(pob, str) or not 2 <= len(pob.strip()) <= 200 or any(ord(c) < 32 for c in pob):
        raise ValueError("pob must be a nonempty place name without control characters")
    try:
        parsed_date = date.fromisoformat(dob)
        time.fromisoformat(tob)
    except ValueError as exc:
        raise ValueError("invalid dob or tob") from exc
    if not 1800 <= parsed_date.year <= 2100:
        raise ValueError("supported birth year range is 1800–2100")
    try:
        resolved = resolve_birth(root or _project_root(), dob, pob, tob)
    except BirthResolutionError as exc:
        return {
            "status": "resolution_unavailable",
            "chart": None,
            "message": f"No chart was calculated: {exc}.",
            "required_before_calculation": [
                "A verified, unambiguous offline birthplace and historical time-zone resolution",
                "A documented, independently validated ayanamsha calculation convention",
            ],
        }
    try:
        validate_local_chart_runtime()
        moment = datetime.fromisoformat(resolved["local_datetime"])
        ayanamsha, tt_jd = true_lahiri_for_utc(moment)
        place = resolved["place"]
        chart = calculate_chart(moment, place["latitude"], place["longitude"], ayanamsha, TRUE_METHOD_ID)
    except (ChartValidationError, AyanamshaUnavailableError, ValueError) as exc:
        return {
            "status": "calculation_unavailable", "chart": None,
            "message": f"No chart was calculated: {exc}.",
        }
    chart["validation_status"] = "limited_two_synthetic_case_comparison_not_general_validation"
    chart["input"]["ayanamsha_source"] = "IAE 1985 Lahiri true epoch; IAU1976 precession; Wahr1980 nutation via PyERFA 2.0.1.5"
    chart["input"]["ayanamsha_tt_julian_date"] = tt_jd
    chart["conventions"]["ayanamsha"] = TRUE_METHOD_ID
    chart["conventions"]["limitations"] = "Experimental; two synthetic reference charts only; mean-node Rahu/Ketu and Navamsa are display details; no other Vargas, house cusps, or interpretation"
    try:
        details = kundli_details(chart, moment)
    except (ValueError, KeyError, ArithmeticError):
        details = None  # the validated chart is still returned without the extra details
    return {
        "status": "experimental_chart", "chart": chart, "details": details, "resolved_birth": resolved,
        "message": "Experimental local chart calculated. Do not treat it as a verified Jathakam or prediction.",
    }


def panchang_noon_status(payload: object, root: Path | None = None) -> dict:
    """Expose only experimental local-noon indices; not a daily Panchang."""
    if not isinstance(payload, dict) or set(payload) != {"date", "place"}:
        raise ValueError("provide only date and place")
    selected_date, place = payload["date"], payload["place"]
    if not isinstance(selected_date, str) or len(selected_date) != 10:
        raise ValueError("date must be YYYY-MM-DD")
    if not isinstance(place, str):
        raise ValueError("place must be a city name")
    outcome = birth_input_status({"dob": selected_date, "pob": place, "tob": "12:00"}, root)
    if outcome.get("chart") is None:
        return {"status": outcome["status"], "indices": None, "message": outcome["message"]}
    chart = outcome["chart"]
    indices = chart["panchanga_at_birth"]
    return {
        "status": "experimental_noon_indices",
        "date": selected_date,
        "place": outcome["resolved_birth"]["place"]["name"],
        "local_datetime": outcome["resolved_birth"]["local_datetime"],
        "indices": {
            "tithi_index": indices["tithi_index"],
            "nakshatra_index": indices["nakshatra_index"],
            "nakshatra_pada": indices["nakshatra_pada"],
            "yoga_index": indices["yoga_index"],
            "karana_half_tithi_index": indices["karana_half_tithi_index"],
            "civil_weekday_index_sunday_first": indices["civil_weekday_index_sunday_first"],
        },
        "method": chart["conventions"]["ephemeris"] + "; " + chart["input"]["ayanamsha_id"],
        "message": "Experimental indices at local noon; not a sunrise-based daily Panchang. No transition times, lunar month, or festival dates are calculated.",
    }


def panchang_month_status(payload: object, root: Path | None = None) -> dict:
    """Calculate each civil date's local-noon indices; never claim sunrise Panchang."""
    if not isinstance(payload, dict) or set(payload) != {"year", "month", "place"}:
        raise ValueError("provide only year, month, and place")
    year, month, place_query = payload["year"], payload["month"], payload["place"]
    if type(year) is not int or type(month) is not int or not 1970 <= year <= 2100 or not 1 <= month <= 12:
        raise ValueError("year must be 1970..2100 and month must be 1..12")
    if not isinstance(place_query, str) or not 2 <= len(place_query.strip()) <= 200 or any(ord(c) < 32 for c in place_query):
        raise ValueError("place must be a city name without control characters")
    try:
        catalog = _approved_catalog(root or _project_root())
        place = _matching_places(catalog, place_query)[0]
        zone = _pinned_zone(place["timezone"])
        validate_local_chart_runtime()
        days = []
        for day in range(1, monthrange(year, month)[1] + 1):
            naive = datetime(year, month, day, 12, 0)
            candidates = [naive.replace(tzinfo=zone, fold=fold) for fold in (0, 1)]
            valid = [moment for moment in candidates if moment.astimezone(timezone.utc).astimezone(zone).replace(tzinfo=None) == naive]
            if not valid or (len(valid) == 2 and valid[0].utcoffset() != valid[1].utcoffset()):
                raise BirthResolutionError("local noon is missing or ambiguous on a calendar date")
            moment = valid[0]
            ayanamsha, _ = true_lahiri_for_utc(moment)
            chart = calculate_chart(moment, place["latitude"], place["longitude"], ayanamsha, TRUE_METHOD_ID)
            indices = chart["panchanga_at_birth"]
            days.append({
                "date": naive.date().isoformat(),
                "tithi_index": indices["tithi_index"],
                "nakshatra_index": indices["nakshatra_index"],
                "nakshatra_pada": indices["nakshatra_pada"],
                "yoga_index": indices["yoga_index"],
                "karana_half_tithi_index": indices["karana_half_tithi_index"],
                "civil_weekday_index_sunday_first": indices["civil_weekday_index_sunday_first"],
            })
    except (BirthResolutionError, ChartValidationError, AyanamshaUnavailableError, ValueError) as exc:
        return {"status": "calculation_unavailable", "days": None, "message": f"No calendar was calculated: {exc}."}
    return {
        "status": "experimental_noon_month", "year": year, "month": month,
        "place": place["name"], "country_code": place["country_code"],
        "local_time": "12:00", "timezone": place["timezone"],
        "today_local_date": datetime.now(timezone.utc).astimezone(zone).date().isoformat(),
        "method": f"astronomy-engine 2.1.19; {TRUE_METHOD_ID}; approved GeoNames and pinned IANA tzdata",
        "days": days,
        "message": "Experimental local-noon indices for each date; not sunrise Panchang, transition times, lunar months, festivals, or predictions.",
    }


def day_panchang_status(payload: object, root: Path | None = None) -> dict:
    """Sunrise-based day Panchang for one date and city; no result on any failure."""
    if not isinstance(payload, dict) or set(payload) != {"date", "place"}:
        raise ValueError("provide only date and place")
    if not isinstance(payload["date"], str) or not isinstance(payload["place"], str):
        raise ValueError("date and place must be text")
    base = root or _project_root()
    key = ("day", str(base), payload["date"].strip(), payload["place"].strip().lower())
    if key is not None and (cached := _RESULT_CACHE.get(key)) is not None:
        return cached
    try:
        day = day_panchang(base, payload["date"], payload["place"])
    except (DayPanchangError, ChartValidationError, AyanamshaUnavailableError) as exc:
        return {"status": "calculation_unavailable", "day": None, "message": f"No day Panchang was calculated: {exc}."}
    result = {"status": day["status"], "day": day, "message": day["message"]}
    if key is not None:
        _RESULT_CACHE.put(key, result)
    return result


def month_calendar_status(payload: object, root: Path | None = None) -> dict:
    """Sunrise Tithi/Nakshatra for every day of a month; no result on any failure."""
    if not isinstance(payload, dict) or set(payload) != {"year", "month", "place"}:
        raise ValueError("provide only year, month, and place")
    base = root or _project_root()
    key = ("month", str(base), payload["year"], payload["month"], payload["place"].strip().lower()) if isinstance(payload["place"], str) and type(payload["year"]) is int and type(payload["month"]) is int else None
    if key is not None and (cached := _RESULT_CACHE.get(key)) is not None:
        return cached
    try:
        result = month_calendar(base, payload["year"], payload["month"], payload["place"])
    except (DayPanchangError, ChartValidationError, AyanamshaUnavailableError) as exc:
        return {"status": "calculation_unavailable", "days": None, "message": f"No calendar was calculated: {exc}."}
    if key is not None:
        _RESULT_CACHE.put(key, result)
    return result


def place_suggestions_status(payload: object, root: Path | None = None) -> dict:
    if not isinstance(payload, dict) or set(payload) != {"query"}:
        raise ValueError("provide only a place query")
    try:
        suggestions = suggest_places(root or _project_root(), payload["query"])
    except BirthResolutionError as exc:
        return {"status": "lookup_unavailable", "suggestions": None, "message": str(exc)}
    return {"status": "ok", "suggestions": suggestions}


def nearby_place_status(payload: object, root: Path | None = None) -> dict:
    if not isinstance(payload, dict) or set(payload) != {"latitude", "longitude"}:
        raise ValueError("provide only latitude and longitude")
    try:
        candidate = nearby_place(root or _project_root(), payload["latitude"], payload["longitude"])
    except BirthResolutionError as exc:
        return {"status": "lookup_unavailable", "candidate": None, "message": str(exc)}
    return {"status": "candidate" if candidate else "no_nearby_city", "candidate": candidate,
            "message": "Confirm the suggested city; current location is not a birth location." if candidate else
            "No approved catalog city within 25 km; enter a city manually."}


def experimental_chart(payload: object) -> dict:
    """Invoke the existing calculator only after explicit acknowledgement.

    No location lookup, offset inference, stored birth record, interpretation,
    training-data export, or alternate astronomy backend is provided.
    """
    if not isinstance(payload, dict):
        raise ValueError("request must be a JSON object")
    if payload.get("experimental_ack") is not True:
        raise ValueError("acknowledge that chart results are experimental and not independently benchmarked")
    required = {"birth_datetime", "latitude", "longitude", "ayanamsha_degrees", "ayanamsha_id", "ayanamsha_source"}
    if not required.issubset(payload):
        raise ValueError("birth date/time, coordinates, and sourced ayanamsha are required")
    if not isinstance(payload["birth_datetime"], str):
        raise ValueError("birth_datetime must be ISO date/time text")
    try:
        moment = datetime.fromisoformat(payload["birth_datetime"])
    except ValueError as exc:
        raise ValueError("invalid birth date/time") from exc
    if moment.tzinfo is None or moment.utcoffset() is None:
        raise ValueError("birth time must contain an explicit UTC offset")
    if abs(moment.utcoffset()) > timedelta(hours=14):
        raise ValueError("UTC offset must be within ±14 hours")
    values = []
    for key in ("latitude", "longitude", "ayanamsha_degrees"):
        value = payload[key]
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
            raise ValueError(f"{key} must be a finite number")
        values.append(float(value))
    ayanamsha_id = payload["ayanamsha_id"]
    source = payload["ayanamsha_source"]
    if not isinstance(ayanamsha_id, str) or not ayanamsha_id.strip() or len(ayanamsha_id) > 120:
        raise ValueError("ayanamsha_id must be a short, nonempty label")
    if not isinstance(source, str) or not source.strip() or len(source) > 300:
        raise ValueError("ayanamsha_source must identify the value's provenance")
    result = calculate_chart(moment, *values, ayanamsha_id.strip())
    result["input"]["ayanamsha_source"] = source.strip()
    result["notice"] = "Experimental calculation only; no independently verified chart or Jyotisha interpretation."
    return result


class LocalServer(ThreadingHTTPServer):
    # On Windows SO_REUSEADDR can permit two listeners on one port, causing
    # requests to alternate between old and new code after a restart.
    allow_reuse_address = False

    def __init__(self, port: int = DEFAULT_PORT, root: Path | None = None, *, bind_host: str = "127.0.0.1", lan_passcode: str | None = None,
                 public: bool = False, allowed_hosts: tuple[str, ...] = (), trust_proxy: bool = False, ask_daily_limit: int = 1000):
        if isinstance(port, bool) or not isinstance(port, int) or not 0 <= port <= 65535:
            raise ValueError("port must be an integer in 0..65535")
        self.public = bool(public)
        if self.public:
            if bind_host not in ("0.0.0.0", "127.0.0.1"):
                raise ValueError("public mode binds 0.0.0.0 (or 127.0.0.1 for tests)")
            host = bind_host
        else:
            host = _validated_bind_host(bind_host)
        self.allowed_hosts = tuple(name.strip().lower() for name in allowed_hosts if name.strip())
        self.trust_proxy = bool(trust_proxy)
        self.ask_daily_limit = int(ask_daily_limit)
        self.limiter = RateLimiter()
        self.lan_enabled = host != "127.0.0.1" and not self.public
        if self.lan_enabled and (not isinstance(lan_passcode, str) or len(lan_passcode) < 16):
            raise ValueError("LAN preview requires a passcode of at least 16 characters")
        self.lan_passcode = lan_passcode if self.lan_enabled else None
        self.project_root = root or _project_root()
        super().__init__((host, port), LocalHandler)


class LocalHandler(BaseHTTPRequestHandler):
    server: LocalServer

    def _local_host(self) -> bool:
        if self.server.public:
            host = (self.headers.get("Host") or "").strip().lower()
            name = host if host.startswith("[") else host.rsplit(":", 1)[0]
            return bool(name) and (not self.server.allowed_hosts or name in self.server.allowed_hosts)
        return self.headers.get("Host") == f"{self.server.server_address[0]}:{self.server.server_port}"

    def _origin_ok(self) -> bool:
        origin = self.headers.get("Origin")
        if origin is None:
            return True
        if self.server.public:
            return urlsplit(origin).netloc.lower() == (self.headers.get("Host") or "").strip().lower()
        return origin == f"http://{self.server.server_address[0]}:{self.server.server_port}"

    def _client(self) -> str:
        if self.server.trust_proxy:
            forwarded = (self.headers.get("X-Forwarded-For") or "").split(",")[0].strip()
            if forwarded:
                return forwarded[:64]
        return self.client_address[0]

    def _limited(self, path: str) -> bool:
        """Public mode only: answer 429 and return True when this client is over its allowance."""
        if not self.server.public or not path.startswith("/api/"):
            return False
        who, limiter = self._client(), self.server.limiter
        allowed = limiter.allow(f"api:{who}", PUBLIC_API_PER_MINUTE, 60.0)
        if allowed and path == "/api/ask":
            today = clock_time.strftime("%Y-%m-%d", clock_time.gmtime())
            allowed = (limiter.allow(f"ask-min:{who}", PUBLIC_ASK_PER_MINUTE, 60.0) and limiter.allow(f"ask-day:{who}", PUBLIC_ASK_PER_DAY, 86400.0)
                       and limiter.allow(f"ask-all:{today}", self.server.ask_daily_limit, 86400.0))
        if not allowed:
            self._json(429, {"error": "too many requests, please try again later"}, {"Retry-After": "60"})
        return not allowed

    def _authorized(self) -> bool:
        if not self.server.lan_enabled:
            return True
        header = self.headers.get("Authorization", "")
        credentials = ""
        if header.startswith("Basic ") and len(header) <= 256:
            try:
                credentials = base64.b64decode(header[6:], validate=True).decode("utf-8")
            except (ValueError, UnicodeError, binascii.Error):
                pass
        username, separator, passcode = credentials.partition(":")
        if separator and hmac.compare_digest(username, "preview") and hmac.compare_digest(passcode, self.server.lan_passcode):
            return True
        self._json(401, {"error": "LAN preview access code required"}, {"WWW-Authenticate": 'Basic realm="Jyotisha LAN Preview"'})
        return False

    def log_message(self, _format: str, *args: object) -> None:
        # Do not log request paths, query strings, or personal birth inputs.
        return

    def _send(self, status: int, body: bytes, content_type: str, extra_headers: dict[str, str] | None = None) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Content-Security-Policy", _content_security_policy())
        if self.server.public and self.headers.get("X-Forwarded-Proto") == "https":
            self.send_header("Strict-Transport-Security", "max-age=31536000")
        for name, value in (extra_headers or {}).items():
            self.send_header(name, value)
        self.end_headers()
        self.wfile.write(body)

    def _json(self, status: int, data: object, extra_headers: dict[str, str] | None = None) -> None:
        self._send(status, json.dumps(data, ensure_ascii=False, allow_nan=False).encode("utf-8"), "application/json; charset=utf-8", extra_headers)

    def do_GET(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler API
        path = urlsplit(self.path).path
        if path == "/healthz":
            self._json(200, {"ok": True})
            return
        if not self._local_host():
            self._json(403, {"error": "local host required"})
            return
        if not self._authorized():
            return
        if self._limited(path):
            return
        if path == "/":
            body = files("jyotisha_ai.web").joinpath("birth.html").read_bytes()
            self._send(200, body, "text/html; charset=utf-8")
        elif path in ("/manifest.webmanifest", "/sw.js"):
            body = files("jyotisha_ai.web").joinpath(path[1:]).read_bytes()
            self._send(200, body, "application/manifest+json" if path.endswith(".webmanifest") else "application/javascript; charset=utf-8")
        elif path in ("/icons/icon-192.png", "/icons/icon-512.png", "/icons/apple-touch-icon.png"):
            self._send(200, files("jyotisha_ai.web").joinpath(path[1:]).read_bytes(), "image/png", {"Cache-Control": "public, max-age=86400"})
        elif path == "/.well-known/assetlinks.json":
            links = _asset_links()
            if links is None:
                self._json(404, {"error": "not found"})
            else:
                self._json(200, links)
        elif path == "/privacy":
            page = files("jyotisha_ai.web").joinpath("privacy.html").read_text(encoding="utf-8")
            page = page.replace("{{ADS_ITEM}}", _privacy_ads_item()).replace("{{DEVELOPER}}", html.escape(os.environ.get("JYOTISHA_DEVELOPER", "Samanvitha")))
            self._send(200, page.replace("{{CONTACT}}", html.escape(os.environ.get("JYOTISHA_CONTACT", "the contact listed on the app store page"))).encode("utf-8"), "text/html; charset=utf-8")
        elif path == "/ads.txt":
            client = _adsense_client()
            if not client:
                self._json(404, {"error": "not found"})
            else:
                self._send(200, f"google.com, pub-{client[len('ca-pub-'):]}, DIRECT, f08c47fec0942fa0\n".encode("utf-8"), "text/plain; charset=utf-8")
        elif path == "/research":
            body = files("jyotisha_ai.web").joinpath("index.html").read_bytes()
            self._send(200, body, "text/html; charset=utf-8")
        elif path == "/locales.js":
            folder = files("jyotisha_ai.web").joinpath("locales")
            parts = sorted((item for item in folder.iterdir() if item.name.endswith(".js")), key=lambda item: (item.name != "en.js", item.name))
            self._send(200, b"\n".join(item.read_bytes() for item in parts), "application/javascript; charset=utf-8")
        elif path in ("/app.js", "/app.css"):
            body = files("jyotisha_ai.web").joinpath(path[1:]).read_bytes()
            self._send(200, body, "application/javascript; charset=utf-8" if path.endswith(".js") else "text/css; charset=utf-8")
        elif path == "/chart-ui.js":
            body = files("jyotisha_ai.web").joinpath("chart-ui.js").read_bytes()
            self._send(200, body, "application/javascript; charset=utf-8")
        elif path == "/calendar-ui.js":
            body = files("jyotisha_ai.web").joinpath("calendar-ui.js").read_bytes()
            self._send(200, body, "application/javascript; charset=utf-8")
        elif path == "/panchang-names.js":
            body = files("jyotisha_ai.web").joinpath("panchang-names.js").read_bytes()
            self._send(200, body, "application/javascript; charset=utf-8")
        elif path == "/api/status":
            self._json(200, research_status(self.server.project_root))
        elif path == "/api/birth-readiness":
            readiness = birth_chart_readiness(self.server.project_root)
            readiness["assistant_available"] = assistant.available()
            readiness["adsense_client"] = _adsense_client() or None
            readiness["app_ads"] = _app_ads()
            contact = os.environ.get("JYOTISHA_CONTACT", "").strip()
            readiness["contact_email"] = contact if re.fullmatch(r"[^@\s<>\"]+@[^@\s<>\"]+\.[^@\s<>\"]+", contact) else None
            self._json(200 if readiness["can_calculate"] else 503, readiness)
        elif path == "/api/deployment-readiness":
            self._json(503, deployment_readiness())
        else:
            self._json(404, {"error": "not found"})

    def do_POST(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler API
        if not self._local_host():
            self._json(403, {"error": "local host required"})
            return
        if not self._authorized():
            return
        path = urlsplit(self.path).path
        if path not in ("/api/chart", "/api/birth-chart", "/api/panchang-noon", "/api/panchang-month", "/api/day-panchang", "/api/month-calendar", "/api/places", "/api/nearby-place", "/api/ask"):
            self._json(404, {"error": "not found"})
            return
        if not self._origin_ok():
            self._json(403, {"error": "cross-origin requests are blocked"})
            return
        if self._limited(path):
            return
        if self.headers.get_content_type() != "application/json":
            self._json(415, {"error": "JSON required"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self._json(400, {"error": "invalid request length"})
            return
        if length <= 0 or length > (MAX_ASK_BYTES if path == "/api/ask" else MAX_REQUEST_BYTES):
            self._json(413, {"error": "request body is too large"})
            return
        try:
            payload = json.loads(self.rfile.read(length))
            if path == "/api/birth-chart":
                result = birth_input_status(payload, self.server.project_root)
            elif path == "/api/panchang-noon":
                result = panchang_noon_status(payload, self.server.project_root)
            elif path == "/api/panchang-month":
                result = panchang_month_status(payload, self.server.project_root)
            elif path == "/api/day-panchang":
                result = day_panchang_status(payload, self.server.project_root)
            elif path == "/api/month-calendar":
                result = month_calendar_status(payload, self.server.project_root)
            elif path == "/api/places":
                result = place_suggestions_status(payload, self.server.project_root)
            elif path == "/api/nearby-place":
                result = nearby_place_status(payload, self.server.project_root)
            elif path == "/api/ask":
                result = assistant.ask_status(payload)
            else:
                result = experimental_chart(payload)
        except (UnicodeError, json.JSONDecodeError, ValueError) as exc:
            self._json(400, {"error": str(exc)})
            return
        self._json(200 if path == "/api/chart" or result.get("chart") is not None or result.get("indices") is not None or result.get("days") is not None or result.get("day") is not None or result.get("suggestions") is not None or result.get("candidate") is not None or result.get("answer") is not None or result.get("status") in ("unconfigured", "unavailable") or result.get("status") == "no_nearby_city" else 422, result)


def serve_public(port: int | None = None) -> None:
    """Internet-facing mode for a container host: HTTPS is terminated by the platform in front of this process."""
    listen = port if port is not None else int(os.environ.get("PORT", "8080"))
    allowed = tuple((os.environ.get("JYOTISHA_ALLOWED_HOSTS") or "").split(","))
    trust_proxy = os.environ.get("JYOTISHA_TRUST_PROXY", "1") != "0"
    ask_limit = int(os.environ.get("JYOTISHA_ASK_DAILY_LIMIT", "1000"))
    with LocalServer(listen, bind_host="0.0.0.0", public=True, allowed_hosts=allowed, trust_proxy=trust_proxy, ask_daily_limit=ask_limit) as server:
        print(f"Jyotisha app (public mode) listening on 0.0.0.0:{server.server_port}", flush=True)
        if not server.allowed_hosts:
            print("Warning: JYOTISHA_ALLOWED_HOSTS is not set, so any Host header is accepted.", flush=True)
        if assistant.available():
            print(f"Chat assistant ON ({assistant.provider()}): daily cap {ask_limit} questions; per visitor {PUBLIC_ASK_PER_DAY}/day.", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


def serve(port: int = DEFAULT_PORT, *, lan_ip: str | None = None, lan_minutes: int | None = None) -> None:
    """Serve on loopback by default; authenticated RFC1918 access is opt-in."""
    if lan_minutes is not None and (isinstance(lan_minutes, bool) or not isinstance(lan_minutes, int) or not 1 <= lan_minutes <= 120):
        raise ValueError("LAN duration must be 1..120 minutes")
    host = _validated_bind_host(lan_ip) if lan_ip else "127.0.0.1"
    if lan_ip and host == "127.0.0.1":
        raise ValueError("--lan-ip requires a private LAN address, not loopback")
    passcode = (os.environ.get("JYOTISHA_LAN_PASSCODE") or secrets.token_urlsafe(18)) if lan_ip else None
    with LocalServer(port, bind_host=host, lan_passcode=passcode) as server:
        print(f"Jyotisha app: http://{host}:{server.server_port}", flush=True)
        timer = None
        if server.lan_enabled:
            if lan_minutes is not None:
                timer = Timer(lan_minutes * 60, server.shutdown)
                timer.daemon = True
                timer.start()
            print(f"LAN preview username: preview | access code: {passcode}", flush=True)
            duration_notice = f"closes automatically after {lan_minutes} minutes" if lan_minutes is not None else "runs until stopped"
            print(f"LAN preview {duration_notice}. Trusted private Wi-Fi and synthetic data only; HTTP is unencrypted.", flush=True)
        print("Experimental calculations only. Press Ctrl+C to stop.")
        if assistant.available():
            destination = "generativelanguage.googleapis.com" if assistant.provider() == "gemini" else "api.anthropic.com"
            print(f"Chat assistant ON ({assistant.provider()}): questions and calculated chart facts are sent to {destination}.")
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
        finally:
            if timer:
                timer.cancel()
