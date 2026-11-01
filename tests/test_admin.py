"""Admin panel: settings store, sign-in, and the routes. Synthetic values only."""

import http.client
import json
from threading import Thread

import pytest

from jyotisha_ai import admin, settings_store as store
from jyotisha_ai.webapp import LocalServer, _app_ads, _notice

PASSWORD = "a-long-test-password"


@pytest.fixture
def panel(monkeypatch):
    monkeypatch.setenv("JYOTISHA_ADMIN_PASSWORD", PASSWORD)
    server = LocalServer(port=0, bind_host="127.0.0.1", public=True, allowed_hosts=("127.0.0.1",), trust_proxy=False)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield server
    finally:
        server.shutdown()
        thread.join(timeout=3)
        server.server_close()


def call(server, method, path, body=None, cookie="", admin_header=True):
    headers = {"Host": "127.0.0.1"}
    if admin_header:
        headers["X-Admin"] = "1"
    if cookie:
        headers["Cookie"] = cookie
    data = None
    if body is not None:
        data = json.dumps(body)
        headers["Content-Type"] = "application/json"
    connection = http.client.HTTPConnection("127.0.0.1", server.server_port, timeout=20)
    connection.request(method, path, body=data, headers=headers)
    response = connection.getresponse()
    raw = response.read()
    result = response.status, dict(response.getheaders()), raw
    connection.close()
    return result


def sign_in(server):
    status, headers, _ = call(server, "POST", "/api/admin/login", {"password": PASSWORD})
    assert status == 200
    return headers["Set-Cookie"].split(";")[0]


def test_panel_is_hidden_without_a_password(monkeypatch):
    monkeypatch.delenv("JYOTISHA_ADMIN_PASSWORD", raising=False)
    server = LocalServer(port=0, bind_host="127.0.0.1", public=True, allowed_hosts=("127.0.0.1",))
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        assert call(server, "GET", "/admin")[0] == 404
        assert call(server, "POST", "/api/admin/login", {"password": "x"})[0] == 404
    finally:
        server.shutdown()
        thread.join(timeout=3)
        server.server_close()


def test_short_password_keeps_the_panel_off(monkeypatch):
    monkeypatch.setenv("JYOTISHA_ADMIN_PASSWORD", "short")
    assert not admin.enabled()


def test_login_page_is_not_indexed_and_state_needs_a_session(panel):
    status, headers, body = call(panel, "GET", "/admin")
    assert status == 200 and b"noindex" in body and "noindex" in headers["X-Robots-Tag"]
    assert call(panel, "GET", "/api/admin/state")[0] == 401
    assert call(panel, "POST", "/api/admin/login", {"password": "wrong-password-here"})[0] == 401
    assert call(panel, "POST", "/api/admin/save", {"changes": {"JYOTISHA_APP_ADS": "1"}})[0] == 401


def test_cookie_is_httponly_strict_and_header_is_required(panel):
    status, headers, _ = call(panel, "POST", "/api/admin/login", {"password": PASSWORD})
    cookie = headers["Set-Cookie"]
    assert status == 200 and "HttpOnly" in cookie and "SameSite=Strict" in cookie
    assert call(panel, "POST", "/api/admin/login", {"password": PASSWORD}, admin_header=False)[0] == 403
    assert call(panel, "GET", "/api/admin/state", cookie=cookie.split(";")[0])[0] == 200


def test_expired_or_forged_sessions_are_refused(monkeypatch):
    monkeypatch.setenv("JYOTISHA_ADMIN_PASSWORD", PASSWORD)
    token = admin.make_session(now=1000)
    assert admin.session_valid(token, now=1000 + 60)
    assert not admin.session_valid(token, now=1000 + admin.SESSION_SECONDS + 1)
    assert not admin.session_valid(token[:-1] + ("0" if token[-1] != "0" else "1"), now=1000 + 60)
    monkeypatch.setenv("JYOTISHA_ADMIN_PASSWORD", "another-long-password")
    assert not admin.session_valid(token, now=1000 + 60)


