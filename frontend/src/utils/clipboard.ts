/**
 * Write sanitized HTML to the system clipboard so WeChat's paste handler
 * receives it as rich text (text/html) with a plain-text fallback.
 *
 * The HTML must already have been run through the WeChat-safe sanitizer
 * pipeline on the backend (the process-for-copy endpoint) — that step strips
 * flex/grid/position:absolute/animations/transforms/etc and uploads local
 * images to mmbiz.qpic.cn so the paste result renders identically to the
 * editor preview.
 */
export async function writeHtmlToClipboard(html: string): Promise<void> {
  const cleaned = stripThemeChromeBackgrounds(html);
  const plainText = htmlToPlainText(cleaned);

  if (typeof navigator !== "undefined" && navigator.clipboard && typeof ClipboardItem !== "undefined") {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([cleaned], { type: "text/html" }),
          "text/plain": new Blob([plainText], { type: "text/plain" }),
        }),
      ]);
      return;
    } catch {
      // fall through to execCommand fallback
    }
  }

  fallbackCopyRichText(cleaned);
}

/**
 * WeChat's paste handler runs getComputedStyle() on every pasted element and
 * inlines the results — including the element's resolved `background-color`.
 * When the mbeditor editor is on a dark theme, the preview iframe's ancestor
 * `background: var(--bg)` resolves to e.g. `rgb(20,16,19)` and that color
 * ends up as inline `background-color` on every `<p>` in the WeChat article.
 *
 * Strategy: read the current theme's chrome variables live, then strip any
 * inline `background-color` whose value matches one of them. Article-authored
 * backgrounds (#fafaf9, #FEFCF7, etc.) are never equal to the chrome vars
 * across any of the three themes, so this is safe.
 */
function stripThemeChromeBackgrounds(html: string): string {
  if (typeof document === "undefined" || typeof window === "undefined" || typeof DOMParser === "undefined") {
    return html;
  }

  const themeColors = collectThemeChromeColors();
  if (themeColors.size === 0) return html;

  const doc = new DOMParser().parseFromString(html, "text/html");
  const styled = doc.querySelectorAll<HTMLElement>("[style]");
  let changed = false;
  for (const el of styled) {
    const bg = el.style.backgroundColor;
    if (bg && themeColors.has(normalizeColor(bg))) {
      el.style.removeProperty("background-color");
      if (el.getAttribute("style") === "") el.removeAttribute("style");
      changed = true;
    }
  }
  if (!changed) return html;
  return doc.body ? doc.body.innerHTML : html;
}

/** Read --bg / --bg-deep / --surface / --surface-2 / --surface-3 values from
 *  the document root. Covers whatever theme is currently active. */
function collectThemeChromeColors(): Set<string> {
  const out = new Set<string>();
  const cs = window.getComputedStyle(document.documentElement);
  // --surface-2 is intentionally omitted: on the "paper" theme it resolves to
  // #FFFFFF, which would false-positive on any white-backgrounded table/card
  // in article content. The other four vars are distinctive cream/dark shades
  // across all three themes and never appear as authored colors.
  const varNames = ["--bg", "--bg-deep", "--surface", "--surface-3"];
  for (const v of varNames) {
    const raw = cs.getPropertyValue(v).trim();
    if (!raw) continue;
    const n = normalizeColor(raw);
    if (n) out.add(n);
  }
  return out;
}

/** Normalize "#141013" / "rgb(20, 16, 19)" / "RGB(20,16,19)" to "rgb(20,16,19)"
 *  so hex vs rgb vs whitespace differences all compare equal. */
function normalizeColor(s: string): string {
  const trimmed = s.trim();
  const shortHex = trimmed.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i);
  if (shortHex) {
    const [, r, g, b] = shortHex;
    return `rgb(${parseInt(r + r, 16)},${parseInt(g + g, 16)},${parseInt(b + b, 16)})`;
  }
  const longHex = trimmed.match(/^#([0-9a-f]{6})$/i);
  if (longHex) {
    const h = longHex[1];
    return `rgb(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)})`;
  }
  const rgb = trimmed.match(/^rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*[\d.]+)?\s*\)$/i);
  if (rgb) return `rgb(${rgb[1]},${rgb[2]},${rgb[3]})`;
  return trimmed.toLowerCase().replace(/\s+/g, "");
}

function htmlToPlainText(html: string): string {
  if (typeof DOMParser === "undefined") return html;
  const doc = new DOMParser().parseFromString(html, "text/html");
  const text = doc.body ? doc.body.textContent ?? "" : "";
  return text.replace(/\s+/g, " ").trim();
}

function fallbackCopyRichText(html: string): void {
  if (typeof document === "undefined") {
    throw new Error("当前环境不支持剪贴板");
  }

  const container = document.createElement("div");
  container.setAttribute("contenteditable", "true");
  container.style.position = "fixed";
  container.style.left = "-9999px";
  container.style.top = "0";
  container.style.opacity = "0";
  // Parse once and append nodes — avoids innerHTML on live DOM.
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const body = parsed.body;
  if (body) {
    while (body.firstChild) container.appendChild(body.firstChild);
  }
  document.body.appendChild(container);

  const range = document.createRange();
  range.selectNodeContents(container);
  const selection = window.getSelection();
  if (!selection) {
    document.body.removeChild(container);
    throw new Error("当前环境不支持选区 API");
  }

  selection.removeAllRanges();
  selection.addRange(range);

  try {
    const ok = document.execCommand("copy");
    if (!ok) throw new Error("复制命令执行失败");
  } finally {
    selection.removeAllRanges();
    document.body.removeChild(container);
  }
}
