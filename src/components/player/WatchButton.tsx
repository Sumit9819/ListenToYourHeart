"use client";

import { Music2, Video } from "lucide-react";
import { usePlayerStore } from "@/store/playerStore";
import { useUiStore } from "@/store/uiStore";

/**
 * The primary Music/Video control.
 *
 * A segmented switch was wrong here: it showed both states at once in a cramped
 * strip, so it read as two unlabelled icons and gave no sense that pressing it
 * would do anything. This is a single verb for the action available right now —
 * "Watch" while listening, "Music" while watching.
 */
export function WatchButton({ compact = false }: { compact?: boolean }) {
  const playbackMode = usePlayerStore((state) => state.playbackMode);
  const isResolvingVideo = usePlayerStore((state) => state.isResolvingVideo);
  const setPlaybackMode = usePlayerStore((state) => state.setPlaybackMode);
  const setNowPlayingOpen = useUiStore((state) => state.setNowPlayingOpen);

  const isVideo = playbackMode === "video";

  return (
    <button
      onClick={() => {
        setPlaybackMode(isVideo ? "audio" : "video");
        if (isVideo) setNowPlayingOpen(false);
      }}
      aria-label={isVideo ? "Back to music only" : "Watch the music video"}
      className={`flex shrink-0 items-center gap-1.5 rounded-full border font-semibold transition ${
        compact ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-[13px]"
      } ${
        isVideo
          ? "border-accent/50 bg-accent/20 text-accent hover:bg-accent/30"
          : // A filled surface, so it reads as a button rather than a label.
            "border-line bg-surface-overlay text-ink hover:border-accent/50 hover:text-accent"
      }`}
    >
      {isVideo ? <Music2 size={15} /> : <Video size={15} />}
      {isResolvingVideo ? "Finding..." : isVideo ? "Music" : "Watch"}
    </button>
  );
}
