"""Local app interface tests with synthetic requests; not astronomy validation."""

import base64
import http.client
import json
from threading import Thread

import pytest

import jyotisha_ai.webapp as webapp
from jyotisha_ai.webapp import LocalServer, _validated_bind_host, birth_chart_readiness, birth_input_status, experimental_chart, panchang_month_status, panchang_noon_status, serve


@pytest.fixture
def local_server():
    server = LocalServer(port=0)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield server
    finally:
        server.shutdown()
        thread.join(timeout=3)
        server.server_close()


def request(server, method, path, body=None, headers=None):
    connection = http.client.HTTPConnection("127.0.0.1", server.server_port, timeout=30)
    connection.request(method, path, body=body, headers=headers or {})
    response = connection.getresponse()
    result = response.status, dict(response.getheaders()), response.read()
    connection.close()
    return result


def test_server_binds_only_to_loopback_and_serves_ui(local_server):
    assert local_server.server_address[0] == "127.0.0.1"
    status, headers, body = request(local_server, "GET", "/")
    assert status == 200
    assert b"Kundli" in body and b"Birth chart" in body
    assert b'name="dob"' in body and b'name="pob"' in body and b'name="tob"' in body
    assert b'<fieldset id="birth-fields" disabled>' in body
    assert b'id="chart-positions"' in body
    assert b'id="d1-grid"' in body
    assert b'id="chat-form"' in body
    assert b'id="month-calendar"' in body and b'id="language-switch"' in body
    assert b'id="about"' not in body and b"Advanced research tools" not in body and b'class="app-footer"' not in body
    assert b'id="services"' in body
    assert b'class="bottom-nav"' in body
    assert b'id="welcome-screen"' in body
    assert b'id="step-welcome"' in body
    assert b'id="step-language"' in body
    assert b'id="step-location"' in body
    assert b'id="allow-location"' in body
    assert b'id="month-calendar"' in body
    assert b'src="/calendar-ui.js"' in body
    assert b'About these calculations' not in body and b'Calculation details and limitations' not in body
    assert b'Local research preview' not in body
    assert b'No generated readings' not in body
    assert b'src="/chart-ui.js"' in body
    assert b'name="utc_offset"' not in body
    assert headers["Cache-Control"] == "no-store"


def test_chart_ui_script_is_local_and_served_with_no_cache(local_server):
    status, headers, body = request(local_server, "GET", "/chart-ui.js")
    assert status == 200
    assert headers["Content-Type"] == "application/javascript; charset=utf-8"
    assert headers["Cache-Control"] == "no-store"
    assert b"buildSouthIndianChart" in body
    assert b"answerChartQuestion" in body


def test_calendar_ui_script_is_local_and_served_with_no_cache(local_server):
    status, headers, body = request(local_server, "GET", "/calendar-ui.js")
    assert status == 200
    assert headers["Content-Type"] == "application/javascript; charset=utf-8"
    assert headers["Cache-Control"] == "no-store"
    assert b"monthCells" in body


def test_panchang_names_script_and_place_datalist_are_served(local_server):
    status, headers, body = request(local_server, "GET", "/panchang-names.js")
    assert status == 200
    assert headers["Content-Type"] == "application/javascript; charset=utf-8"
    assert headers["Cache-Control"] == "no-store"
    assert b"tithiName" in body and b"nakshatraName" in body
    status, _, page = request(local_server, "GET", "/")
    assert status == 200
    assert b'id="place-suggestions"' in page
    assert page.count(b'type="text" list="place-suggestions"') == 3
    assert b'src="/panchang-names.js"' in page
    assert b'src="/app.js"' in page and b'href="/app.css"' in page
    status, headers, script = request(local_server, "GET", "/app.js")
    assert status == 200 and headers["Content-Type"] == "application/javascript; charset=utf-8"
    assert b"/api/nearby-place" in script and b"showPage('home')" in script and b"/api/month-calendar" in script
    status, headers, css = request(local_server, "GET", "/app.css")
    assert status == 200 and headers["Content-Type"] == "text/css; charset=utf-8" and b"--gold" in css
    assert b'href="#home"' in page and b'href="#top"' not in page
    assert b'id="day-panchang"' in page


