"use client";

import { useEffect, type ReactNode } from "react";
import { NowPlayingSheet } from "@/components/player/NowPlayingSheet";
import { PlayerBar } from "@/components/player/PlayerBar";
import { QueuePanel } from "@/components/player/QueuePanel";
import { VideoStage } from "@/components/player/VideoStage";
import { MobileNav } from "@/components/shell/MobileNav";
import { Sidebar } from "@/components/shell/Sidebar";
import { TopBar } from "@/components/shell/TopBar";
import { AddToPlaylistDialog } from "@/components/track/AddToPlaylistDialog";
import { ShortcutsDialog } from "@/components/ui/ShortcutsDialog";
import { Toaster } from "@/components/ui/Toaster";
import { useAudioController } from "@/hooks/useAudioController";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useUiStore } from "@/store/uiStore";

/**
 * The persistent frame around every route.
 *
 * It lives in the root layout so navigation never unmounts the player: the
 * audio element survives because the tree around it never tears down.
 */
export function AppShell({ children }: { children: ReactNode }) {
  useAudioController();
  useKeyboardShortcuts();

  const isQueueOpen = useUiStore((state) => state.isQueueOpen);
  const theme = useUiStore((state) => state.theme);

  // The stored theme is applied on rehydrate; this covers the first paint.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return (
    <div className="min-h-screen">
      <Sidebar />

      <div className={`transition-[padding] lg:pl-60 xl:pl-64 ${isQueueOpen ? "xl:pr-96" : ""}`}>
        <TopBar />
        {/* Bottom padding clears the player bar plus the mobile tab bar. */}
        <main className="mx-auto min-h-[calc(100vh-4rem)] max-w-7xl px-4 pb-52 pt-6 sm:px-6 sm:pb-40 lg:px-8">
          {children}
        </main>
      </div>

      <PlayerBar />
      <VideoStage />
      <QueuePanel />
      <MobileNav />
      <NowPlayingSheet />
      <AddToPlaylistDialog />
      <ShortcutsDialog />
      <Toaster />
    </div>
  );
}
