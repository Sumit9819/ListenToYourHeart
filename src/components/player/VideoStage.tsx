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

  const showStage = playbackMode === "video" && hasVideo && currentIndex >= 0;

  return (
    <div
      aria-hidden={!showStage}
      className={
        showStage
          ? isNowPlayingOpen
            ? // Centred over the now-playing sheet's artwork slot.
              "pointer-events-auto fixed left-1/2 top-1/2 z-70 aspect-video w-[min(92vw,56rem)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl bg-black shadow-2xl"
            : // Docked above the player bar, out of the way but still watchable.
              "pointer-events-auto fixed bottom-32 right-4 z-50 aspect-video w-56 overflow-hidden rounded-xl border border-line bg-black shadow-2xl sm:bottom-24 sm:w-72"
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
