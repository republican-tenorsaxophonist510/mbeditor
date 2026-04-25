import { useEffect, useRef, useState } from "react";
import { writeHtmlToClipboard } from "@/utils/clipboard";

interface Props {
  open: boolean;
  html: string | null;
  hint?: string;
  onClose: () => void;
}

// Copying rich HTML to the clipboard requires a *fresh* user activation — the
// browser expires the one from the original 复制富文本 button by the time the
// backend round-trip finishes. navigator.clipboard.write is also blocked in
// non-secure contexts like http://192.168.x.y. Both paths need the user to
// click a second time. This dialog makes that explicit: server-processed HTML
// is ready → one extra click → clipboard.
export default function CopyReadyDialog({ open, html, hint, onClose }: Props) {
  const [status, setStatus] = useState<"idle" | "ok" | "err">("idle");
  const [message, setMessage] = useState<string>("");
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) {
      setStatus("idle");
      setMessage("");
    }
  }, [open]);

  if (!open || !html) return null;

  const tryCopy = async () => {
    try {
      await writeHtmlToClipboard(html);
      setStatus("ok");
      setMessage("已复制到剪贴板，可以粘到公众号编辑器了");
      window.setTimeout(() => closeRef.current(), 900);
    } catch (err) {
      setStatus("err");
      setMessage(
        err instanceof Error && err.message
          ? `${err.message}。请在下方文本框里手动全选复制。`
          : "复制失败。请在下方文本框里手动全选复制。",
      );
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="copy-ready-title"
      data-testid="copy-ready-dialog"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "grid",
        placeItems: "center",
        zIndex: 1100,
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "var(--bg)",
          color: "var(--fg)",
          width: "min(480px, 100%)",
          borderRadius: 8,
          border: "1px solid var(--border)",
          padding: "20px 22px 18px",
          boxShadow: "0 12px 40px rgba(0,0,0,0.35)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          id="copy-ready-title"
          style={{
            fontSize: 15,
            fontWeight: 600,
            fontFamily: "var(--f-display)",
            letterSpacing: "0.02em",
            marginBottom: 10,
          }}
        >
          富文本已准备好
        </div>
        <div style={{ fontSize: 13, color: "var(--fg-2)", lineHeight: 1.7, marginBottom: 14 }}>
          {hint ?? "浏览器要求剪贴板写入发生在最新一次点击里，请再点一下按钮完成复制。"}
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
          <button className="btn btn-primary btn-sm" onClick={tryCopy} autoFocus>
            点此复制到剪贴板
          </button>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            取消
          </button>
          {status === "ok" && (
            <span style={{ fontSize: 12, color: "var(--accent)" }}>{message}</span>
          )}
          {status === "err" && (
            <span style={{ fontSize: 12, color: "var(--danger, #e5484d)" }}>{message}</span>
          )}
        </div>

        {status === "err" && (
          <textarea
            data-testid="copy-ready-fallback-textarea"
            readOnly
            value={html}
            onFocus={(e) => e.currentTarget.select()}
            style={{
              width: "100%",
              height: 140,
              fontFamily: "var(--f-mono)",
              fontSize: 11,
              border: "1px solid var(--border)",
              borderRadius: 4,
              padding: 8,
              background: "var(--surface)",
              color: "var(--fg-2)",
              resize: "vertical",
              boxSizing: "border-box",
            }}
          />
        )}
      </div>
    </div>
  );
}
