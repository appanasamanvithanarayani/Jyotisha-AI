"""Messages from the admin panel to every installed Android app, through Firebase Cloud Messaging (FCM HTTP v1).

The server needs the Firebase service-account key (a JSON file kept only on the server; never in git or the image).
Its path is JYOTISHA_FIREBASE_KEY (default /run/secrets/firebase-key.json, see deploy/digitalocean/docker-compose.yml).
Apps subscribe to the topic "all" and to "lang-<code>" for their interface language, so no device list is stored here.
"""

from __future__ import annotations

import json
import os
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

DEFAULT_KEY_PATH = "/run/secrets/firebase-key.json"
SCOPE = "https://www.googleapis.com/auth/firebase.messaging"
PAGES = ("home", "calendar", "kundli", "relationship", "chat", "rashi")
MAX_TITLE, MAX_BODY = 65, 240

_token: dict = {"value": "", "expires": 0.0}
_lock = threading.Lock()


class PushError(Exception):
    """A message could not be sent; the text is safe to show in the admin panel."""


def key_path() -> Path:
    return Path(os.environ.get("JYOTISHA_FIREBASE_KEY", "").strip() or DEFAULT_KEY_PATH)


def _key() -> dict | None:
    try:
        data = json.loads(key_path().read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if not isinstance(data, dict) or data.get("type") != "service_account":
        return None
    if not all(isinstance(data.get(name), str) and data[name] for name in ("project_id", "client_email", "private_key")):
        return None
    return data


def status() -> dict:
    """Whether sending is set up, for the admin panel (never includes the key)."""
    key = _key()
    return {"ready": key is not None, "project": key["project_id"] if key else None}


def _access_token(key: dict) -> str:
    """A short-lived OAuth token from a JWT signed with the service-account key (cached until shortly before expiry)."""
    with _lock:
        if _token["value"] and time.time() < _token["expires"] - 120:
            return _token["value"]
    from google.auth import crypt, jwt  # imported here so the rest of the app never needs it

    now = int(time.time())
    token_uri = key.get("token_uri") or "https://oauth2.googleapis.com/token"
    claims = {"iss": key["client_email"], "scope": SCOPE, "aud": token_uri, "iat": now, "exp": now + 3600}
    assertion = jwt.encode(crypt.RSASigner.from_service_account_info(key), claims)
    if isinstance(assertion, bytes):
        assertion = assertion.decode("ascii")
    body = urllib.parse.urlencode({"grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer", "assertion": assertion}).encode()
    request = urllib.request.Request(token_uri, data=body, method="POST", headers={"Content-Type": "application/x-www-form-urlencoded"})
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            reply = json.loads(response.read())
    except (urllib.error.URLError, TimeoutError, OSError, ValueError) as exc:
        raise PushError("Could not sign in to Firebase with the server key") from exc
    value = reply.get("access_token") if isinstance(reply, dict) else None
    if not value:
        raise PushError("Firebase did not accept the server key")
    with _lock:
        _token.update(value=value, expires=time.time() + int(reply.get("expires_in", 3600)))
    return value


def validate(title: object, body: object, audience: object, page: object, languages: tuple[str, ...]) -> dict:
    if not isinstance(title, str) or not 1 <= len(title.strip()) <= MAX_TITLE:
        raise PushError(f"Title must be 1–{MAX_TITLE} characters")
    if not isinstance(body, str) or not 1 <= len(body.strip()) <= MAX_BODY:
        raise PushError(f"Message must be 1–{MAX_BODY} characters")
    if any(ord(c) < 32 and c != "\n" for c in title + body):
        raise PushError("Remove special control characters")
    if audience != "all" and audience not in languages:
        raise PushError("Unknown audience")
    if page not in PAGES:
        raise PushError("Unknown screen")
    return {"title": title.strip(), "body": body.strip(), "topic": "all" if audience == "all" else f"lang-{audience}", "page": page}


def send(message: dict) -> str:
    """Send one notification to a topic; returns Firebase's message id."""
    key = _key()
    if key is None:
        raise PushError("Push is not set up: the Firebase server key was not found on the server")
    if not re.fullmatch(r"[a-zA-Z0-9-_.~%]{1,900}", message["topic"]):
        raise PushError("Invalid topic")
    payload = {"message": {
        "topic": message["topic"],
        "notification": {"title": message["title"], "body": message["body"]},
        "data": {"page": message["page"]},
        "android": {"priority": "HIGH", "notification": {"icon": "ic_stat_jyotisha", "color": "#E8822B"}},
    }}
    url = f"https://fcm.googleapis.com/v1/projects/{urllib.parse.quote(key['project_id'])}/messages:send"
    request = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), method="POST", headers={
        "Content-Type": "application/json", "Authorization": f"Bearer {_access_token(key)}"})
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            reply = json.loads(response.read())
    except urllib.error.HTTPError as exc:
        raise PushError(f"Firebase refused the message (HTTP {exc.code})") from exc
    except (urllib.error.URLError, TimeoutError, OSError, ValueError) as exc:
        raise PushError("Could not reach Firebase") from exc
    return str(reply.get("name", "")) if isinstance(reply, dict) else ""
