"""Settings you can change from the admin panel instead of editing the server's .env file.

Every setting keeps the name of its environment variable. A value saved in the panel wins; otherwise the environment
value is used, otherwise the default. Removing a panel value ("revert") hands control back to the environment.

Also here: the change history (audit log) and aggregate usage counters. Nothing personal is stored: counters are
totals per day, and the visitor count is built from a hash that is thrown away at the end of the day.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import threading
import time
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

UNIT_ID = r"ca-app-pub-\d{16}/\d{10}"


@dataclass(frozen=True)
class Setting:
    key: str
    group: str
    label: str
    help: str
    kind: str                    # bool | int | text | choice | pattern | secret
    default: str = ""
    choices: tuple = ()
    minimum: int = 0
    maximum: int = 0
    pattern: str = ""
    maxlen: int = 200
    example: str = ""


SETTINGS: tuple[Setting, ...] = (
    # ---- Ads in the Android app (Google AdMob)
    Setting("JYOTISHA_APP_ADS", "Android app ads", "Show ads in the Android app", "Master switch. Off hides every ad and every ad popup.", "bool", "0"),
    Setting("JYOTISHA_ADMOB_PUBLISHER", "Android app ads", "AdMob publisher ID (for app-ads.txt)", "Only needed before you add your own ad unit IDs; app-ads.txt uses the ID inside your ad units.", "pattern", "", pattern=r"pub-\d{16}", example="pub-1234567890123456"),
    Setting("JYOTISHA_ADMOB_TESTING", "Android app ads", "Always show test ads", "Keep on until the app is live on Google Play and your AdMob account is approved.", "bool", "0"),
    Setting("JYOTISHA_ADMOB_BANNER_ID", "Android app ads", "Banner ad unit ID", "From AdMob. Leave empty to use Google's test banner.", "pattern", "", pattern=UNIT_ID, example="ca-app-pub-1234567890123456/1234567890"),
    Setting("JYOTISHA_REWARDED_KUNDLI", "Android app ads", "Watch an ad to generate a Kundli", "Asks the user to watch a short ad before a new Kundli is made.", "bool", "0"),
    Setting("JYOTISHA_REWARDED_TAROT", "Android app ads", "Watch an ad to see a Tarot reading", "A '▶ See my reading' button plays a rewarded ad before each Tarot reading (like Palm AI). If no ad loads, the reading still shows.", "bool", "1"),
    Setting("JYOTISHA_REWARDED_PALM", "Android app ads", "Watch an ad to see a palm reading", "After the photo is taken, a rewarded ad plays before the palm reading. If no ad loads, the reading still shows.", "bool", "1"),
    Setting("JYOTISHA_REWARDED_RASHIPHAL", "Android app ads", "Watch an ad for today's Rashiphal (once a day)", "The daily Rashiphal reading asks for one rewarded ad a day; after that it is open all day.", "bool", "1"),
    Setting("JYOTISHA_REWARDED_LIFEGUIDE", "Android app ads", "Watch an ad to open the Life Guide tabs (once per sign per day)", "Today's balance is free; Yesterday, Tomorrow, This month and This year open after one rewarded ad for that sign.", "bool", "1"),
    Setting("JYOTISHA_REWARDED_SIGNMATCH", "Android app ads", "Watch an ad to see a Sign match", "The 'See our match' button plays a rewarded ad before the result.", "bool", "1"),
    Setting("JYOTISHA_REWARDED_MOON", "Android app ads", "Watch an ad to explore another Moon sign", "Your own Moon sign stays free; choosing another sign on the Moon Sign page plays a rewarded ad.", "bool", "0"),
    Setting("JYOTISHA_REWARDED_NUMBERS", "Android app ads", "Watch an ad to work out Numerology for new details", "Shown for the date of birth saved on the phone; the 'Show my numbers' button for a new person plays a rewarded ad.", "bool", "0"),
    Setting("JYOTISHA_REWARDED_CHAT", "Android app ads", "Watch an ad for more AI questions", "Gives free AI questions a day, then a rewarded ad buys more.", "bool", "0"),
    Setting("JYOTISHA_ADMOB_REWARDED_ID", "Android app ads", "Rewarded ad unit ID", "From AdMob. Leave empty to use Google's test rewarded ad.", "pattern", "", pattern=UNIT_ID, example="ca-app-pub-1234567890123456/1234567890"),
    Setting("JYOTISHA_CHAT_FREE_QUESTIONS", "Android app ads", "Free AI questions per day", "Per phone, before an ad is needed.", "int", "10", minimum=1, maximum=100),
    Setting("JYOTISHA_CHAT_BONUS_QUESTIONS", "Android app ads", "Extra questions per ad watched", "", "int", "5", minimum=1, maximum=100),
    Setting("JYOTISHA_ONBOARDING_ADS", "Android app ads", "Full-screen ads in the welcome steps", "One full-screen ad after the opening screen and one after the name and birth-date step (first start only).", "bool", "1"),
    Setting("JYOTISHA_ONBOARDING_BANNER", "Android app ads", "Ad box on the language and birth-date steps", "A 300 x 250 ad under the language list and the date-of-birth wheels on the first start (uses the banner ad unit).", "bool", "1"),
    Setting("JYOTISHA_LAUNCH_AD", "Android app ads", "Full-screen ad each time the app opens", "A short loading screen and then one full-screen ad every time the app is opened again (the first start has its own ads). Off by default: Google's AdMob rules discourage full-screen ads while an app is loading, so this can get ads limited.", "bool", "0"),
    Setting("JYOTISHA_INTERSTITIAL", "Android app ads", "Occasional full-screen ad between screens", "At most one per few screen switches, never in the first minute.", "bool", "0"),
    Setting("JYOTISHA_ADMOB_INTERSTITIAL_ID", "Android app ads", "Interstitial ad unit ID", "From AdMob. Leave empty to use Google's test interstitial.", "pattern", "", pattern=UNIT_ID, example="ca-app-pub-1234567890123456/1234567890"),
    # ---- Ads on the website
    Setting("JYOTISHA_ADSENSE_CLIENT", "Website ads", "Google AdSense publisher ID", "Only after AdSense approves your own domain. Empty means no website ads.", "pattern", "", pattern=r"ca-pub-\d{10,20}", example="ca-pub-1234567890123456"),
    # ---- AI chat
    Setting("JYOTISHA_ASSISTANT_PROVIDER", "AI chat", "AI provider", "Which service writes the free-form chat answers.", "choice", "", choices=("", "gemini", "anthropic", "offline")),
    Setting("JYOTISHA_GEMINI_MODEL", "AI chat", "Gemini model", "Leave empty for the built-in default.", "pattern", "", pattern=r"[A-Za-z0-9][A-Za-z0-9._-]{0,79}", example="gemini-3.5-flash-lite"),
    Setting("JYOTISHA_ASSISTANT_MODEL", "AI chat", "Claude model", "Used only when the provider is Anthropic.", "pattern", "", pattern=r"[A-Za-z0-9][A-Za-z0-9._-]{0,79}", example="claude-haiku-5-5"),
    Setting("JYOTISHA_ASK_DAILY_LIMIT", "AI chat", "Daily AI questions, whole site", "Hard cap on AI questions per day across everyone. Protects your bill.", "int", "1000", minimum=0, maximum=1000000),
    Setting("JYOTISHA_TEASER_HOURS", "AI chat", "Reading reminder notifications: every N hours", "Short teaser notifications on the phone (\"Your palm is waiting to be read\", \"Your Jathakam is ready\"…) that open a feature when tapped. 1 = every hour, 0 = off. Only between the hours below; users can turn them off in the app.", "int", "1", minimum=0, maximum=12),
    Setting("JYOTISHA_TEASER_FROM", "AI chat", "Reading reminders: first hour of the day", "24-hour clock, phone's local time.", "int", "5", minimum=0, maximum=23),
    Setting("JYOTISHA_TEASER_TO", "AI chat", "Reading reminders: last hour of the day", "24-hour clock; no reminders after this hour (none at night).", "int", "21", minimum=0, maximum=23),
    Setting("JYOTISHA_AI_LIFEGUIDE_TEXT", "AI chat", "AI-written Life Guide wording", "The AI writes four short sentences for each life area and score band once a day per language (shared by everyone), so the Life Guide does not read the same every day. Off: the built-in sentences are used.", "bool", "1"),
    Setting("JYOTISHA_AI_NUDGES", "AI chat", "AI-written daily notifications", "The AI writes fresh notification text every day for each language. Off uses the built-in messages only.", "bool", "1"),
    Setting("JYOTISHA_AI_PALM", "AI chat", "AI palm reading (photo)", "Users scan their palm with the camera and the AI reads it. The photo is used once and never stored.", "bool", "1"),
    Setting("JYOTISHA_PALM_PER_VISITOR_DAY", "AI chat", "Palm readings per visitor per day", "Each palm reading sends a photo to the AI, which costs more than a question.", "int", "5", minimum=1, maximum=100),
    Setting("JYOTISHA_AI_PARTNER_PORTRAIT", "AI chat", "AI 'ideal partner' illustration", "On the Love page, draws a stylized, non-photorealistic illustration from the user's own 7th house and Venus traits — never a real photo and never a specific real person. Needs the image provider below set up; costs more than a text question.", "bool", "0"),
    Setting("JYOTISHA_IMAGE_PROVIDER", "AI chat", "Image generation provider", "Which service draws the ideal-partner illustration. Independent of the AI provider above (used for chat text) — Claude/Anthropic has no image generation at all, so this needs its own choice and key either way.", "choice", "", choices=("", "gemini", "fal", "bfl")),
    Setting("JYOTISHA_GEMINI_IMAGE_MODEL", "AI chat", "Gemini image model", "Used only when the image provider above is Gemini. Leave empty for the built-in default.", "pattern", "", pattern=r"[A-Za-z0-9][A-Za-z0-9._-]{0,79}", example="gemini-2.5-flash-image"),
    Setting("FAL_API_KEY", "API keys", "fal.ai API key (Flux images)", "From fal.ai (Dashboard -> Keys). Write-only, like the other AI keys. Needed only when the image provider above is set to \"fal\".", "secret"),
    Setting("JYOTISHA_FAL_MODEL", "AI chat", "fal.ai (Flux) model", "Used only when the image provider above is \"fal\". Leave empty for the built-in default (Flux Schnell: fast and inexpensive).", "pattern", "", pattern=r"[A-Za-z0-9][A-Za-z0-9._/-]{0,99}", example="fal-ai/flux/schnell"),
    Setting("BFL_API_KEY", "API keys", "Black Forest Labs API key (Flux images)", "From bfl.ai (your account's API Keys page) — a different service from fal.ai, with its own key. Write-only, like the other AI keys. Needed only when the image provider above is set to \"bfl\".", "secret"),
    Setting("JYOTISHA_BFL_MODEL", "AI chat", "Black Forest Labs (Flux) model", "Used only when the image provider above is \"bfl\". Leave empty for the built-in default (flux-3-image-klein). Use the exact model slug from the code sample on your Black Forest Labs account if it differs (the display name shown in their UI is not the same as the slug the API expects).", "pattern", "", pattern=r"[A-Za-z0-9][A-Za-z0-9._-]{0,79}", example="flux-3-image-klein"),
    Setting("JYOTISHA_PARTNER_PORTRAIT_PER_VISITOR_DAY", "AI chat", "Ideal-partner illustrations per visitor per day", "Image generation costs more than a question or even a palm reading.", "int", "3", minimum=1, maximum=50),
    Setting("JYOTISHA_AI_TAROT", "AI chat", "AI-written Tarot readings", "The AI explains each 3-card Tarot draw in the user's language (counts toward the AI question limits). Off shows the built-in card meanings.", "bool", "1"),
    Setting("JYOTISHA_AI_MOON_SIGN", "AI chat", "AI-written Moon Sign page", "The AI writes the Moon Sign page (5 sections) once per sign and language; it is kept and shared. Off shows a short built-in description.", "bool", "1"),
    Setting("JYOTISHA_AI_RASHIPHAL", "AI chat", "AI-written daily Rashiphal", "The AI writes each day’s Rashiphal paragraph for the 12 signs (per language), based on the day’s planet positions. Off shows the built-in reading.", "bool", "1"),
    Setting("JYOTISHA_NUDGE_MODEL", "AI chat", "Notification model", "Model that writes the daily notifications (for the provider above). Empty uses the same model as the chat; a small, cheap model is enough.", "pattern", "", pattern=r"[A-Za-z0-9][A-Za-z0-9._-]{0,79}", example="gemini-3.5-flash-lite"),
    Setting("JYOTISHA_ASK_PER_VISITOR_DAY", "AI chat", "Daily AI questions per visitor", "Per network address, per day.", "int", "60", minimum=1, maximum=10000),
    Setting("JYOTISHA_ASK_PER_VISITOR_MINUTE", "AI chat", "AI questions per visitor per minute", "Slows down automated use.", "int", "8", minimum=1, maximum=1000),
    Setting("GEMINI_API_KEY", "API keys", "Gemini API key", "Write-only: once saved it is shown only as the last four characters.", "secret"),
    Setting("ANTHROPIC_API_KEY", "API keys", "Anthropic (Claude) API key", "Write-only, like the Gemini key.", "secret"),
    # ---- Payments (an alternative to watching an ad; off until a provider is chosen and its keys are set)
    Setting("JYOTISHA_PAYMENTS_PROVIDER", "Payments", "Payment provider", "Lets users pay a small amount instead of watching an ad, for extra AI questions or a single reading unlock. Off (empty) until you add the keys below and choose a provider; no card or UPI details ever reach this server, only Razorpay's own signed confirmation.", "choice", "", choices=("", "razorpay")),
    Setting("RAZORPAY_KEY_ID", "Payments", "Razorpay Key ID", "From your Razorpay dashboard (Settings -> API Keys). Safe to use in the app itself.", "pattern", "", pattern=r"rzp_(live|test)_[A-Za-z0-9]{10,}", example="rzp_live_abcdEFGH1234"),
    Setting("RAZORPAY_KEY_SECRET", "Payments", "Razorpay Key Secret", "Write-only, like the AI provider keys. Never shown to users or sent to the browser.", "secret"),
    Setting("JYOTISHA_PRICE_CHAT_BONUS_RS", "Payments", "Price: extra AI questions (Rs)", "Pay instead of watching an ad, for the same number of bonus questions set above.", "int", "9", minimum=1, maximum=999),
    Setting("JYOTISHA_PRICE_UNLOCK_RS", "Payments", "Price: unlock one reading (Rs)", "Pay instead of watching an ad, for one Palm, Tarot, Life Guide, Sign match, Moon sign, Rashiphal or ideal-partner reading.", "int", "9", minimum=1, maximum=999),
    # ---- Messages to users
    Setting("JYOTISHA_ANNOUNCEMENT", "Announcement", "Announcement text", "Shown as a banner at the top of the app and website. Empty hides it.", "text", "", maxlen=300),
    Setting("JYOTISHA_ANNOUNCEMENT_LINK", "Announcement", "Announcement link (optional)", "Must start with https://", "pattern", "", pattern=r"https://[^\s<>\"']{3,300}", example="https://example.com/news"),
    Setting("JYOTISHA_ANNOUNCEMENT_UNTIL", "Announcement", "Hide the announcement after (date)", "YYYY-MM-DD. Empty means until you remove it.", "pattern", "", pattern=r"\d{4}-\d{2}-\d{2}", example="2026-12-31"),
    Setting("JYOTISHA_MAINTENANCE", "Announcement", "Maintenance notice", "Shows the notice below on every screen. The app keeps working.", "bool", "0"),
    Setting("JYOTISHA_MAINTENANCE_MESSAGE", "Announcement", "Maintenance message", "", "text", "We are doing some maintenance. Some features may be slow for a short while.", maxlen=300),
    # ---- About the site
    Setting("JYOTISHA_CONTACT", "Site details", "Support e-mail", "Shown on the privacy page and used by the \"Report this answer\" link.", "pattern", "", pattern=r"[^@\s<>\"']+@[^@\s<>\"']+\.[^@\s<>\"']+", example="support@example.com"),
    Setting("JYOTISHA_DEVELOPER", "Site details", "Developer name", "Shown on the privacy page.", "text", "Samanvitha", maxlen=80),
)
BY_KEY = {item.key: item for item in SETTINGS}
SECRET_KEYS = frozenset(item.key for item in SETTINGS if item.kind == "secret")


class SettingError(ValueError):
    """A value the panel refuses to save."""


# ----------------------------------------------------------------------------------------- storage
_lock = threading.RLock()
_cache: dict = {"path": None, "mtime": None, "data": {}}


def data_dir() -> Path:
    configured = os.environ.get("JYOTISHA_DATA_DIR", "").strip()
    if configured:
        return Path(configured)
    home = os.environ.get("JYOTISHA_HOME", "").strip()
    return (Path(home) if home else Path(__file__).resolve().parents[2]) / "admin-data"


def _settings_path() -> Path:
    return data_dir() / "settings.json"


def _read_overrides() -> dict:
    path = _settings_path()
    try:
        mtime = path.stat().st_mtime_ns
    except OSError:
        return {}
    with _lock:
        if _cache["path"] == str(path) and _cache["mtime"] == mtime:
            return _cache["data"]
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return {}
        data = {key: str(value) for key, value in data.items() if key in BY_KEY and isinstance(value, (str, int))} if isinstance(data, dict) else {}
        _cache.update(path=str(path), mtime=mtime, data=data)
        return data


def _write_overrides(data: dict) -> None:
    directory = data_dir()
    directory.mkdir(parents=True, exist_ok=True)
    path = _settings_path()
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")
    try:
        os.chmod(temporary, 0o600)
    except OSError:
        pass
    os.replace(temporary, path)
    with _lock:
        _cache["mtime"] = None   # force a re-read next time


def _env(name: str) -> str:
    return os.environ.get(name, "").strip()


def value(name: str, default: str = "") -> str:
    """The effective value: panel override, else the environment variable, else ``default``."""
    overrides = _read_overrides()
    if name in overrides:
        return overrides[name]
    return _env(name) or default


def number(name: str, default: int) -> int:
    raw = value(name, "")
    return int(raw) if raw.isdigit() else default


def source(name: str) -> str:
    if name in _read_overrides():
        return "panel"
    return "server" if _env(name) else "default"


def _validate(setting: Setting, raw) -> str:
    text = str(raw).strip() if raw is not None else ""
    if setting.kind == "bool":
        if text not in ("0", "1"):
            raise SettingError(f"{setting.label}: choose on or off")
        return text
    if setting.kind == "int":
        if not text.isdigit() or not setting.minimum <= int(text) <= setting.maximum:
            raise SettingError(f"{setting.label}: enter a whole number from {setting.minimum} to {setting.maximum}")
        return str(int(text))
    if setting.kind == "choice":
        if text not in setting.choices:
            raise SettingError(f"{setting.label}: choose one of the listed options")
        return text
    if setting.kind == "pattern":
        if text and not re.fullmatch(setting.pattern, text):
            raise SettingError(f"{setting.label}: that does not look right (example: {setting.example})")
        if setting.key == "JYOTISHA_ANNOUNCEMENT_UNTIL" and text:
            try:
                date.fromisoformat(text)
            except ValueError as exc:
                raise SettingError(f"{setting.label}: not a real date") from exc
        return text
    if setting.kind == "secret":
        if not 8 <= len(text) <= 300 or re.search(r"\s", text):
            raise SettingError(f"{setting.label}: paste the key exactly, with no spaces (8 to 300 characters)")
        return text
    if len(text) > setting.maxlen or re.search(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", text):
        raise SettingError(f"{setting.label}: at most {setting.maxlen} characters")
    return text


def mask(setting: Setting, text: str) -> str:
    if setting.kind != "secret":
        return text
    return f"…{text[-4:]}" if len(text) >= 8 else ("set" if text else "")


def update(changes: dict, actor: str = "") -> list[dict]:
    """Apply {KEY: value} (a value of None reverts to the server environment). All or nothing."""
    if not isinstance(changes, dict) or not changes:
        raise SettingError("nothing to save")
    overrides = dict(_read_overrides())
    entries = []
    for key, raw in changes.items():
        setting = BY_KEY.get(key)
        if setting is None:
            raise SettingError(f"unknown setting {key!r}")
        before = overrides.get(key, _env(key))
        if raw is None:
            overrides.pop(key, None)
            after, action = _env(key), "revert"
        else:
            after, action = _validate(setting, raw), "set"
            overrides[key] = after
        if after != before or action == "revert":
            entries.append({"key": key, "action": action, "old": mask(setting, before), "new": mask(setting, after)})
    if entries:
        with _lock:
            _write_overrides(overrides)
            now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
            lines = [json.dumps({"time": now, "who": actor[:40], **entry}, ensure_ascii=False) for entry in entries]
            log = data_dir() / "audit.jsonl"
            with log.open("a", encoding="utf-8") as stream:
                stream.write("\n".join(lines) + "\n")
            _trim_audit(log)
    return entries


def log_event(key: str, action: str, old: str, new: str, actor: str = "") -> None:
    """Add a line to the change history for something that is not a setting (for example a notification sent)."""
    with _lock:
        now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
        log = data_dir() / "audit.jsonl"
        try:
            with log.open("a", encoding="utf-8") as stream:
                stream.write(json.dumps({"time": now, "who": actor[:40], "key": key, "action": action, "old": old[:80], "new": new[:120]}, ensure_ascii=False) + "\n")
            _trim_audit(log)
        except OSError:
            pass


def _trim_audit(path: Path, keep: int = 1000) -> None:
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
        if len(lines) > keep * 2:
            path.write_text("\n".join(lines[-keep:]) + "\n", encoding="utf-8")
    except OSError:
        pass


def audit_tail(count: int = 60) -> list[dict]:
    try:
        lines = (data_dir() / "audit.jsonl").read_text(encoding="utf-8").splitlines()[-count:]
    except OSError:
        return []
    result = []
    for line in reversed(lines):
        try:
            result.append(json.loads(line))
        except ValueError:
            continue
    return result


def describe() -> list[dict]:
    """Every setting with its current value (secrets masked), where the value comes from, and its rules."""
    rows = []
    for item in SETTINGS:
        effective = value(item.key, item.default if item.kind != "secret" else "")
        rows.append({
            "key": item.key, "group": item.group, "label": item.label, "help": item.help, "kind": item.kind,
            "value": mask(item, effective), "source": source(item.key), "default": item.default if item.kind != "secret" else "",
            "choices": list(item.choices), "minimum": item.minimum, "maximum": item.maximum, "maxlen": item.maxlen, "example": item.example,
            "isSet": bool(effective) if item.kind == "secret" else None,
        })
    return rows


# ----------------------------------------------------------------------------------------- usage counters
COUNTERS = ("page_views", "day_panchang", "month_calendar", "birth_chart", "ai_questions", "places", "apk_downloads", "rate_limited")


class Stats:
    """Totals per day; no personal data. Written to disk at most every half minute."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._days: dict[str, dict[str, int]] = {}
        self._seen: dict[str, set] = {}
        self._salt = os.urandom(8)
        self._last_save = 0.0
        self._loaded_from = None

    def _path(self) -> Path:
        return data_dir() / "stats.json"

    def _load(self) -> None:
        path = str(self._path())
        if self._loaded_from == path:
            return
        self._loaded_from = path
        self._seen = {}
        try:
            data = json.loads(Path(path).read_text(encoding="utf-8"))
            if isinstance(data, dict):
                self._days = {day: {k: int(v) for k, v in counts.items() if k in COUNTERS + ("visitors",)} for day, counts in data.items() if isinstance(counts, dict)}
        except (OSError, ValueError):
            self._days = {}

    def record(self, name: str, visitor: str = "") -> None:
        if name not in COUNTERS:
            return
        today = date.today().isoformat()
        with self._lock:
            self._load()
            day = self._days.setdefault(today, {})
            day[name] = day.get(name, 0) + 1
            if visitor:
                seen = self._seen.setdefault(today, set())
                token = hashlib.sha256(self._salt + visitor.encode("utf-8", "ignore")).hexdigest()[:16]
                if token not in seen:
                    seen.add(token)
                    day["visitors"] = day.get("visitors", 0) + 1
            for stale in [d for d in self._days if d < (date.today() - timedelta(days=45)).isoformat()]:
                self._days.pop(stale, None)
            for stale in [d for d in self._seen if d != today]:
                self._seen.pop(stale, None)
            if time.monotonic() - self._last_save > 30:
                self._save()

    def _save(self) -> None:
        self._last_save = time.monotonic()
        try:
            self._path().parent.mkdir(parents=True, exist_ok=True)
            self._path().write_text(json.dumps(self._days, sort_keys=True), encoding="utf-8")
        except OSError:
            pass

    def snapshot(self, days: int = 14) -> list[dict]:
        with self._lock:
            self._load()
            self._save()
            result = []
            for offset in range(days):
                day = (date.today() - timedelta(days=offset)).isoformat()
                counts = self._days.get(day, {})
                result.append({"date": day, **{name: counts.get(name, 0) for name in COUNTERS + ("visitors",)}})
            return result


