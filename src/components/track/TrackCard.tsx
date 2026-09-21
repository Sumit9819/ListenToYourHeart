"use client";

import { MoreVertical, Pause, Play } from "lucide-react";
import { Artwork } from "@/components/ui/Artwork";
import { Menu, type MenuItem } from "@/components/ui/Menu";
import { cleanArtistName, cleanTrackTitle } from "@/lib/format";
import { usePlayerStore } from "@/store/playerStore";
import type { Track } from "@/types/music";

interface TrackCardProps {
  track: Track;
  index: number;
  context: Track[];
  origin?: string;
  caption?: string;
  menuItems?: MenuItem[];
}

/** Square card used on shelves; the row variant handles dense lists. */
export function TrackCard({ track, index, context, origin, caption, menuItems }: TrackCardProps) {
  const playQueue = usePlayerStore((state) => state.playQueue);
  const togglePlay = usePlayerStore((state) => state.togglePlay);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const currentTrackId = usePlayerStore((state) => state.queue[state.currentIndex]?.id);

  const isCurrent = currentTrackId === track.id;
  const title = cleanTrackTitle(track.title);

  const activate = () => {
    if (isCurrent) return togglePlay();
    playQueue(context, index, origin);
  };

  return (
    <div className="group relative">
      <button onClick={activate} className="w-full text-left" aria-label={`Play ${title}`}>
        <div className="relative overflow-hidden rounded-card">
          <Artwork
            src={track.albumArtUrl}
            className="aspect-square w-full transition duration-300 group-hover:scale-105"
            rounded="rounded-card"
          />
          <span
            className={`absolute bottom-2 right-2 grid h-11 w-11 place-items-center rounded-full bg-accent text-accent-ink shadow-lg transition duration-200 ${
              isCurrent ? "opacity-100" : "translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100"
            }`}
          >
            {isCurrent && isPlaying ? (
              <Pause size={18} fill="currentColor" />
            ) : (
              <Play size={18} fill="currentColor" className="ml-0.5" />
            )}
          </span>
        </div>

        <p className={`mt-2.5 truncate text-sm font-medium ${isCurrent ? "text-accent" : ""}`}>{title}</p>
        <p className="truncate text-xs text-ink-muted">{caption ?? cleanArtistName(track.artist)}</p>
      </button>

      {menuItems && menuItems.length > 0 && (
        <div className="absolute right-1.5 top-1.5">
          <Menu
            items={menuItems}
            label={`Actions for ${title}`}
            trigger={({ toggle, ref, open }) => (
              <button
                ref={ref}
                onClick={toggle}
                aria-label={`More actions for ${title}`}
                aria-expanded={open}
                className={`rounded-full bg-black/60 p-1.5 text-white backdrop-blur transition ${
                  open ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                }`}
              >
                <MoreVertical size={15} />
              </button>
            )}
          />
        </div>
      )}
    </div>
  );
}
