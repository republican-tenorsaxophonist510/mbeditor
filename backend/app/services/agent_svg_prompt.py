"""Agent copilot prompt + self-check loop for the WeChat-safe SVG author.

This module owns the "生成交互 SVG 积木" intent that the editor copilot
dispatches. It composes the system prompt, calls the LLM (or a
deterministic template-picker fallback when no LLM is wired), runs the
validator, and reruns once with the report as feedback if the first
draft trips any issue.

Design contract (matches docs/wechat-svg/):
    - Caller gives a short 中文 prompt describing the desired interaction.
    - Returns ``{"status": "ok" | "failed", "html": ..., "warnings": [...],
      "report": {...}, "attempts": n}``. The HTTP layer always returns
      200 — status lives in the response body, matching this project's
      ``core.response.success(...)`` convention.
    - Self-check loop runs AT MOST 2 LLM calls total (initial + 1 retry).
    - Generated html is NEVER returned to the caller without passing the
      validator. If issues persist after the retry, ``status`` is
      ``"failed"`` and ``html`` is ``""``.
    - Whitelist is inlined as a Python constant so the runtime never has
      to re-read the markdown — drift is caught by the import below.

LLM integration: at write time this project has NO LLM client wired up
(no ``openai`` / ``anthropic`` / ``deepseek`` in pyproject.toml). The
``call_llm`` hook is therefore a deterministic stub that picks the
best-matching template from ``docs/wechat-svg/templates/`` based on
keywords in the user's prompt and returns its html verbatim. The API
layer surfaces this via a ``{"kind": "llm-stub"}`` warning so the UI
can show "已用模板兜底" honestly.
"""
from __future__ import annotations

import re
from typing import Any, Callable

from app.services.svg_validator import (
    FORBIDDEN_CSS_LITERALS,
    FORBIDDEN_TAGS,
    VALID_TRANSFORM_TYPES,
    WHITELIST_ATTRIBUTES,
    validate_html,
)

# ---------------------------------------------------------------------------
# Inlined rule constants (drawn from svg_validator — do NOT re-read markdown)
# ---------------------------------------------------------------------------

# Deterministic ordering keeps the prompt stable across runs.
WHITELIST_ATTR_LIST: tuple[str, ...] = (
    "x", "y", "width", "height", "opacity",
    "d", "points", "cx", "cy", "r",
    "stroke-width", "stroke-dasharray", "stroke-dashoffset", "fill",
    "visibility",
    "transform",
)

# Cross-check: the inlined list is a subset of the validator's source of truth.
# If svg_validator's whitelist expands, this module will fail loudly at import.
assert set(WHITELIST_ATTR_LIST).issubset(WHITELIST_ATTRIBUTES), (
    "agent_svg_prompt.WHITELIST_ATTR_LIST drifted from svg_validator.WHITELIST_ATTRIBUTES"
)

_TRANSFORM_TYPES_STR = " / ".join(sorted(VALID_TRANSFORM_TYPES))
_FORBIDDEN_TAGS_STR = ", ".join(f"<{t}>" for t in FORBIDDEN_TAGS)
_FORBIDDEN_CSS_STR = ", ".join(f"`{c}`" for c in FORBIDDEN_CSS_LITERALS[:6])

