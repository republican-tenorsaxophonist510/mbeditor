import { describe, expect, it } from "vitest";
import { TEMPLATES } from "./templates";

describe("WeChat SVG template gallery bundle", () => {
  it("bundles exactly 5 templates (one per interaction pattern)", () => {
    expect(TEMPLATES).toHaveLength(5);
  });

  it("every template has required metadata + non-empty html", () => {
    TEMPLATES.forEach((tpl) => {
      expect(tpl.id, "id").toMatch(/^[a-z0-9-]+$/);
      expect(tpl.filename, `${tpl.id} filename`).toMatch(/\.html$/);
      expect(tpl.title, `${tpl.id} title`).toBeTruthy();
      expect(tpl.pattern, `${tpl.id} pattern`).toBeTruthy();
      expect(tpl.topic, `${tpl.id} topic`).toBeTruthy();
      expect(tpl.wordCount, `${tpl.id} wordCount`).toBeGreaterThan(0);
      expect(tpl.preview, `${tpl.id} preview`).toBeTruthy();

      // ?raw import should deliver a big blob of HTML; anything less than 1kB
      // means the vendored template was swapped for an empty file or the
      // import path drifted. Catch that early.
      expect(tpl.html.length, `${tpl.id} html length`).toBeGreaterThan(1000);
      expect(tpl.html, `${tpl.id} html shape`).toMatch(/<section|<svg/i);
    });
  });

  it("template ids and filenames are unique", () => {
    const ids = new Set(TEMPLATES.map((tpl) => tpl.id));
    const files = new Set(TEMPLATES.map((tpl) => tpl.filename));
    expect(ids.size).toBe(TEMPLATES.length);
    expect(files.size).toBe(TEMPLATES.length);
  });
});
