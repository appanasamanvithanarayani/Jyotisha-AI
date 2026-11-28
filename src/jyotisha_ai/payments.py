"""Razorpay payments: a 'pay instead of watching an ad' option for AI chat bonus questions and single reading
unlocks (Palm, Tarot, Life Guide, Sign match, Moon sign, Rashiphal, the ideal-partner illustration), and, when Google
Play Billing is off, Razorpay checkout for the same named one-time products Play Billing sells (Doshas, the complete
Kundli report, extra AI questions, the 7-day action plan, the weekly Rashiphal forecast, detailed Palm/Tarot, Sign
match, the partner portrait, and Kundli matching).

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
import os
import threading
import urllib.error
import urllib.request
from pathlib import Path

from jyotisha_ai import play_billing
from jyotisha_ai import settings_store as store

ORDERS_URL = "https://api.razorpay.com/v1/orders"
# feature name -> the admin setting holding its price in rupees
FEATURES = {"chat_bonus": "JYOTISHA_PRICE_CHAT_BONUS_RS", "unlock": "JYOTISHA_PRICE_UNLOCK_RS"}

_lock = threading.RLock()


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


def price_paise_for(key: str) -> int:
    """Price in paise for either a legacy feature (chat_bonus/unlock) or a named product id."""
    if key in FEATURES:
        return price_paise(key)
    return play_billing.PRODUCTS[key]["price_rs"] * 100


def product_catalog() -> dict:
    """The same named one-time products Play Billing sells, for display when Razorpay is the active provider."""
    return {key: dict(value) for key, value in play_billing.PRODUCTS.items()}


def _ledger_path() -> Path:
    return store.data_dir() / "razorpay-purchases.json"


def _read_ledger() -> dict:
    try:
        data = json.loads(_ledger_path().read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def _write_ledger(data: dict) -> None:
    path = _ledger_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(data, sort_keys=True), encoding="utf-8")
    try:
        os.chmod(temporary, 0o600)
    except OSError:
        pass
    os.replace(temporary, path)


def _purchase_key(payload: dict) -> str:
    """Either payload['feature'] (chat_bonus/unlock) or payload['product_id'] (one of the named products), never
    both; raises ValueError for anything else."""
    feature, product_id = payload.get("feature"), payload.get("product_id")
    if feature is not None and product_id is not None:
        raise ValueError("specify either feature or product_id, not both")
    if feature in FEATURES:
        return feature
    if product_id in play_billing.PRODUCTS:
        return product_id
    raise ValueError("feature or product_id must be a known value")


def create_order(payload: object) -> dict:
    """{'status': 'ok', 'order_id', 'amount', 'currency', 'key_id'} once Razorpay accepts the order, or
    {'status': 'off'} while payments are not configured. ValueError for a malformed request or a Razorpay error."""
    if not isinstance(payload, dict):
        raise ValueError("JSON object required")
    key = _purchase_key(payload)
    context_id = payload.get("context_id", "")
    if not isinstance(context_id, str) or len(context_id) > 160:
        raise ValueError("invalid purchase context")
    if not enabled():
        return {"status": "off"}
    amount = price_paise_for(key)
    body = json.dumps({"amount": amount, "currency": "INR", "receipt": f"jyotisha-{key}"[:40],
                        "notes": {"key": key, "context_id": context_id}}).encode("utf-8")
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


def verify_payment(payload: object, visitor: str = "") -> dict:
    """For a legacy feature: {'status': 'ok', 'feature': ...}. For a named product: {'status': 'ok', 'product_id':
    ..., 'context_id': ..., 'already_verified': bool}, replay-safe the same way Play Billing purchases are: the same
    order can be re-verified (e.g. after a dropped connection) and always returns the same product for it.
    {'status': 'invalid'} for a wrong or forged signature; {'status': 'off'} while payments are not configured."""
    if not isinstance(payload, dict):
        raise ValueError("JSON object required")
    key = _purchase_key(payload)
    order_id, payment_id, signature = payload.get("order_id"), payload.get("payment_id"), payload.get("signature")
    context_id = payload.get("context_id", "")
    if not all(isinstance(v, str) and v for v in (order_id, payment_id, signature)):
        raise ValueError("order_id, payment_id and signature are required")
    if not isinstance(context_id, str) or len(context_id) > 160:
        raise ValueError("invalid purchase context")
    if not enabled():
        return {"status": "off"}
    expected = hmac.new(_key_secret().encode(), f"{order_id}|{payment_id}".encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, signature):
        return {"status": "invalid"}
    if key in FEATURES:
        return {"status": "ok", "feature": key}
    order_hash = hashlib.sha256(order_id.encode()).hexdigest()
    owner = hashlib.sha256(("razorpay-owner|" + visitor).encode()).hexdigest()[:24]
    expected_entry = {"owner": owner, "product_id": key, "context_id": context_id}
    with _lock:
        ledger = _read_ledger()
        existing = ledger.get(order_hash)
        if existing and existing != expected_entry:
            raise ValueError("this purchase was already used")
        recovered = bool(existing)
        ledger[order_hash] = expected_entry
        _write_ledger(ledger)
    return {"status": "ok", "product_id": key, "context_id": context_id, "already_verified": recovered}
