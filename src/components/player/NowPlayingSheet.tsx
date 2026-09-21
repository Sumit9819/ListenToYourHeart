"use client";

import {
  ChevronDown,
  Heart,
  ListMusic,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Music2,
  Video,
} from "lucide-react";
import { SeekBar } from "@/components/player/SeekBar";
import { Artwork } from "@/components/ui/Artwork";
import { useLikedIds } from "@/hooks/useLibrary";
import { toggleLike } from "@/lib/db/library";
import { cleanArtistName, cleanTrackTitle } from "@/lib/format";
import { useCurrentTrack, usePlayerStore } from "@/store/playerStore";
import { useUiStore } from "@/store/uiStore";

/**
 * Full-screen now playing view. Primary surface on phones, and a pleasant
 * full-bleed mode on desktop.
 */
export function NowPlayingSheet() {
  const isOpen = useUiStore((state) => state.isNowPlayingOpen);
  const setOpen = useUiStore((state) => state.setNowPlayingOpen);
  const toggleQueue = useUiStore((state) => state.toggleQueue);
  const pushToast = useUiStore((state) => state.pushToast);

  const track = useCurrentTrack();
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const isShuffled = usePlayerStore((state) => state.isShuffled);
  const repeatMode = usePlayerStore((state) => state.repeatMode);
  const playbackMode = usePlayerStore((state) => state.playbackMode);
  const hasVideo = usePlayerStore((state) => state.hasVideo);
  const togglePlaybackMode = usePlayerStore((state) => state.togglePlaybackMode);
  const { togglePlay, next, previous, toggleShuffle, cycleRepeat } = usePlayerStore.getState();
  const likedIds = useLikedIds();

  if (!isOpen || !track) return null;

  const isLiked = likedIds.has(track.id);
  const RepeatIcon = repeatMode === "one" ? Repeat1 : Repeat;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Now playing"
      className="fixed inset-0 z-60 flex animate-fade flex-col bg-surface"
    >
      {/* The cover art, blurred, stands in for a per-track accent colour. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-30">
        {track.albumArtUrl && (
          <Artwork src={track.albumArtUrl} className="h-full w-full scale-150 blur-3xl" rounded="rounded-none" />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-surface/40 via-surface/70 to-surface" />
      </div>

      <header className="relative flex items-center justify-between px-5 py-4">
        <button
          onClick={() => setOpen(false)}
          aria-label="Close the now playing view"
          className="rounded-full p-2 text-ink-muted transition hover:bg-white/10 hover:text-ink"
        >
          <ChevronDown size={22} />
        </button>
        <p className="text-xs font-semibold uppercase tracking-wider text-ink-faint">Now playing</p>
        <button
          onClick={() => {
            toggleQueue();
            setOpen(false);
          }}
          aria-label="Show the queue"
          className="rounded-full p-2 text-ink-muted transition hover:bg-white/10 hover:text-ink"
        >
          <ListMusic size={20} />
        </button>
      </header>

      <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-8 px-6 pb-10">
        {playbackMode === "video" && hasVideo ? (
          // VideoStage renders the element itself, positioned over this box.
          <div className="aspect-video w-[min(92vw,56rem)] max-w-full" aria-hidden="true" />
        ) : (
          <Artwork
            src={track.albumArtUrl}
            className="aspect-square w-full max-w-[min(70vw,22rem)] shadow-2xl"
            rounded="rounded-2xl"
            priority
          />
        )}

        <div className="w-full max-w-md text-center">
          <h1 className="text-xl font-bold leading-snug sm:text-2xl">{cleanTrackTitle(track.title)}</h1>
          <p className="mt-1.5 text-sm text-ink-muted">{cleanArtistName(track.artist)}</p>
        </div>

        <div className="w-full max-w-md">
          <SeekBar />
        </div>

        <div className="flex w-full max-w-md items-center justify-between">
          <button
            onClick={toggleShuffle}
            aria-label="Shuffle"
            aria-pressed={isShuffled}
            className={`rounded-full p-3 transition ${isShuffled ? "text-accent" : "text-ink-muted hover:text-ink"}`}
          >
            <Shuffle size={20} />
          </button>

          <button
            onClick={() => previous()}
            aria-label="Previous track"
            className="rounded-full p-3 transition hover:text-ink"
          >
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

        <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          onClick={togglePlaybackMode}
          aria-pressed={playbackMode === "video"}
          className={`flex items-center gap-2 rounded-full border border-line px-5 py-2.5 text-sm font-medium transition ${
            playbackMode === "video" ? "border-accent/40 bg-accent/10 text-accent" : "text-ink-muted hover:text-ink"
          }`}
        >
          {playbackMode === "video" ? <Video size={17} /> : <Music2 size={17} />}
          {playbackMode === "video" ? "Video" : "Audio only"}
        </button>

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
        </div>
      </div>
    </div>
  );
}
