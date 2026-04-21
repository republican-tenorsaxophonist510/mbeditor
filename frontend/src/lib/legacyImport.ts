import type { LegacyExportBundle } from "@/types";
import { useArticlesStore } from "@/stores/articlesStore";
import { useMBDocStore } from "@/stores/mbdocStore";

export async function readLegacyBundle(file: File): Promise<LegacyExportBundle> {
  const text = await file.text();
  const parsed = JSON.parse(text);
  if (parsed?.version !== 1 || !Array.isArray(parsed.articles) || !Array.isArray(parsed.mbdocs)) {
    throw new Error("非法的旧数据 bundle 格式");
  }
  return parsed as LegacyExportBundle;
}

export function applyLegacyBundle(bundle: LegacyExportBundle): void {
  useArticlesStore.getState().replaceAll(bundle.articles);
  useMBDocStore.getState().replaceAll(bundle.mbdocs);
}
