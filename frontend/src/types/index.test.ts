import { describe, expect, it } from "vitest";
import type { WeChatAccount, LegacyExportBundle } from "./index";

describe("types", () => {
  it("WeChatAccount has the expected shape", () => {
    const a: WeChatAccount = { id: "x", name: "n", appid: "wxA", appsecret: "s" };
    expect(a.appid).toBe("wxA");
  });

  it("LegacyExportBundle has articles and mbdocs arrays", () => {
    const b: LegacyExportBundle = { version: 1, exported_at: "now", articles: [], mbdocs: [] };
    expect(b.articles).toEqual([]);
    expect(b.mbdocs).toEqual([]);
  });
});