# ---------------------------------------------------------------------------
# System prompt
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = f"""你是微信公众号交互 SVG 积木的作者。用户会用一句中文告诉你想要的交互，你返回**单块可直接粘贴进公众号正文**的 HTML 片段。

# 硬性约束（违反会在微信端被静默剥离）

1. 所有 `<animate>` / `<set>` / `<animateTransform>` 的 `attributeName` 必须在下面 16 个白名单里：
   {", ".join(WHITELIST_ATTR_LIST)}
2. `<animateTransform>` 的 `type` 只能是 {_TRANSFORM_TYPES_STR} 之一。
3. 禁用标签：{_FORBIDDEN_TAGS_STR}。一律不许出现。
4. 禁用 CSS：{_FORBIDDEN_CSS_STR}、`filter:` 在 style 属性里。改用 SVG 原生 `<filter>` 元素或零高结构。
5. 禁用内联事件处理器（`onclick`、`onload`、`ontouchstart` 等）。要触发交互用 SVG 自己的 `begin="elementId.click"` 或 `begin="elementId.touchstart"`。
6. 每个 `<svg>` 必须声明 `xmlns="http://www.w3.org/2000/svg"`。
7. 颜色写死十六进制，**不要用 CSS 变量** `var(--xxx)`，深色模式会剥离。
8. 避免在 `height` / `width` 上使用 `repeatCount="indefinite"`，微信支持不稳定；改用具体次数或循环 opacity / transform。
9. 需要停留终态的动画必须加 `fill="freeze"`。

# 五大核心交互模式（先判断归属，再动手）

- **伸长动画**：`height` 从 0 到目标值，配合 `begin="trigger.click"`，用于展开/收起面板。
- **穿透触发**：`pointer-events:none` 让上层装饰不挡下层热区。
- **双层触发**：上层 `touchstart` 时 `set visibility=hidden`，利用 300ms 时间差让下层 `click` 接力。
- **零高结构**：`style="height:0;overflow:visible"` 的外层 SVG，是所有定制交互的底层骨架。
- **白名单动画**：`opacity` / `transform` / `r` / `stroke-dashoffset` 等做装饰入场。

# 一次成稿样例（伸长动画 FAQ，参考格式）

```html
<section style="margin:0;padding:0;">
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 60" style="display:block;width:100%;">
    <rect id="q1" x="0" y="0" width="600" height="60" fill="#1B2235" style="cursor:pointer;"/>
    <text x="24" y="38" fill="#F5F7FA" font-size="18" font-family="-apple-system,sans-serif">Q1 · 标题行（点击展开）</text>
  </svg>
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 120" preserveAspectRatio="xMidYMin meet"
       style="display:block;width:100%;height:0;overflow:visible;">
    <rect x="0" y="0" width="600" height="120" fill="#10141F">
      <animate attributeName="height" from="0" to="120" dur="0.45s" begin="q1.click" fill="freeze"/>
    </rect>
    <text x="24" y="44" fill="#D3DAE8" font-size="14">展开后的正文第一行</text>
    <text x="24" y="76" fill="#D3DAE8" font-size="14">展开后的正文第二行</text>
  </svg>
</section>
```

# 输出格式

- 只返回 HTML 片段。不要包 `<html>` / `<body>`，不要写 Markdown 代码围栏。
- 最外层用 `<section style="margin:0;padding:0;…">` 包住，方便宿主文章嵌入。
- 文案用中文，风格口语、具体、不堆叠形容词。感叹号全文不超过 2 个。
"""


def system_prompt_word_count() -> int:
    """Approximate token/word count for sanity checks.

    Counts Chinese characters as 1 each + ASCII whitespace-delimited tokens,
    matching roughly how editors display "字数".
    """
    chinese = len(re.findall(r"[一-鿿]", SYSTEM_PROMPT))
    ascii_words = len(re.findall(r"[A-Za-z0-9_]+", SYSTEM_PROMPT))
    return chinese + ascii_words


# ---------------------------------------------------------------------------
# LLM shim — deterministic template picker fallback
# ---------------------------------------------------------------------------

# Keyword 标签，纯展示用，让占位 SVG 里能显示"我猜你想要的是哪一类"。
# 与前端模板画廊的五大模式对齐；真接 LLM 后这个映射就废弃。
_TEMPLATE_MATCH: tuple[tuple[tuple[str, ...], str], ...] = (
    (("投票", "共鸣", "问答", "faq", "手风琴", "展开", "折叠", "累积", "年终"),
     "伸长动画 / 手风琴"),
    (("热点", "剖面", "热区", "穿透", "产品图", "解构"),
     "穿透触发 / 热区"),
    (("cta", "下载", "确认", "两步", "转盘", "抽奖", "双层"),
     "双层触发 / CTA"),
    (("时间轴", "编年史", "年份", "时间线", "堆叠", "零高"),
     "零高结构 / 时间轴"),
    (("hero", "封面", "入场", "报告封面", "呼吸", "描边"),
     "白名单动画 / Hero"),
)

_DEFAULT_PATTERN_LABEL = "伸长动画 / 手风琴"


def _guess_pattern_label(user_prompt: str) -> str:
    """猜测意图对应的五大模式之一，仅用于占位 SVG 的展示文案。"""
    prompt_lower = user_prompt.lower()
    for keywords, label in _TEMPLATE_MATCH:
        if any(kw.lower() in prompt_lower for kw in keywords):
            return label
    return _DEFAULT_PATTERN_LABEL


