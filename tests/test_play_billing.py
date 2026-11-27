from __future__ import annotations

import json

import pytest

from jyotisha_ai import play_billing


def test_google_auth_transport_supports_https() -> None:
    assert play_billing.Request.__module__ == "google.auth.transport.requests"


def test_catalog_contains_the_approved_products_and_prices() -> None:
    assert {key: row["price_rs"] for key, row in play_billing.PRODUCTS.items()} == {
        "dosha_remedies": 9, "kundli_complete": 19, "ai_questions_5": 9, "ai_action_plan_7d": 9,
        "rashiphal_forecast_7d": 9, "tarot_detailed": 5, "palm_detailed": 5,
        "sign_match_full": 3, "partner_portrait": 3, "kundli_match_full": 9,
    }


def test_verification_is_off_without_server_credentials(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("JYOTISHA_PLAY_BILLING", "1")
    monkeypatch.setattr(play_billing, "_credentials", lambda: None)
    assert play_billing.verify({"product_id": "tarot_detailed", "purchase_token": "x" * 30}, "visitor") == {"status": "off"}


def test_selected_and_enabled_are_separate_until_credentials_exist(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("JYOTISHA_PLAY_BILLING", "1")
    monkeypatch.setattr(play_billing, "_credentials", lambda: None)
    assert play_billing.selected() is True
    assert play_billing.enabled() is False


def test_verified_token_is_replay_safe_and_recovers_after_reinstall(tmp_path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("JYOTISHA_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("JYOTISHA_PLAY_BILLING", "1")
    monkeypatch.setattr(play_billing, "_credentials", lambda: object())
    calls = []
    monkeypatch.setattr(play_billing, "_google_purchase", lambda product, token: calls.append((product, token)) or {})
    payload = {"product_id": "kundli_complete", "purchase_token": "token-" + "a" * 30, "context_id": "birth-1"}
    assert play_billing.verify(payload, "visitor-a")["status"] == "ok"
    assert play_billing.verify(payload, "visitor-a")["already_verified"] is True
    assert calls == [("kundli_complete", payload["purchase_token"])]
    recovered = play_billing.verify(payload, "visitor-b")
    assert recovered["status"] == "ok"
    assert recovered["already_verified"] is True
    assert recovered["recovered"] is True
    assert calls == [("kundli_complete", payload["purchase_token"]), ("kundli_complete", payload["purchase_token"])]
    ledger = json.loads((tmp_path / "play-purchases.json").read_text())
    assert list(ledger.values()) == [{"context_id": "birth-1", "owner": play_billing.hashlib.sha256(b"play-owner|visitor-b").hexdigest()[:24], "product_id": "kundli_complete"}]


def test_verified_token_cannot_unlock_a_different_product(tmp_path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("JYOTISHA_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("JYOTISHA_PLAY_BILLING", "1")
    monkeypatch.setattr(play_billing, "_credentials", lambda: object())
    monkeypatch.setattr(play_billing, "_google_purchase", lambda product, token: {})
    token = "token-" + "a" * 30
    assert play_billing.verify({"product_id": "kundli_complete", "purchase_token": token, "context_id": "birth-1"}, "visitor-a")["status"] == "ok"
    with pytest.raises(ValueError, match="already used"):
        play_billing.verify({"product_id": "dosha_remedies", "purchase_token": token, "context_id": "birth-1"}, "visitor-a")


@pytest.mark.parametrize("product", ["unknown", ""])
def test_unknown_products_are_rejected(product: str) -> None:
    with pytest.raises(ValueError, match="unknown"):
        play_billing.verify({"product_id": product, "purchase_token": "x" * 30}, "visitor")
