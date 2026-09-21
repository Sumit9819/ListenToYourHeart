"use client";

import {
  ChevronDown,
  Heart,
  Pause,
  PictureInPicture2,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
} from "lucide-react";
import { ModeSwitch } from "@/components/player/ModeSwitch";
import { QueueList } from "@/components/player/QueueList";
import { SeekBar } from "@/components/player/SeekBar";
import { Artwork } from "@/components/ui/Artwork";
import { useLikedIds } from "@/hooks/useLibrary";
import { toggleLike } from "@/lib/db/library";
import { cleanArtistName, cleanTrackTitle, pluralize } from "@/lib/format";
import { useCurrentTrack, usePlayerStore } from "@/store/playerStore";
import { useUiStore } from "@/store/uiStore";

/**
 * The expanded player.
 *
 * In video mode this becomes a watch layout — video on the left, queue on the
 * right — so the queue stays reachable while watching instead of the video
 * taking over the whole screen.
 */
export function NowPlayingSheet() {
  const isOpen = useUiStore((state) => state.isNowPlayingOpen);
  const setOpen = useUiStore((state) => state.setNowPlayingOpen);
  const pushToast = useUiStore((state) => state.pushToast);

  const track = useCurrentTrack();
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const isShuffled = usePlayerStore((state) => state.isShuffled);
  const repeatMode = usePlayerStore((state) => state.repeatMode);
  const playbackMode = usePlayerStore((state) => state.playbackMode);
  const hasVideo = usePlayerStore((state) => state.hasVideo);
  const queueLength = usePlayerStore((state) => state.queue.length);
  const togglePictureInPicture = usePlayerStore((state) => state.togglePictureInPicture);
  const { togglePlay, next, previous, toggleShuffle, cycleRepeat } = usePlayerStore.getState();
  const likedIds = useLikedIds();

  if (!isOpen || !track) return null;

  const isLiked = likedIds.has(track.id);
  const RepeatIcon = repeatMode === "one" ? Repeat1 : Repeat;
  const isWatching = playbackMode === "video" && hasVideo;

  const transport = (
    <div className="flex w-full max-w-md items-center justify-between">
      <button
        onClick={toggleShuffle}
        aria-label="Shuffle"
        aria-pressed={isShuffled}
        className={`rounded-full p-3 transition ${isShuffled ? "text-accent" : "text-ink-muted hover:text-ink"}`}
      >
        <Shuffle size={20} />
      </button>
      <button onClick={() => previous()} aria-label="Previous track" className="rounded-full p-3 transition hover:text-ink">
        <SkipBack size={26} fill="currentColor" />
      </button>
      <button
        onClick={togglePlay}
        aria-label={isPlaying ? "Pause" : "Play"}
        className="grid h-16 w-16 place-items-center rounded-full bg-ink text-surface transition hover:scale-105 active:scale-95"
      >
        {isPlaying ? <Pause size={26} fill="currentColor" /> : <Play size={26} fill="currentColor" className="ml-1" />}
      </button>
      <button onClick={() => next()} aria-label="Next track" className="rounded-full p-3 transition hover:text-ink">
        <SkipForward size={26} fill="currentColor" />
      </button>
      <button
        onClick={cycleRepeat}
        aria-label={`Repeat: ${repeatMode}`}
        aria-pressed={repeatMode !== "off"}
        className={`rounded-full p-3 transition ${repeatMode !== "off" ? "text-accent" : "text-ink-muted hover:text-ink"}`}
      >
        <RepeatIcon size={20} />
      </button>
    </div>
  );

  const favoriteButton = (
    <button
      onClick={async () => {
        const liked = await toggleLike(track);
        pushToast(liked ? "Added to favorites" : "Removed from favorites", "success");
      }}
      aria-pressed={isLiked}
      className={`flex items-center gap-2 rounded-full border border-line px-5 py-2.5 text-sm font-medium transition ${
        isLiked ? "border-accent/40 bg-accent/10 text-accent" : "text-ink-muted hover:text-ink"
      }`}
    >
      <Heart size={17} fill={isLiked ? "currentColor" : "none"} />
      {isLiked ? "In your favorites" : "Add to favorites"}
    </button>
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Now playing"
      className="fixed inset-0 z-60 flex animate-fade flex-col bg-surface"
    >
      {!isWatching && (
        // Blurred cover art stands in for a per-track accent colour.
        <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-30">
          {track.albumArtUrl && (
            <Artwork src={track.albumArtUrl} className="h-full w-full scale-150 blur-3xl" rounded="rounded-none" />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-surface/40 via-surface/70 to-surface" />
        </div>
      )}

      <header className="relative z-10 flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
        <button
          onClick={() => setOpen(false)}
          aria-label="Close the now playing view"
          className="rounded-full p-2 text-ink-muted transition hover:bg-white/10 hover:text-ink"
        >
          <ChevronDown size={22} />
        </button>

        <ModeSwitch />

        <div className="flex items-center gap-1">
          {isWatching && (
            <button
              onClick={togglePictureInPicture}
              aria-label="Picture in picture"
              className="rounded-full p-2 text-ink-muted transition hover:bg-white/10 hover:text-ink"
            >
              <PictureInPicture2 size={19} />
            </button>
          )}
        </div>
      </header>

      {isWatching ? (
        // Watch layout: video beside the queue on desktop, stacked on mobile.
        <div className="relative z-10 grid min-h-0 flex-1 gap-6 overflow-y-auto px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:overflow-hidden">
          <div className="flex min-w-0 flex-col gap-4 lg:overflow-y-auto">
            {/* VideoStage positions the media element over this box. */}
            <div className="aspect-video w-full rounded-xl bg-black" aria-hidden="true" />

            <div>
              <h1 className="text-lg font-bold leading-snug sm:text-xl">{cleanTrackTitle(track.title)}</h1>
              <p className="mt-1 text-sm text-ink-muted">{cleanArtistName(track.artist)}</p>
            </div>

            <SeekBar />

            <div className="flex flex-wrap items-center justify-between gap-3">
              {transport}
              {favoriteButton}
            </div>
          </div>

          <aside className="flex min-h-0 flex-col rounded-xl border border-line bg-surface-raised p-3 lg:overflow-hidden">
            <div className="mb-2 flex items-baseline justify-between px-1">
              <h2 className="text-sm font-semibold">Up next</h2>
              <span className="text-xs text-ink-faint">{pluralize(queueLength, "track")}</span>
            </div>
            <div className="min-h-0 flex-1 lg:overflow-y-auto">
              <QueueList compact />
            </div>
          </aside>
        </div>
      ) : (
        <div className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center gap-8 px-6 pb-10">
          <Artwork
            src={track.albumArtUrl}
            className="aspect-square w-full max-w-[min(70vw,22rem)] shadow-2xl"
            rounded="rounded-2xl"
            priority
          />

          <div className="w-full max-w-md text-center">
            <h1 className="text-xl font-bold leading-snug sm:text-2xl">{cleanTrackTitle(track.title)}</h1>
            <p className="mt-1.5 text-sm text-ink-muted">{cleanArtistName(track.artist)}</p>
          </div>

          <div className="w-full max-w-md">
            <SeekBar />
          </div>

          {transport}
          {favoriteButton}
        </div>
      )}
    </div>
  );
}
