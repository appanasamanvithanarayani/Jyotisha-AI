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
    Setting("JYOTISHA_REWARDED_CHAT", "Android app ads", "Watch an ad for more AI questions", "Gives free AI questions a day, then a rewarded ad buys more.", "bool", "0"),
    Setting("JYOTISHA_ADMOB_REWARDED_ID", "Android app ads", "Rewarded ad unit ID", "From AdMob. Leave empty to use Google's test rewarded ad.", "pattern", "", pattern=UNIT_ID, example="ca-app-pub-1234567890123456/1234567890"),
    Setting("JYOTISHA_CHAT_FREE_QUESTIONS", "Android app ads", "Free AI questions per day", "Per phone, before an ad is needed.", "int", "10", minimum=1, maximum=100),
    Setting("JYOTISHA_CHAT_BONUS_QUESTIONS", "Android app ads", "Extra questions per ad watched", "", "int", "5", minimum=1, maximum=100),
    Setting("JYOTISHA_ONBOARDING_ADS", "Android app ads", "Full-screen ads in the welcome steps", "One full-screen ad after the opening screen and one after the name and birth-date step (first start only).", "bool", "1"),
    Setting("JYOTISHA_INTERSTITIAL", "Android app ads", "Occasional full-screen ad between screens", "At most one per few screen switches, never in the first minute.", "bool", "0"),
    Setting("JYOTISHA_ADMOB_INTERSTITIAL_ID", "Android app ads", "Interstitial ad unit ID", "From AdMob. Leave empty to use Google's test interstitial.", "pattern", "", pattern=UNIT_ID, example="ca-app-pub-1234567890123456/1234567890"),
    # ---- Ads on the website
    Setting("JYOTISHA_ADSENSE_CLIENT", "Website ads", "Google AdSense publisher ID", "Only after AdSense approves your own domain. Empty means no website ads.", "pattern", "", pattern=r"ca-pub-\d{10,20}", example="ca-pub-1234567890123456"),
    # ---- AI chat
    Setting("JYOTISHA_ASSISTANT_PROVIDER", "AI chat", "AI provider", "Which service writes the free-form chat answers.", "choice", "", choices=("", "gemini", "anthropic", "offline")),
    Setting("JYOTISHA_GEMINI_MODEL", "AI chat", "Gemini model", "Leave empty for the built-in default.", "pattern", "", pattern=r"[A-Za-z0-9][A-Za-z0-9._-]{0,79}", example="gemini-3.5-flash-lite"),
    Setting("JYOTISHA_ASSISTANT_MODEL", "AI chat", "Claude model", "Used only when the provider is Anthropic.", "pattern", "", pattern=r"[A-Za-z0-9][A-Za-z0-9._-]{0,79}", example="claude-haiku-5-5"),
    Setting("JYOTISHA_ASK_DAILY_LIMIT", "AI chat", "Daily AI questions, whole site", "Hard cap on AI questions per day across everyone. Protects your bill.", "int", "1000", minimum=0, maximum=1000000),
    Setting("JYOTISHA_AI_NUDGES", "AI chat", "AI-written daily notifications", "The AI writes fresh notification text every day for each language. Off uses the built-in messages only.", "bool", "1"),
    Setting("JYOTISHA_AI_RASHIPHAL", "AI chat", "AI-written daily Rashiphal", "The AI writes each day’s Rashiphal paragraph for the 12 signs (per language), based on the day’s planet positions. Off shows the built-in reading.", "bool", "1"),
    Setting("JYOTISHA_NUDGE_MODEL", "AI chat", "Notification model", "Model that writes the daily notifications (for the provider above). Empty uses the same model as the chat; a small, cheap model is enough.", "pattern", "", pattern=r"[A-Za-z0-9][A-Za-z0-9._-]{0,79}", example="gemini-3.5-flash-lite"),
    Setting("JYOTISHA_ASK_PER_VISITOR_DAY", "AI chat", "Daily AI questions per visitor", "Per network address, per day.", "int", "60", minimum=1, maximum=10000),
    Setting("JYOTISHA_ASK_PER_VISITOR_MINUTE", "AI chat", "AI questions per visitor per minute", "Slows down automated use.", "int", "8", minimum=1, maximum=1000),
    Setting("GEMINI_API_KEY", "API keys", "Gemini API key", "Write-only: once saved it is shown only as the last four characters.", "secret"),
    Setting("ANTHROPIC_API_KEY", "API keys", "Anthropic (Claude) API key", "Write-only, like the Gemini key.", "secret"),
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
