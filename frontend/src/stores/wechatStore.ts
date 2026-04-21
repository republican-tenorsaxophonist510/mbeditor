import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface WeChatAccount {
  id: string;
  name: string;
  appid: string;
  appsecret: string;
}

interface WeChatState {
  accounts: WeChatAccount[];
  activeAccountId: string | null;
  addAccount: (data: Omit<WeChatAccount, "id">) => string;
  updateAccount: (id: string, patch: Partial<Omit<WeChatAccount, "id">>) => void;
  removeAccount: (id: string) => void;
  setActive: (id: string | null) => void;
  getActiveAccount: () => WeChatAccount | null;
  reset: () => void;
}

function generateId(): string {
  return "acct_" + Math.random().toString(36).slice(2, 10);
}

export const useWeChatStore = create<WeChatState>()(
  persist(
    (set, get) => ({
      accounts: [],
      activeAccountId: null,
      addAccount: ({ name, appid, appsecret }) => {
        const id = generateId();
        set((state) => ({
          accounts: [...state.accounts, { id, name, appid, appsecret }],
          activeAccountId: state.activeAccountId ?? id,
        }));
        return id;
      },
      updateAccount: (id, patch) =>
        set((state) => ({
          accounts: state.accounts.map((a) => (a.id === id ? { ...a, ...patch } : a)),
        })),
      removeAccount: (id) =>
        set((state) => {
          const accounts = state.accounts.filter((a) => a.id !== id);
          const activeAccountId =
            state.activeAccountId === id ? (accounts[0]?.id ?? null) : state.activeAccountId;
          return { accounts, activeAccountId };
        }),
      setActive: (id) => set({ activeAccountId: id }),
      getActiveAccount: () => {
        const { accounts, activeAccountId } = get();
        return accounts.find((a) => a.id === activeAccountId) ?? null;
      },
      reset: () => set({ accounts: [], activeAccountId: null }),
    }),
    {
      name: "mbeditor.wechat",
      partialize: (state) => ({
        accounts: state.accounts,
        activeAccountId: state.activeAccountId,
      }),
    }
  )
);
