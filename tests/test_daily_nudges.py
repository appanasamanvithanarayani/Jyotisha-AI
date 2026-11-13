"""AI-written daily notification copy: checks, caching, and the endpoints. The AI is stubbed; no network."""

import json
from datetime import date, datetime, timedelta, timezone

import pytest

from jyotisha_ai import daily_nudges
from jyotisha_ai.webapp import nudges_status


def good_batch(tag="A"):
    return {
        "questions": [{"t": f"🤞 Question {tag}{i}?", "b": "Ask your stars 😉", "ask": f"Will plan {tag}{i} work out?"} for i in range(10)],
        "dasha": [{"t": "👀 Your {dasha} period speaks", "b": "Tap to hear 🤫", "ask": "How is my {dasha} period?"}],
        "sign": [{"t": "🌙 {sign}, tonight is yours", "b": "See why ✨", "ask": "How is tonight for {sign}?"}],
        "good": [{"t": "⏰ Golden hour", "b": "Do it now, till {end}"}, {"t": "🟢 Green signal", "b": "Till {end} only"}, {"t": "✨ Lucky window", "b": "Open till {end}"}],
        "bad": [{"t": "🚦 Red signal", "b": "Hold on till {end}"}, {"t": "🛑 Not now", "b": "Wait till {end}"}, {"t": "⏸️ Pause", "b": "Pause till {end}"}],
    }


def test_validate_keeps_good_lines_and_drops_rule_breakers():
    raw = good_batch()
    raw["questions"] += [
        {"t": "💎 Buy this gemstone", "b": "Guaranteed luck", "ask": "Which gemstone?"},          # banned words
        {"t": "📅 On 2026-12-01", "b": "x y", "ask": "When?"},                                     # a date
        {"t": "🙂 Hi {name}", "b": "Hello", "ask": "Hi?"},                                          # unknown blank
        {"t": "x" * 80, "b": "too long title", "ask": "?"},
    ]
    raw["dasha"].append({"t": "No blank here", "b": "b", "ask": "ask"})                             # must contain {dasha}
    raw["good"].append({"t": "No end time", "b": "Go now"})                                         # must contain {end}
    batch = daily_nudges.validate(raw)
    assert len(batch["questions"]) == 10 and len(batch["dasha"]) == 1 and len(batch["good"]) == 3 and len(batch["bad"]) == 3
    assert all("gemstone" not in item["t"].lower() for item in batch["questions"])
    assert daily_nudges.validate({"questions": [], "good": [], "bad": []}) is None                  # too few to use
    assert daily_nudges._parse("```json\n" + json.dumps(raw) + "\n```")["questions"][0]["t"].startswith("🤞")


@pytest.fixture
def ai(monkeypatch):
    calls = []

    def complete(system, prompt, **kwargs):
        calls.append((system, prompt, kwargs))
        return json.dumps(good_batch(str(len(calls))))

    monkeypatch.setattr(daily_nudges.assistant, "complete", complete)
    monkeypatch.setattr(daily_nudges.assistant, "available", lambda: True)
    daily_nudges._failed.clear()
    return calls


def test_batches_are_written_once_per_day_and_language_then_cached(ai):
    today = datetime.now(timezone.utc).date()
    first = daily_nudges.batches(today, 3, "te")
    assert sorted(first) == [(today + timedelta(days=i)).isoformat() for i in range(3)]
    assert len(ai) == 3 and "Telugu" in ai[0][0]
    assert ai[0][2]["model"] is None                                          # same model as the chat unless set
    again = daily_nudges.batches(today, 3, "te")
    assert again == first and len(ai) == 3                                    # served from the cache
    assert "Question 1" in ai[1][1]                                           # recent titles are passed on, to keep it fresh
    daily_nudges.batches(today, 1, "hi")
    assert len(ai) == 4 and "Hindi" in ai[3][0]


def test_a_separate_notification_model_can_be_set(monkeypatch, ai):
    monkeypatch.setenv("JYOTISHA_NUDGE_MODEL", "gemini-cheap-lite")
    daily_nudges.generate(date(2031, 2, 2), "en")
    assert ai[-1][2]["model"] == "gemini-cheap-lite"


def test_failed_generation_is_not_retried_at_once_and_switch_off_works(monkeypatch, ai):
    monkeypatch.setattr(daily_nudges.assistant, "complete", lambda *a, **k: "not json")
    day = date(2031, 1, 1)
    assert daily_nudges.generate(day, "en") is None
    monkeypatch.setattr(daily_nudges.assistant, "complete", lambda *a, **k: json.dumps(good_batch()))
    assert daily_nudges.generate(day, "en") is None                          # waits an hour after a failure
    monkeypatch.setenv("JYOTISHA_AI_NUDGES", "0")
    assert not daily_nudges.enabled()


