"""Unit coverage for :mod:`app.services.local_imgbed_service`.

Mocks ``httpx.get`` (fetching the external image) and ``httpx.post`` (the
imgbed upload) so no network is touched.
"""
from __future__ import annotations

from typing import Any, Dict

import pytest

from app.services import local_imgbed_service


class _FakeResp:
    def __init__(
        self, *, content: bytes = b"", json_data: Dict[str, Any] | None = None
    ) -> None:
        self.content = content
        self._json = json_data or {}

    def json(self) -> Dict[str, Any]:
        return self._json

    def raise_for_status(self) -> None:
        return None


def test_noop_when_no_img_tags():
    html = "<p>just text, no images</p>"
    assert (
        local_imgbed_service.process_html_images_via_imgbed(
            html, upload_url="http://imgbed.example/upload"
        )
        == html
    )


def test_http_image_is_downloaded_then_uploaded(monkeypatch):
    monkeypatch.setattr(
        local_imgbed_service.httpx,
        "get",
        lambda url, timeout, headers, follow_redirects: _FakeResp(content=b"bytes"),
    )
    upload_calls: list[tuple[str, tuple]] = []

    def fake_post(url, *, files, timeout, headers=None):
        upload_calls.append((url, files["file"]))
        return _FakeResp(json_data={"url": "http://imgbed.example/images/x.png"})

    monkeypatch.setattr(local_imgbed_service.httpx, "post", fake_post)

    html = '<div><img src="https://cdn.example.com/pic.jpg"></div>'
    out = local_imgbed_service.process_html_images_via_imgbed(
        html, upload_url="http://imgbed.example/upload"
    )
    assert 'src="http://imgbed.example/images/x.png"' in out
    assert "cdn.example.com" not in out
    assert len(upload_calls) == 1
    # The upload field matches the imgbed API: name ``file``, tuple (name, bytes, ct)
    field = upload_calls[0][1]
    assert field[0] == "pic.jpg"
    assert field[1] == b"bytes"
    assert field[2] == "image/jpeg"


def test_data_uri_image_is_decoded_then_uploaded(monkeypatch):
    upload_payloads: list[bytes] = []

    def fake_post(url, *, files, timeout, headers=None):
        upload_payloads.append(files["file"][1])
        return _FakeResp(json_data={"url": "http://imgbed.example/images/inline.png"})

    monkeypatch.setattr(local_imgbed_service.httpx, "post", fake_post)

    # 1×1 transparent PNG
    data_uri = (
        "data:image/png;base64,"
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAA"
        "C0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII="
    )
    html = f'<img src="{data_uri}">'
    out = local_imgbed_service.process_html_images_via_imgbed(
        html, upload_url="http://imgbed.example/upload"
    )
    assert "http://imgbed.example/images/inline.png" in out
    assert "data:image/" not in out
    # Verify the decoded bytes were actually uploaded (not the raw base64 string)
    assert upload_payloads[0][:8] == b"\x89PNG\r\n\x1a\n"


def test_src_already_on_imgbed_is_skipped(monkeypatch):
    # httpx.post must NOT be called — if it is, the test should see that and fail
    def explode(*a, **k):
        raise AssertionError("imgbed should not be re-uploaded to itself")

    monkeypatch.setattr(local_imgbed_service.httpx, "post", explode)
    monkeypatch.setattr(local_imgbed_service.httpx, "get", explode)

    html = '<img src="http://imgbed.example/images/cached.png">'
    out = local_imgbed_service.process_html_images_via_imgbed(
        html, upload_url="http://imgbed.example/upload"
    )
    assert out == html


def test_download_failure_leaves_src_alone(monkeypatch):
    def failing_get(*a, **k):
        raise RuntimeError("boom")

    monkeypatch.setattr(local_imgbed_service.httpx, "get", failing_get)
    # ``post`` should never be reached; if it is, the test fails loudly
    monkeypatch.setattr(
        local_imgbed_service.httpx,
        "post",
        lambda *a, **k: (_ for _ in ()).throw(AssertionError("should not upload")),
    )

    html = '<img src="https://broken.example.com/404.png">'
    out = local_imgbed_service.process_html_images_via_imgbed(
        html, upload_url="http://imgbed.example/upload"
    )
    assert out == html  # unchanged because upload failed


def test_duplicate_src_uploads_once(monkeypatch):
    monkeypatch.setattr(
        local_imgbed_service.httpx,
        "get",
        lambda url, timeout, headers, follow_redirects: _FakeResp(content=b"b"),
    )
    call_count = {"n": 0}

    def fake_post(url, *, files, timeout, headers=None):
        call_count["n"] += 1
        return _FakeResp(json_data={"url": "http://imgbed.example/images/dup.png"})

    monkeypatch.setattr(local_imgbed_service.httpx, "post", fake_post)

    html = (
        '<img src="https://cdn.example.com/x.png">'
        '<img src="https://cdn.example.com/x.png">'
    )
    out = local_imgbed_service.process_html_images_via_imgbed(
        html, upload_url="http://imgbed.example/upload"
    )
    assert out.count("http://imgbed.example/images/dup.png") == 2
    assert call_count["n"] == 1


@pytest.mark.parametrize(
    "filename,expected_ct",
    [
        ("pic.jpg", "image/jpeg"),
        ("pic.JPEG", "image/jpeg"),
        ("logo.png", "image/png"),
        ("banner.webp", "image/webp"),
        ("something.unknown", "application/octet-stream"),
        ("noext", "application/octet-stream"),
    ],
)
def test_content_type_detection(filename, expected_ct):
    assert local_imgbed_service._content_type_for(filename) == expected_ct
