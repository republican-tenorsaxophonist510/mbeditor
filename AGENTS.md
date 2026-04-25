---
name: mbeditor-agents
description: "根路由文件：MBEditor 是微信交互式 SVG 文档编辑器；按触发场景分派到 skill/mbeditor、skill/wechat-svg-author、skill/wechat-svg-validate 与 docs/wechat-svg/。"
---

# MBEditor · Agent 入口

## 产品心智模型

- MBEditor 是**微信交互式 SVG 文档编辑器**，不是通用 Markdown 工具。
- 文档由三层叠加：HTML（文字/版式）+ SVG（矢量与交互）+ Raster（只在前两层无法表达时）。
- 微信 = W3C SVG 的**严格子集**：动画属性仅 ~20 个白名单，HTML/CSS 有禁用清单。

## 分派到哪个 skill

| 触发 | Skill |
|---|---|
| 架构 / 发布管线 / Lane A-B-C / publish.py | `skill/mbeditor.skill.md` |
| 写或改 HtmlBlock、SVG 交互、五大模式 | `skill/wechat-svg-author.skill.md` |
| 校验、发布前闸口、CI 中 gate | `skill/wechat-svg-validate.skill.md` |

## Agent 循环

1. Read 匹配的 skill。
2. Read skill 内指向的 `docs/wechat-svg/*` 参考文件。
3. 按模式写 HTML/SVG。
4. 过 `scripts/validate_wechat_svg.py` 或 `POST /api/v1/wechat/validate`。
5. 通过后再 commit / 推草稿。

## 硬规则

- 不绕开校验器交付 SVG 产物。
- 不在 HtmlBlock 注入 `<script>` 或 `on*` 事件处理器。
- 不用 `@keyframes` / `transition` / `animation`；动画走 SMIL 白名单属性。
- `<animate>` / `<set>` / `<animateTransform>` 的 `attributeName` 必须在 20 个白名单内。
- 不一次性重写前端 UI shell；不扩张 `backend/app/api/v1/publish.py`（只能缩减/隔离）。
- Lane 未定前，不混合 legacy `Article` 与 `MBDoc` 的修改。

## 运维 / 部署

- **"部署/重新部署" = 本地 NAS**，不是 Docker Desktop，也不是 GitHub Actions。
  SSH 连接、docker-compose 路径、一键命令见用户 auto-memory `project_nas_deploy.md`
  （`~/.claude/projects/Z--mbeditor/memory/`）。SMB 挂载让 `git pull` 在 Windows 端
  的 `Z:\mbeditor` 做即可，build 必须在 NAS 上跑。
- 前端 build 有 Vite 缓存，backend 改 Python 通常立即生效但最好 `docker-compose up
  -d --build`。容器重建后必须 `docker exec mbeditor-backend-1 env` 核对 env 实际
  注入——`docker-compose.yml` 改了不 rebuild 不会生效。

## 踩过的坑（历史伤疤，别重蹈）

### 1. "复制富文本到微信"图片链路——走 data URI，不走图床 URL

- **错误路径**：把 `<img src>` 改写成图床 URL（公网 VPS `mbluostudio.com/imgbed/`
  或 LAN `192.168.31.199:9697`），指望 mp.weixin.qq.com 的粘贴处理器帮忙转存到
  mmbiz。症状：微信后台弹"来源链接 https://… 拉取图片数据失败 重试"。
- **根因**：WeChat 的 paste rehost 不信任任意第三方公网域名（已经收紧），LAN URL
  又只在浏览器和 imgbed 同网段时才可达；两种 URL 都会间歇失败。
- **正确答案**：`backend/app/services/wechat_copy_images.py::inline_images_as_data_uris`
  把所有外链图下载内联成 `data:image/...;base64,...`。WeChat 粘贴处理器对 data
  URI 是浏览器端直接上传 mmbiz，不走 URL 抓取，所有第三方域名问题一次性消失。
  `publish_adapter.process_html_for_copy` 必须调这个，**不要**调
  `local_imgbed_service.process_html_images_via_imgbed`。
- **别动**：`local_imgbed_service.py` 整个模块留着是给 `publish_draft_sync`（直发
  草稿 API）兜底，用户说那条路不主用；不要以为没人用就删掉。
- 单张图封顶 `_MAX_INLINE_BYTES = 6 MB`，超了保留原 src+warning。

### 2. 两个 local-imgbed 实例，配置不一样

- NAS 上 `local-imgbed` 容器（端口 9697）：`BASE_URL=http://192.168.31.199:9697`，
  返回 LAN URL，无鉴权。doocs-md 在用。
- VPS 上另一套 `local-imgbed`（通过 `https://mbluostudio.com/imgbed/` 暴露）：
  Bearer token 鉴权，返回 HTTPS 公网 URL。
- 两者不是同一个容器，配置和鉴权都独立。`docker-compose.yml` 里的
  `LOCAL_IMGBED_UPLOAD_URL` 想往哪打就写哪个，不会自动切换。

### 3. `publish_adapter` 两条函数，不要混合

- `process_html_for_copy` = 复制富文本（不需要 appid/appsecret；data URI 路径）。
- `publish_draft_sync` = 直发草稿（需要 appid/appsecret；用户不主用）。
  两条路径的图片处理策略**必须不同**（data URI vs URL），别图省事共用一个。

### 4. 前端 draft.html 缓存

- `draft.html` 存在 `articlesStore` 里的 localStorage。如果老数据里已经是
  `<img src="https://mbluostudio.com/imgbed/...">`，后端新 pipeline 能把它**再**
  下载回来内联成 data URI（代价是多一次公网抓取），不需要清数据。
- 但前端 JS bundle 走 Vite build + nginx，换了后端行为后如果症状没变，先 Ctrl+
  Shift+R 硬刷再下结论。

## 深度在哪里

- `skill/mbeditor.skill.md` — 架构、Lane 判定、渲染真相、入口文件清单。
- `skill/wechat-svg-author.skill.md` — 如何写一段微信安全的交互式 SVG。
- `skill/wechat-svg-validate.skill.md` — 如何通过校验器作为发布闸。
- `docs/wechat-svg/` — whitelist / five-patterns / html-css-restrictions / copywriting-style / pre-publish-checklist / multi-platform。
- `docs/wechat-svg/templates/` — stretch-accordion / passthrough-hotspot / dual-touch-cta / zero-height-stack / whitelist-hero 五套样板。
- `scripts/validate_wechat_svg.py` · `backend/app/services/svg_validator.py` · `POST /api/v1/wechat/validate`。
