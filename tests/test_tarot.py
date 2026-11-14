"""Tarot: checking a 3-card draw, the AI reading (stubbed) with its cache, and the switch."""

import json

import pytest

from jyotisha_ai import tarot

TEXT = "This card brings a gentle, hopeful message for your path and asks you to trust yourself. " * 2
GOOD = {"past": TEXT, "present": TEXT, "future": TEXT, "advice": TEXT}
DRAW = {"topic": "career", "language": "te", "cards": [{"id": 0, "reversed": False}, {"id": 17, "reversed": True}, {"id": 21, "reversed": False}]}


@pytest.fixture
def ai(monkeypatch):
    calls = []

    def complete(system, prompt, **kwargs):
        calls.append((system, prompt))
        return json.dumps(GOOD)

    monkeypatch.setattr(tarot.assistant, "complete", complete)
    monkeypatch.setattr(tarot.assistant, "available", lambda: True)
    tarot._cache.clear()
    return calls


def test_twenty_two_major_arcana_and_six_topics():
    assert len(tarot.CARDS) == 22 and tarot.CARDS[0][0] == "The Fool" and tarot.CARDS[21][0] == "The World"
    assert set(tarot.TOPICS) == {"love", "career", "money", "health", "luck", "family"}


def test_bad_draws_are_refused():
    for change in ({"topic": "lottery"}, {"language": "xx"}, {"cards": DRAW["cards"][:2]},
                   {"cards": [{"id": 0, "reversed": False}] * 3}, {"cards": [{"id": 22, "reversed": False}, *DRAW["cards"][1:]]},
                   {"cards": [{"id": 1, "reversed": "no"}, *DRAW["cards"][1:]]}, {"cards": [{"id": True, "reversed": False}, *DRAW["cards"][1:]]}):
        with pytest.raises(ValueError):
            tarot.check_draw({**DRAW, **change})


def test_reading_is_written_in_the_language_about_the_topic_and_cached(ai):
    first = tarot.reading(DRAW)
    assert first["status"] == "ok" and set(first["reading"]) == {"past", "present", "future", "advice"}
    system, prompt = ai[0]
    assert "Telugu" in system and "career and work" in prompt and "The Star (reversed)" in prompt and "- future: The World" in prompt
    assert tarot.reading(DRAW) == first and len(ai) == 1                       # the same draw is not paid for twice


def test_off_or_a_bad_reply_falls_back_to_the_built_in_meanings(ai, monkeypatch):
    monkeypatch.setattr(tarot.assistant, "complete", lambda *a, **k: json.dumps({**GOOD, "advice": "Buy this gemstone now. " * 5}))
    assert tarot.reading(DRAW) == {"status": "unavailable", "reading": None}
    monkeypatch.setenv("JYOTISHA_AI_TAROT", "0")
    assert tarot.reading(DRAW) == {"status": "off", "reading": None}
