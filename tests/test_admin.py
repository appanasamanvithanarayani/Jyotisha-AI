"""Admin panel: settings store, sign-in, and the routes. Synthetic values only."""

import http.client
import json
from datetime import date, timedelta
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


def test_admin_state_includes_safe_payment_status(panel):
    cookie = sign_in(panel)
    state = json.loads(call(panel, "GET", "/api/admin/state", cookie=cookie)[2])
    assert state["payments"] == {"ready": False, "provider": None, "chat_bonus_rs": 9, "reading_unlock_rs": 9}
    assert "RAZORPAY_KEY_SECRET" not in json.dumps(state["payments"])


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


def test_anonymous_analytics_counts_new_returning_users_and_generation_types():
    store.analytics.visit("random-device-token-a-12345")
    store.analytics.visit("random-device-token-a-12345")
    store.analytics.visit("random-device-token-b-67890")
    store.analytics.generated("random-device-token-a-12345", "kundli")
    store.analytics.generated("random-device-token-a-12345", "tarot")
    store.analytics.viewed("random-device-token-a-12345", "numerology")
    store.analytics.observe("random-device-token-a-12345", "tarot", True, 120)
    store.analytics.observe("random-device-token-b-67890", "palm", False, 250)
    store.analytics.ad_event("random-device-token-a-12345", "rewarded", "requested")
    store.analytics.ad_event("random-device-token-a-12345", "rewarded", "shown")
    store.analytics.ad_event("random-device-token-a-12345", "rewarded", "rewarded")
    store.analytics.ad_event("random-device-token-a-12345", "rewarded", "dismissed")
    store.analytics.ad_event("random-device-token-b-67890", "interstitial", "failed")
    store.analytics.payment_event("random-device-token-a-12345", "unlock", "orders", 900)
    assert store.analytics.payment_event("random-device-token-a-12345", "unlock", "successful", 900, "pay_private_123")
    assert not store.analytics.payment_event("random-device-token-a-12345", "unlock", "successful", 900, "pay_private_123")
    store.analytics.payment_event("random-device-token-b-67890", "chat_bonus", "failed")
    store.analytics.installed("random-device-token-a-12345", "android")
    store.analytics.installed("random-device-token-a-12345", "android")
    store.analytics.profile_birth_year("random-device-token-a-12345", "2000-06-15")
    snapshot = store.analytics.snapshot()
    assert snapshot["total_users"] == 2 and snapshot["active_today"] == 2 and snapshot["new_today"] == 2
    assert snapshot["total_installs"] == 1 and snapshot["new_installs_today"] == 1 and snapshot["install_platforms"]["android"] == 1
    assert snapshot["periods"]["30"] == {"all_users": 2, "unique_users": 2, "active_users": 2, "inactive_users": 0,
                                            "new_users": 2, "new_installs": 1}
    assert snapshot["generation_totals"]["kundli"] == 1 and snapshot["generation_totals"]["tarot"] == 1
    assert snapshot["feature_views"]["numerology"] == 1
    assert snapshot["observability"]["tarot"]["success_rate"] == 100 and snapshot["observability"]["tarot"]["avg_ms"] == 120
    assert snapshot["observability"]["palm"]["failure"] == 1 and snapshot["observability"]["palm"]["max_ms"] == 250
    assert snapshot["feature_unique_users"]["tarot"] == 1 and snapshot["feature_unique_users"]["palm"] == 1
    assert snapshot["new_user_features"]["numerology"] == 1
    assert snapshot["ad_periods"]["30"]["rewarded"] == {"requested": 1, "shown": 1, "rewarded": 1, "dismissed": 1, "failed": 0}
    assert snapshot["ad_periods"]["all"]["interstitial"]["failed"] == 1
    assert snapshot["payment_periods"]["30"]["successful"] == 1
    assert snapshot["payment_periods"]["30"]["revenue_paise"] == 900
    assert snapshot["payment_periods"]["all"]["features"]["unlock"]["orders"] == 1
    assert snapshot["payment_periods"]["all"]["features"]["chat_bonus"]["failed"] == 1
    first = next(user for user in snapshot["users"] if user["generation_count"] == 2)
    assert first["generations"]["kundli"] == 1 and len(first["id"]) == 10
    assert first["birth_year"] == 2000 and first["age_range"] in ("25–34", "18–24")
    assert first["usage"]["numerology"] == 1 and first["usage"]["tarot"] == 1
    assert first["platform"] == "android" and first["installed_at"]
    saved = (store.data_dir() / "analytics.json").read_text()
    assert "random-device-token" not in saved and "2000-06-15" not in saved and "pay_private_123" not in saved


