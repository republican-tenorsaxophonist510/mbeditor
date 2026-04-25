import { useCallback, useEffect, useMemo, useState } from "react";
import { IconClose } from "@/components/icons";
import { TEMPLATES, type Template } from "./templates";

interface TemplateGalleryProps {
  open: boolean;
  /** 当前文章正文长度，用来决定是否需要覆盖确认 */
  currentHtmlLength: number;
  onClose: () => void;
  onInsert: (template: Template) => void;
}

/** 超过这个长度就认为是"非空白草稿"，插入前需要用户确认 */
const NON_TRIVIAL_HTML_LENGTH = 200;

/**
 * 插入模板画廊模态框。
 *
 * 行为约定（与 Agent E 的约束对齐）：
 *  - 点击"插入"后，若当前文章 html 长度 > 200，先弹 confirm；否则直接覆盖。
 *  - 模板 html 是 build time 打包的，所以点击插入是纯本地动作，不走网络。
 *  - 插入成功后立刻关闭画廊；toast 由父组件（StructurePanel）负责。
 *  - 本组件不调用 validator —— 模板文件已预校验过。
 */
export default function TemplateGallery({
  open,
  currentHtmlLength,
  onClose,
  onInsert,
}: TemplateGalleryProps) {
  const [focusedId, setFocusedId] = useState<string | null>(null);

  // ESC 关闭
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const templates = useMemo(() => TEMPLATES, []);

  const handleInsert = useCallback(
    (template: Template) => {
      if (currentHtmlLength > NON_TRIVIAL_HTML_LENGTH) {
        const ok = window.confirm(
          `当前文章已经有内容（约 ${currentHtmlLength.toLocaleString()} 字符），插入「${template.title}」会完全覆盖现有内容。确认继续？`,
        );
        if (!ok) return;
      }
      onInsert(template);
    },
    [currentHtmlLength, onInsert],
  );

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="插入模板"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        background: "rgba(10, 8, 9, 0.62)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        display: "grid",
        placeItems: "center",
        padding: 24,
        animation: "fade-in 0.18s ease-out",
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: "min(960px, 100%)",
          maxHeight: "calc(100vh - 48px)",
          background: "var(--bg-deep)",
          border: "1px solid var(--border-2)",
          borderRadius: "var(--r-lg)",
          boxShadow: "var(--shadow-3)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          animation: "slide-up 0.22s ease-out",
        }}
      >
        <header
          style={{
            padding: "18px 22px 16px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          <div>
            <div className="caps" style={{ color: "var(--gold)", marginBottom: 6 }}>
              模板库 · WeChat SVG
            </div>
            <h2
              className="title-serif"
              style={{ margin: 0, fontSize: 26, color: "var(--fg)", lineHeight: 1.15 }}
            >
              插入一个可直接发布的模板
            </h2>
            <p
              style={{
                margin: "8px 0 0",
                color: "var(--fg-3)",
                fontSize: 12,
                lineHeight: 1.7,
                maxWidth: 620,
              }}
            >
              五大交互模式的生产级参考作品，点"插入"后会覆盖当前文章的正文，保留标题。插入后可以继续在编辑器里改文案、换配色。
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="关闭"
            className="btn btn-ghost btn-sm"
            style={{ flexShrink: 0 }}
          >
            <IconClose size={14} />
            关闭
          </button>
        </header>

        <div
          style={{
            padding: 20,
            overflowY: "auto",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 14,
            alignContent: "start",
          }}
        >
          {templates.map((tpl) => {
            const focused = focusedId === tpl.id;
            return (
              <article
                key={tpl.id}
                onMouseEnter={() => setFocusedId(tpl.id)}
                onMouseLeave={() => setFocusedId((current) => (current === tpl.id ? null : current))}
                style={{
                  position: "relative",
                  display: "flex",
                  flexDirection: "column",
                  padding: 16,
                  background: "var(--surface)",
                  border: `1px solid ${focused ? "var(--border-3)" : "var(--border-2)"}`,
                  borderRadius: "var(--r-md)",
                  boxShadow: focused ? "var(--shadow-2)" : "var(--shadow-1)",
                  transition: "all 0.18s var(--ease-out-expo)",
                  minHeight: 240,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 10,
                    flexWrap: "wrap",
                  }}
                >
                  <span className="chip chip-accent" title="交互模式">
                    {tpl.pattern}
                  </span>
                  <span className="chip" title="全文字数">
                    {tpl.wordCount.toLocaleString()} 字
                  </span>
                </div>

                <h3
                  style={{
                    margin: "0 0 6px",
                    fontFamily: "var(--f-display)",
                    fontSize: 18,
                    lineHeight: 1.25,
                    color: "var(--fg)",
                    letterSpacing: "-0.01em",
                  }}
                >
                  {tpl.title}
                </h3>

                <div
                  className="caps"
                  style={{ color: "var(--fg-4)", marginBottom: 10, fontSize: 9 }}
                  title="选题样本"
                >
                  选题 · {tpl.topic}
                </div>

                <p
                  style={{
                    margin: 0,
                    fontSize: 12,
                    lineHeight: 1.65,
                    color: "var(--fg-3)",
                    whiteSpace: "pre-line",
                    display: "-webkit-box",
                    WebkitLineClamp: 4,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {tpl.preview}
                </p>

                <div style={{ flex: 1 }} />

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginTop: 14,
                    gap: 10,
                  }}
                >
                  <span
                    className="mono"
                    style={{
                      fontSize: 10,
                      color: "var(--fg-5)",
                      letterSpacing: "0.08em",
                      textOverflow: "ellipsis",
                      overflow: "hidden",
                      whiteSpace: "nowrap",
                      flex: 1,
                      minWidth: 0,
                    }}
                    title={tpl.filename}
                  >
                    {tpl.filename}
                  </span>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => handleInsert(tpl)}
                    style={{ flexShrink: 0 }}
                  >
                    插入
                  </button>
                </div>
              </article>
            );
          })}
        </div>

        <footer
          style={{
            padding: "10px 20px",
            borderTop: "1px solid var(--border)",
            fontFamily: "var(--f-mono)",
            fontSize: 10,
            color: "var(--fg-5)",
            display: "flex",
            justifyContent: "space-between",
            letterSpacing: "0.08em",
          }}
        >
          <span>{templates.length} 个模板 · 已预校验</span>
          <span>插入 = 覆盖正文；标题保留</span>
        </footer>
      </div>
    </div>
  );
}
