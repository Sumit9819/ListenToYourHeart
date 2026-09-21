"use client";

import { useEffect, useRef } from "react";
import { audioEngine } from "@/lib/audio/engine";
import { usePlayerStore } from "@/store/playerStore";
import { useUiStore } from "@/store/uiStore";

/**
 * The single home for the media element's video surface.
 *
 * The element is adopted once and never re-parented afterwards. Moving a
 * playing media element between containers drops its buffer and, in some
 * browsers, pauses it — so this container stays mounted for the life of the
 * app and only its position and size change.
 */
export function VideoStage() {
  const hostRef = useRef<HTMLDivElement>(null);
  const playbackMode = usePlayerStore((state) => state.playbackMode);
  const hasVideo = usePlayerStore((state) => state.hasVideo);
  const currentIndex = usePlayerStore((state) => state.currentIndex);
  const isNowPlayingOpen = useUiStore((state) => state.isNowPlayingOpen);
  const setNowPlayingOpen = useUiStore((state) => state.setNowPlayingOpen);

  useEffect(() => {
    const host = hostRef.current;
    const element = audioEngine.getElement();
    if (!host || element.parentElement === host) return;
    element.className = "h-full w-full bg-black object-contain";
    host.appendChild(element);
  }, []);

  const isQueueOpen = useUiStore((state) => state.isQueueOpen);
  const showStage = playbackMode === "video" && hasVideo && currentIndex >= 0;

  return (
    <div
      aria-hidden={!showStage}
      style={
        // In the watch layout the stage tracks the slot the sheet reserves, so
        // the two stay aligned at any window size without hard-coded offsets.
        showStage && isNowPlayingOpen
          ? { left: "max(1rem, calc(50% - 45rem))", right: undefined }
          : undefined
      }
      className={
        showStage
          ? isNowPlayingOpen
            ? // Watch layout: fills the reserved box beside the queue column.
              "pointer-events-auto fixed top-[4.5rem] z-70 aspect-video w-[min(calc(100vw-2rem),56rem)] overflow-hidden rounded-xl bg-black shadow-2xl lg:w-[min(calc(100vw-27rem),56rem)]"
            : // Docked while browsing; shifts clear of the queue panel.
              `pointer-events-auto fixed bottom-32 z-50 aspect-video w-48 overflow-hidden rounded-xl border border-line bg-black shadow-2xl sm:bottom-24 sm:w-64 ${
                isQueueOpen ? "right-4 xl:right-[25rem]" : "right-4"
              }`
          : // Never unmounted — parked offscreen so playback is uninterrupted.
            "pointer-events-none fixed h-px w-px overflow-hidden opacity-0 -left-[9999px] top-0"
      }
    >
      <div ref={hostRef} className="h-full w-full" />

      {showStage && !isNowPlayingOpen && (
        <button
          onClick={() => setNowPlayingOpen(true)}
          aria-label="Expand the video"
          className="absolute inset-0 grid place-items-center bg-black/0 text-white/0 transition hover:bg-black/40 hover:text-white"
        >
          <span className="rounded-full bg-black/60 px-3 py-1.5 text-xs font-medium">Expand</span>
        </button>
      )}
    </div>
  );
}
