import re
import time
from typing import Callable

import httpx

from app.core.exceptions import AppError

# appid -> {"access_token": str, "expires_at": float}
_token_cache: dict[str, dict] = {}


def get_access_token(*, appid: str, appsecret: str, force_refresh: bool = False) -> str:
    """Fetch access_token via stable_token. Cache is keyed by appid."""
    appid = (appid or "").strip()
    appsecret = (appsecret or "").strip()
    if not appid or not appsecret:
        raise AppError(code=400, message="未配置公众号 AppID/AppSecret")

    entry = _token_cache.get(appid)
    if not force_refresh and entry and entry["access_token"] and time.time() < entry["expires_at"]:
        return entry["access_token"]

    resp = httpx.post(
        "https://api.weixin.qq.com/cgi-bin/stable_token",
        json={
            "grant_type": "client_credential",
            "appid": appid,
            "secret": appsecret,
            "force_refresh": force_refresh,
        },
        timeout=10,
    )
    data = resp.json()
    if "access_token" not in data:
        raise AppError(code=500, message=f"WeChat token error: {data.get('errmsg', 'unknown')}")

    _token_cache[appid] = {
        "access_token": data["access_token"],
        "expires_at": time.time() + data.get("expires_in", 7200) - 300,
    }
    return _token_cache[appid]["access_token"]


def _is_invalid_credential(data: dict) -> bool:
    return data.get("errcode") in (40001, 42001, 40014)


def _post_with_token_retry(
    url_fmt: str,
    *,
    appid: str,
    appsecret: str,
    files=None,
    json_body=None,
    success_key: str,
    err_label: str,
    timeout: int = 30,
) -> dict:
    for attempt in (0, 1):
        token = get_access_token(appid=appid, appsecret=appsecret, force_refresh=(attempt == 1))
        url = url_fmt.format(token=token)
        if files is not None:
            resp = httpx.post(url, files=files, timeout=timeout)
        else:
            resp = httpx.post(url, json=json_body, timeout=timeout)
        data = resp.json()
        if success_key in data:
            return data
        if attempt == 0 and _is_invalid_credential(data):
            _token_cache.pop(appid, None)
            continue
        raise AppError(code=500, message=f"{err_label}: {data.get('errmsg', 'unknown')}")
    raise AppError(code=500, message=f"{err_label}: retry exhausted")


def upload_image_to_wechat(image_bytes: bytes, filename: str, *, appid: str, appsecret: str) -> str:
    data = _post_with_token_retry(
        "https://api.weixin.qq.com/cgi-bin/media/uploadimg?access_token={token}",
        appid=appid,
        appsecret=appsecret,
        files={"media": (filename, image_bytes, "image/png")},
        success_key="url",
        err_label="WeChat upload error",
    )
    return data["url"]


def upload_thumb_to_wechat(image_bytes: bytes, filename: str, *, appid: str, appsecret: str) -> str:
    data = _post_with_token_retry(
        "https://api.weixin.qq.com/cgi-bin/material/add_material?access_token={token}&type=thumb",
        appid=appid,
        appsecret=appsecret,
        files={"media": (filename, image_bytes, "image/jpeg")},
        success_key="media_id",
        err_label="WeChat thumb upload error",
    )
    return data["media_id"]


def _convert_to_png(img_bytes: bytes, filename: str) -> tuple[bytes, str]:
    lower = filename.lower()
    if lower.endswith((".webp", ".svg", ".bmp", ".tiff")):
        try:
            from PIL import Image
            import io
            img = Image.open(io.BytesIO(img_bytes))
            img = img.convert("RGBA") if img.mode in ("RGBA", "P") else img.convert("RGB")
            buf = io.BytesIO()
            img.save(buf, format="PNG")
            return buf.getvalue(), filename.rsplit(".", 1)[0] + ".png"
        except Exception:
            pass
    return img_bytes, filename


def process_html_images(html: str, *, appid: str, appsecret: str) -> str:
    """Upload remote / data-URI images referenced in HTML to WeChat CDN.

    Local `/images/...` paths no longer exist in the stateless backend, so
    only `http(s)://` and `data:image/...` srcs are rewritten.
    """
    import logging
    logger = logging.getLogger(__name__)
    seen: dict[str, str] = {}

    def replace_src(match: re.Match) -> str:
        src = match.group(1)
        if "mmbiz.qpic.cn" in src:
            return match.group(0)
        if src in seen:
            return f'src="{seen[src]}"'

        if src.startswith("http"):
            try:
                resp = httpx.get(
                    src, timeout=20,
                    headers={"User-Agent": "Mozilla/5.0"},
                    follow_redirects=True,
                )
                resp.raise_for_status()
                fname = src.split("/")[-1].split("?")[0] or "image.png"
                img_bytes, fname = _convert_to_png(resp.content, fname)
                wx_url = upload_image_to_wechat(img_bytes, fname, appid=appid, appsecret=appsecret)
                seen[src] = wx_url
                return f'src="{wx_url}"'
            except Exception as e:
                logger.warning("Failed to upload image %s: %s", src[:80], e)
                return match.group(0)

        if src.startswith("data:image/"):
            try:
                import base64 as b64mod
                header, b64data = src.split(",", 1)
                mime = header.split(";")[0].removeprefix("data:")
                ext = mime.split("/")[-1].replace("jpeg", "jpg").replace("svg+xml", "svg")
                img_bytes = b64mod.b64decode(b64data)
                fname = f"inline_image.{ext}"
                img_bytes, fname = _convert_to_png(img_bytes, fname)
                wx_url = upload_image_to_wechat(img_bytes, fname, appid=appid, appsecret=appsecret)
                seen[src] = wx_url
                return f'src="{wx_url}"'
            except Exception as e:
                logger.warning("Failed to upload base64 image: %s", e)
                return match.group(0)

        return match.group(0)

    return re.sub(r'src="([^"]+)"', replace_src, html)


def _generate_default_cover(title: str) -> bytes:
    from PIL import Image, ImageDraw, ImageFont
    import io

    img = Image.new("RGB", (900, 383), color=(30, 30, 30))
    draw = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 36)
    except (OSError, IOError):
        font = ImageFont.load_default()
    display_title = title[:20] + "..." if len(title) > 20 else title
    bbox = draw.textbbox((0, 0), display_title, font=font)
    tw = bbox[2] - bbox[0]
    draw.text(((900 - tw) / 2, 150), display_title, fill=(240, 237, 230), font=font)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue()


def create_draft(
    *,
    appid: str,
    appsecret: str,
    title: str,
    html: str,
    author: str = "",
    digest: str = "",
    thumb_media_id: str = "",
    content_source_url: str = "",
) -> dict:
    if not thumb_media_id:
        cover_bytes = _generate_default_cover(title)
        thumb_media_id = upload_thumb_to_wechat(cover_bytes, "auto_cover.jpg", appid=appid, appsecret=appsecret)

    article = {
        "title": title,
        "author": author,
        "digest": digest,
        "content": html,
        "thumb_media_id": thumb_media_id,
        "content_source_url": content_source_url,
        "need_open_comment": 0,
        "only_fans_can_comment": 0,
    }

    data = _post_with_token_retry(
        "https://api.weixin.qq.com/cgi-bin/draft/add?access_token={token}",
        appid=appid,
        appsecret=appsecret,
        json_body={"articles": [article]},
        success_key="media_id",
        err_label="WeChat draft error",
    )
    return {"media_id": data["media_id"]}
