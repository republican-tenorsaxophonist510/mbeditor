import logging

from app.services import wechat_service
from app.services.css_inline import inline_css, strip_wechat_unsupported_css
from app.services.legacy_render_pipeline import process_for_wechat, preview_html
from app.services.local_imgbed_service import process_html_images_via_imgbed
from app.services.svg_validator import validate_html
from app.services.wechat_copy_images import inline_images_as_data_uris
from app.services.wechat_sanitize import sanitize_for_wechat


def process_html_for_copy(
    html: str, css: str, *, appid: str = "", appsecret: str = ""
) -> dict:
    """复制富文本流水线，返回 ``{"html": str, "report": ValidationReport}``。

    Pipeline:
        1. ``process_for_wechat`` —— 本地净化 + CSS inline
        2. ``inline_images_as_data_uris`` —— 所有 ``<img src="http(s)://...">``
           下载下来改写成 ``data:image/...;base64,...``。clipboard 里全是自包含
           payload，交给 mp.weixin.qq.com 的粘贴处理器转存 mmbiz。不用图床、
           不用账号、不依赖 WeChat 信任任何第三方域名。
        3. ``validate_html`` —— WeChat-safe 静态检查，作为单一 gate

    ``appid``/``appsecret`` 参数保留只为 API 向后兼容，当前路径完全不用——
    data URI 自带图片数据，微信粘贴时直接上传 mmbiz，不需要账号。
    """
    del appid, appsecret  # 签名保留，实现不依赖
    processed = process_for_wechat(html, css)
    processed = inline_images_as_data_uris(processed)
    report = validate_html(processed)
    return {"html": processed, "report": report}


def publish_draft_sync(article: dict, appid: str, appsecret: str) -> dict:
    logger = logging.getLogger(__name__)
    title = article.get("title", "")
    html = article.get("html", "")
    css = article.get("css", "")
    logger.info("[publish] title=%r html=%d css=%d", title, len(html), len(css))

    processed_html = process_for_wechat(html, css)
    # 和复制路径一致，图片走本地图床。公众号服务器访问不到 LAN URL，所以直接通过
    # 草稿 API 推送的文章里 <img> 最终在微信端可能显示不出来——用户已明确不使用
    # 这条路径，保留是为了保持端点可用。
    processed_html = process_html_images_via_imgbed(processed_html)

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