def test_place_suggestions_endpoint_uses_approved_lookup(local_server, monkeypatch):
    def fake_suggestions(_root, query):
        assert query == "Test"
        return [{"label": "Test City, TC", "value": "Test City, TC"}]
    monkeypatch.setattr("jyotisha_ai.webapp.suggest_places", fake_suggestions)
    status, _, body = request(local_server, "POST", "/api/places",
        body=b'{"query":"Test"}', headers={"Content-Type": "application/json"})
    assert status == 200
    assert json.loads(body) == {"status": "ok", "suggestions": [
        {"label": "Test City, TC", "value": "Test City, TC"}]}


def test_place_suggestions_fail_closed_and_reject_extra_fields(local_server, monkeypatch):
    from jyotisha_ai.birth_resolution import BirthResolutionError
    monkeypatch.setattr("jyotisha_ai.webapp.suggest_places", lambda *_: (_ for _ in ()).throw(
        BirthResolutionError("approved catalog is missing")))
    status, _, body = request(local_server, "POST", "/api/places",
        body=b'{"query":"Test"}', headers={"Content-Type": "application/json"})
    assert status == 422
    assert json.loads(body)["suggestions"] is None
    status, _, body = request(local_server, "POST", "/api/places",
        body=b'{"query":"Test","dob":"2000-01-01"}',
        headers={"Content-Type": "application/json"})
    assert status == 400
    assert "only a place query" in json.loads(body)["error"]


def test_nearby_place_requires_coordinates_and_only_returns_candidate(local_server, monkeypatch):
    monkeypatch.setattr("jyotisha_ai.webapp.nearby_place", lambda _root, lat, lon: {
        "value": "Test City, TC", "distance_km": 2.0, "status": "approximate_nearby_city"
    } if (lat, lon) == (10.0, 20.0) else None)
    status, _, body = request(local_server, "POST", "/api/nearby-place",
        body=b'{"latitude":10.0,"longitude":20.0}', headers={"Content-Type": "application/json"})
    result = json.loads(body)
    assert status == 200
    assert result["candidate"]["value"] == "Test City, TC"
    assert "birth location" in result["message"]
    status, _, body = request(local_server, "POST", "/api/nearby-place",
        body=b'{"latitude":10.0,"longitude":20.0,"dob":"2000-01-01"}',
        headers={"Content-Type": "application/json"})
    assert status == 400


def test_second_server_cannot_bind_same_port(local_server):
    with pytest.raises(OSError):
        LocalServer(port=local_server.server_port)


def test_advanced_research_calculator_remains_available(local_server):
    status, _, body = request(local_server, "GET", "/research")
    assert status == 200
    assert b"Birth chart laboratory" in body


def test_birth_readiness_blocks_input_before_personal_data(local_server, monkeypatch):
    from jyotisha_ai.birth_resolution import BirthResolutionError
    def missing_catalog(_root):
        raise BirthResolutionError("approved catalog is missing")
    monkeypatch.setattr("jyotisha_ai.webapp._approved_catalog", missing_catalog)
    status, _, body = request(local_server, "GET", "/api/birth-readiness")
    result = json.loads(body)
    assert status == 503
    assert result["can_calculate"] is False
    assert "personal birth details" in result["message"]
    assert any("catalog" in blocker for blocker in result["blockers"])


def test_birth_readiness_reports_missing_catalog_in_empty_workspace(tmp_path):
    result = birth_chart_readiness(tmp_path)
    assert result["can_calculate"] is False
    assert any("catalog" in blocker for blocker in result["blockers"])


def test_three_input_flow_fails_closed_without_resolvers(local_server):
    payload = {"dob": "2000-01-01", "pob": "Synthetic Test City", "tob": "12:00"}
    status, _, body = request(
        local_server, "POST", "/api/birth-chart", body=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
    )
    result = json.loads(body)
    assert status == 422
    assert result["chart"] is None
    assert result["status"] == "resolution_unavailable"
    assert "Synthetic Test City" not in body.decode()


def test_birth_chart_http_success_uses_chart_status(local_server, monkeypatch):
    monkeypatch.setattr("jyotisha_ai.webapp.birth_input_status", lambda *_: {
        "status": "experimental_chart", "chart": {"validation_status": "synthetic_mock"},
        "message": "Mocked response only",
    })
    status, _, body = request(
        local_server, "POST", "/api/birth-chart",
        body=b'{"dob":"2000-01-01","pob":"Test City","tob":"12:00"}',
        headers={"Content-Type": "application/json"},
    )
    assert status == 200
    assert json.loads(body)["chart"]["validation_status"] == "synthetic_mock"


