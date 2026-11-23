"""Razorpay payments: a 'pay instead of watching an ad' option for AI chat bonus questions and single reading
unlocks (Palm, Tarot, Life Guide, Sign match, Moon sign, Rashiphal, the ideal-partner illustration).

Off until an admin sets JYOTISHA_PAYMENTS_PROVIDER to "razorpay" and adds a Razorpay key id and key secret in the
admin panel. No card or UPI details ever reach this server: Razorpay's own Checkout collects the payment in the
browser, and this module only ever sees an order id, a payment id and a signature, which it verifies itself with
HMAC-SHA256 before telling the app anything unlocked. A forged or missing signature is rejected the same way.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import urllib.error
import urllib.request

from jyotisha_ai import settings_store as store

ORDERS_URL = "https://api.razorpay.com/v1/orders"
# feature name -> the admin setting holding its price in rupees
FEATURES = {"chat_bonus": "JYOTISHA_PRICE_CHAT_BONUS_RS", "unlock": "JYOTISHA_PRICE_UNLOCK_RS"}


def enabled() -> bool:
    return store.value("JYOTISHA_PAYMENTS_PROVIDER") == "razorpay" and bool(key_id()) and bool(_key_secret())


def key_id() -> str:
    return store.value("RAZORPAY_KEY_ID").strip()


def _key_secret() -> str:
    return store.value("RAZORPAY_KEY_SECRET").strip()


def price_paise(feature: str) -> int:
    raw = store.value(FEATURES[feature])
    rupees = int(raw) if raw.isdigit() and 1 <= int(raw) <= 999 else 9
    return rupees * 100


def create_order(payload: object) -> dict:
    """{'status': 'ok', 'order_id', 'amount', 'currency', 'key_id'} once Razorpay accepts the order, or
    {'status': 'off'} while payments are not configured. ValueError for a malformed request or a Razorpay error."""
    if not isinstance(payload, dict) or payload.get("feature") not in FEATURES:
        raise ValueError("feature must be one of " + ", ".join(FEATURES))
    if not enabled():
        return {"status": "off"}
    feature = payload["feature"]
    amount = price_paise(feature)
    body = json.dumps({"amount": amount, "currency": "INR", "receipt": f"jyotisha-{feature}"[:40],
                        "notes": {"feature": feature}}).encode("utf-8")
    auth = base64.b64encode(f"{key_id()}:{_key_secret()}".encode()).decode()
    request = urllib.request.Request(ORDERS_URL, data=body, method="POST",
                                     headers={"content-type": "application/json", "authorization": f"Basic {auth}"})
    try:
        with urllib.request.urlopen(request, timeout=20.0) as response:
            reply = json.loads(response.read())
    except urllib.error.HTTPError as exc:
        detail = ""
        try:
            detail = json.loads(exc.read()).get("error", {}).get("description", "")
        except (ValueError, OSError, AttributeError):
            pass
        raise ValueError(f"Razorpay answered HTTP {exc.code}: {detail}".strip()) from exc
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError) as exc:
        raise ValueError(f"could not reach Razorpay: {type(exc).__name__}") from exc
    if not isinstance(reply, dict) or not isinstance(reply.get("id"), str) or not reply["id"]:
        raise ValueError("unexpected reply from Razorpay")
    return {"status": "ok", "order_id": reply["id"], "amount": amount, "currency": "INR", "key_id": key_id()}


def verify_payment(payload: object) -> dict:
    """{'status': 'ok', 'feature': ...} once the signature is confirmed genuine; {'status': 'invalid'} for a wrong
    or forged signature; {'status': 'off'} while payments are not configured."""
    if not isinstance(payload, dict):
        raise ValueError("JSON object required")
    order_id, payment_id, signature, feature = (payload.get("order_id"), payload.get("payment_id"),
                                                  payload.get("signature"), payload.get("feature"))
    if not all(isinstance(v, str) and v for v in (order_id, payment_id, signature)) or feature not in FEATURES:
        raise ValueError("order_id, payment_id, signature and a known feature are required")
    if not enabled():
        return {"status": "off"}
    expected = hmac.new(_key_secret().encode(), f"{order_id}|{payment_id}".encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, signature):
        return {"status": "invalid"}
    return {"status": "ok", "feature": feature}
