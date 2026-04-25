// 五个微信 SVG 模板的静态元数据 + 原始 HTML。
//
// 模板 HTML 通过 Vite `?raw` import 以字符串形式打包进前端 bundle，不走任何
// 网络请求。源文件维护在 docs/wechat-svg/templates/，发布时镜像到本目录的
// templates/ 子文件夹——前端 Docker build context 只覆盖 frontend/，无法跨
// 仓库跨界引用。元数据 (title / mode / topic / wordCount) 与 docs 下的
// README.md 保持一致，preview 则从每个模板的第一段正文文案中截取 (4 行内)。
//
// 维护规则：
//  - README.md 改了字数/选题/模式 → 同步改本文件
//  - 模板文件本身改了第一段 hook 段落 → 同步改 preview
//  - 新增模板 → 同步加 entry + 镜像到 ./templates/；不要删 filename 字段
//  - docs/wechat-svg/templates/*.html 改了 → 重跑 scripts/sync_template_mirror
//    或手动 cp 一份到 ./templates/（CI 可以加校验）

import stretchAccordionHtml from "./templates/stretch-accordion.html?raw";
import passthroughHotspotHtml from "./templates/passthrough-hotspot.html?raw";
import dualTouchCtaHtml from "./templates/dual-touch-cta.html?raw";
import zeroHeightStackHtml from "./templates/zero-height-stack.html?raw";
import whitelistHeroHtml from "./templates/whitelist-hero.html?raw";

export interface Template {
  /** 稳定 id，用作 React key 与埋点 */
  id: string;
  /** 与 docs/wechat-svg/templates 下文件名一致，供 Agent E 校验定位 */
  filename: string;
  /** 中文模板名 */
  title: string;
  /** 交互模式标签（对应 five-patterns.md 的五大模式之一） */
  pattern: string;
  /** 选题样本（README.md 里抄来的，用来向用户展示契合度） */
  topic: string;
  /** 全文字数，README.md 同步 */
  wordCount: number;
  /** 4 行以内预览 */
  preview: string;
  /** 模板原始 HTML（已经是经过校验的合法微信 SVG 内容） */
  html: string;
}

export const TEMPLATES: Template[] = [
  {
    id: "stretch-accordion",
    filename: "stretch-accordion.html",
    title: "手风琴展开榜单",
    pattern: "伸长动画 + 零高结构",
    topic: "2026 年度 AI 生产力工具精选榜 TOP 10",
    wordCount: 2040,
    preview:
      "从写作、开发、设计到自动化，我们用了 11 个月，测完 147 款工具。\n只留这 10 个，敢让你把一年的订阅预算押进去。\n10 张工具卡点击展开详细评测，height 从 0 到 260 的伸长动画。\n适合做年度盘点、TOP N 榜单、课程目录等“信息密度高、按需展开”的场景。",
    html: stretchAccordionHtml,
  },
  {
    id: "passthrough-hotspot",
    filename: "passthrough-hotspot.html",
    title: "产业图热区点击",
    pattern: "穿透触发 + 精确热区 + 伸长",
    topic: "一张图看懂 2026 新能源汽车产业链",
    wordCount: 2120,
    preview:
      "从锂矿到 Robotaxi，六个环节，72 家代表企业，一张可点的图。\n点图上的热点，看这一环节今年发生了什么。\n产业链图上 6 个 pointer-events:all 圆点，点击展开对应环节详情。\n适合做产业地图、流程拆解、知识图谱等“整体看形、局部看细”的场景。",
    html: passthroughHotspotHtml,
  },
  {
    id: "dual-touch-cta",
    filename: "dual-touch-cta.html",
    title: "长按揭示投票卡",
    pattern: "双层触发 (touchstart → click)",
    topic: "年终行业共鸣投票 · 10 条判断",
    wordCount: 2170,
    preview:
      "一年快过完，是时候认真说一句“这件事我信”或“这事我不信”了。\n按住每张卡片查看背景，松手即为投票。\n10 张遮罩卡 touchstart 隐藏上层、露出下层投票结果。\n适合做年终投票、观点对决、品牌 CTA 等“先悬念再揭示”的互动场景。",
    html: dualTouchCtaHtml,
  },
  {
    id: "zero-height-stack",
    filename: "zero-height-stack.html",
    title: "零高时间轴编年史",
    pattern: "零高结构 · 多 SVG 堆叠",
    topic: "国产大模型编年史 2019 — 2026",
    wordCount: 2030,
    preview:
      "从第一篇预训练论文到自主产出万亿参数模型，中国 AI 用了整整七年。\n这是这段路程的每一年。\n时间轴下方 7 个零高展开条，点击年份独立展开该年三件大事。\n适合做编年史、发展复盘、版本里程碑等“线性时间 + 事件展开”的场景。",
    html: zeroHeightStackHtml,
  },
  {
    id: "whitelist-hero",
    filename: "whitelist-hero.html",
    title: "白名单动画报告封面",
    pattern: "白名单动画 · 入场装饰",
    topic: "《2026 创业者年度复盘报告》发布",
    wordCount: 2080,
    preview:
      "装饰光圈呼吸、主标题淡入、核心数字描边绘制、装饰圆点脉动。\n全部为时间驱动（begin=\"0s/0.6s/…\"），打开即播放，无需点击。\n使用的 opacity / transform / r / stroke-dashoffset / width 均在 20 属性白名单内。\n适合做报告发布、品牌年鉴、产品首发等“强视觉 hero + 正文数据条”的场景。",
    html: whitelistHeroHtml,
  },
];
