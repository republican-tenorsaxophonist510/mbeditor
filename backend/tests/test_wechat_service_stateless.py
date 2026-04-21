# backend/tests/test_wechat_service_stateless.py
import time

import httpx
import pytest

from app.services import wechat_service


@pytest.fixture(autouse=True)
def _reset_cache():
    wechat_service._token_cache.clear()
    yield
    wechat_service._token_cache.clear()


def _mock_stable_token(monkeypatch, token_value: str = "tok-A", expires_in: int = 7200):
    calls = {"n": 0}

    def fake_post(url, json=None, timeout=None, **_):
        calls["n"] += 1
        request = httpx.Request("POST", url, json=json)
        return httpx.Response(
            200,
            json={"access_token": token_value, "expires_in": expires_in},
            request=request,
        )

    monkeypatch.setattr(httpx, "post", fake_post)
    return calls


def test_get_access_token_accepts_credentials_as_arguments(monkeypatch):
    calls = _mock_stable_token(monkeypatch, "tok-A")
    token = wechat_service.get_access_token(appid="wxA", appsecret="secretA")
    assert token == "tok-A"
    assert calls["n"] == 1


def test_token_cache_is_keyed_by_appid(monkeypatch):
    calls = _mock_stable_token(monkeypatch, "tok-shared")
    wechat_service.get_access_token(appid="wxA", appsecret="secretA")
    wechat_service.get_access_token(appid="wxA", appsecret="secretA")
    assert calls["n"] == 1, "second call for same appid must use cache"

    wechat_service.get_access_token(appid="wxB", appsecret="secretB")
    assert calls["n"] == 2, "different appid must trigger a new fetch"


def test_force_refresh_bypasses_cache(monkeypatch):
    calls = _mock_stable_token(monkeypatch, "tok-A")
    wechat_service.get_access_token(appid="wxA", appsecret="secretA")
    wechat_service.get_access_token(appid="wxA", appsecret="secretA", force_refresh=True)
    assert calls["n"] == 2


def test_missing_credentials_raise(monkeypatch):
    _mock_stable_token(monkeypatch)
    from app.core.exceptions import AppError

    with pytest.raises(AppError):
        wechat_service.get_access_token(appid="", appsecret="")


def test_expired_token_is_refreshed(monkeypatch):
    calls = _mock_stable_token(monkeypatch, "tok-A", expires_in=10)
    wechat_service.get_access_token(appid="wxA", appsecret="secretA")
    # Force expiry
    wechat_service._token_cache["wxA"]["expires_at"] = time.time() - 1
    wechat_service.get_access_token(appid="wxA", appsecret="secretA")
    assert calls["n"] == 2


def test_load_config_and_save_config_are_removed():
    assert not hasattr(wechat_service, "load_config")
    assert not hasattr(wechat_service, "save_config")
    assert not hasattr(wechat_service, "_wx_image_cache")
