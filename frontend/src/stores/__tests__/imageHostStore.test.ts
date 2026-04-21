import { describe, it, expect, beforeEach } from "vitest";
import { useImageHostStore } from "@/stores/imageHostStore";

describe("imageHostStore", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useImageHostStore.persist.clearStorage();
    useImageHostStore.setState({ activeHostId: "default", configs: {} });
  });

  it("defaults to 'default' engine with empty configs", () => {
    const s = useImageHostStore.getState();
    expect(s.activeHostId).toBe("default");
    expect(s.configs).toEqual({});
  });

  it("setConfig stores per-engine config", () => {
    useImageHostStore.getState().setConfig("github", {
      repo: "me/img", branch: "main", accessToken: "t", useCDN: false,
    });
    expect(useImageHostStore.getState().configs.github?.repo).toBe("me/img");
  });

  it("setActiveHost switches active engine", () => {
    useImageHostStore.getState().setActiveHost("aliyun");
    expect(useImageHostStore.getState().activeHostId).toBe("aliyun");
  });

  it("persists to mbeditor.imagehost key", () => {
    useImageHostStore.getState().setActiveHost("github");
    useImageHostStore.getState().setConfig("github", {
      repo: "me/img", branch: "main", accessToken: "tok", useCDN: true,
    });
    const raw = window.localStorage.getItem("mbeditor.imagehost");
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.state.activeHostId).toBe("github");
    expect(parsed.state.configs.github.accessToken).toBe("tok");
  });
});