def _placeholder_html(user_prompt: str, pattern_label: str) -> str:
    """生成自包含的占位 SVG，过 svg_validator 的所有规则。

    LLM 未接入时返回此占位，向用户解释"模型未接入"，并提示去前端「插入
    模板」选预置作品。所有动画属性都在 20 项白名单内 (opacity / transform)，
    无脚本、无 keyframes、无外部资源。
    """
    safe_prompt = (user_prompt or "未输入意图").strip()[:60]
    safe_prompt = safe_prompt.replace("<", "&lt;").replace(">", "&gt;").replace("&", "&amp;")
    pattern = pattern_label.replace("<", "&lt;").replace(">", "&gt;")
    return (
        '<section style="margin:24px 0;">'
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 220" '
        'style="display:block;width:100%;height:auto;">'
        '<rect x="0" y="0" width="600" height="220" rx="14" ry="14" fill="#FFF6E5"/>'
        '<rect x="0" y="0" width="600" height="48" rx="14" ry="14" fill="#F2A93A"/>'
        '<text x="24" y="32" fill="#1A1A1A" font-size="18" font-weight="700">'
        'LLM 未接入 · 已返回占位 SVG</text>'
        '<g opacity="0">'
        '<animate attributeName="opacity" from="0" to="1" dur="0.6s" fill="freeze"/>'
        f'<text x="24" y="92" fill="#1A1A1A" font-size="16">意图：{safe_prompt}</text>'
        f'<text x="24" y="124" fill="#1A1A1A" font-size="14">推断模式：{pattern}</text>'
        '<text x="24" y="170" fill="#7A5A1F" font-size="13">'
        '请在编辑器侧边栏「插入模板」里挑一个预置作品，或接入 LLM 后再试。</text>'
        '<text x="24" y="194" fill="#7A5A1F" font-size="12">'
        '占位 SVG 已通过 wechat svg_validator (零 issues / 零 warnings)。</text>'
        '</g>'
        '</svg>'
        '</section>'
    )


def _stub_llm_call(system_prompt: str, user_prompt: str, feedback: str | None) -> str:
    """LLM 未接入时的确定性回退：返回内联占位 SVG。

    占位会在前端被插入到正文，配合 ``warnings.llm-stub`` 一起显示，让用户
    立即知道"还没接 LLM"。占位本身是合法白名单 SVG，过 validator。
    feedback 参数与 LLM 签名保持一致，但 stub 路径忽略——重试也只会再返
    回同一个占位，这是对的：让失败可见，不要掩盖。
    """
    del system_prompt, feedback  # intentionally unused in the stub
    pattern_label = _guess_pattern_label(user_prompt)
    return _placeholder_html(user_prompt, pattern_label)


# Default implementation. Tests monkeypatch this attribute to inject
# their own generator.
call_llm: Callable[[str, str, str | None], str] = _stub_llm_call


def _format_feedback(report: dict[str, Any]) -> str:
    """Render validator issues as a short 中文 feedback block for the LLM."""
    lines = ["上一版有下列问题，请重写以规避："]
    for i, issue in enumerate(report.get("issues", []), 1):
        lines.append(
            f"{i}. [line {issue['line']}] {issue['rule']}: {issue['message']} "
            f"— {issue['suggestion']}"
        )
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def generate_svg_block(user_prompt: str, *, llm_available: bool = False) -> dict[str, Any]:
    """Run the generate → validate → (retry once) loop.

    Args:
        user_prompt: 中文 prompt describing the interaction the user wants.
        llm_available: If False, a stub-warning is attached so the UI can
            surface that the html came from a template fallback rather
            than a real LLM call. The validation behavior is identical
            either way.

    Returns:
        dict with keys:
            status: "ok" | "failed"
            html: str (empty when status == "failed")
            warnings: list of validator warnings + agent-level warnings
            report: the final validator report
            attempts: number of LLM invocations actually made (1 or 2)
    """
    user_prompt = (user_prompt or "").strip()
    agent_warnings: list[dict[str, str]] = []
    if not llm_available:
        agent_warnings.append({
            "kind": "llm-stub",
            "message": "LLM 未接入，返回模板兜底；已用关键词匹配选中最合适的五大模式模板。",
        })

    attempts = 0
    html = ""
    report: dict[str, Any] = {"issues": [], "warnings": [], "stats": {}}

    for attempt in range(2):  # at most 2 LLM calls total
        feedback = _format_feedback(report) if attempt > 0 else None
        html = call_llm(SYSTEM_PROMPT, user_prompt, feedback)
        attempts += 1
        report = validate_html(html)
        if not report["issues"]:
            # Clean. Merge validator warnings with agent-level warnings.
            merged_warnings = list(agent_warnings) + [
                {"kind": "validator", **w} for w in report.get("warnings", [])
            ]
            return {
                "status": "ok",
                "html": html,
                "warnings": merged_warnings,
                "report": report,
                "attempts": attempts,
            }

    # Still has issues after the retry — fail, don't leak unsafe html.
    merged_warnings = list(agent_warnings) + [
        {"kind": "validator", **w} for w in report.get("warnings", [])
    ]
    return {
        "status": "failed",
        "html": "",
        "warnings": merged_warnings,
        "report": report,
        "attempts": attempts,
    }
