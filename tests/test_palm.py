"""Palm reading: checking the photo, the AI's vision reading (stubbed), 'not a palm', and that the photo is not kept."""

import base64
import json

import pytest

from jyotisha_ai import palm
from tests.test_webapp import local_server, request  # noqa: F401 - pytest fixture reused

JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 4000
PHOTO = "data:image/jpeg;base64," + base64.b64encode(JPEG).decode()
TEXT = "Your line is long and clear, a sign of warmth and a caring heart that people trust easily. " * 1
GOOD = {"palm": True, "heart": TEXT, "head": TEXT, "life": TEXT, "fate": TEXT, "summary": TEXT + TEXT}
REQUEST = {"hand": "right", "language": "te", "image": PHOTO}


@pytest.fixture
def ai(monkeypatch):
    calls = []

    def complete(system, prompt, **kwargs):
        calls.append((system, prompt, kwargs))
        return json.dumps(GOOD)

    monkeypatch.setattr(palm.assistant, "complete", complete)
    monkeypatch.setattr(palm.assistant, "available", lambda: True)
    return calls


def test_photo_checks():
    for change in ({"hand": "both"}, {"language": "xx"}, {"image": "not a photo"},
                   {"image": "data:image/gif;base64," + base64.b64encode(JPEG).decode()},
                   {"image": "data:image/jpeg;base64,!!!"},
                   {"image": "data:image/jpeg;base64," + base64.b64encode(b"\xff\xd8\xff").decode()},           # too small
                   {"image": "data:image/jpeg;base64," + base64.b64encode(b"\x00" * 5000).decode()},          # not a JPEG
                   {"image": "data:image/jpeg;base64," + base64.b64encode(b"\xff\xd8\xff" + b"\x00" * 700_000).decode()}):
        with pytest.raises(ValueError):
            palm.check_request({**REQUEST, **change})
    assert palm.check_request(REQUEST)[:3] == ("right", "te", "image/jpeg")


def test_the_photo_goes_to_the_ai_and_the_reading_comes_back_in_the_language(ai, tmp_path):
    result = palm.reading(REQUEST)
    assert result["status"] == "ok" and set(result["reading"]) == {"heart", "head", "life", "fate", "summary"}
    system, prompt, kwargs = ai[0]
    assert "Telugu" in system and "right palm" in system and kwargs["image"] == ("image/jpeg", PHOTO.split(",", 1)[1])
    assert "never about how long one lives" in prompt


def test_not_a_palm_off_and_bad_replies(ai, monkeypatch):
    monkeypatch.setattr(palm.assistant, "complete", lambda *a, **k: json.dumps({"palm": False}))
    assert palm.reading(REQUEST) == {"status": "not_palm", "reading": None}
    monkeypatch.setattr(palm.assistant, "complete", lambda *a, **k: json.dumps({**GOOD, "life": "You will live to ninety and avoid accidents. " * 3}))
    assert palm.reading(REQUEST) == {"status": "unavailable", "reading": None}   # banned content is never shown
    monkeypatch.setenv("JYOTISHA_AI_PALM", "0")
    assert palm.reading(REQUEST) == {"status": "off", "reading": None}


def test_the_photo_is_not_written_anywhere(ai, tmp_path, monkeypatch):
    monkeypatch.setenv("JYOTISHA_DATA_DIR", str(tmp_path / "data"))
    palm.reading(REQUEST)
    assert not (tmp_path / "data").exists() or not any((tmp_path / "data").rglob("*"))


def test_endpoint_takes_a_real_size_photo_and_refuses_an_oversized_body(ai, local_server):
    big_jpeg = b"\xff\xd8\xff\xe0" + b"\x00" * 300_000                     # a resized phone photo is well under this
    body = json.dumps({"hand": "left", "language": "en", "image": "data:image/jpeg;base64," + base64.b64encode(big_jpeg).decode()})
    status, _, reply = request(local_server, "POST", "/api/palm", body, {"Content-Type": "application/json"})
    assert status == 200 and json.loads(reply)["status"] == "ok"
    too_big = json.dumps({"hand": "left", "language": "en", "image": "data:image/jpeg;base64," + "A" * 1_000_000})
    status, _, _ = request(local_server, "POST", "/api/palm", too_big, {"Content-Type": "application/json"})
    assert status == 413
    status, _, _ = request(local_server, "POST", "/api/tarot", "x" * 20_000, {"Content-Type": "application/json"})
    assert status == 413                                                    # other endpoints keep the small limit