def test_noon_indices_return_only_limited_calendar_fields(monkeypatch):
    calls = []
    def fake_birth(payload, root):
        calls.append(payload)
        return {
            "chart": {
                "panchanga_at_birth": {
                    "tithi_index": 3, "nakshatra_index": 17, "nakshatra_pada": 2,
                    "yoga_index": 4, "karana_half_tithi_index": 5,
                    "civil_weekday_index_sunday_first": 6,
                },
                "conventions": {"ephemeris": "synthetic-test-only"},
                "input": {"ayanamsha_id": "synthetic-test-only"},
                "positions": {"Moon": "must not be exported"},
            },
            "resolved_birth": {"place": {"name": "Test City"}, "local_datetime": "2000-01-01T12:00:00+00:00"},
        }
    monkeypatch.setattr("jyotisha_ai.webapp.birth_input_status", fake_birth)
    result = panchang_noon_status({"date": "2000-01-01", "place": "Test City"})
    assert calls == [{"dob": "2000-01-01", "pob": "Test City", "tob": "12:00"}]
    assert result["indices"]["tithi_index"] == 3
    assert "positions" not in result and "chart" not in result
    assert "sunrise" in result["message"]


def test_noon_indices_fail_closed_on_invalid_or_unresolved_input(local_server):
    status, _, body = request(local_server, "POST", "/api/panchang-noon",
        body=b'{"date":"2000-01-01","place":"Synthetic Missing City"}',
        headers={"Content-Type": "application/json"})
    result = json.loads(body)
    assert status == 422 and result["indices"] is None
    assert "chart" not in result
    with pytest.raises(ValueError, match="only date and place"):
        panchang_noon_status({"date": "2000-01-01", "place": "Test City", "tob": "12:00"})


def test_month_calendar_has_every_date_and_only_noon_indices(monkeypatch, tmp_path):
    from zoneinfo import ZoneInfo
    monkeypatch.setattr("jyotisha_ai.webapp._approved_catalog", lambda _root: tmp_path / "synthetic.zip")
    monkeypatch.setattr("jyotisha_ai.webapp._matching_places", lambda _path, _query: [{
        "name": "Test City", "country_code": "TC", "timezone": "Etc/UTC", "latitude": 0, "longitude": 0,
    }])
    monkeypatch.setattr("jyotisha_ai.webapp._pinned_zone", lambda _key: ZoneInfo("Etc/UTC"))
    monkeypatch.setattr("jyotisha_ai.webapp.validate_local_chart_runtime", lambda: None)
    monkeypatch.setattr("jyotisha_ai.webapp.true_lahiri_for_utc", lambda _moment: (0, 0))
    seen = []
    def fake_chart(moment, *_args):
        seen.append(moment)
        return {"panchanga_at_birth": {
            "tithi_index": 1, "nakshatra_index": 1, "nakshatra_pada": 1,
            "yoga_index": 1, "karana_half_tithi_index": 1,
            "civil_weekday_index_sunday_first": 1,
        }, "positions": {"Moon": "not for calendar export"}}
    monkeypatch.setattr("jyotisha_ai.webapp.calculate_chart", fake_chart)
    result = panchang_month_status({"year": 2000, "month": 2, "place": "Test City"}, tmp_path)
    assert result["status"] == "experimental_noon_month"
    assert len(result["days"]) == 29 and len(seen) == 29
    assert result["days"][0]["date"] == "2000-02-01"
    assert result["days"][-1]["date"] == "2000-02-29"
    assert len(result["today_local_date"]) == 10
    assert all(moment.hour == 12 for moment in seen)
    assert "positions" not in result["days"][0]
    assert "sunrise" in result["message"]


