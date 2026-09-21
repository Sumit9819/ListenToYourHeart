"use client";

import { Heart, ListPlus, ListVideo, MoreVertical, Pause, Play, Radio, Share2, Trash2 } from "lucide-react";
import { Artwork } from "@/components/ui/Artwork";
import { Menu, type MenuItem } from "@/components/ui/Menu";
import { cleanArtistName, cleanTrackTitle, formatDuration } from "@/lib/format";
import { toggleLike } from "@/lib/db/library";
import { usePlayerStore } from "@/store/playerStore";
import { useUiStore } from "@/store/uiStore";
import type { Track } from "@/types/music";

interface TrackRowProps {
  track: Track;
  index: number;
  /** All tracks in the surrounding list, so playing one queues the rest. */
  context: Track[];
  origin?: string;
  isLiked?: boolean;
  /** Supplied by playlist views to offer a "Remove from playlist" entry. */
  onRemove?: () => void;
  /** Secondary line replacement, e.g. "Played 2 hours ago". */
  subtitle?: string;
  draggable?: boolean;
  onDragStart?: (index: number) => void;
  onDrop?: (index: number) => void;
}

export function TrackRow({
  track,
  index,
  context,
  origin,
  isLiked = false,
  onRemove,
  subtitle,
  draggable,
  onDragStart,
  onDrop,
}: TrackRowProps) {
  const playQueue = usePlayerStore((state) => state.playQueue);
  const playNext = usePlayerStore((state) => state.playNext);
  const addToQueue = usePlayerStore((state) => state.addToQueue);
  const togglePlay = usePlayerStore((state) => state.togglePlay);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const currentTrackId = usePlayerStore((state) => state.queue[state.currentIndex]?.id);
  const pushToast = useUiStore((state) => state.pushToast);
  const openAddToPlaylist = useUiStore((state) => state.openAddToPlaylist);

  const isCurrent = currentTrackId === track.id;
  const title = cleanTrackTitle(track.title);
  const artist = cleanArtistName(track.artist);

  const activate = () => {
    if (isCurrent) return togglePlay();
    playQueue(context.length ? context : [track], context.length ? index : 0, origin);
  };

  const menuItems: MenuItem[] = [
    {
      label: "Play next",
      icon: ListVideo,
      onSelect: () => {
        playNext(track);
        pushToast(`"${title}" plays next`, "success");
      },
    },
    {
      label: "Add to queue",
      icon: ListPlus,
      onSelect: () => {
        addToQueue(track);
        pushToast(`"${title}" added to the queue`, "success");
      },
    },
    { label: "Save to playlist", icon: ListPlus, onSelect: () => openAddToPlaylist(track) },
    {
      label: isLiked ? "Remove from favorites" : "Add to favorites",
      icon: Heart,
      onSelect: async () => {
        const liked = await toggleLike(track);
        pushToast(liked ? "Added to favorites" : "Removed from favorites", "success");
      },
    },
    {
      label: "Start radio",
      icon: Radio,
      onSelect: async () => {
        pushToast("Building a radio station...");
        const response = await fetch(`/api/related/${encodeURIComponent(track.sourceId)}`);
        const body = (await response.json()) as { tracks?: Track[] };
        const related = body.tracks ?? [];
        if (!related.length) return pushToast("No related tracks were found.", "error");
        playQueue([track, ...related], 0, `${title} radio`);
      },
    },
    {
      label: "Copy source link",
      icon: Share2,
      onSelect: async () => {
        try {
          await navigator.clipboard.writeText(`https://www.youtube.com/watch?v=${track.sourceId}`);
          pushToast("Link copied to the clipboard", "success");
        } catch {
          pushToast("The clipboard is not available here.", "error");
        }
      },
    },
    { label: "Remove from this list", icon: Trash2, onSelect: () => onRemove?.(), tone: "danger", when: Boolean(onRemove) },
  ];

  return (
    <div
      draggable={draggable}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        // Firefox will not start a drag without payload on the transfer.
        event.dataTransfer.setData("text/plain", String(index));
        onDragStart?.(index);
      }}
      onDragOver={(event) => {
        if (draggable) event.preventDefault();
      }}
      onDrop={(event) => {
        event.preventDefault();
        onDrop?.(index);
      }}
      onDoubleClick={activate}
      className={`group flex items-center gap-3 rounded-xl border border-transparent px-2 py-2 transition sm:gap-4 sm:px-3 ${
        isCurrent ? "bg-white/[0.07]" : "hover:border-line hover:bg-white/[0.04]"
      }`}
    >
      <button
        onClick={activate}
        aria-label={isCurrent && isPlaying ? `Pause ${title}` : `Play ${title}`}
        className="relative shrink-0"
      >
        <Artwork src={track.albumArtUrl} className="h-11 w-11 sm:h-12 sm:w-12" />
        <span
          className={`absolute inset-0 grid place-items-center rounded-lg bg-black/55 text-white transition ${
            isCurrent ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
          }`}
        >
          {isCurrent && isPlaying ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}
        </span>
      </button>

      <button onClick={activate} className="min-w-0 flex-1 text-left">
        <p className={`truncate text-sm font-medium ${isCurrent ? "text-accent" : ""}`}>{title}</p>
        <p className="truncate text-xs text-ink-muted sm:text-[13px]">{subtitle ?? artist}</p>
      </button>

      {track.isLive ? (
        <span className="shrink-0 rounded-full bg-danger/15 px-2 py-0.5 text-[11px] font-semibold text-danger">
          LIVE
        </span>
      ) : (
        <span className="hidden shrink-0 text-xs tabular-nums text-ink-faint sm:block">
          {formatDuration(track.durationSeconds)}
        </span>
      )}

      <button
        onClick={async () => {
          const liked = await toggleLike(track);
          pushToast(liked ? "Added to favorites" : "Removed from favorites", "success");
        }}
        aria-label={isLiked ? `Remove ${title} from favorites` : `Add ${title} to favorites`}
        aria-pressed={isLiked}
        className={`shrink-0 rounded-full p-2 transition ${
          isLiked ? "text-accent" : "text-ink-faint opacity-0 hover:text-ink group-hover:opacity-100 focus-visible:opacity-100"
        }`}
      >
        <Heart size={16} fill={isLiked ? "currentColor" : "none"} />
      </button>

      <Menu
        items={menuItems}
        label={`Actions for ${title}`}
        trigger={({ toggle, ref, open }) => (
          <button
            ref={ref}
            onClick={toggle}
            aria-label={`More actions for ${title}`}
            aria-expanded={open}
            className={`shrink-0 rounded-full p-2 text-ink-muted transition hover:bg-white/10 hover:text-ink ${
              open ? "bg-white/10" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
            }`}
          >
            <MoreVertical size={16} />
          </button>
        )}
      />
    </div>
  );
}
