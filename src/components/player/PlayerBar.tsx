"use client";

import {
  ChevronUp,
  Heart,
  ListMusic,
  Loader2,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import Link from "next/link";
import { SeekBar } from "@/components/player/SeekBar";
import { PlayerOverflowMenu } from "@/components/player/PlayerOverflowMenu";
import { WatchButton } from "@/components/player/WatchButton";
import { Artwork } from "@/components/ui/Artwork";
import { useLikedIds } from "@/hooks/useLibrary";
import { toggleLike } from "@/lib/db/library";
import { cleanArtistName, cleanTrackTitle } from "@/lib/format";
import { useCurrentTrack, usePlayerStore } from "@/store/playerStore";
import { useUiStore } from "@/store/uiStore";

function VolumeControl() {
  const volume = usePlayerStore((state) => state.volume);
  const isMuted = usePlayerStore((state) => state.isMuted);
  const setVolume = usePlayerStore((state) => state.setVolume);
  const toggleMuted = usePlayerStore((state) => state.toggleMuted);

  const level = isMuted ? 0 : volume;
  const Icon = level === 0 ? VolumeX : level < 0.5 ? Volume1 : Volume2;

  return (
    <div className="group/volume hidden items-center gap-1.5 lg:flex">
      <button
        onClick={toggleMuted}
        aria-label={isMuted ? "Unmute" : "Mute"}
        className="rounded-full p-2 text-ink-muted transition hover:text-ink"
      >
        <Icon size={18} />
      </button>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={level}
        onChange={(event) => setVolume(Number(event.target.value))}
        aria-label="Volume"
        className="h-1 w-24 cursor-pointer appearance-none rounded-full bg-white/15 accent-[var(--accent)]"
        style={{
          background: `linear-gradient(to right, var(--accent) ${level * 100}%, rgb(255 255 255 / 0.15) ${level * 100}%)`,
        }}
      />
    </div>
  );
}

export function PlayerBar() {
  const track = useCurrentTrack();
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const isLoading = usePlayerStore((state) => state.isLoading);
  const isShuffled = usePlayerStore((state) => state.isShuffled);
  const repeatMode = usePlayerStore((state) => state.repeatMode);
  const error = usePlayerStore((state) => state.error);
  const queueLength = usePlayerStore((state) => state.queue.length);
  const { togglePlay, next, previous, toggleShuffle, cycleRepeat, dismissError } = usePlayerStore.getState();

  const toggleQueue = useUiStore((state) => state.toggleQueue);
  const isQueueOpen = useUiStore((state) => state.isQueueOpen);
  const setNowPlayingOpen = useUiStore((state) => state.setNowPlayingOpen);
  const pushToast = useUiStore((state) => state.pushToast);
  const likedIds = useLikedIds();

  if (!track) {
    return (
      <footer className="fixed inset-x-0 bottom-14 z-40 border-t border-line bg-surface-raised/95 px-4 py-3 backdrop-blur-xl sm:bottom-0">
        <p className="mx-auto max-w-7xl text-center text-sm text-ink-faint">
          Pick a song to start listening. Press <kbd className="rounded bg-white/10 px-1.5 py-0.5 text-xs">/</kbd> to
          search.
        </p>
      </footer>
    );
  }

  const isLiked = likedIds.has(track.id);
  const title = cleanTrackTitle(track.title);
  const RepeatIcon = repeatMode === "one" ? Repeat1 : Repeat;

  return (
    <footer className="fixed inset-x-0 bottom-14 z-40 border-t border-line bg-surface-raised/95 backdrop-blur-xl sm:bottom-0">
      {error && (
        <div role="alert" className="flex items-center gap-3 bg-danger/15 px-4 py-2 text-xs text-danger">
          <span className="min-w-0 flex-1">{error}</span>
          {/* The moment someone sees this is the moment the checks are worth
              running, so the way to them is here rather than buried in a menu. */}
          <Link href="/diagnostics" className="shrink-0 font-semibold underline underline-offset-2">
            Find out why
          </Link>
          <button onClick={() => next()} className="shrink-0 font-semibold underline underline-offset-2">
            Skip
          </button>
          <button onClick={dismissError} aria-label="Dismiss playback error" className="shrink-0">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Mobile keeps the scrub bar flush to the top edge of the bar. */}
      <div className="px-3 pt-1 sm:hidden">
        <SeekBar compact />
      </div>

      <div className="mx-auto flex max-w-7xl items-center gap-3 px-3 py-2 sm:gap-4 sm:px-4 sm:py-3">
        <button
          onClick={() => setNowPlayingOpen(true)}
          aria-label="Open the now playing view"
          className="flex min-w-0 flex-1 items-center gap-3 text-left sm:w-64 sm:flex-none lg:w-72"
        >
          <Artwork src={track.albumArtUrl} className="h-11 w-11" priority />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{title}</span>
            <span className="block truncate text-xs text-ink-muted">{cleanArtistName(track.artist)}</span>
          </span>
          <ChevronUp size={16} className="hidden shrink-0 text-ink-faint sm:block" />
        </button>

        <button
          onClick={async () => {
            const liked = await toggleLike(track);
            pushToast(liked ? "Added to favorites" : "Removed from favorites", "success");
          }}
          aria-label={isLiked ? "Remove from favorites" : "Add to favorites"}
          aria-pressed={isLiked}
          className={`shrink-0 rounded-full p-2 transition ${isLiked ? "text-accent" : "text-ink-muted hover:text-ink"}`}
        >
          <Heart size={18} fill={isLiked ? "currentColor" : "none"} />
        </button>

        <div className="shrink-0 sm:hidden">
          <WatchButton compact />
        </div>

        <div className="flex shrink-0 flex-col items-center gap-1 sm:flex-1">
          <div className="flex items-center gap-1 sm:gap-2">
            <button
              onClick={toggleShuffle}
              aria-label="Shuffle"
              aria-pressed={isShuffled}
              className={`hidden rounded-full p-2 transition sm:block ${
                isShuffled ? "text-accent" : "text-ink-muted hover:text-ink"
              }`}
            >
              <Shuffle size={17} />
            </button>

            <button
              onClick={() => previous()}
              aria-label="Previous track"
              className="rounded-full p-2 text-ink-muted transition hover:text-ink"
            >
              <SkipBack size={18} fill="currentColor" />
            </button>

            <button
              onClick={togglePlay}
              aria-label={isPlaying ? "Pause" : "Play"}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-ink text-surface transition hover:scale-105 active:scale-95"
            >
              {isLoading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : isPlaying ? (
                <Pause size={18} fill="currentColor" />
              ) : (
                <Play size={18} fill="currentColor" className="ml-0.5" />
              )}
            </button>

            <button
              onClick={() => next()}
              aria-label="Next track"
              className="rounded-full p-2 text-ink-muted transition hover:text-ink"
            >
              <SkipForward size={18} fill="currentColor" />
            </button>

            <button
              onClick={cycleRepeat}
              aria-label={`Repeat: ${repeatMode}`}
              aria-pressed={repeatMode !== "off"}
              className={`hidden rounded-full p-2 transition sm:block ${
                repeatMode !== "off" ? "text-accent" : "text-ink-muted hover:text-ink"
              }`}
            >
              <RepeatIcon size={17} />
            </button>
          </div>

          <div className="hidden w-full max-w-xl sm:block">
            <SeekBar />
          </div>
        </div>

        <div className="hidden shrink-0 items-center gap-1 sm:flex sm:w-72 sm:justify-end lg:w-80">
          <WatchButton />
          <VolumeControl />
          <button
            onClick={toggleQueue}
            aria-label={`Toggle the queue, ${queueLength} tracks`}
            aria-pressed={isQueueOpen}
            className={`ml-1 flex items-center gap-1 rounded-full px-2 py-2 transition ${
              isQueueOpen ? "text-accent" : "text-ink-muted hover:text-ink"
            }`}
          >
            <ListMusic size={18} />
            {queueLength > 1 && (
              // Inline rather than a floating badge. Overlaying a counter on an
              // 18px icon left no room, so it spilled onto the volume slider.
              <span className="text-[11px] font-semibold tabular-nums">
                {queueLength > 99 ? "99+" : queueLength}
              </span>
            )}
          </button>

          <PlayerOverflowMenu />
        </div>
      </div>
    </footer>
  );
}
