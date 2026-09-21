"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ThemeName, Track } from "@/types/music";

export interface Toast {
  id: number;
  message: string;
  tone: "info" | "success" | "error";
  action?: { label: string; run: () => void };
}

type UiState = {
  theme: ThemeName;
  isSidebarCollapsed: boolean;
  isQueueOpen: boolean;
  isNowPlayingOpen: boolean;
  isShortcutsOpen: boolean;
  /** Track queued for the "add to playlist" dialog; null when it is closed. */
  addToPlaylistTarget: Track | null;
  toasts: Toast[];
};

type UiActions = {
  setTheme: (theme: ThemeName) => void;
  toggleTheme: () => void;
  toggleSidebar: () => void;
  toggleQueue: () => void;
  setQueueOpen: (open: boolean) => void;
  setNowPlayingOpen: (open: boolean) => void;
  setShortcutsOpen: (open: boolean) => void;
  openAddToPlaylist: (track: Track | null) => void;
  pushToast: (message: string, tone?: Toast["tone"], action?: Toast["action"]) => void;
  dismissToast: (id: number) => void;
};

let toastId = 0;

export const useUiStore = create<UiState & UiActions>()(
  persist(
    (set, get) => ({
      theme: "dark",
      isSidebarCollapsed: false,
      isQueueOpen: false,
      isNowPlayingOpen: false,
      isShortcutsOpen: false,
      addToPlaylistTarget: null,
      toasts: [],

      setTheme: (theme) => {
        applyTheme(theme);
        set({ theme });
      },
      toggleTheme: () => get().setTheme(get().theme === "dark" ? "light" : "dark"),
      toggleSidebar: () => set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),
      toggleQueue: () => set((state) => ({ isQueueOpen: !state.isQueueOpen })),
      setQueueOpen: (isQueueOpen) => set({ isQueueOpen }),
      setNowPlayingOpen: (isNowPlayingOpen) => set({ isNowPlayingOpen }),
      setShortcutsOpen: (isShortcutsOpen) => set({ isShortcutsOpen }),
      openAddToPlaylist: (addToPlaylistTarget) => set({ addToPlaylistTarget }),

      pushToast: (message, tone = "info", action) => {
        const id = ++toastId;
        set((state) => ({ toasts: [...state.toasts, { id, message, tone, action }] }));
        window.setTimeout(() => get().dismissToast(id), 4200);
      },
      dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
    }),
    {
      name: "lyh-ui",
      partialize: (state) => ({ theme: state.theme, isSidebarCollapsed: state.isSidebarCollapsed }),
      onRehydrateStorage: () => (state) => {
        if (state) applyTheme(state.theme);
      },
    },
  ),
);

function applyTheme(theme: ThemeName) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = theme;
}
