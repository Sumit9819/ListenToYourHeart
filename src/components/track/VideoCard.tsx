"use client";

import { Heart, ListPlus, Play } from "lucide-react";
import { Artwork } from "@/components/ui/Artwork";
import { toggleLike } from "@/lib/db/library";
import { cleanArtistName, cleanTrackTitle, formatDuration } from "@/lib/format";
import { usePlayerStore } from "@/store/playerStore";
import { useUiStore } from "@/store/uiStore";
import type { Track } from "@/types/music";

interface VideoCardProps {
  track: Track;
  /** The other results, so the rest of the list becomes the queue. */
  context: Track[];
  origin?: string;
  isLiked: boolean;
}

/**
 * A video search result.
 *
 * Deliberately not a TrackRow: a video's thumbnail carries most of the
 * information about it, so it gets a 16:9 frame at a readable size rather than
 * the 48px square a song row uses. Selecting one opens the watch view straight
 * away — picking a result from a list headed "Videos" is an unambiguous request
 * to watch, and making it play as audio first would be a wasted round trip.
 */
export function VideoCard({ track, context, origin, isLiked }: VideoCardProps) {
  const watchTrack = usePlayerStore((state) => state.watchTrack);
  const playNext = usePlayerStore((state) => state.playNext);
  const pushToast = useUiStore((state) => state.pushToast);

  return (
    <div className="group relative">
      <button
        type="button"
        onClick={() => watchTrack(track, context, origin)}
        className="block w-full text-left"
      >
        <span className="relative block overflow-hidden rounded-card">
          <Artwork
            src={track.albumArtUrl}
            className="aspect-video w-full transition duration-300 group-hover:scale-105"
            rounded="rounded-card"
          />
          <span className="absolute inset-0 grid place-items-center bg-black/0 opacity-0 transition group-hover:bg-black/35 group-hover:opacity-100">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-accent text-accent-ink">
              <Play size={20} fill="currentColor" className="ml-0.5" />
            </span>
          </span>
          {track.isLive ? (
            <span className="absolute bottom-1.5 right-1.5 rounded bg-danger px-1.5 py-0.5 text-[11px] font-semibold text-white">
              LIVE
            </span>
          ) : (
            track.durationSeconds != null && (
              <span className="absolute bottom-1.5 right-1.5 rounded bg-black/80 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-white">
                {formatDuration(track.durationSeconds)}
              </span>
            )
          )}
        </span>

        <span className="mt-2.5 block line-clamp-2 text-sm font-medium leading-snug">
          {cleanTrackTitle(track.title)}
        </span>
        <span className="mt-0.5 block truncate text-xs text-ink-muted">{cleanArtistName(track.artist)}</span>
      </button>

      <div className="mt-1.5 flex items-center gap-1">
        <button
          type="button"
          onClick={async () => {
            const liked = await toggleLike(track);
            pushToast(liked ? "Added to favorites" : "Removed from favorites", "success");
          }}
          aria-label={isLiked ? "Remove from favorites" : "Add to favorites"}
          aria-pressed={isLiked}
          className={`grid h-9 w-9 place-items-center rounded-full transition ${isLiked ? "text-accent" : "text-ink-faint hover:text-ink"}`}
        >
          <Heart size={16} fill={isLiked ? "currentColor" : "none"} />
        </button>
        <button
          type="button"
          onClick={() => {
            playNext(track);
            pushToast("Playing next", "success");
          }}
          aria-label="Play next"
          className="grid h-9 w-9 place-items-center rounded-full text-ink-faint transition hover:text-ink"
        >
          <ListPlus size={16} />
        </button>
      </div>
    </div>
  );
}
