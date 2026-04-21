import asyncio

from fastapi import APIRouter, File, Form, UploadFile
from pydantic import BaseModel, Field

from app.core.response import success
from app.services import wechat_service
from app.services.publish_adapter import publish_draft_sync

router = APIRouter(prefix="/wechat", tags=["wechat"])


class Credentials(BaseModel):
    appid: str
    appsecret: str


class ArticlePayload(BaseModel):
    title: str = ""
    html: str = ""
    css: str = ""
    author: str = ""
    digest: str = ""
    cover: str = ""
    mode: str = "html"
    markdown: str = ""


class DraftReq(BaseModel):
    appid: str
    appsecret: str
    article: ArticlePayload = Field(default_factory=ArticlePayload)


@router.post("/test-connection")
async def test_connection(req: Credentials):
    wechat_service.get_access_token(appid=req.appid, appsecret=req.appsecret, force_refresh=True)
    return success({"valid": True, "appid": req.appid})


@router.post("/upload-image")
async def upload_image(
    appid: str = Form(default=""),
    appsecret: str = Form(default=""),
    file: UploadFile = File(...),
):
    content = await file.read()
    filename = file.filename or "image.png"
    url = wechat_service.upload_image_to_wechat(content, filename, appid=appid, appsecret=appsecret)
    return success({"url": url, "filename": filename, "size": len(content)})


@router.post("/draft")
async def create_draft(req: DraftReq):
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        None,
        publish_draft_sync,
        req.article.model_dump(),
        req.appid,
        req.appsecret,
    )
    return success(result)