def test_month_calendar_rejects_invalid_range_and_fails_without_approved_data(tmp_path):
    with pytest.raises(ValueError, match="1970"):
        panchang_month_status({"year": 1969, "month": 1, "place": "Test City"}, tmp_path)
    with pytest.raises(ValueError, match="month"):
        panchang_month_status({"year": 2026, "month": 13, "place": "Test City"}, tmp_path)
    result = panchang_month_status({"year": 2026, "month": 10, "place": "Test City"}, tmp_path)
    assert result["status"] == "calculation_unavailable" and result["days"] is None


@pytest.mark.parametrize("payload", [
    {"dob": "2000-02-30", "pob": "Test City", "tob": "12:00"},
    {"dob": "2000-01-01", "pob": "Test City", "tob": "25:00"},
    {"dob": "2000-01-01", "pob": "", "tob": "12:00"},
    {"dob": "2000-01-01", "pob": "Test City", "tob": "12:00", "utc_offset": "+05:30"},
])
def test_invalid_three_input_request_returns_no_chart(payload):
    with pytest.raises(ValueError):
        birth_input_status(payload)


def test_status_reports_untrained_and_unverified(local_server):
    status, _, body = request(local_server, "GET", "/api/status")
    result = json.loads(body)
    assert status == 200
    assert result["ai_model_status"] == "not_trained"
    assert result["chart_validation_status"] == "limited_two_synthetic_case_comparison"
    assert result["predictions_available"] is False


def test_public_deployment_readiness_fails_closed(local_server):
    status, _, body = request(local_server, "GET", "/api/deployment-readiness")
    result = json.loads(body)
    assert status == 503
    assert result["public_deployment_ready"] is False
    assert result["supported_interface_languages"][0] == "en" and {"te", "hi", "ta", "ur"} <= set(result["supported_interface_languages"])
    assert result["reviewed_interface_languages"] == ["en"]
    assert result["arbitrary_language_support"] is False
    assert result["blockers"]


def test_unexpected_host_is_rejected(local_server):
    status, _, body = request(
        local_server, "GET", "/api/status", headers={"Host": "example.invalid"},
    )
    assert status == 403
    assert "knowledge_records" not in json.loads(body)


def test_lan_preview_accepts_only_explicit_private_ipv4_and_bounded_duration():
    for address in ("10.4.5.6", "172.16.1.2", "172.31.255.254", "192.168.1.35"):
        assert _validated_bind_host(address) == address
    for address in ("0.0.0.0", "8.8.8.8", "169.254.1.2", "172.32.1.2", "::1", "example.com"):
        with pytest.raises(ValueError, match="private IPv4"):
            _validated_bind_host(address)
    with pytest.raises(ValueError, match="duration"):
        serve(lan_minutes=0)
    with pytest.raises(ValueError, match="private LAN"):
        serve(lan_ip="127.0.0.1")


def test_lan_server_without_duration_does_not_start_shutdown_timer(monkeypatch):
    class FakeServer:
        lan_enabled = True
        server_port = 8766

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def serve_forever(self):
            return None

    monkeypatch.setattr(webapp, "LocalServer", lambda *_args, **_kwargs: FakeServer())
    monkeypatch.setattr(webapp, "Timer", lambda *_args, **_kwargs: pytest.fail("unexpected shutdown timer"))
    monkeypatch.setattr(webapp.assistant, "available", lambda: False)
    monkeypatch.setenv("JYOTISHA_LAN_PASSCODE", "synthetic-test-passcode-123")
    serve(port=8766, lan_ip="192.168.1.35")


def test_lan_preview_requires_passcode_for_every_route_and_preserves_origin_check(local_server):
    # Use loopback transport in tests; the same handler enforces LAN authentication.
    local_server.lan_enabled = True
    local_server.lan_passcode = "synthetic-test-passcode-123"
    status, headers, _ = request(local_server, "GET", "/")
    assert status == 401 and "Basic" in headers["WWW-Authenticate"]
    status, _, _ = request(local_server, "POST", "/api/places", body=b'{}', headers={"Content-Type": "application/json"})
    assert status == 401
    wrong = "Basic " + base64.b64encode(b"preview:wrong-code").decode()
    status, _, _ = request(local_server, "GET", "/", headers={"Authorization": wrong})
    assert status == 401
    token = "Basic " + base64.b64encode(b"preview:synthetic-test-passcode-123").decode()
    status, _, body = request(local_server, "GET", "/", headers={"Authorization": token})
    assert status == 200 and b"Kundli" in body
    status, _, _ = request(local_server, "POST", "/api/places", body=b'{}', headers={"Authorization": token, "Content-Type": "application/json", "Origin": "https://evil.example"})
    assert status == 403


