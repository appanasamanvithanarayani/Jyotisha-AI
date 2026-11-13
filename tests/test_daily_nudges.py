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
    assert len(batch["questions"]) == 10 and len(batch["dasha"]) == 1 and len(batch["good"]) == 3
    assert all("gemstone" not in item["t"].lower() for item in batch["questions"])
    assert daily_nudges.validate({"questions": [], "good": [], "bad": []}) is None                  # too few to use
    assert daily_nudges._parse("```json\n" + json.dumps(raw) + "\n```")["questions"][0]["t"].startswith("🤞")


@pytest.fixture
def ai(monkeypatch):
    calls = []

    def complete(system, prompt, **kwargs):
        calls.append((system, prompt))
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
    again = daily_nudges.batches(today, 3, "te")
    assert again == first and len(ai) == 3                                    # served from the cache
    assert "Question 1" in ai[1][1]                                           # recent titles are passed on, to keep it fresh
    daily_nudges.batches(today, 1, "hi")
    assert len(ai) == 4 and "Hindi" in ai[3][0]


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
