"""Agent copilot generation endpoints.

Currently hosts the "生成交互 SVG 积木" intent. Always returns HTTP 200
(matching ``core.response.success(...)``) — failure is signaled via
``data.status`` in the body, so the editor UI can render a diff-style
error panel without juggling axios error handling.
"""
from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.core.response import success
from app.services.agent_svg_prompt import generate_svg_block

router = APIRouter(prefix="/agent", tags=["agent"])


class GenerateSvgReq(BaseModel):
    prompt: str = Field(default="", description="中文意图，如 10 题年终共鸣投票")


@router.post("/generate-svg")
async def generate_svg(req: GenerateSvgReq):
    # ``llm_available=False`` until a real LLM client is wired. See
    # app.services.agent_svg_prompt for the stub contract.
    result = generate_svg_block(req.prompt, llm_available=False)
    return success(result)