def test_admin_analytics_exposes_history_and_period_comparisons():
    today = date.today()
    old_day = (today - timedelta(days=30)).isoformat()
    yesterday = (today - timedelta(days=1)).isoformat()
    payload = {
        "users": {"anon-a": {"first_seen": old_day, "last_seen": yesterday, "visits": 2, "generations": {"tarot": 2}},
                  "anon-b": {"first_seen": old_day, "last_seen": old_day, "visits": 1, "generations": {}}},
        "days": {
            old_day: {"users": ["anon-a", "anon-b"], "new_users": 2, "new_installs": 1, "views": {"tarot": 2},
                      "generations": {"tarot": 2}, "observability": {"tarot": {"requests": 2}}},
            yesterday: {"users": ["anon-a"], "new_users": 0, "views": {"home": 1}, "generations": {}},
        },
    }
    path = store.data_dir() / "analytics.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload), encoding="utf-8")
    store.analytics._loaded_from = None

    snapshot = store.analytics.snapshot()
    assert [row["date"] for row in snapshot["history"]] == [old_day, yesterday]
    assert [row["all_users"] for row in snapshot["history"]] == [2, 2]
    assert snapshot["history"][-1]["active_users"] == 1 and snapshot["history"][-1]["inactive_users"] == 1
    month_ago = next(row for row in snapshot["comparisons"] if row["label"] == "30 days ago")
    assert month_ago["all_users"] == 2 and month_ago["unique_users"] == 2 and month_ago["new_installs"] == 1
    assert month_ago["feature_views"] == 2 and month_ago["feature_requests"] == 2 and month_ago["generation_count"] == 2
    assert snapshot["periods"]["30"] == {"all_users": 2, "unique_users": 1, "active_users": 1, "inactive_users": 1,
                                          "new_users": 0, "new_installs": 0}
    assert snapshot["periods"]["all"] == {"all_users": 2, "unique_users": 2, "active_users": 2, "inactive_users": 0,
                                           "new_users": 2, "new_installs": 0}


def test_counter_history_keeps_all_recorded_days():
    old_day = (date.today() - timedelta(days=90)).isoformat()
    path = store.data_dir() / "stats.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({old_day: {"page_views": 7}}), encoding="utf-8")
    store.stats._loaded_from = None
    assert store.stats.history() == [{"date": old_day, "page_views": 7, "day_panchang": 0, "month_calendar": 0,
                                      "birth_chart": 0, "ai_questions": 0, "places": 0, "apk_downloads": 0,
                                      "rate_limited": 0, "visitors": 0}]


def test_private_low_rating_is_saved_and_visible_only_in_admin(panel):
    status, _, body = call(panel, "POST", "/api/rating", {"stars": 2, "reason": "The regenerate button failed", "language": "en"})
    assert status == 200 and json.loads(body) == {"ok": True, "stars": 2}
    assert call(panel, "POST", "/api/rating", {"stars": 1, "reason": "", "language": "te"})[0] == 400
    cookie = sign_in(panel)
    ratings = json.loads(call(panel, "GET", "/api/admin/state", cookie=cookie)[2])["ratings"]
    assert ratings["total"] == 1 and ratings["average"] == 2
    assert ratings["counts"]["2"] == 1 and ratings["recent"][0]["reason"] == "The regenerate button failed"


def test_partner_quota_can_be_checked_before_an_ad(panel):
    store.update({"JYOTISHA_PARTNER_PORTRAIT_PER_VISITOR_DAY": "1"})
    status, _, body = call(panel, "GET", "/api/partner-portrait-quota")
    assert status == 200 and json.loads(body)["remaining"] == 1
    request = {"house7_rashi": 4, "venus_rashi": 7, "gender": "woman"}
    assert call(panel, "POST", "/api/partner-portrait", request)[0] in (200, 422)
    assert json.loads(call(panel, "GET", "/api/partner-portrait-quota")[2])["remaining"] == 0
    status, _, body = call(panel, "POST", "/api/partner-portrait", request)
    assert status == 429 and json.loads(body)["code"] == "partner_daily_limit"


def test_login_attempts_are_limited(panel):
    results = [call(panel, "POST", "/api/admin/login", {"password": "wrong-password-here"})[0] for _ in range(admin.MAX_FAILURES * 3 + 1)]
    assert results[-1] == 429


def test_test_image_reports_off_and_the_real_failure_reason(panel, monkeypatch):
    from jyotisha_ai import partner_portrait

    cookie = sign_in(panel)
    monkeypatch.delenv("JYOTISHA_AI_PARTNER_PORTRAIT", raising=False)
    monkeypatch.delenv("JYOTISHA_ASSISTANT_PROVIDER", raising=False)
    status, _, body = call(panel, "POST", "/api/admin/test-image", {}, cookie)
    result = json.loads(body)
    assert status == 200 and result["ok"] is False and "Off:" in result["detail"]

    monkeypatch.setattr(partner_portrait, "enabled", lambda: True)
    monkeypatch.setattr(partner_portrait.assistant, "generate_image", lambda prompt, **kwargs: None)
    monkeypatch.setattr(partner_portrait.assistant, "LAST_ERROR", {"text": "gemini image model x answered HTTP 404: not found"})
    status, _, body = call(panel, "POST", "/api/admin/test-image", {}, cookie)
    result = json.loads(body)
    assert status == 200 and result["ok"] is False and result["detail"] == "gemini image model x answered HTTP 404: not found"

    monkeypatch.setattr(partner_portrait.assistant, "generate_image", lambda prompt, **kwargs: ("image/png", "ZmFrZQ=="))
    status, _, body = call(panel, "POST", "/api/admin/test-image", {}, cookie)
    assert status == 200 and json.loads(body) == {"ok": True, "detail": ""}