def test_nudges_endpoint_checks_input(ai):
    today = datetime.now(timezone.utc).date().isoformat()
    result = nudges_status({"language": "te", "from": today, "days": 2})
    assert result["status"] == "ok" and len(result["batches"]) == 2
    for bad in ({"language": "xx", "from": today}, {"language": "te", "from": "2001-01-01"}, {"language": "te", "from": today, "days": 30}):
        with pytest.raises(ValueError):
            nudges_status(bad)


def test_admin_sees_todays_batch(ai):
    from tests.test_admin import call, sign_in
    from jyotisha_ai.webapp import LocalServer
    from threading import Thread
    import os
    os.environ["JYOTISHA_ADMIN_PASSWORD"] = "a-long-test-password"
    server = LocalServer(port=0, bind_host="127.0.0.1", public=True, allowed_hosts=("127.0.0.1",), trust_proxy=False)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        cookie = sign_in(server)
        status, _, body = call(server, "POST", "/api/admin/nudges", {"language": "te"}, cookie=cookie)
        data = json.loads(body)
        assert status == 200 and data["enabled"] is True and len(data["batch"]["questions"]) == 10
        assert call(server, "POST", "/api/admin/nudges", {"language": "te"})[0] == 401
    finally:
        os.environ.pop("JYOTISHA_ADMIN_PASSWORD", None)
        server.shutdown()
        thread.join(timeout=3)
        server.server_close()


def test_complete_sends_the_chosen_model_to_gemini(monkeypatch):
    import io
    from jyotisha_ai import assistant
    monkeypatch.setenv("JYOTISHA_ASSISTANT_PROVIDER", "gemini")
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    seen = []

    class Reply(io.BytesIO):
        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

    def urlopen(request, timeout=0):
        seen.append((request.full_url, json.loads(request.data)))
        return Reply(json.dumps({"candidates": [{"content": {"parts": [{"text": "{}"}]}}]}).encode())

    monkeypatch.setattr(assistant.urllib.request, "urlopen", urlopen)
    assert assistant.complete("sys", "hi", model="gemini-cheap-lite", json_output=True, max_tokens=2048) == "{}"
    url, body = seen[-1]
    assert "/models/gemini-cheap-lite:generateContent" in url
    assert body["generationConfig"]["maxOutputTokens"] == 2048 and body["generationConfig"]["responseMimeType"] == "application/json"
    assistant.complete("sys", "hi")
    assert f"/models/{assistant.DEFAULT_GEMINI_MODEL}:generateContent" in seen[-1][0]            # chat model when not set
    assert assistant.complete("sys", "hi", model="bad model!") is None


def test_failure_reasons_are_recorded_and_try_again_skips_the_wait(monkeypatch, ai):
    day = date(2031, 3, 3)
    key = (day.isoformat(), "te")
    # 1. The AI itself failed: its message is kept.
    def failing(*a, **k):
        daily_nudges.assistant.LAST_ERROR["text"] = "gemini model x answered HTTP 400: model not found"
        return None
    monkeypatch.setattr(daily_nudges.assistant, "complete", failing)
    assert daily_nudges.generate(day, "te") is None
    assert "HTTP 400: model not found" in daily_nudges.LAST_REPORT[key]
    # 2. Lines failed the checks: which ones and why.
    bad = good_batch(); bad["good"] = [{"t": "Go now", "b": "no end time here"}]
    monkeypatch.setattr(daily_nudges.assistant, "complete", lambda *a, **k: json.dumps(bad))
    assert daily_nudges.generate(day, "te") is None                          # still within the hour: not tried
    assert daily_nudges.generate(day, "te", force=True) is None               # the admin's Try again
    assert "good 0/1" in daily_nudges.LAST_REPORT[key] and "no {end}" in daily_nudges.LAST_REPORT[key]
    # 3. A good reply after a forced retry is saved and the reason cleared.
    monkeypatch.setattr(daily_nudges.assistant, "complete", lambda *a, **k: json.dumps(good_batch()))
    assert daily_nudges.generate(day, "te", force=True) is not None and key not in daily_nudges.LAST_REPORT


def test_rahu_kalam_lines_may_talk_about_payments_and_put_the_time_in_the_title():
    raw = good_batch()
    raw["bad"] = [{"t": "🛑 Not now — till {end}", "b": "Hold big payments for a while"}]
    batch = daily_nudges.validate(raw)
    assert batch["bad"][0]["t"] == "🛑 Not now — till {end}"
    raw["bad"] = [{"t": "Pay now to fix it", "b": "till {end}"}]
    report = []
    assert daily_nudges.validate(raw, report) is None and "banned word" in " ".join(report)
