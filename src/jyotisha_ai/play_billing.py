"""Google Play one-time product verification and replay-safe entitlement recording."""

from __future__ import annotations

import hashlib
import json
import os
import threading
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from google.auth.transport._http_client import Request
from google.oauth2 import service_account

from jyotisha_ai import settings_store as store

PACKAGE_NAME = "store.karthiktraders.jyotisha"
SCOPE = "https://www.googleapis.com/auth/androidpublisher"
PRODUCTS = {
    "dosha_remedies": {"price_rs": 9, "title": "Doshas & detailed remedies"},
    "kundli_complete": {"price_rs": 19, "title": "Complete personal Kundli report"},
    "ai_questions_5": {"price_rs": 9, "title": "5 additional AI questions", "credits": 5},
    "ai_action_plan_7d": {"price_rs": 9, "title": "Personalized 7-day action plan"},
    "rashiphal_forecast_7d": {"price_rs": 9, "title": "Personalized 7-day forecast"},
    "tarot_detailed": {"price_rs": 5, "title": "Detailed Tarot interpretation & guidance"},
    "palm_detailed": {"price_rs": 5, "title": "Detailed palm guidance"},
    "sign_match_full": {"price_rs": 3, "title": "Full sign compatibility explanation"},
    "partner_portrait": {"price_rs": 3, "title": "Ideal-partner portrait"},
    "kundli_match_full": {"price_rs": 9, "title": "Full Kundli compatibility report"},
}

_lock = threading.RLock()


def public_config() -> dict:
    return {"provider": "google_play", "products": {key: dict(value) for key, value in PRODUCTS.items()}}


def _credentials():
    raw = os.environ.get("JYOTISHA_GOOGLE_PLAY_SERVICE_ACCOUNT_JSON", "").strip()
    path = os.environ.get("JYOTISHA_GOOGLE_PLAY_CREDENTIALS", "").strip()
    try:
        if raw:
            return service_account.Credentials.from_service_account_info(json.loads(raw), scopes=[SCOPE])
        if path:
            return service_account.Credentials.from_service_account_file(path, scopes=[SCOPE])
    except (ValueError, OSError, KeyError, TypeError):
        return None
    return None


def enabled() -> bool:
    return store.value("JYOTISHA_PLAY_BILLING", "0") == "1" and _credentials() is not None


def _ledger_path() -> Path:
    return store.data_dir() / "play-purchases.json"


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


def _google_purchase(product_id: str, purchase_token: str) -> dict:
    credentials = _credentials()
    if credentials is None:
        raise ValueError("Google Play purchase verification is not configured")
    credentials.refresh(Request())
    package = urllib.parse.quote(PACKAGE_NAME, safe="")
    token = urllib.parse.quote(purchase_token, safe="")
    url = f"https://androidpublisher.googleapis.com/androidpublisher/v3/applications/{package}/purchases/productsv2/tokens/{token}"
    request = urllib.request.Request(url, headers={"authorization": f"Bearer {credentials.token}", "accept": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=20.0) as response:
            result = json.loads(response.read())
    except urllib.error.HTTPError as exc:
        raise ValueError(f"Google Play rejected this purchase (HTTP {exc.code})") from exc
    except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError) as exc:
        raise ValueError("Google Play purchase verification is temporarily unavailable") from exc
    if not isinstance(result, dict):
        raise ValueError("Google Play returned an invalid verification response")
    state = result.get("purchaseStateContext", {}).get("purchaseState")
    line_items = result.get("productLineItem") or []
    verified_products = {item.get("productId") for item in line_items if isinstance(item, dict)}
    if state != "PURCHASED" or product_id not in verified_products:
        raise ValueError("purchase is not completed or does not match this product")
    return result


def verify(payload: object, visitor: str) -> dict:
    if not isinstance(payload, dict):
        raise ValueError("JSON object required")
    product_id, purchase_token = payload.get("product_id"), payload.get("purchase_token")
    context_id = payload.get("context_id", "")
    if product_id not in PRODUCTS:
        raise ValueError("unknown Google Play product")
    if not isinstance(purchase_token, str) or not 20 <= len(purchase_token) <= 4096:
        raise ValueError("a valid purchase token is required")
    if not isinstance(context_id, str) or len(context_id) > 160:
        raise ValueError("invalid purchase context")
    if not enabled():
        return {"status": "off"}
    token_hash = hashlib.sha256(purchase_token.encode()).hexdigest()
    owner = hashlib.sha256(("play-owner|" + visitor).encode()).hexdigest()[:24]
    with _lock:
        ledger = _read_ledger()
        existing = ledger.get(token_hash)
        if existing:
            if existing == {"owner": owner, "product_id": product_id, "context_id": context_id}:
                return {"status": "ok", "product_id": product_id, "context_id": context_id, "already_verified": True}
            raise ValueError("this purchase was already used")
    _google_purchase(product_id, purchase_token)
    with _lock:
        ledger = _read_ledger()
        if token_hash in ledger:
            raise ValueError("this purchase was already used")
        ledger[token_hash] = {"owner": owner, "product_id": product_id, "context_id": context_id}
        _write_ledger(ledger)
    return {"status": "ok", "product_id": product_id, "context_id": context_id, "already_verified": False}
