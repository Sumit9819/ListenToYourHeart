"use client";

import { useEffect, useRef, useState } from "react";
import { audioEngine } from "@/lib/audio/engine";
import { usePlayerStore } from "@/store/playerStore";
import { useUiStore } from "@/store/uiStore";

/** Any layout wanting the video reserves space with this id. */
export const VIDEO_SLOT_ID = "video-slot";

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * The single home for the media element's video surface.
 *
 * The element is adopted once and never re-parented: moving a playing media
 * element between containers drops its buffer and can pause it. So this
 * container stays mounted for the life of the app and only moves.
 *
 * When a layout reserves a slot, the stage measures that slot and matches it.
 * The previous version positioned itself with hand-written calc() mirroring the
 * sheet's grid, which drifted out of alignment as soon as either side changed —
 * measuring cannot drift.
 */
export function VideoStage() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [slotRect, setSlotRect] = useState<Rect | null>(null);

  const playbackMode = usePlayerStore((state) => state.playbackMode);
  const hasVideo = usePlayerStore((state) => state.hasVideo);
  const currentIndex = usePlayerStore((state) => state.currentIndex);
  const isNowPlayingOpen = useUiStore((state) => state.isNowPlayingOpen);
  const setNowPlayingOpen = useUiStore((state) => state.setNowPlayingOpen);
  const isQueueOpen = useUiStore((state) => state.isQueueOpen);

  const showStage = playbackMode === "video" && hasVideo && currentIndex >= 0;

  useEffect(() => {
    const host = hostRef.current;
    const element = audioEngine.getElement();
    if (!host || element.parentElement === host) return;
    element.className = "h-full w-full bg-black object-contain";
    host.appendChild(element);
  }, []);

  // Track the reserved slot's box while the watch view is open.
  useEffect(() => {
    // No clearing here: a stale rect is simply ignored below, which keeps every
    // state update inside a callback rather than synchronous in the effect.
    if (!showStage || !isNowPlayingOpen) return;

    let frame = 0;
    const measure = () => {
      const slot = document.getElementById(VIDEO_SLOT_ID);
      if (!slot) return;
      const { top, left, width, height } = slot.getBoundingClientRect();
      // Skip no-op updates; the observer fires on every scroll-driven reflow.
      setSlotRect((previous) =>
        previous && previous.top === top && previous.left === left && previous.width === width
          ? previous
          : { top, left, width, height },
      );
    };

    // rAF lets the slot lay out before the first measurement.
    frame = requestAnimationFrame(measure);
    const slot = document.getElementById(VIDEO_SLOT_ID);
    const observer = new ResizeObserver(measure);
    if (slot) observer.observe(slot);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [showStage, isNowPlayingOpen]);

  const docked = !isNowPlayingOpen;
  // Only trust the measurement while the watch view is actually up.
  const pinnedRect = showStage && !docked ? slotRect : null;

  return (
    <div
      aria-hidden={!showStage}
      style={
        pinnedRect
          ? { top: pinnedRect.top, left: pinnedRect.left, width: pinnedRect.width, height: pinnedRect.height }
          : undefined
      }
      className={
        !showStage
          ? // Never unmounted — parked offscreen so playback is uninterrupted.
            "pointer-events-none fixed h-px w-px overflow-hidden opacity-0 -left-[9999px] top-0"
          : docked
            ? // Docked while browsing; shifts clear of the queue panel.
              `pointer-events-auto fixed bottom-32 z-50 aspect-video w-48 overflow-hidden rounded-xl border border-line bg-black shadow-2xl sm:bottom-24 sm:w-64 ${
                isQueueOpen ? "right-4 xl:right-[25rem]" : "right-4"
              }`
            : // Watch view: pinned to the measured slot.
              "pointer-events-auto fixed z-70 overflow-hidden rounded-xl bg-black shadow-2xl"
      }
    >
      <div ref={hostRef} className="h-full w-full" />

      {showStage && docked && (
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
