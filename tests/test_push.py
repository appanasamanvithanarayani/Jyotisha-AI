"""Admin-panel notifications through Firebase: validation, the request sent to FCM, and the admin route. No network."""

import io
import json

import pytest
import rsa

from jyotisha_ai import push, settings_store as store
from tests.test_admin import call, panel, sign_in  # noqa: F401 - pytest fixture reused


@pytest.fixture
def firebase_key(tmp_path, monkeypatch):
    public, private = rsa.newkeys(1024)
    key = {"type": "service_account", "project_id": "jyotisha-test", "client_email": "push@jyotisha-test.iam.gserviceaccount.com",
           "private_key": private.save_pkcs1().decode(), "token_uri": "https://oauth2.googleapis.com/token"}
    path = tmp_path / "firebase-key.json"
    path.write_text(json.dumps(key), encoding="utf-8")
    monkeypatch.setenv("JYOTISHA_FIREBASE_KEY", str(path))
    push._token.update(value="", expires=0.0)
    return key


@pytest.fixture
def fake_google(monkeypatch):
    """Stand in for Google: the token endpoint and FCM; records what was sent."""
    sent = []

    class Reply(io.BytesIO):
        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

    def urlopen(request, timeout=0):
        sent.append({"url": request.full_url, "headers": dict(request.header_items()), "body": request.data})
        if request.full_url.startswith("https://oauth2.googleapis.com/token"):
            return Reply(json.dumps({"access_token": "test-token", "expires_in": 3600}).encode())
        return Reply(json.dumps({"name": "projects/jyotisha-test/messages/123"}).encode())

    monkeypatch.setattr(push.urllib.request, "urlopen", urlopen)
    return sent


def test_validate_checks_lengths_audience_and_screen():
    languages = ("en", "te", "hi")
    assert push.validate(" 🪔 Happy Diwali ", "See the muhurat.", "te", "calendar", languages) == {
        "title": "🪔 Happy Diwali", "body": "See the muhurat.", "topic": "lang-te", "page": "calendar"}
    assert push.validate("Hi", "Hello", "all", "home", languages)["topic"] == "all"
    for bad in [("", "x", "all", "home"), ("x" * 66, "x", "all", "home"), ("x", "y" * 241, "all", "home"),
                ("x", "y", "fr", "home"), ("x", "y", "all", "admin"), ("x\x07", "y", "all", "home")]:
        with pytest.raises(push.PushError):
            push.validate(*bad, languages)


def test_not_ready_without_a_key(monkeypatch, tmp_path):
    monkeypatch.setenv("JYOTISHA_FIREBASE_KEY", str(tmp_path / "missing.json"))
    assert push.status() == {"ready": False, "project": None}
    with pytest.raises(push.PushError, match="not set up"):
        push.send({"title": "a", "body": "b", "topic": "all", "page": "home"})


def test_send_signs_in_and_posts_an_fcm_v1_message(firebase_key, fake_google):
    assert push.status() == {"ready": True, "project": "jyotisha-test"}
    message_id = push.send({"title": "🪔 Happy Diwali", "body": "Muhurat inside.", "topic": "lang-te", "page": "calendar"})
    assert message_id == "projects/jyotisha-test/messages/123"
    token_call, fcm_call = fake_google
    assert b"grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer" in token_call["body"]
    assert fcm_call["url"] == "https://fcm.googleapis.com/v1/projects/jyotisha-test/messages:send"
    assert fcm_call["headers"]["Authorization"] == "Bearer test-token"
    message = json.loads(fcm_call["body"])["message"]
    assert message["topic"] == "lang-te" and message["notification"] == {"title": "🪔 Happy Diwali", "body": "Muhurat inside."}
    assert message["data"] == {"page": "calendar"} and message["android"]["notification"]["icon"] == "ic_stat_jyotisha"
    push.send({"title": "again", "body": "b", "topic": "all", "page": "home"})
    assert len(fake_google) == 3                                       # the access token is reused


def test_admin_route_sends_and_records_it(panel, firebase_key, fake_google):  # noqa: F811
    cookie = sign_in(panel)
    status, _, body = call(panel, "GET", "/api/admin/state", cookie=cookie)
    assert status == 200 and json.loads(body)["push"]["ready"] is True
    payload = {"title": "Festival today", "body": "Open the app", "audience": "all", "page": "calendar"}
    assert call(panel, "POST", "/api/admin/push", payload)[0] == 401          # needs a session
    status, _, body = call(panel, "POST", "/api/admin/push", payload, cookie=cookie)
    assert status == 200 and json.loads(body)["ok"] is True
    assert json.loads(fake_google[-1]["body"])["message"]["topic"] == "all"
    assert store.audit_tail()[0]["key"] == "PUSH" and store.audit_tail()[0]["new"] == "Festival today"
    status, _, body = call(panel, "POST", "/api/admin/push", {**payload, "audience": "xx"}, cookie=cookie)
    assert status == 400 and "audience" in json.loads(body)["error"]
