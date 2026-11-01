"""Sign-in for the admin panel. The panel exists only when JYOTISHA_ADMIN_PASSWORD is set on the server."""

from __future__ import annotations

import hashlib
import hmac
import os
import time

SESSION_SECONDS = 2 * 60 * 60
COOKIE = "jyotisha_admin"
MAX_FAILURES = 5
FAILURE_WINDOW = 15 * 60


def password() -> str:
    return os.environ.get("JYOTISHA_ADMIN_PASSWORD", "").strip()


def enabled() -> bool:
    return len(password()) >= 12


def _key() -> bytes:
    # Derived from the password, so changing the password signs everyone out.
    return hashlib.sha256(b"jyotisha-admin-session|" + password().encode("utf-8")).digest()


def password_matches(candidate: str) -> bool:
    expected = hashlib.sha256(password().encode("utf-8")).digest()
    given = hashlib.sha256(str(candidate).encode("utf-8")).digest()
    return enabled() and hmac.compare_digest(expected, given)


def make_session(now: float | None = None) -> str:
    expires = int((time.time() if now is None else now) + SESSION_SECONDS)
    body = f"v1.{expires}"
    return f"{body}.{hmac.new(_key(), body.encode(), hashlib.sha256).hexdigest()}"


def session_valid(token: str, now: float | None = None) -> bool:
    if not enabled() or not token or len(token) > 120:
        return False
    version, _, rest = token.partition(".")
    expires, _, signature = rest.partition(".")
    if version != "v1" or not expires.isdigit():
        return False
    expected = hmac.new(_key(), f"v1.{expires}".encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature) and int(expires) > (time.time() if now is None else now)


def cookie_from(header: str) -> str:
    for part in (header or "").split(";"):
        name, _, value = part.strip().partition("=")
        if name == COOKIE:
            return value
    return ""


def set_cookie(token: str, secure: bool) -> str:
    return f"{COOKIE}={token}; Path=/; Max-Age={SESSION_SECONDS}; HttpOnly; SameSite=Strict" + ("; Secure" if secure else "")


def clear_cookie(secure: bool) -> str:
    return f"{COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict" + ("; Secure" if secure else "")
