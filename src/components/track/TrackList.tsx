"use client";

import { useRef } from "react";
import { TrackRow } from "@/components/track/TrackRow";
import { useLikedIds } from "@/hooks/useLibrary";
import type { Track } from "@/types/music";

interface TrackListProps {
  tracks: Track[];
  origin?: string;
  onRemove?: (track: Track, index: number) => void;
  /** Enables drag-to-reorder and reports the resulting move. */
  onReorder?: (from: number, to: number) => void;
  subtitleFor?: (track: Track, index: number) => string | undefined;
}

export function TrackList({ tracks, origin, onRemove, onReorder, subtitleFor }: TrackListProps) {
  const likedIds = useLikedIds();
  const dragFrom = useRef<number | null>(null);

  return (
    <div className="space-y-0.5">
      {tracks.map((track, index) => (
        <TrackRow
          // Index-keyed because the same track may legitimately appear twice.
          key={`${track.id}-${index}`}
          track={track}
          index={index}
          context={tracks}
          origin={origin}
          isLiked={likedIds.has(track.id)}
          subtitle={subtitleFor?.(track, index)}
          onRemove={onRemove ? () => onRemove(track, index) : undefined}
          draggable={Boolean(onReorder)}
          onDragStart={(from) => {
            dragFrom.current = from;
          }}
          onDrop={(to) => {
            const from = dragFrom.current;
            dragFrom.current = null;
            if (from !== null && from !== to) onReorder?.(from, to);
          }}
        />
      ))}
    </div>
  );
}