stats = Stats()


# -------------------------------------------------------------------------------- anonymous product analytics
GENERATION_TYPES = ("kundli", "ai_chat", "rashiphal", "life_guide", "moon_sign", "tarot", "palm", "partner_portrait")
FEATURE_TYPES = ("home", "research_chart", "kundli", "panchang", "calendar", "festivals", "relationship", "place_search",
                 "nearby_place", "ai_chat", "nudges", "rashiphal", "life_guide", "life_guide_text", "moon_sign", "tarot",
                 "palm", "partner_portrait", "numerology", "sign_match", "doshas", "dasha", "rating", "payments")


class Analytics:
    """Anonymous users and successful generation types; never stores inputs, outputs, IP addresses, or the cookie."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._loaded_from = None
        self._data: dict = {"users": {}, "days": {}}

    def _path(self) -> Path:
        return data_dir() / "analytics.json"

    @staticmethod
    def _anonymous_id(visitor: str) -> str:
        return hashlib.sha256(("jyotisha-anonymous|" + visitor).encode("utf-8", "ignore")).hexdigest()[:24]

    def _load(self) -> None:
        path = str(self._path())
        if self._loaded_from == path:
            return
        self._loaded_from = path
        try:
            raw = json.loads(Path(path).read_text(encoding="utf-8"))
            self._data = raw if isinstance(raw, dict) and isinstance(raw.get("users"), dict) and isinstance(raw.get("days"), dict) else {"users": {}, "days": {}}
        except (OSError, ValueError):
            self._data = {"users": {}, "days": {}}

    def _save(self) -> None:
        try:
            self._path().parent.mkdir(parents=True, exist_ok=True)
            self._path().write_text(json.dumps(self._data, sort_keys=True), encoding="utf-8")
        except OSError:
            pass

    def _visit(self, visitor: str, today: str) -> tuple[str, dict, dict]:
        anonymous_id = self._anonymous_id(visitor)
        users, days = self._data["users"], self._data["days"]
        is_new = anonymous_id not in users
        user = users.setdefault(anonymous_id, {"first_seen": today, "last_seen": today, "visits": 0, "generations": {}})
        day = days.setdefault(today, {"users": [], "new_users": 0, "generations": {}})
        if anonymous_id not in day["users"]:
            day["users"].append(anonymous_id)
            user["visits"] = int(user.get("visits", 0)) + 1
        if is_new:
            day["new_users"] = int(day.get("new_users", 0)) + 1
        user["last_seen"] = today
        return anonymous_id, user, day

    def visit(self, visitor: str) -> None:
        if not visitor:
            return
        today = date.today().isoformat()
        with self._lock:
            self._load()
            self._visit(visitor, today)
            self._save()

    def generated(self, visitor: str, feature: str) -> None:
        if not visitor or feature not in GENERATION_TYPES:
            return
        today = date.today().isoformat()
        with self._lock:
            self._load()
            _, user, day = self._visit(visitor, today)
            user_generations = user.setdefault("generations", {})
            day_generations = day.setdefault("generations", {})
            user_generations[feature] = int(user_generations.get(feature, 0)) + 1
            day_generations[feature] = int(day_generations.get(feature, 0)) + 1
            self._save()

    def observe(self, visitor: str, feature: str, success: bool, duration_ms: int) -> None:
        """Record feature-level volume, outcome and latency without storing request or response content."""
        if feature not in FEATURE_TYPES:
            return
        today = date.today().isoformat()
        elapsed = max(0, min(int(duration_ms), 300_000))
        with self._lock:
            self._load()
            if visitor:
                anonymous_id, user, day = self._visit(visitor, today)
                usage = user.setdefault("usage", {})
                usage[feature] = int(usage.get(feature, 0)) + 1
                feature_users = day.setdefault("feature_users", {}).setdefault(feature, [])
                if anonymous_id not in feature_users:
                    feature_users.append(anonymous_id)
            else:
                day = self._data["days"].setdefault(today, {"users": [], "new_users": 0, "generations": {}})
            feature_metrics = day.setdefault("observability", {}).setdefault(feature, {"requests": 0, "success": 0, "failure": 0, "total_ms": 0, "max_ms": 0})
            feature_metrics["requests"] = int(feature_metrics.get("requests", 0)) + 1
            outcome = "success" if success else "failure"
            feature_metrics[outcome] = int(feature_metrics.get(outcome, 0)) + 1
            feature_metrics["total_ms"] = int(feature_metrics.get("total_ms", 0)) + elapsed
            feature_metrics["max_ms"] = max(int(feature_metrics.get("max_ms", 0)), elapsed)
            self._save()

    def viewed(self, visitor: str, feature: str) -> None:
        """Record a client-side feature/page open, including features that do not call the server."""
        if not visitor or feature not in FEATURE_TYPES:
            return
        today = date.today().isoformat()
        with self._lock:
            self._load()
            anonymous_id, user, day = self._visit(visitor, today)
            views = day.setdefault("views", {})
            views[feature] = int(views.get(feature, 0)) + 1
            usage = user.setdefault("usage", {})
            usage[feature] = int(usage.get(feature, 0)) + 1
            feature_users = day.setdefault("feature_users", {}).setdefault(feature, [])
            if anonymous_id not in feature_users:
                feature_users.append(anonymous_id)
            self._save()

    def installed(self, visitor: str, platform: str) -> None:
        """Record the first launch reported by a native app installation, once per anonymous visitor."""
        if not visitor or platform not in ("android", "ios"):
            return
        today = date.today().isoformat()
        with self._lock:
            self._load()
            _, user, day = self._visit(visitor, today)
            if not user.get("installed_at"):
                user["installed_at"] = today
                user["platform"] = platform
                day["new_installs"] = int(day.get("new_installs", 0)) + 1
            self._save()

    def profile_birth_year(self, visitor: str, dob: object) -> None:
        """Keep only a birth year and broad current age range; the exact birth date is deliberately discarded."""
        if not visitor or not isinstance(dob, str):
            return
        try:
            born = date.fromisoformat(dob)
        except ValueError:
            return
        today = date.today()
        age = today.year - born.year - ((today.month, today.day) < (born.month, born.day))
        if not 0 <= age <= 125:
            return
        if age < 18:
            age_range = "Under 18"
        elif age < 25:
            age_range = "18–24"
        elif age < 35:
            age_range = "25–34"
        elif age < 45:
            age_range = "35–44"
        elif age < 55:
            age_range = "45–54"
        elif age < 65:
            age_range = "55–64"
        else:
            age_range = "65+"
        with self._lock:
            self._load()
            _, user, _ = self._visit(visitor, today.isoformat())
            user["birth_year"] = born.year
            user["age_range"] = age_range
            self._save()

    def snapshot(self, days: int = 14, user_limit: int = 100) -> dict:
        with self._lock:
            self._load()
            recent_days = [(date.today() - timedelta(days=offset)).isoformat() for offset in range(days)]
            day_rows, active, generation_totals = [], set(), {feature: 0 for feature in GENERATION_TYPES}
            observability = {feature: {"requests": 0, "success": 0, "failure": 0, "total_ms": 0, "max_ms": 0} for feature in FEATURE_TYPES}
            feature_views = {feature: 0 for feature in FEATURE_TYPES}
            feature_user_sets = {feature: set() for feature in FEATURE_TYPES}
            new_installs_period = 0
            for day_name in recent_days:
                row = self._data["days"].get(day_name, {})
                users = set(row.get("users", [])); active.update(users)
                generations = {feature: int(row.get("generations", {}).get(feature, 0)) for feature in GENERATION_TYPES}
                for feature, count in generations.items():
                    generation_totals[feature] += count
                daily_requests = 0
                for feature in FEATURE_TYPES:
                    feature_views[feature] += int(row.get("views", {}).get(feature, 0))
                    feature_user_sets[feature].update(row.get("feature_users", {}).get(feature, []))
                    metric = row.get("observability", {}).get(feature, {})
                    target = observability[feature]
                    for key in ("requests", "success", "failure", "total_ms"):
                        target[key] += int(metric.get(key, 0))
                    target["max_ms"] = max(target["max_ms"], int(metric.get("max_ms", 0)))
                    daily_requests += int(metric.get("requests", 0))
                new_installs_period += int(row.get("new_installs", 0))
                day_rows.append({"date": day_name, "unique_users": len(users), "new_users": int(row.get("new_users", 0)),
                                 "new_installs": int(row.get("new_installs", 0)), "feature_requests": daily_requests, "generations": generations})
            for metric in observability.values():
                metric["avg_ms"] = round(metric["total_ms"] / metric["requests"]) if metric["requests"] else 0
                metric["success_rate"] = round(metric["success"] * 100 / metric["requests"], 1) if metric["requests"] else 0
                metric.pop("total_ms", None)
            users = sorted(self._data["users"].items(), key=lambda item: (item[1].get("last_seen", ""), item[0]), reverse=True)
            period_start = recent_days[-1] if recent_days else date.today().isoformat()
            new_user_feature_sets = {feature: set() for feature in FEATURE_TYPES}
            for anonymous_id, user in users:
                if user.get("first_seen", "") >= period_start:
                    for feature, count in user.get("usage", {}).items():
                        if feature in new_user_feature_sets and int(count) > 0:
                            new_user_feature_sets[feature].add(anonymous_id)
            recent_users = []
            for anonymous_id, user in users[:max(0, min(user_limit, 100))]:
                generations = {feature: int(user.get("generations", {}).get(feature, 0)) for feature in GENERATION_TYPES}
                usage = {feature: int(user.get("usage", {}).get(feature, 0)) for feature in FEATURE_TYPES if user.get("usage", {}).get(feature)}
                recent_users.append({"id": anonymous_id[:10], "birth_year": user.get("birth_year"), "age_range": user.get("age_range", ""),
                                     "platform": user.get("platform", ""), "installed_at": user.get("installed_at", ""),
                                     "is_new_period": user.get("first_seen", "") >= period_start,
                                     "first_seen": user.get("first_seen", ""), "last_seen": user.get("last_seen", ""),
                                     "active_days": int(user.get("visits", 0)), "generation_count": sum(generations.values()),
                                     "generations": generations, "usage": usage})
            installed_users = [user for user in self._data["users"].values() if user.get("installed_at")]
            platforms = {platform: sum(user.get("platform") == platform for user in installed_users) for platform in ("android", "ios")}
            return {"total_users": len(self._data["users"]), "total_installs": len(installed_users),
                    "new_installs_today": day_rows[0]["new_installs"] if day_rows else 0, "new_installs_period": new_installs_period,
                    "install_platforms": platforms, "active_today": day_rows[0]["unique_users"] if day_rows else 0,
                    "new_today": day_rows[0]["new_users"] if day_rows else 0, "active_period": len(active),
                    "new_period": sum(row["new_users"] for row in day_rows), "generation_totals": generation_totals,
                    "feature_views": feature_views, "feature_unique_users": {feature: len(users) for feature, users in feature_user_sets.items()},
                    "new_user_features": {feature: len(users) for feature, users in new_user_feature_sets.items()}, "observability": observability,
                    "days": day_rows, "users": recent_users}


analytics = Analytics()


# ----------------------------------------------------------------------------------------- private app ratings
def record_rating(stars: object, reason: object = "", language: object = "") -> dict:
    """Store an app rating for the owner. Low ratings require a short private explanation."""
    if isinstance(stars, bool) or not isinstance(stars, int) or not 1 <= stars <= 5:
        raise ValueError("rating must be a whole number from 1 to 5")
    note = str(reason).strip() if isinstance(reason, str) else ""
    if stars < 3 and not note:
        raise ValueError("please tell us what went wrong")
    if len(note) > 500 or re.search(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", note):
        raise ValueError("feedback must be at most 500 characters")
    lang = str(language).strip().lower() if isinstance(language, str) else ""
    if not re.fullmatch(r"[a-z]{2,3}", lang):
        lang = ""
    row = {"time": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"), "stars": stars,
           "reason": note, "language": lang}
    with _lock:
        directory = data_dir()
        directory.mkdir(parents=True, exist_ok=True)
        path = directory / "ratings.jsonl"
        with path.open("a", encoding="utf-8") as stream:
            stream.write(json.dumps(row, ensure_ascii=False) + "\n")
        try:
            lines = path.read_text(encoding="utf-8").splitlines()
            if len(lines) > 1000:
                path.write_text("\n".join(lines[-1000:]) + "\n", encoding="utf-8")
        except OSError:
            pass
    return row


def ratings_snapshot(limit: int = 100) -> dict:
    """Aggregate rating totals and return recent private feedback for the admin panel."""
    try:
        lines = (data_dir() / "ratings.jsonl").read_text(encoding="utf-8").splitlines()
    except OSError:
        lines = []
    rows = []
    for line in lines:
        try:
            row = json.loads(line)
            if isinstance(row, dict) and isinstance(row.get("stars"), int) and 1 <= row["stars"] <= 5:
                rows.append(row)
        except ValueError:
            continue
    counts = {str(stars): sum(row["stars"] == stars for row in rows) for stars in range(1, 6)}
    average = round(sum(row["stars"] for row in rows) / len(rows), 2) if rows else 0
    recent = [row for row in reversed(rows) if row.get("reason")][:max(0, min(limit, 100))]
    return {"total": len(rows), "average": average, "counts": counts, "recent": recent}
