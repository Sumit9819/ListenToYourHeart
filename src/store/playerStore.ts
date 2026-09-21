"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { audioEngine } from "@/lib/audio/engine";
import { recordPlay } from "@/lib/db/library";
import { useUiStore } from "@/store/uiStore";
import type { PlaybackMode, PlayerState, RepeatMode, Track } from "@/types/music";

/**
 * How many tracks in a row may fail before playback stops.
 *
 * Stream extraction fails per-video often enough that halting on the first bad
 * track makes a queue feel broken. Skipping past a few keeps listening going,
 * while the cap stops a dead provider from racing through the whole queue.
 */
const MAX_CONSECUTIVE_FAILURES = 3;

type PlayerActions = {
  playQueue: (tracks: Track[], startIndex?: number, origin?: string) => void;
  playTrack: (track: Track, origin?: string) => void;
  togglePlay: () => void;
  play: () => void;
  pause: () => void;
  next: (options?: { userInitiated?: boolean }) => void;
  previous: () => void;
  jumpTo: (queueIndex: number) => void;
  playNext: (track: Track) => void;
  addToQueue: (tracks: Track | Track[]) => void;
  removeFromQueue: (queueIndex: number) => void;
  moveInQueue: (from: number, to: number) => void;
  clearQueue: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  setVolume: (volume: number) => void;
  toggleMuted: () => void;
  seek: (seconds: number) => void;
  nudge: (deltaSeconds: number) => void;
  dismissError: () => void;
  /** Switches audio/video without losing the current position. */
  setPlaybackMode: (mode: PlaybackMode) => void;
  togglePlaybackMode: () => void;
  togglePictureInPicture: () => void;
  /** Minutes from now, or null to cancel. */
  setSleepTimer: (minutes: number | null) => void;
  /** Wires engine events into the store. Called once by the app shell. */
  attachEngine: () => () => void;
  hydrateFromStorage: () => void;
};

export type PlayerStore = PlayerState & PlayerActions;

const identityOrder = (length: number) => Array.from({ length }, (_, index) => index);