def test_chart_requires_acknowledgement_and_provenance(monkeypatch):
    monkeypatch.setattr("jyotisha_ai.webapp.calculate_chart", lambda *args: pytest.fail("calculator called"))
    with pytest.raises(ValueError, match="acknowledge"):
        experimental_chart({})
    with pytest.raises(ValueError, match="sourced ayanamsha"):
        experimental_chart({"experimental_ack": True})


def test_invalid_chart_request_returns_no_chart(local_server):
    status, _, body = request(
        local_server, "POST", "/api/chart", body=b"{}",
        headers={"Content-Type": "application/json"},
    )
    assert status == 400
    assert "chart" not in json.loads(body)


def test_cross_origin_request_is_rejected(local_server):
    status, _, body = request(
        local_server, "POST", "/api/chart", body=b"",
        headers={"Content-Type": "application/json", "Origin": "https://untrusted.example"},
    )
    assert status == 403
    assert "chart" not in json.loads(body)


def test_oversized_body_is_rejected(local_server):
    status, _, _ = request(
        local_server, "POST", "/api/chart", body=b"",
        headers={"Content-Type": "application/json", "Content-Length": "8193"},
    )
    assert status == 413


def test_success_uses_existing_calculator_and_labels_output(monkeypatch):
    def fake_calculator(*args):
        return {"input": {}, "validation_status": "not_independently_benchmarked"}

    monkeypatch.setattr("jyotisha_ai.webapp.calculate_chart", fake_calculator)
    result = experimental_chart({
        "experimental_ack": True,
        "birth_datetime": "2000-01-01T12:00:00+00:00",
        "latitude": 0,
        "longitude": 0,
        "ayanamsha_degrees": 0,
        "ayanamsha_id": "synthetic-test",
        "ayanamsha_source": "synthetic test only",
    })
    assert result["input"]["ayanamsha_source"] == "synthetic test only"
    assert "no independently verified chart" in result["notice"]


