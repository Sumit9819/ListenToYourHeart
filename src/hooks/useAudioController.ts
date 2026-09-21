"use client";

import { useEffect } from "react";
import { audioEngine } from "@/lib/audio/engine";
import { cleanArtistName, cleanTrackTitle } from "@/lib/format";
import { usePlayerStore } from "@/store/playerStore";
import type { Track } from "@/types/music";

/** Provider thumbnails are square-ish; declaring sizes helps OS media UIs. */
function artworkFor(track: Track): MediaImage[] {
  if (!track.albumArtUrl) return [];
  return [{ src: track.albumArtUrl, sizes: "480x360", type: "image/jpeg" }];
}

/**
 * Connects the app to the browser: OS media keys, the lock-screen card and
 * automatic queue extension.
 *
 * Playback itself lives in `audioEngine`; this hook only mirrors state outward.
 * Mount it once, from the app shell.
 */
export function useAudioController() {
  const attachEngine = usePlayerStore((state) => state.attachEngine);
  const hydrateFromStorage = usePlayerStore((state) => state.hydrateFromStorage);

  useEffect(() => {
    hydrateFromStorage();
    return attachEngine();
  }, [attachEngine, hydrateFromStorage]);

  // Media Session: title card plus hardware/lock-screen controls.
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;

    const sync = (state: ReturnType<typeof usePlayerStore.getState>) => {
      const track = state.queue[state.currentIndex];
      if (!track) {
        navigator.mediaSession.metadata = null;
        navigator.mediaSession.playbackState = "none";
        return;
      }
      navigator.mediaSession.metadata = new MediaMetadata({
        title: cleanTrackTitle(track.title),
        artist: cleanArtistName(track.artist),
        album: track.album ?? "Listen To Your Heart",
        artwork: artworkFor(track),
      });
      navigator.mediaSession.playbackState = state.isPlaying ? "playing" : "paused";

      if (state.duration > 0 && Number.isFinite(state.duration)) {
        try {
          navigator.mediaSession.setPositionState({
            duration: state.duration,
            position: Math.min(state.currentTime, state.duration),
            playbackRate: 1,
          });
        } catch {
          // Safari throws when position briefly exceeds duration; harmless.
        }
      }
    };

    const handlers: Array<[MediaSessionAction, MediaSessionActionHandler]> = [
      ["play", () => usePlayerStore.getState().play()],
      ["pause", () => usePlayerStore.getState().pause()],
      ["nexttrack", () => usePlayerStore.getState().next()],
      ["previoustrack", () => usePlayerStore.getState().previous()],
      ["seekbackward", () => audioEngine.nudge(-10)],
      ["seekforward", () => audioEngine.nudge(10)],
      ["seekto", (details) => {
        if (details.seekTime != null) usePlayerStore.getState().seek(details.seekTime);
      }],
      ["stop", () => usePlayerStore.getState().pause()],
    ];

    for (const [action, handler] of handlers) {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {
        // Not every browser implements every action.
      }
    }

    sync(usePlayerStore.getState());
    const unsubscribe = usePlayerStore.subscribe(sync);

    return () => {
      unsubscribe();
      for (const [action] of handlers) {
        try {
          navigator.mediaSession.setActionHandler(action, null);
        } catch {
          // Ignore.
        }
      }
    };
  }, []);

  // Autoplay radio: top up the queue before the last track finishes so
  // listening never stops dead at the end of a search result page.
  useEffect(() => {
    let isFetching = false;

    return usePlayerStore.subscribe(async (state) => {
      const { queue, order, currentIndex, repeatMode, isPlaying } = state;
      if (!isPlaying || isFetching || repeatMode !== "off" || currentIndex < 0) return;
      // Only extend once we are actually on the final track of the order.
      if (order.indexOf(currentIndex) !== order.length - 1) return;

      const seed = queue[currentIndex];
      if (!seed) return;

      isFetching = true;
      try {
        const response = await fetch(`/api/related/${encodeURIComponent(seed.sourceId)}`);
        const body = (await response.json()) as { tracks?: Track[] };
        const known = new Set(queue.map((track) => track.id));
        const additions = (body.tracks ?? []).filter((track) => !known.has(track.id)).slice(0, 10);
        if (additions.length) usePlayerStore.getState().addToQueue(additions);
      } catch {
        // Autoplay is best-effort.
      } finally {
        isFetching = false;
      }
    });
  }, []);
}
