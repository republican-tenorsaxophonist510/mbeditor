import { afterEach, describe, expect, it, vi } from "vitest";

import api from "@/lib/api";
import {
  reportIsBlocking,
  reportIsEmpty,
  validateWechatHtml,
} from "@/lib/wechat-validate";

describe("validateWechatHtml", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parses a well-formed response into a typed report", async () => {
    const mockReport = {
      issues: [{ line: 3, rule: "forbidden-tag", message: "m", suggestion: "s" }],
      warnings: [{ line: 1, rule: "svg-xmlns", message: "w", suggestion: "x" }],
      stats: {
        svg_count: 1,
        animate_count: 0,
        animate_transform_count: 0,
        set_count: 0,
        anchor_count: 0,
      },
    };
    const postSpy = vi
      .spyOn(api, "post")
      .mockResolvedValueOnce({ data: { code: 0, data: mockReport, message: "" } });

    const result = await validateWechatHtml("<svg></svg>");
    expect(postSpy).toHaveBeenCalledWith(
      "/wechat/validate",
      { html: "<svg></svg>" },
      expect.any(Object),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.report.issues).toHaveLength(1);
      expect(result.report.issues[0].rule).toBe("forbidden-tag");
      expect(result.report.warnings[0].rule).toBe("svg-xmlns");
      expect(result.report.stats.svg_count).toBe(1);
    }
  });

  it("fails open on network error", async () => {
    vi.spyOn(api, "post").mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const result = await validateWechatHtml("<svg></svg>");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("ECONNREFUSED");
  });

  it("fails open on non-zero response code", async () => {
    vi.spyOn(api, "post").mockResolvedValueOnce({
      data: { code: 1, data: null, message: "boom" },
    });
    const result = await validateWechatHtml("x");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("boom");
  });

  it("fails open on malformed payload", async () => {
    vi.spyOn(api, "post").mockResolvedValueOnce({
      data: { code: 0, data: { issues: "nope" }, message: "" },
    });
    const result = await validateWechatHtml("x");
    expect(result.ok).toBe(false);
  });

  it("reportIsBlocking / reportIsEmpty helpers agree with finding counts", () => {
    const blocking = {
      issues: [{ line: 0, rule: "r", message: "m", suggestion: "s" }],
      warnings: [],
      stats: {
        svg_count: 0,
        animate_count: 0,
        animate_transform_count: 0,
        set_count: 0,
        anchor_count: 0,
      },
    };
    expect(reportIsBlocking(blocking)).toBe(true);
    expect(reportIsEmpty(blocking)).toBe(false);

    const empty = { issues: [], warnings: [], stats: blocking.stats };
    expect(reportIsBlocking(empty)).toBe(false);
    expect(reportIsEmpty(empty)).toBe(true);
  });
});