def test_synthetic_chart_http_smoke_is_not_an_accuracy_benchmark(local_server):
    payload = {
        "experimental_ack": True,
        "birth_datetime": "2000-01-01T12:00:00+00:00",
        "latitude": 0,
        "longitude": 0,
        "ayanamsha_degrees": 0,
        "ayanamsha_id": "synthetic-zero-test",
        "ayanamsha_source": "synthetic arithmetic test, not Lahiri",
    }
    status, _, body = request(
        local_server, "POST", "/api/chart", body=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    result = json.loads(body)
    assert status == 200
    assert result["validation_status"] == "not_independently_benchmarked"
    assert len(result["positions"]) == 7
    assert result["input"]["ayanamsha_source"] == payload["ayanamsha_source"]


def test_day_panchang_endpoint_returns_sunrise_day_or_no_result(local_server):
    headers = {"Content-Type": "application/json"}
    status, _, body = request(local_server, "POST", "/api/day-panchang", json.dumps({"date": "2026-10-30", "place": "Bengaluru"}), headers)
    assert status == 200
    day = json.loads(body)["day"]
    assert day["status"] == "experimental_sunrise_day" and day["sunrise"].startswith("2026-10-30T06:")
    status, _, body = request(local_server, "POST", "/api/day-panchang", json.dumps({"date": "2026-06-21", "place": "Murmansk, RU"}), headers)
    assert status == 422 and json.loads(body)["day"] is None
    status, _, _ = request(local_server, "POST", "/api/day-panchang", json.dumps({"date": "2026-10-30"}), headers)
    assert status == 400


def test_locales_bundle_is_served_with_english_first_and_all_languages(local_server):
    status, headers, body = request(local_server, "GET", "/locales.js")
    assert status == 200 and headers["Content-Type"] == "application/javascript; charset=utf-8"
    text = body.decode("utf-8")
    assert text.index("registry.en =") < text.index("registry.te =")
    for code in ("hi", "ta", "kn", "ml", "mr", "bn", "gu", "pa", "or", "as", "ur", "ne", "sa", "kok", "mai"):
        assert f"registry.{code} =" in text
    status, _, page = request(local_server, "GET", "/")
    assert b'src="/locales.js"' in page and page.index(b"/locales.js") < page.index(b"/calendar-ui.js")


def test_month_calendar_endpoint_marks_sunrise_tithis_and_rejects_bad_input(local_server):
    headers = {"Content-Type": "application/json"}
    status, _, body = request(local_server, "POST", "/api/month-calendar", json.dumps({"year": 2026, "month": 10, "place": "Bengaluru"}), headers)
    assert status == 200
    month = json.loads(body)
    assert month["status"] == "experimental_sunrise_month" and len(month["days"]) == 31
    assert month["days"][29]["date"] == "2026-10-30" and month["days"][29]["tithi_index"] == 20  # Krishna Panchami at sunrise
    assert all(1 <= day["tithi_index"] <= 30 and 1 <= day["nakshatra_index"] <= 27 for day in month["days"])
    assert [day["date"][-2:] for day in month["days"] if day["tithi_index"] in (15, 30)] == ["10", "26"]  # Amavasya, Purnima
    status, _, _ = request(local_server, "POST", "/api/month-calendar", json.dumps({"year": 1969, "month": 1, "place": "Bengaluru"}), headers)
    assert status == 400
    status, _, _ = request(local_server, "POST", "/api/month-calendar", json.dumps({"year": 2026, "month": 10}), headers)
    assert status == 400


def test_month_calendar_includes_festivals_and_gazetted_holidays(local_server):
    headers = {"Content-Type": "application/json"}
    status, _, body = request(local_server, "POST", "/api/month-calendar", json.dumps({"year": 2026, "month": 11, "place": "Bengaluru"}), headers)
    assert status == 200
    month = json.loads(body)
    events = {event["key"]: event for event in month["events"]}
    assert events["diwali"]["date"] == "2026-11-08" and events["diwali"]["holiday"] is True
    assert events["dhanteras"]["holiday"] is False
    assert all(event["date"].startswith("2026-11") for event in month["events"])
    assert "can differ by a day" in month["message"]


def test_assistant_is_off_without_a_key_and_validates_and_calls_claude_with_one(monkeypatch):
    import io
    from jyotisha_ai import assistant

    monkeypatch.setenv("JYOTISHA_ASSISTANT_PROVIDER", "offline")
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    assert assistant.ask_status({"question": "q", "language": "en", "facts": ["Lagna: Leo"]}) == {"status": "unconfigured"}
    monkeypatch.setenv("JYOTISHA_ASSISTANT_PROVIDER", "anthropic")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
    for bad in ({"question": "", "language": "en", "facts": ["x"]}, {"question": "q", "language": "xx", "facts": ["x"]}, {"question": "q", "language": "en", "facts": []}, {"question": "q", "language": "en", "facts": [1]}):
        with pytest.raises(ValueError):
            assistant.ask_status(bad)
    seen = {}

    class Reply(io.BytesIO):
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

    def fake_urlopen(request, timeout):
        seen["body"] = json.loads(request.data)
        seen["key"] = request.get_header("X-api-key")
        return Reply(json.dumps({"content": [{"type": "text", "text": "answer"}]}).encode())

    monkeypatch.setattr(assistant.urllib.request, "urlopen", fake_urlopen)
    result = assistant.ask_status({"question": "naa dabbu ela undi", "language": "te", "facts": ["Lagna: Leo"]})
    assert result == {"answer": "answer"}
    assert seen["key"] == "test-key" and "Telugu" in seen["body"]["system"]
    assert "naa dabbu ela undi" in seen["body"]["messages"][-1]["content"] and "Lagna: Leo" in seen["body"]["system"]
    monkeypatch.setattr(assistant.urllib.request, "urlopen", lambda *a, **k: (_ for _ in ()).throw(OSError("down")))
    assert assistant.ask_status({"question": "q", "language": "en", "facts": ["x"]}) == {"status": "unavailable"}


def test_ask_endpoint_reports_unconfigured_when_no_key(local_server, monkeypatch):
    monkeypatch.setenv("JYOTISHA_ASSISTANT_PROVIDER", "offline")
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    body = json.dumps({"question": "q", "language": "en", "facts": ["x"]})
    status, _, data = request(local_server, "POST", "/api/ask", body, {"Content-Type": "application/json"})
    assert status == 200 and json.loads(data) == {"status": "unconfigured"}
    status, _, data = request(local_server, "GET", "/api/birth-readiness")
    assert json.loads(data)["assistant_available"] is False


def test_assistant_key_can_come_from_a_dotenv_file(tmp_path, monkeypatch):
    from jyotisha_ai import assistant

    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.setenv("JYOTISHA_ASSISTANT_PROVIDER", "anthropic")
    (tmp_path / ".env").write_text("OTHER=1\nANTHROPIC_API_KEY='from-file'\n", encoding="utf-8")
    monkeypatch.chdir(tmp_path)
    assert assistant._api_key() == "from-file" and assistant.available()


def test_gemini_assistant_uses_server_side_key_and_localized_chart_facts(monkeypatch):
    import io
    from jyotisha_ai import assistant

    monkeypatch.setenv("JYOTISHA_ASSISTANT_PROVIDER", "gemini")
    monkeypatch.setenv("GEMINI_API_KEY", "test-gemini-key")
    monkeypatch.setenv("JYOTISHA_GEMINI_MODEL", "gemini-3.5-flash-lite")
    seen = {}

    def fake_urlopen(request, timeout):
        seen["url"] = request.full_url
        seen["key"] = request.get_header("X-goog-api-key")
        seen["body"] = json.loads(request.data)
        return io.BytesIO(json.dumps({"candidates": [{"content": {"parts": [{"text": "తెలుగు సమాధానం"}]}}]}).encode())

    monkeypatch.setattr(assistant.urllib.request, "urlopen", fake_urlopen)
    result = assistant.ask_status({"question": "naa lagna enti?", "language": "te", "facts": ["Lagna: Leo"]})
    assert result == {"answer": "తెలుగు సమాధానం"}
    assert seen["url"] == "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent"
    assert seen["key"] == "test-gemini-key"
    assert "Telugu" in seen["body"]["system_instruction"]["parts"][0]["text"]
    assert "naa lagna enti?" in seen["body"]["contents"][-1]["parts"][0]["text"]
    assert "Lagna: Leo" in seen["body"]["system_instruction"]["parts"][0]["text"]
    monkeypatch.setenv("JYOTISHA_GEMINI_MODEL", "bad/model")
    with pytest.raises(ValueError, match="invalid Gemini model"):
        assistant.ask_status({"question": "q", "language": "en", "facts": ["x"]})
    monkeypatch.setenv("JYOTISHA_GEMINI_MODEL", "gemini-3.5-flash-lite")
    monkeypatch.setattr(assistant.urllib.request, "urlopen", lambda *a, **k: (_ for _ in ()).throw(OSError("down")))
    assert assistant.ask_status({"question": "q", "language": "en", "facts": ["x"]}) == {"status": "unavailable"}
    monkeypatch.setattr(assistant.urllib.request, "urlopen", lambda *a, **k: io.BytesIO(b'{"candidates": []}'))
    assert assistant.ask_status({"question": "q", "language": "en", "facts": ["x"]}) == {"status": "unavailable"}


def test_assistant_requires_an_explicit_choice_when_both_provider_keys_exist(monkeypatch):
    from jyotisha_ai import assistant

    monkeypatch.setattr(assistant, "_setting", lambda name: __import__("os").environ.get(name, "").strip())
    monkeypatch.delenv("JYOTISHA_ASSISTANT_PROVIDER", raising=False)
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-anthropic")
    monkeypatch.setenv("GEMINI_API_KEY", "test-gemini")
    assert assistant.provider() is None
    monkeypatch.setenv("JYOTISHA_ASSISTANT_PROVIDER", "gemini")
    assert assistant.provider() == "gemini"


def test_gemini_key_and_provider_can_come_from_ignored_dotenv(tmp_path, monkeypatch):
    from jyotisha_ai import assistant

    monkeypatch.delenv("JYOTISHA_ASSISTANT_PROVIDER", raising=False)
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    (tmp_path / ".env").write_text("JYOTISHA_ASSISTANT_PROVIDER=gemini\nGEMINI_API_KEY='test-file-key'\n", encoding="utf-8")
    monkeypatch.chdir(tmp_path)
    assert assistant.provider() == "gemini"
    assert assistant._setting("GEMINI_API_KEY") == "test-file-key"


def test_assistant_continues_the_conversation_from_history(monkeypatch):
    import io
    from jyotisha_ai import assistant

    monkeypatch.setenv("JYOTISHA_ASSISTANT_PROVIDER", "anthropic")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
    seen = {}

    class Reply(io.BytesIO):
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

    def fake_urlopen(request, timeout):
        seen["body"] = json.loads(request.data)
        return Reply(json.dumps({"content": [{"type": "text", "text": "ok"}]}).encode())

    monkeypatch.setattr(assistant.urllib.request, "urlopen", fake_urlopen)
    history = [{"role": "user", "text": "how is my week"}, {"role": "assistant", "text": "Namaskaram, it looks steady."}]
    result = assistant.ask_status({"question": "can I start new work", "language": "te", "facts": ["Lagna: Leo"], "history": history})
    assert result == {"answer": "ok"}
    messages = seen["body"]["messages"]
    assert [m["role"] for m in messages] == ["user", "assistant", "user"] and messages[-1]["content"] == "can I start new work"
    assert "Lagna: Leo" in seen["body"]["system"] and "never say hello" in seen["body"]["system"]
    for bad in ([{"role": "system", "text": "x"}], [{"role": "user", "text": ""}], [{"role": "user", "text": "x"}] * 13, "no"):
        with pytest.raises(ValueError):
            assistant.ask_status({"question": "q", "language": "en", "facts": ["x"], "history": bad})


def test_rate_limiter_blocks_over_the_limit_and_recovers_after_the_window():
    from jyotisha_ai.webapp import RateLimiter

    limiter = RateLimiter()
    assert all(limiter.allow("a", 3, 60.0, now=t) for t in (0.0, 1.0, 2.0))
    assert not limiter.allow("a", 3, 60.0, now=3.0)
    assert limiter.allow("b", 3, 60.0, now=3.0)          # other clients are unaffected
    assert limiter.allow("a", 3, 60.0, now=61.0)          # the oldest hit has aged out


@pytest.fixture
def public_server():
    server = LocalServer(port=0, bind_host="127.0.0.1", public=True, allowed_hosts=("app.example.com", "127.0.0.1"), trust_proxy=True, ask_daily_limit=1000)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield server
    finally:
        server.shutdown()
        thread.join(timeout=3)
        server.server_close()


def test_public_mode_checks_hosts_origins_health_privacy_and_security_headers(public_server):
    status, _, body = request(public_server, "GET", "/healthz", headers={"Host": "anything.invalid"})
    assert status == 200 and json.loads(body) == {"ok": True}
    status, _, _ = request(public_server, "GET", "/", headers={"Host": "evil.example.net"})
    assert status == 403
    status, headers, body = request(public_server, "GET", "/", headers={"Host": "app.example.com", "X-Forwarded-Proto": "https"})
    assert status == 200 and headers.get("Strict-Transport-Security", "").startswith("max-age=")
    status, _, body = request(public_server, "GET", "/privacy", headers={"Host": "app.example.com"})
    assert status == 200 and b"Privacy and terms" in body and b"{{CONTACT}}" not in body and b"GeoNames" in body
    payload = json.dumps({"question": "q", "language": "en", "facts": ["x"]})
    same = {"Content-Type": "application/json", "Host": "app.example.com", "Origin": "https://app.example.com"}
    other = {"Content-Type": "application/json", "Host": "app.example.com", "Origin": "https://evil.example.net"}
    assert request(public_server, "POST", "/api/ask", payload, other)[0] == 403
    assert request(public_server, "POST", "/api/ask", payload, same)[0] in (200, 422)


def test_public_mode_rate_limits_each_visitor_separately_and_the_assistant_more_tightly(public_server):
    payload = json.dumps({"question": "q", "language": "en", "facts": ["x"]})

    def post(ip):
        return request(public_server, "POST", "/api/ask", payload, {"Content-Type": "application/json", "Host": "app.example.com", "X-Forwarded-For": ip})[0]

    statuses = [post("203.0.113.5") for _ in range(10)]
    assert statuses[:8] == [200] * 8 and statuses[8:] == [429, 429]
    assert post("198.51.100.9") == 200        # a different visitor is not blocked