/** Fisher-Yates over queue indices, pinning keepFirst at the head. */
function shuffledOrder(length: number, keepFirst: number): number[] {
  const rest = identityOrder(length).filter((index) => index !== keepFirst);
  for (let i = rest.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return keepFirst >= 0 ? [keepFirst, ...rest] : rest;
}

const nextRepeatMode: Record<RepeatMode, RepeatMode> = { off: "all", all: "one", one: "off" };

export const usePlayerStore = create<PlayerStore>()(
  persist(
    (set, get) => {
      /** Starts playback of a queue position and mirrors it into the engine. */
      const startIndex = (queueIndex: number) => {
        const { queue } = get();
        const track = queue[queueIndex];
        if (!track) return;
        set({
          currentIndex: queueIndex,
          currentTime: 0,
          duration: track.durationSeconds ?? 0,
          bufferedTo: 0,
          isLoading: true,
          error: null,
        });
        void audioEngine.load(track.sourceId, { mode: get().playbackMode });
        void recordPlay(track);
      };

      /** Consecutive failed loads; reset as soon as anything plays. */
      let consecutiveFailures = 0;
      /** Handle for the sleep timer, so a new one replaces the old. */
      let sleepTimeout: number | null = null;

      /** Position of currentIndex within the active play order. */
      const orderPosition = () => {
        const { order, currentIndex } = get();
        return order.indexOf(currentIndex);
      };

      return {
        queue: [],
        currentIndex: -1,
        order: [],
        isPlaying: false,
        isLoading: false,
        volume: 0.8,
        isMuted: false,
        repeatMode: "off",
        isShuffled: false,
        currentTime: 0,
        duration: 0,
        bufferedTo: 0,
        error: null,
        queueOrigin: null,
        playbackMode: "audio",
        hasVideo: false,
        sleepTimerEndsAt: null,

        playQueue: (tracks, start = 0, origin) => {
          if (!tracks.length) return;
          const clampedStart = Math.max(0, Math.min(start, tracks.length - 1));
          const { isShuffled } = get();
          set({
            queue: tracks,
            queueOrigin: origin ?? null,
            order: isShuffled ? shuffledOrder(tracks.length, clampedStart) : identityOrder(tracks.length),
          });
          startIndex(clampedStart);
        },

        playTrack: (track, origin) => get().playQueue([track], 0, origin),

        togglePlay: () => {
          const { isPlaying, currentIndex, queue } = get();
          if (currentIndex < 0 && queue.length > 0) return startIndex(0);
          if (isPlaying) audioEngine.pause();
          else void audioEngine.play();
        },

        play: () => void audioEngine.play(),
        pause: () => audioEngine.pause(),

        next: ({ userInitiated = true } = {}) => {
          const { order, repeatMode, currentIndex, queue } = get();
          if (!queue.length) return;

          // Repeat-one only auto-repeats; an explicit skip should still advance.
          if (repeatMode === "one" && !userInitiated) return startIndex(currentIndex);

          const position = orderPosition();
          const nextPosition = position + 1;

          if (nextPosition >= order.length) {
            if (repeatMode === "all") return startIndex(order[0] ?? 0);
            audioEngine.pause();
            audioEngine.seek(0);
            set({ isPlaying: false, currentTime: 0 });
            return;
          }
          startIndex(order[nextPosition]);
        },

        previous: () => {
          // Matches every other player: restart first, skip back only if early.
          if (audioEngine.getCurrentTime() > 3) return audioEngine.seek(0);
          const { order, repeatMode } = get();
          const position = orderPosition();
          if (position <= 0) {
            if (repeatMode === "all" && order.length) return startIndex(order[order.length - 1]);
            return audioEngine.seek(0);
          }
          startIndex(order[position - 1]);
        },

        jumpTo: (queueIndex) => startIndex(queueIndex),

        playNext: (track) =>
          set((state) => {
            const insertAt = state.currentIndex + 1;
            const queue = [...state.queue];
            queue.splice(insertAt, 0, track);
            // Every index at or past the insert point shifts by one.
            const order = state.order.map((index) => (index >= insertAt ? index + 1 : index));
            const position = order.indexOf(state.currentIndex);
            order.splice(position + 1, 0, insertAt);
            return { queue, order };
          }),

        addToQueue: (input) =>
          set((state) => {
            const additions = Array.isArray(input) ? input : [input];
            if (!additions.length) return state;
            const queue = [...state.queue, ...additions];
            const appended = additions.map((_, offset) => state.queue.length + offset);
            return { queue, order: [...state.order, ...appended] };
          }),

        removeFromQueue: (queueIndex) => {
          const { queue, currentIndex, order } = get();
          if (!queue[queueIndex]) return;
          const nextQueue = queue.filter((_, index) => index !== queueIndex);
          const reindex = (index: number) => (index > queueIndex ? index - 1 : index);
          const nextOrder = order.filter((index) => index !== queueIndex).map(reindex);

          if (queueIndex === currentIndex) {
            // Dropping the playing track: slide onto whatever took its place.
            set({ queue: nextQueue, order: nextOrder });
            if (!nextQueue.length) {
              audioEngine.stop();
              set({ currentIndex: -1, isPlaying: false, currentTime: 0, duration: 0 });
              return;
            }
            startIndex(Math.min(queueIndex, nextQueue.length - 1));
            return;
          }
          set({ queue: nextQueue, order: nextOrder, currentIndex: reindex(currentIndex) });
        },

        moveInQueue: (from, to) =>
          set((state) => {
            if (from === to || !state.queue[from] || to < 0 || to >= state.queue.length) return state;
            const queue = [...state.queue];
            const [moved] = queue.splice(from, 1);
            queue.splice(to, 0, moved);

            // Remap every stored index through the same permutation.
            const remap = (index: number) => {
              if (index === from) return to;
              if (from < to) return index > from && index <= to ? index - 1 : index;
              return index >= to && index < from ? index + 1 : index;
            };
            return { queue, order: state.order.map(remap), currentIndex: remap(state.currentIndex) };
          }),

        clearQueue: () => {
          audioEngine.stop();
          set({
            queue: [],
            order: [],
            currentIndex: -1,
            isPlaying: false,
            currentTime: 0,
            duration: 0,
            queueOrigin: null,
          });
        },

        toggleShuffle: () =>
          set((state) => {
            const isShuffled = !state.isShuffled;
            return {
              isShuffled,
              order: isShuffled
                ? shuffledOrder(state.queue.length, state.currentIndex)
                : identityOrder(state.queue.length),
            };
          }),

        cycleRepeat: () => set((state) => ({ repeatMode: nextRepeatMode[state.repeatMode] })),

        setVolume: (volume) => {
          const clamped = Math.max(0, Math.min(volume, 1));
          audioEngine.setVolume(clamped);
          audioEngine.setMuted(clamped === 0);
          set({ volume: clamped, isMuted: clamped === 0 });
        },

        toggleMuted: () => {
          const isMuted = !get().isMuted;
          audioEngine.setMuted(isMuted);
          set({ isMuted });
        },

        seek: (seconds) => {
          audioEngine.seek(seconds);
          set({ currentTime: seconds });
        },

        nudge: (deltaSeconds) => audioEngine.nudge(deltaSeconds),

        dismissError: () => set({ error: null }),

        setPlaybackMode: (mode) => {
          const state = get();
          if (state.playbackMode === mode) return;
          set({ playbackMode: mode });

          const track = state.queue[state.currentIndex];
          if (!track) return;

          // Reload the other rendition from the same spot, so toggling mid-song
          // does not restart the track.
          const resumeAt = audioEngine.getCurrentTime();
          const wasPlaying = state.isPlaying;
          set({ isLoading: true, error: null });
          void audioEngine.load(track.sourceId, { mode, startAt: resumeAt, autoplay: wasPlaying });
        },

        togglePlaybackMode: () => get().setPlaybackMode(get().playbackMode === "audio" ? "video" : "audio"),

        togglePictureInPicture: () => void audioEngine.togglePictureInPicture(),

        setSleepTimer: (minutes) => {
          if (sleepTimeout !== null) {
            clearTimeout(sleepTimeout);
            sleepTimeout = null;
          }
          if (minutes === null) return set({ sleepTimerEndsAt: null });

          const endsAt = Date.now() + minutes * 60_000;
          sleepTimeout = setTimeout(() => {
            audioEngine.pause();
            sleepTimeout = null;
            set({ sleepTimerEndsAt: null });
            useUiStore.getState().pushToast("Sleep timer ended playback", "info");
          }, minutes * 60_000) as unknown as number;
          set({ sleepTimerEndsAt: endsAt });
        },

        attachEngine: () =>
          audioEngine.subscribe((event) => {
            switch (event.type) {
              case "videoavailable":
                set({ hasVideo: event.hasVideo });
                break;
              case "time":
                set((state) => ({ currentTime: event.currentTime, bufferedTo: event.buffered || state.bufferedTo }));
                break;
              case "duration":
                if (event.duration > 0) set({ duration: event.duration });
                break;
              case "playing":
                consecutiveFailures = 0;
                set({ isPlaying: true, isLoading: false, error: null });
                break;
              case "paused":
                set({ isPlaying: false, isLoading: false });
                break;
              case "waiting":
                set({ isLoading: true });
                break;
              case "ended":
                set({ isPlaying: false });
                get().next({ userInitiated: false });
                break;
              case "error": {
                const state = get();
                const position = state.order.indexOf(state.currentIndex);
                const hasNext = position >= 0 && position + 1 < state.order.length;

                // Skip past an unplayable track rather than stalling the queue,
                // but give up once several in a row fail — at that point the
                // provider is down and skipping further just burns the queue.
                if (hasNext && consecutiveFailures + 1 < MAX_CONSECUTIVE_FAILURES) {
                  consecutiveFailures += 1;
                  const failed = state.queue[state.currentIndex];
                  useUiStore
                    .getState()
                    .pushToast(
                      failed ? `Skipped "${failed.title}" — no playable audio` : "Skipped an unplayable track",
                      "error",
                    );
                  set({ isPlaying: false, isLoading: false });
                  get().next({ userInitiated: false });
                  break;
                }

                consecutiveFailures = 0;
                set({ error: event.message, isPlaying: false, isLoading: false });
                break;
              }
            }
          }),

        hydrateFromStorage: () => {
          const { volume, isMuted } = get();
          audioEngine.setVolume(volume);
          audioEngine.setMuted(isMuted);
        },
      };
    },
    {
      name: "lyh-player",
      version: 2,
      // Playback position is deliberately not persisted; a stale stream URL
      // cannot be resumed anyway, so the queue reloads paused at the top.
      partialize: (state) => ({
        volume: state.volume,
        isMuted: state.isMuted,
        playbackMode: state.playbackMode,
        repeatMode: state.repeatMode,
        isShuffled: state.isShuffled,
        queue: state.queue,
        order: state.order,
        currentIndex: state.currentIndex,
        queueOrigin: state.queueOrigin,
      }),
    },
  ),
);

/** Selector for the playing track; undefined when the queue is empty. */
export function useCurrentTrack(): Track | undefined {
  return usePlayerStore((state) => state.queue[state.currentIndex]);
}
