import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi } from "vitest";
import { dispatchEditorImageUpload } from "./CenterStage";

vi.mock("@/lib/image-hosts/dispatch", () => ({
  uploadWithActive: vi.fn().mockResolvedValue({ url: "https://cdn/x.png" }),
}));

describe("dispatchEditorImageUpload", () => {
  it("delegates to uploadWithActive and returns the url", async () => {
    const file = new File(["x"], "x.png", { type: "image/png" });
    const url = await dispatchEditorImageUpload(file);
    expect(url).toBe("https://cdn/x.png");
    const { uploadWithActive } = await import("@/lib/image-hosts/dispatch");
    expect(uploadWithActive).toHaveBeenCalledWith(file);
  });

  it("bubbles engine error when not configured", async () => {
    const { uploadWithActive } = await import("@/lib/image-hosts/dispatch");
    (uploadWithActive as unknown as { mockRejectedValueOnce: (e: Error) => void }).mockRejectedValueOnce(new Error("图床未配置"));
    const file = new File(["x"], "x.png", { type: "image/png" });
    await expect(dispatchEditorImageUpload(file)).rejects.toThrow("图床未配置");
  });
});
