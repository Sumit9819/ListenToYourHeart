"use client";

import { Heart, HeartOff } from "lucide-react";
import Link from "next/link";
import { CollectionHeader } from "@/components/track/CollectionHeader";
import { TrackList } from "@/components/track/TrackList";
import { EmptyState, TrackRowSkeleton } from "@/components/ui/States";
import { useLikedTracks } from "@/hooks/useLibrary";
import { toggleLike } from "@/lib/db/library";
import { useUiStore } from "@/store/uiStore";

export default function LikedPage() {
  const { data: tracks, isLoading } = useLikedTracks();
  const pushToast = useUiStore((state) => state.pushToast);

  if (isLoading) return <TrackRowSkeleton count={10} />;

  if (!tracks?.length) {
    return (
      <EmptyState
        icon={HeartOff}
        title="No favorites yet"
        message="Tap the heart on any song and it lands here. Favorites live in this browser, so they are yours alone."
        action={
          <Link
            href="/search"
            className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-accent-ink transition hover:opacity-90"
          >
            Find songs to love
          </Link>
        }
      />
    );
  }

  return (
    <>
      <CollectionHeader
        eyebrow="Collection"
        title="Favorites"
        description="Every song you have hearted, newest first."
        tracks={tracks}
        icon={Heart}
      />
      <TrackList
        tracks={tracks}
        origin="Favorites"
        onRemove={async (track) => {
          await toggleLike(track);
          pushToast("Removed from favorites", "success", { label: "Undo", run: () => void toggleLike(track) });
        }}
      />
    </>
  );
}
