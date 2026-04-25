import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ArticleFull, ArticleMode, ArticleSummary } from "@/types";
import { getRequiredSeedArticles, getSeedArticles, SEED_VERSION } from "@/seeds";

const SEED_FLAG_KEY = "mbeditor.articles.seeded";
const SEED_VERSION_KEY = "mbeditor.articles.seedVersion";

function shouldSeed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(SEED_FLAG_KEY) !== "1";
  } catch {
    return false;
  }
}

function markSeeded(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SEED_FLAG_KEY, "1");
    window.localStorage.setItem(SEED_VERSION_KEY, String(SEED_VERSION));
  } catch {
    /* storage unavailable — fall back to in-memory only */
  }
}

function readSeededVersion(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = window.localStorage.getItem(SEED_VERSION_KEY);
    const parsed = raw ? Number.parseInt(raw, 10) : NaN;
    return Number.isFinite(parsed) ? parsed : 0;
  } catch {
    return 0;
  }
}

type ArticleUpdateData = Partial<Omit<ArticleFull, "id" | "created_at" | "updated_at">>;

function generateId(): string {
  return Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 8);
}

function nowIso(): string {
  return new Date().toISOString();
}

function emptyArticle(id: string, title: string, mode: ArticleMode): ArticleFull {
  const ts = nowIso();
  return {
    id,
    title,
    mode,
    cover: "",
    created_at: ts,
    updated_at: ts,
    html: "",
    css: "",
    js: "",
    markdown: "",
    author: "",
    digest: "",
  };
}

interface ArticlesState {
  articles: (ArticleSummary | ArticleFull)[];
  currentArticleId: string | null;
  loading: boolean;

  fetchArticles: () => Promise<void>;
  fetchArticle: (id: string) => Promise<ArticleFull>;
  createArticle: (title: string, mode: ArticleMode) => Promise<ArticleFull>;
  updateArticle: (id: string, data: ArticleUpdateData) => Promise<ArticleFull>;
  deleteArticle: (id: string) => Promise<void>;
  setCurrentArticle: (id: string | null) => void;
  replaceAll: (articles: ArticleFull[]) => void;
}

export const useArticlesStore = create<ArticlesState>()(
  persist(
    (set, get) => ({
      articles: [],
      currentArticleId: null,
      loading: false,

      fetchArticles: async () => {
        // Local-only; nothing to fetch.
      },

      fetchArticle: async (id) => {
        const found = get().articles.find((a) => a.id === id) as ArticleFull | undefined;
        if (!found) {
          throw new Error(`Article ${id} not found`);
        }
        set({ currentArticleId: id });
        return found;
      },

      createArticle: async (title, mode) => {
        const article = emptyArticle(generateId(), title, mode);
        set((state) => ({
          articles: [article, ...state.articles],
          currentArticleId: article.id,
        }));
        return article;
      },

      updateArticle: async (id, data) => {
        const existing = get().articles.find((a) => a.id === id) as ArticleFull | undefined;
        if (!existing) {
          throw new Error(`Article ${id} not found`);
        }
        const merged: ArticleFull = {
          ...existing,
          ...data,
          id: existing.id,
          created_at: existing.created_at,
          updated_at: nowIso(),
        };
        set((state) => ({
          articles: state.articles.map((a) => (a.id === id ? merged : a)),
          currentArticleId: id,
        }));
        return merged;
      },

      deleteArticle: async (id) => {
        set((state) => ({
          articles: state.articles.filter((a) => a.id !== id),
          currentArticleId: state.currentArticleId === id ? null : state.currentArticleId,
        }));
      },

      setCurrentArticle: (id) => set({ currentArticleId: id }),

      replaceAll: (articles) => set({ articles, currentArticleId: null }),
    }),
    {
      name: "mbeditor.articles",
      partialize: (state) => ({ articles: state.articles }),
      onRehydrateStorage: () => (state) => {
        // zustand persist 在 rehydrate 回调里 setState 不会触发 persist 的写回。
        // 用 queueMicrotask 推到下一 tick：此时 rehydrate 已完成，setState 会
        // 正常走 partialize → localStorage 写回，React 组件也会重新订阅。
        const firstTime = shouldSeed();
        const currentArticles = state?.articles ?? useArticlesStore.getState().articles;

        if (firstTime) {
          if (currentArticles.length > 0) {
            markSeeded();
            return;
          }
          const seeds = getSeedArticles();
          queueMicrotask(() => {
            useArticlesStore.setState({ articles: seeds });
            markSeeded();
          });
          return;
        }

        if (readSeededVersion() < SEED_VERSION) {
          // 版本滞后时 REQUIRED_SEED_IDS 里的文章**强制**用最新内容覆盖，
          // 保证 demo 文章内容始终跟着前端构建走（否则老用户拿到的是旧版 HTML）。
          const required = getRequiredSeedArticles();
          queueMicrotask(() => {
            const current = useArticlesStore.getState().articles;
            const byId = new Map(current.map((a) => [a.id, a] as const));
            for (const seed of required) byId.set(seed.id, seed);
            const next = Array.from(byId.values());
            // Ensure the demo article leads the list on fresh sync
            next.sort((a, b) => {
              const ai = required.findIndex((s) => s.id === a.id);
              const bi = required.findIndex((s) => s.id === b.id);
              if (ai !== -1 && bi !== -1) return ai - bi;
              if (ai !== -1) return -1;
              if (bi !== -1) return 1;
              return 0;
            });
            useArticlesStore.setState({ articles: next });
            markSeeded();
          });
        }
      },
    }
  )
);
