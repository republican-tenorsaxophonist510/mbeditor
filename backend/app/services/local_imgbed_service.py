"""Upload <img> sources to a self-hosted image bed instead of WeChat mmbiz.

The user's NAS already runs a tiny image bed (same one their doocs-md install
talks to at :9697). For every ``<img src="...">`` in outgoing article HTML we
download the bytes, POST them to the imgbed as multipart ``file``, and rewrite
the src to the returned URL.

Why not go through WeChat's material API?
-----------------------------------------
* ``add_draft`` API uploads have strict quota + require appid/secret.
* The user's primary flow is "复制富文本 → 粘到公众号编辑器"; WeChat's paste
  handler (running in the user's own browser on the LAN) happily fetches any
  LAN URL and re-hosts to mmbiz automatically. So hosting on the NAS works end-
  to-end for that path without us having to touch WeChat credentials.

Direct ``/wechat/draft`` API calls will see LAN URLs that WeChat's servers
can't reach — user has explicitly decided they're fine with that tradeoff.
"""
from __future__ import annotations

import base64
import logging
import os
import re
from typing import Dict

import httpx

logger = logging.getLogger(__name__)

# NAS IP by default — can be overridden via env for other deploys.
DEFAULT_IMGBED_UPLOAD_URL = "https://mbluostudio.com/imgbed/upload"

_EXT_TO_MIME: Dict[str, str] = {
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "png": "image/png",
    "gif": "image/gif",
    "webp": "image/webp",
    "svg": "image/svg+xml",
}


def _imgbed_upload_url() -> str:
    return os.environ.get("LOCAL_IMGBED_UPLOAD_URL", DEFAULT_IMGBED_UPLOAD_URL).strip()


def _imgbed_upload_token() -> str:
    """Shared Bearer token for the public imgbed. Empty string disables auth
    (useful for the legacy LAN-only deployment where /upload was open)."""
    return os.environ.get("LOCAL_IMGBED_UPLOAD_TOKEN", "").strip()


def _content_type_for(filename: str) -> str:
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    return _EXT_TO_MIME.get(ext, "application/octet-stream")


def _origin_of(url: str) -> str:
    match = re.match(r"(https?://[^/]+)", url)
    return match.group(1) if match else ""


def upload_image_to_imgbed(
    image_bytes: bytes, filename: str, *, upload_url: str | None = None
) -> str:
    """Upload raw image bytes to the imgbed, return the public URL.

    When ``LOCAL_IMGBED_UPLOAD_TOKEN`` is set the request sends the shared
    Bearer token so the public VPS gateway (``https://mbluostudio.com/imgbed/
    upload``) will accept the POST. Empty token leaves the header off, matching
    the original LAN-only deployment.
    """
    target = upload_url or _imgbed_upload_url()
    files = {"file": (filename, image_bytes, _content_type_for(filename))}
    headers: Dict[str, str] = {}
    token = _imgbed_upload_token()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    resp = httpx.post(target, files=files, headers=headers, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    url = data.get("url")
    if not url:
        raise RuntimeError(f"imgbed returned no url field: {data}")
    return url


def process_html_images_via_imgbed(
    html: str, *, upload_url: str | None = None
) -> str:
    """For every <img src>, fetch the original and re-host on the imgbed.

    Skips sources already pointing at the imgbed (idempotent re-processing).
    Leaves sources untouched on any fetch/upload error so one bad image does
    not lose the whole article.
    """
    target = upload_url or _imgbed_upload_url()
    if not target:
        return html

    imgbed_origin = _origin_of(target)
    rewritten: Dict[str, str] = {}

    def replace_src(match: "re.Match[str]") -> str:
        src = match.group(1)
        if imgbed_origin and imgbed_origin in src:
            return match.group(0)
        cached = rewritten.get(src)
        if cached is not None:
            return f'src="{cached}"'

        try:
            if src.startswith("http://") or src.startswith("https://"):
                resp = httpx.get(
                    src,
                    timeout=20,
                    headers={"User-Agent": "Mozilla/5.0"},
                    follow_redirects=True,
                )
                resp.raise_for_status()
                filename = src.split("/")[-1].split("?")[0] or "image.png"
                hosted = upload_image_to_imgbed(
                    resp.content, filename, upload_url=target
                )
                rewritten[src] = hosted
                return f'src="{hosted}"'

            if src.startswith("data:image/"):
                header, b64data = src.split(",", 1)
                mime = header.split(";")[0].removeprefix("data:")
                ext = (
                    mime.split("/")[-1]
                    .replace("jpeg", "jpg")
                    .replace("svg+xml", "svg")
                )
                image_bytes = base64.b64decode(b64data)
                hosted = upload_image_to_imgbed(
                    image_bytes, f"inline_image.{ext}", upload_url=target
                )
                rewritten[src] = hosted
                return f'src="{hosted}"'
        except Exception as exc:  # noqa: BLE001 — per-image degrade
            logger.warning(
                "Failed to upload image to imgbed (%s): %s", src[:80], exc
            )

        return match.group(0)

    return re.sub(r'src="([^"]+)"', replace_src, html)
