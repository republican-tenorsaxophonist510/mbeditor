import logging

from app.services import wechat_service
from app.services.css_inline import inline_css, strip_wechat_unsupported_css
from app.services.legacy_render_pipeline import process_for_wechat, preview_html
from app.services.wechat_sanitize import sanitize_for_wechat


def process_html_for_copy(html: str, css: str, *, appid: str, appsecret: str) -> str:
    if not appid or not appsecret:
        from app.core.exceptions import AppError
        raise AppError(code=400, message="未配置公众号 AppID/AppSecret")
    processed = process_for_wechat(html, css)
    return wechat_service.process_html_images(processed, appid=appid, appsecret=appsecret)


def publish_draft_sync(article: dict, appid: str, appsecret: str) -> dict:
    logger = logging.getLogger(__name__)
    title = article.get("title", "")
    html = article.get("html", "")
    css = article.get("css", "")
    logger.info("[publish] title=%r html=%d css=%d", title, len(html), len(css))

    processed_html = process_for_wechat(html, css)
    processed_html = wechat_service.process_html_images(processed_html, appid=appid, appsecret=appsecret)

    return wechat_service.create_draft(
        appid=appid,
        appsecret=appsecret,
        title=title,
        html=processed_html,
        author=article.get("author", ""),
        digest=article.get("digest", ""),
        thumb_media_id="",
        content_source_url="",
    )


_strip_wechat_unsupported_css = strip_wechat_unsupported_css
_inline_css = inline_css
_sanitize_for_wechat = sanitize_for_wechat
_process_for_wechat = process_for_wechat
