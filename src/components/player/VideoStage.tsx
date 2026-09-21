"use client";

import { useEffect, useRef, useState } from "react";
import { VideoControls } from "@/components/player/VideoControls";
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
 * The live stage container, so code outside React (the keyboard shortcuts) can
 * drive fullscreen without threading a ref through the tree.
 */
let stageElement: HTMLDivElement | null = null;

type IosVideoElement = HTMLVideoElement & { webkitEnterFullscreen?: () => void };

/**
 * Toggles fullscreen for the video stage. Safe to call when nothing is playing.
 *
 * The container is promoted rather than the media element, because the
 * Fullscreen API hides everything outside the promoted node — promoting the
 * <video> alone would take the custom controls off screen with it. iPhone
 * Safari does not implement the element-level API at all, so there it falls
 * back to the media element's own native fullscreen.
 */
export async function toggleVideoFullscreen(): Promise<void> {
  if (document.fullscreenElement) return void document.exitFullscreen();

  const host = stageElement;
  if (host?.requestFullscreen) {
    try {
      await host.requestFullscreen({ navigationUI: "hide" });
      return;
    } catch {
      // Fall through to the media element below.
    }
  }
  (audioEngine.getElement() as IosVideoElement).webkitEnterFullscreen?.();
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
  const stageRef = useRef<HTMLDivElement>(null);
  const [slotRect, setSlotRect] = useState<Rect | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

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

  // Publish the container so toggleVideoFullscreen can reach it.
  useEffect(() => {
    stageElement = stageRef.current;
    return () => {
      stageElement = null;
    };
  }, []);

  // Fullscreen can also be left with Escape or the browser's own chrome, so the
  // event is the only reliable source of truth for the current state.
  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement === stageRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // Track the reserved slot's box while the watch view is open.
  useEffect(() => {
    // No clearing here: a stale rect is simply ignored below, which keeps every
    // state update inside a callback rather than synchronous in the effect.
    if (!showStage || !isNowPlayingOpen || isFullscreen) return;

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
  }, [showStage, isNowPlayingOpen, isFullscreen]);

  const docked = !isNowPlayingOpen && !isFullscreen;
  // Only trust the measurement while the watch view is actually up. In
  // fullscreen the browser sizes the element, so any inline box would fight it.
  const pinnedRect = showStage && !docked && !isFullscreen ? slotRect : null;
  const showControls = showStage && (isFullscreen || isNowPlayingOpen);

  // The watch view needs a measurement before it can place the stage, and the
  // first frame after a video resolves has none yet. A fixed element with no
  // offsets falls back to its static position — the very bottom of a long
  // page — so it would flash in there. Stay parked until the box is known.
  const awaitingMeasurement = showStage && !docked && !isFullscreen && !pinnedRect;
  const parked = !showStage || awaitingMeasurement;

  return (
    <div
      ref={stageRef}
      aria-hidden={!showStage}
      style={
        pinnedRect
          ? { top: pinnedRect.top, left: pinnedRect.left, width: pinnedRect.width, height: pinnedRect.height }
          : undefined
      }
      className={
        parked
          ? // Never unmounted — parked offscreen so playback is uninterrupted.
            "pointer-events-none fixed h-px w-px overflow-hidden opacity-0 -left-[9999px] top-0"
          : isFullscreen
            ? // The UA stylesheet already fills the screen; keeping position
              // fixed here stops an author rule from fighting it.
              "pointer-events-auto fixed inset-0 h-full w-full bg-black"
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

      {showControls && <VideoControls isFullscreen={isFullscreen} onToggleFullscreen={toggleVideoFullscreen} />}

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
