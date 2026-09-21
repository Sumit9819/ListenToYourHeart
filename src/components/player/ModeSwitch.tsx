"use client";

import { Music2, Video } from "lucide-react";
import { usePlayerStore } from "@/store/playerStore";

/**
 * Music / Video segmented control.
 *
 * Labelled rather than icon-only: as a single toggling icon this was easy to
 * miss and gave no hint of what the other state was.
 */
export function ModeSwitch({ size = "default" }: { size?: "default" | "compact" }) {
  const playbackMode = usePlayerStore((state) => state.playbackMode);
  const setPlaybackMode = usePlayerStore((state) => state.setPlaybackMode);
  const isResolvingVideo = usePlayerStore((state) => state.isResolvingVideo);

  const padding = size === "compact" ? "px-2.5 py-1 text-xs" : "px-4 py-2 text-sm";

  return (
    <div
      role="group"
      aria-label="Playback mode"
      className="inline-flex shrink-0 rounded-full border border-line bg-surface-raised p-0.5"
    >
      <button
        onClick={() => setPlaybackMode("audio")}
        aria-pressed={playbackMode === "audio"}
        className={`flex items-center gap-1.5 rounded-full font-medium transition ${padding} ${
          playbackMode === "audio" ? "bg-ink text-surface" : "text-ink-muted hover:text-ink"
        }`}
      >
        <Music2 size={14} />
        Music
      </button>
      <button
        onClick={() => setPlaybackMode("video")}
        aria-pressed={playbackMode === "video"}
        className={`flex items-center gap-1.5 rounded-full font-medium transition ${padding} ${
          playbackMode === "video" ? "bg-ink text-surface" : "text-ink-muted hover:text-ink"
        }`}
      >
        <Video size={14} />
        {isResolvingVideo && playbackMode === "video" ? "Finding..." : "Video"}
      </button>
    </div>
  );
}
