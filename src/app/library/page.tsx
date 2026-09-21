"use client";

import { Download, Heart, History, ListMusic, Plus, Upload } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { NewPlaylistDialog } from "@/components/shell/Sidebar";
import { Artwork } from "@/components/ui/Artwork";
import { CardGrid } from "@/components/ui/Shelf";
import { CardShelfSkeleton, EmptyState } from "@/components/ui/States";
import { useHistory, useLikedTracks, usePlaylists } from "@/hooks/useLibrary";
import { exportLibrary, importLibrary, type LibraryBackup } from "@/lib/db/library";
import { formatRelativeTime, pluralize } from "@/lib/format";
import { useUiStore } from "@/store/uiStore";

/** Downloads the whole library as JSON — the only way off this device. */
function useBackup() {
  const pushToast = useUiStore((state) => state.pushToast);

  const download = async () => {
    const backup = await exportLibrary();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `listen-to-your-heart-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    pushToast("Library exported", "success");
  };

  const restore = async (file: File) => {
    try {
      const backup = JSON.parse(await file.text()) as LibraryBackup;
      const { playlists, liked } = await importLibrary(backup);
      pushToast(`Imported ${pluralize(playlists, "playlist")} and ${pluralize(liked, "favorite")}`, "success");
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "That file could not be read.", "error");
    }
  };

  return { download, restore };
}

export default function LibraryPage() {
  const { data: playlists, isLoading } = usePlaylists();
  const { data: liked } = useLikedTracks();
  const { data: history } = useHistory(1);
  const [isCreating, setIsCreating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { download, restore } = useBackup();

  return (
    <>
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Your library</h1>
          <p className="mt-1.5 text-sm text-ink-muted">
            Everything here is stored in this browser. Export a backup to move it elsewhere.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setIsCreating(true)}
            className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-accent-ink transition hover:opacity-90"
          >
            <Plus size={16} />
            New playlist
          </button>
          <button
            onClick={download}
            className="inline-flex items-center gap-2 rounded-full border border-line px-4 py-2.5 text-sm font-medium transition hover:bg-white/10"
          >
            <Download size={16} />
            Export
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-full border border-line px-4 py-2.5 text-sm font-medium transition hover:bg-white/10"
          >
            <Upload size={16} />
            Import
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void restore(file);
              // Reset so re-picking the same file fires change again.
              event.target.value = "";
            }}
          />
        </div>
      </header>

      <section className="mb-10 grid gap-3 sm:grid-cols-2">
        <Link
          href="/liked"
          className="group flex items-center gap-4 overflow-hidden rounded-xl border border-line bg-surface-raised pr-4 transition hover:border-accent/40"
        >
          <span className="grid h-20 w-20 shrink-0 place-items-center bg-gradient-to-br from-accent to-accent/40 text-accent-ink">
            <Heart size={26} fill="currentColor" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">Favorites</span>
            <span className="block text-sm text-ink-faint">{pluralize(liked?.length ?? 0, "song")}</span>
          </span>
        </Link>

        <Link
          href="/history"
          className="group flex items-center gap-4 overflow-hidden rounded-xl border border-line bg-surface-raised pr-4 transition hover:border-accent/40"
        >
          <span className="grid h-20 w-20 shrink-0 place-items-center bg-white/[0.06] text-ink-muted">
            <History size={26} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">Recently played</span>
            <span className="block text-sm text-ink-faint">
              {history?.length ? `Last played ${formatRelativeTime(history[0].playedAt)}` : "Nothing played yet"}
            </span>
          </span>
        </Link>
      </section>

      <h2 className="mb-4 text-lg font-bold tracking-tight sm:text-xl">Playlists</h2>

      {isLoading ? (
        <CardShelfSkeleton />
      ) : playlists?.length ? (
        <CardGrid>
          {playlists.map((playlist) => (
            <Link key={playlist.id} href={`/playlist/${playlist.id}`} className="group">
              <div className="relative overflow-hidden rounded-card">
                <Artwork
                  src={playlist.coverUrl}
                  className="aspect-square w-full transition duration-300 group-hover:scale-105"
                  rounded="rounded-card"
                />
                {!playlist.coverUrl && (
                  <span className="pointer-events-none absolute inset-0 grid place-items-center">
                    <ListMusic size={32} className="text-ink-faint" />
                  </span>
                )}
              </div>
              <p className="mt-2.5 truncate text-sm font-medium">{playlist.name}</p>
              <p className="truncate text-xs text-ink-muted">
                {pluralize(playlist.trackCount, "song")} · {formatRelativeTime(playlist.updatedAt)}
              </p>
            </Link>
          ))}
        </CardGrid>
      ) : (
        <EmptyState
          icon={ListMusic}
          title="No playlists yet"
          message="Group songs however you like — by mood, by artist, by the drive you play them on."
          action={
            <button
              onClick={() => setIsCreating(true)}
              className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-accent-ink transition hover:opacity-90"
            >
              <Plus size={16} />
              Create a playlist
            </button>
          }
        />
      )}

      <NewPlaylistDialog open={isCreating} onClose={() => setIsCreating(false)} />
    </>
  );
}
