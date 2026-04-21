import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ImageHostConfigs, ImageHostId } from "@/lib/image-hosts/types";

interface ImageHostState {
  activeHostId: ImageHostId;
  configs: ImageHostConfigs;
  setActiveHost: (id: ImageHostId) => void;
  setConfig: <K extends keyof ImageHostConfigs>(id: K, cfg: ImageHostConfigs[K]) => void;
  clearConfig: (id: ImageHostId) => void;
}

export const useImageHostStore = create<ImageHostState>()(
  persist(
    (set) => ({
      activeHostId: "default",
      configs: {},
      setActiveHost: (activeHostId) => set({ activeHostId }),
      setConfig: (id, cfg) =>
        set((state) => ({ configs: { ...state.configs, [id]: cfg } })),
      clearConfig: (id) =>
        set((state) => {
          const next = { ...state.configs };
          delete next[id];
          return { configs: next };
        }),
    }),
    {
      name: "mbeditor.imagehost",
      partialize: (state) => ({
        activeHostId: state.activeHostId,
        configs: state.configs,
      }),
    }
  )
);
