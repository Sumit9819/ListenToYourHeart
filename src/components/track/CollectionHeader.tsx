"use client";

import { ListPlus, Play, Shuffle } from "lucide-react";
import type { LucideIcon, } from "lucide-react";
import type { ReactNode } from "react";
import { Artwork } from "@/components/ui/Artwork";
import { formatTotalRuntime, pluralize } from "@/lib/format";
import { usePlayerStore } from "@/store/playerStore";
import { useUiStore } from "@/store/uiStore";
import type { Track } from "@/types/music";

interface CollectionHeaderProps {
  title: string;
  description?: string;
  tracks: Track[];
  coverUrl?: string;
  /** Used in place of cover art for built-in collections like Favorites. */
  icon?: LucideIcon;
  eyebrow?: string;
  actions?: ReactNode;
}

/**
 * The banner above Favorites, a playlist or history: art, counts and the
 * play/shuffle/queue actions those pages all share.
 */
export function CollectionHeader({
  title,
  description,
  tracks,
  coverUrl,
  icon: Icon,
  eyebrow,
  actions,
}: CollectionHeaderProps) {
  const playQueue = usePlayerStore((state) => state.playQueue);
  const addToQueue = usePlayerStore((state) => state.addToQueue);
  const toggleShuffle = usePlayerStore((state) => state.toggleShuffle);
  const isShuffled = usePlayerStore((state) => state.isShuffled);
  const pushToast = useUiStore((state) => state.pushToast);

  const runtime = formatTotalRuntime(tracks);
  const isEmpty = tracks.length === 0;

  return (
    <header className="mb-8 flex flex-col gap-6 sm:flex-row sm:items-end">
      {Icon ? (
        <div className="grid h-40 w-40 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-accent to-accent/40 shadow-xl sm:h-48 sm:w-48">
          <Icon size={56} className="text-accent-ink" fill="currentColor" />
        </div>
      ) : (
        <Artwork
          src={coverUrl}
          className="h-40 w-40 shrink-0 shadow-xl sm:h-48 sm:w-48"
          rounded="rounded-2xl"
          priority
        />
      )}

      <div className="min-w-0 flex-1">
        {eyebrow && (
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-ink-muted">{eyebrow}</p>
        )}
        <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">{title}</h1>
        {description && <p className="mt-2 max-w-xl text-sm text-ink-muted">{description}</p>}
        <p className="mt-2 text-sm text-ink-faint">
          {pluralize(tracks.length, "song")}
          {runtime && ` · ${runtime}`}
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <button
            onClick={() => playQueue(tracks, 0, title)}
            disabled={isEmpty}
            className="inline-flex items-center gap-2 rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-accent-ink transition hover:opacity-90 disabled:opacity-40"
          >
            <Play size={16} fill="currentColor" />
            Play
          </button>
          <button
            onClick={() => {
              if (!isShuffled) toggleShuffle();
              playQueue(tracks, Math.floor(Math.random() * tracks.length), title);
            }}
            disabled={isEmpty}
            className="inline-flex items-center gap-2 rounded-full border border-line px-5 py-2.5 text-sm font-medium transition hover:bg-white/10 disabled:opacity-40"
          >
            <Shuffle size={16} />
            Shuffle
          </button>
          <button
            onClick={() => {
              addToQueue(tracks);
              pushToast(`${pluralize(tracks.length, "song")} added to the queue`, "success");
            }}
            disabled={isEmpty}
            aria-label="Add everything to the queue"
            className="inline-flex items-center gap-2 rounded-full border border-line px-5 py-2.5 text-sm font-medium transition hover:bg-white/10 disabled:opacity-40"
          >
            <ListPlus size={16} />
            <span className="hidden sm:inline">Add to queue</span>
          </button>
          {actions}
        </div>
      </div>
    </header>
  );
}
