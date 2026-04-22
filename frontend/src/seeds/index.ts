import type { ArticleFull } from "@/types";
import bizMinimal from "./tpl_biz_minimal.json";
import literary from "./tpl_literary.json";
import magazine from "./tpl_magazine.json";
import techNeon from "./tpl_tech_neon.json";
import vibrant from "./tpl_vibrant.json";

type SeedRaw = {
  id: string;
  title: string;
  mode: string;
  html: string;
  css: string;
  js: string;
  markdown: string;
  cover: string;
  author: string;
  digest: string;
};

const RAW_SEEDS: SeedRaw[] = [bizMinimal, literary, magazine, techNeon, vibrant];

function normalize(raw: SeedRaw): ArticleFull {
  const ts = new Date().toISOString();
  return {
    id: raw.id,
    title: raw.title,
    mode: raw.mode === "markdown" ? "markdown" : "html",
    cover: raw.cover || "",
    created_at: ts,
    updated_at: ts,
    html: raw.html || "",
    css: raw.css || "",
    js: raw.js || "",
    markdown: raw.markdown || "",
    author: raw.author || "",
    digest: raw.digest || "",
  };
}

export function getSeedArticles(): ArticleFull[] {
  return RAW_SEEDS.map(normalize);
}

export const SEED_VERSION = 1;
