import asyncio

from fastapi import APIRouter
from pydantic import BaseModel

from app.core.response import success
from app.services import publish_adapter
from app.services.legacy_render_pipeline import preview_html

router = APIRouter(prefix="/publish", tags=["publish"])


class PreviewReq(BaseModel):
    html: str
    css: str = ""


class ProcessForCopyReq(BaseModel):
    html: str
    css: str = ""
    # appid/appsecret 只在需要把图片上传到公众号素材库时才用。没传或为空字符串
    # 时后端会跳过上传步骤，返回仅做本地净化 + CSS inline 的 HTML。
    appid: str = ""
    appsecret: str = ""


@router.post("/preview")
async def preview_wechat(req: PreviewReq):
    return success({"html": preview_html(req.html, req.css)})


@router.post("/process-for-copy")
async def process_html_for_copy(req: ProcessForCopyReq):
    # ``process_html_for_copy`` performs blocking sync-httpx uploads to the
    # local image-bed inside ``process_html_images_via_imgbed``; calling it
    # directly would stall the asyncio event loop for the duration of every
    # <img> fetch. Offload to the default thread-pool executor — same pattern
    # the ``/wechat/draft`` route uses for its sync work.
    #
    # Note: no Playwright rasterize step anymore. WeChat-safe SVG is authored
    # correctly up-front; ``validate_html`` runs inside the adapter and its
    # report is returned to the caller. The frontend is responsible for hard-
    # gating on ``report.issues`` — backend only reports, never blocks.
    loop = asyncio.get_running_loop()
    result = await loop.run_in_executor(
        None,
        lambda: publish_adapter.process_html_for_copy(
            req.html, req.css, appid=req.appid, appsecret=req.appsecret,
        ),
    )
    return success({"html": result["html"], "report": result["report"]})
