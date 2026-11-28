"""Razorpay payments: off until a provider and keys are set, order creation, and HMAC signature verification."""

import hashlib
import hmac
import json

import pytest

from jyotisha_ai import payments


def configure(monkeypatch, *, key_id="rzp_test_abc123", key_secret="shh"):
    values = {"JYOTISHA_PAYMENTS_PROVIDER": "razorpay", "RAZORPAY_KEY_ID": key_id, "RAZORPAY_KEY_SECRET": key_secret,
              "JYOTISHA_PRICE_CHAT_BONUS_RS": "9", "JYOTISHA_PRICE_UNLOCK_RS": "9"}
    monkeypatch.setattr(payments.store, "value", lambda name, default="": values.get(name, default))


def test_off_until_provider_and_both_keys_are_set(monkeypatch):
    monkeypatch.setattr(payments.store, "value", lambda name, default="": "")
    assert payments.enabled() is False
    assert payments.create_order({"feature": "unlock"}) == {"status": "off"}
    assert payments.verify_payment({"order_id": "x", "payment_id": "y", "signature": "z", "feature": "unlock"}) == {"status": "off"}
    configure(monkeypatch, key_secret="")   # provider chosen, key id present, but no secret yet
    assert payments.enabled() is False


def test_request_checks():
    for bad in ({"feature": "unknown"}, {}, "not a dict"):
        with pytest.raises(ValueError):
            payments.create_order(bad)
    for bad in ({"order_id": "", "payment_id": "p", "signature": "s", "feature": "unlock"},
                {"order_id": "o", "payment_id": "p", "signature": "s", "feature": "unknown"},
                {"order_id": "o", "payment_id": "p", "feature": "unlock"}):
        with pytest.raises(ValueError):
            payments.verify_payment(bad)


def test_create_order_sends_the_server_side_price_never_a_client_supplied_amount(monkeypatch):
    configure(monkeypatch)
    seen = {}

    class Reply:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def read(self):
            return json.dumps({"id": "order_abc123"}).encode()

    def fake_urlopen(request, timeout):
        seen["url"] = request.full_url
        seen["auth"] = request.get_header("Authorization")
        seen["body"] = json.loads(request.data)
        return Reply()

    monkeypatch.setattr(payments.urllib.request, "urlopen", fake_urlopen)
    result = payments.create_order({"feature": "unlock", "amount": 1})   # a client-sent amount is ignored
    assert result == {"status": "ok", "order_id": "order_abc123", "amount": 900, "currency": "INR", "key_id": "rzp_test_abc123"}
    assert seen["url"] == "https://api.razorpay.com/v1/orders"
    assert seen["body"]["amount"] == 900 and seen["body"]["currency"] == "INR"
    assert seen["auth"].startswith("Basic ")

    monkeypatch.setattr(payments.urllib.request, "urlopen", lambda *a, **k: (_ for _ in ()).throw(OSError("down")))
    with pytest.raises(ValueError, match="could not reach"):
        payments.create_order({"feature": "chat_bonus"})


def test_verify_payment_checks_the_hmac_signature_and_rejects_a_forged_one(monkeypatch):
    configure(monkeypatch, key_secret="my-secret")
    order_id, payment_id = "order_abc", "pay_xyz"
    genuine = hmac.new(b"my-secret", f"{order_id}|{payment_id}".encode(), hashlib.sha256).hexdigest()
    assert payments.verify_payment({"order_id": order_id, "payment_id": payment_id, "signature": genuine, "feature": "unlock"}) == {"status": "ok", "feature": "unlock"}
    forged = "0" * 64
    assert payments.verify_payment({"order_id": order_id, "payment_id": payment_id, "signature": forged, "feature": "unlock"}) == {"status": "invalid"}


def test_product_catalog_mirrors_play_billing_for_display_when_razorpay_is_active():
    catalog = payments.product_catalog()
    assert catalog["palm_detailed"] == {"price_rs": 5, "title": "Detailed palm guidance"}
    assert catalog["rashiphal_forecast_7d"]["price_rs"] == 9
    catalog["palm_detailed"]["price_rs"] = 999   # the catalog is a copy; mutating it must not affect play_billing's
    assert payments.product_catalog()["palm_detailed"]["price_rs"] == 5


def test_create_order_also_accepts_a_named_product_id_priced_from_the_play_billing_catalog(monkeypatch):
    configure(monkeypatch)
    seen = {}

    class Reply:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def read(self):
            return json.dumps({"id": "order_tarot1"}).encode()

    def fake_urlopen(request, timeout):
        seen["body"] = json.loads(request.data)
        return Reply()

    monkeypatch.setattr(payments.urllib.request, "urlopen", fake_urlopen)
    result = payments.create_order({"product_id": "tarot_detailed", "context_id": "2026-01-01-love"})
    assert result == {"status": "ok", "order_id": "order_tarot1", "amount": 500, "currency": "INR", "key_id": "rzp_test_abc123"}
    assert seen["body"]["amount"] == 500
    with pytest.raises(ValueError, match="either feature or product_id"):
        payments.create_order({"feature": "unlock", "product_id": "tarot_detailed"})
    with pytest.raises(ValueError):
        payments.create_order({"product_id": "not_a_real_product"})


def test_verify_payment_for_a_named_product_is_replay_safe_like_a_play_billing_purchase(monkeypatch):
    configure(monkeypatch, key_secret="my-secret")
    order_id, payment_id, context_id = "order_palm1", "pay_1", "2026-01-01-right"
    signature = hmac.new(b"my-secret", f"{order_id}|{payment_id}".encode(), hashlib.sha256).hexdigest()
    payload = {"order_id": order_id, "payment_id": payment_id, "signature": signature,
               "product_id": "palm_detailed", "context_id": context_id}
    first = payments.verify_payment(payload, "visitor-a")
    assert first == {"status": "ok", "product_id": "palm_detailed", "context_id": context_id, "already_verified": False}
    again = payments.verify_payment(payload, "visitor-a")
    assert again["already_verified"] is True   # re-verifying the same order (e.g. after a dropped reply) is safe
    mismatched = {**payload, "context_id": "a-different-context"}
    with pytest.raises(ValueError, match="already used"):
        payments.verify_payment(mismatched, "visitor-a")
