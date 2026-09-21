"use client";

import { History, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { CollectionHeader } from "@/components/track/CollectionHeader";
import { TrackList } from "@/components/track/TrackList";
import { Modal } from "@/components/ui/Modal";
import { EmptyState, TrackRowSkeleton } from "@/components/ui/States";
import { useHistory } from "@/hooks/useLibrary";
import { clearHistory } from "@/lib/db/library";
import { formatRelativeTime } from "@/lib/format";
import { useUiStore } from "@/store/uiStore";

export default function HistoryPage() {
  const { data: rows, isLoading } = useHistory(200);
  const [isConfirmingClear, setIsConfirmingClear] = useState(false);
  const pushToast = useUiStore((state) => state.pushToast);

  const tracks = useMemo(() => (rows ?? []).map((row) => row.track), [rows]);

  if (isLoading) return <TrackRowSkeleton count={10} />;

  if (!rows?.length) {
    return (
      <EmptyState
        icon={History}
        title="Nothing played yet"
        message="Songs you listen to show up here so you can find your way back to them."
        action={
          <Link
            href="/search"
            className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-accent-ink transition hover:opacity-90"
          >
            Start listening
          </Link>
        }
      />
    );
  }

  return (
    <>
      <CollectionHeader
        eyebrow="Collection"
        title="Recently played"
        description="Your last 200 plays, stored on this device."
        tracks={tracks}
        icon={History}
        actions={
          <button
            onClick={() => setIsConfirmingClear(true)}
            className="inline-flex items-center gap-2 rounded-full border border-line px-5 py-2.5 text-sm font-medium text-ink-muted transition hover:border-danger/40 hover:text-danger"
          >
            <Trash2 size={16} />
            Clear
          </button>
        }
      />

      <TrackList
        tracks={tracks}
        origin="Recently played"
        subtitleFor={(track, index) =>
          rows[index] ? `${track.artist} · ${formatRelativeTime(rows[index].playedAt)}` : undefined
        }
      />

      <Modal
        open={isConfirmingClear}
        onClose={() => setIsConfirmingClear(false)}
        title="Clear listening history?"
        description="This removes every entry from this device. Favorites and playlists are not affected."
        footer={
          <>
            <button
              onClick={() => setIsConfirmingClear(false)}
              className="rounded-lg px-4 py-2 text-sm text-ink-muted transition hover:text-ink"
            >
              Cancel
            </button>
            <button
              onClick={async () => {
                await clearHistory();
                setIsConfirmingClear(false);
                pushToast("Listening history cleared", "success");
              }}
              className="rounded-lg bg-danger px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
            >
              Clear history
            </button>
          </>
        }
      >
        <p className="text-sm text-ink-muted">This cannot be undone.</p>
      </Modal>
    </>
  );
}