def test_saving_changes_what_the_app_is_told_and_is_audited(panel, monkeypatch):
    monkeypatch.delenv("JYOTISHA_APP_ADS", raising=False)
    assert _app_ads() is None
    cookie = sign_in(panel)
    changes = {"JYOTISHA_APP_ADS": "1", "JYOTISHA_REWARDED_CHAT": "1", "JYOTISHA_CHAT_FREE_QUESTIONS": "7",
               "JYOTISHA_ADMOB_BANNER_ID": "ca-app-pub-1234567890123456/1234567890"}
    status, _, body = call(panel, "POST", "/api/admin/save", {"changes": changes}, cookie)
    assert status == 200 and json.loads(body)["saved"] == 4
    ads = _app_ads()
    assert ads["chat_free_questions"] == 7 and ads["banner_id"].endswith("/1234567890") and ads["testing"] is False
    assert {row["key"] for row in store.audit_tail()} >= {"JYOTISHA_APP_ADS", "JYOTISHA_CHAT_FREE_QUESTIONS"}
    call(panel, "POST", "/api/admin/save", {"changes": {"JYOTISHA_APP_ADS": None}}, cookie)   # revert: back to the server environment
    assert _app_ads() is None


def test_invalid_values_are_rejected_and_nothing_is_saved(panel):
    cookie = sign_in(panel)
    for bad in ({"JYOTISHA_ADMOB_BANNER_ID": "not-an-id"}, {"JYOTISHA_CHAT_FREE_QUESTIONS": "9999"}, {"JYOTISHA_APP_ADS": "yes"},
                {"NOT_A_SETTING": "1"}, {"JYOTISHA_ANNOUNCEMENT_LINK": "http://insecure.example"}, {"JYOTISHA_ANNOUNCEMENT_UNTIL": "2026-13-45"}):
        assert call(panel, "POST", "/api/admin/save", {"changes": bad}, cookie)[0] == 400, bad
    mixed = {"JYOTISHA_APP_ADS": "1", "JYOTISHA_CHAT_FREE_QUESTIONS": "0"}
    assert call(panel, "POST", "/api/admin/save", {"changes": mixed}, cookie)[0] == 400
    assert store.value("JYOTISHA_APP_ADS") == ""


def test_api_keys_are_write_only_and_masked_everywhere(panel, monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    cookie = sign_in(panel)
    secret = "AIzaSyTestKeyValue1234567890abcdWXYZ"
    status, _, body = call(panel, "POST", "/api/admin/save", {"changes": {"GEMINI_API_KEY": secret}}, cookie)
    assert status == 200 and secret.encode() not in body
    state = call(panel, "GET", "/api/admin/state", cookie=cookie)[2]
    assert secret.encode() not in state and b"WXYZ" in state
    assert secret not in json.dumps(store.audit_tail())
    assert store.value("GEMINI_API_KEY") == secret          # the assistant can still read it
    assert (store.data_dir() / "settings.json").exists()


def test_notice_shows_maintenance_first_and_hides_an_old_announcement(monkeypatch):
    for key in ("JYOTISHA_MAINTENANCE", "JYOTISHA_ANNOUNCEMENT", "JYOTISHA_ANNOUNCEMENT_UNTIL", "JYOTISHA_ANNOUNCEMENT_LINK"):
        monkeypatch.delenv(key, raising=False)
    assert _notice() is None
    store.update({"JYOTISHA_ANNOUNCEMENT": "New festival calendar!", "JYOTISHA_ANNOUNCEMENT_LINK": "https://example.com/a"})
    assert _notice() == {"kind": "announcement", "text": "New festival calendar!", "link": "https://example.com/a"}
    store.update({"JYOTISHA_ANNOUNCEMENT_UNTIL": "2020-01-01"})
    assert _notice() is None
    store.update({"JYOTISHA_MAINTENANCE": "1"})
    assert _notice()["kind"] == "maintenance"


def test_counters_keep_totals_only():
    store.stats.record("page_views", "203.0.113.5")
    store.stats.record("page_views", "203.0.113.5")
    store.stats.record("page_views", "203.0.113.9")
    today = store.stats.snapshot(1)[0]
    assert today["page_views"] == 3 and today["visitors"] == 2
    assert "203.0.113" not in (store.data_dir() / "stats.json").read_text()


def test_login_attempts_are_limited(panel):
    results = [call(panel, "POST", "/api/admin/login", {"password": "wrong-password-here"})[0] for _ in range(admin.MAX_FAILURES * 3 + 1)]
    assert results[-1] == 429
