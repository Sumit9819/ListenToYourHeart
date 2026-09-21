"use client";

import { ListMusic, Pencil, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { CollectionHeader } from "@/components/track/CollectionHeader";
import { TrackList } from "@/components/track/TrackList";
import { Modal } from "@/components/ui/Modal";
import { EmptyState, TrackRowSkeleton } from "@/components/ui/States";
import { usePlaylist } from "@/hooks/useLibrary";
import {
  addTracksToPlaylist,
  deletePlaylist,
  removeTrackFromPlaylist,
  renamePlaylist,
  reorderPlaylistTrack,
} from "@/lib/db/library";
import { useUiStore } from "@/store/uiStore";

export default function PlaylistPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data, isLoading } = usePlaylist(id);
  const pushToast = useUiStore((state) => state.pushToast);

  const [isEditing, setIsEditing] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");

  if (isLoading) return <TrackRowSkeleton count={8} />;

  const playlist = data?.playlist;
  const tracks = data?.tracks ?? [];

  if (!playlist) {
    return (
      <EmptyState
        icon={ListMusic}
        title="Playlist not found"
        message="This playlist no longer exists on this device. It may have been deleted, or saved in another browser."
        action={
          <Link
            href="/library"
            className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-accent-ink transition hover:opacity-90"
          >
            Back to your library
          </Link>
        }
      />
    );
  }

  const openEditor = () => {
    setDraftName(playlist.name);
    setDraftDescription(playlist.description ?? "");
    setIsEditing(true);
  };

  return (
    <>
      <CollectionHeader
        eyebrow="Playlist"
        title={playlist.name}
        description={playlist.description}
        tracks={tracks}
        coverUrl={playlist.coverUrl}
        actions={
          <>
            <button
              onClick={openEditor}
              aria-label="Edit playlist details"
              className="inline-flex items-center gap-2 rounded-full border border-line px-4 py-2.5 text-sm font-medium transition hover:bg-white/10"
            >
              <Pencil size={15} />
              <span className="hidden sm:inline">Edit</span>
            </button>
            <button
              onClick={() => setIsConfirmingDelete(true)}
              aria-label="Delete this playlist"
              className="inline-flex items-center gap-2 rounded-full border border-line px-4 py-2.5 text-sm font-medium text-ink-muted transition hover:border-danger/40 hover:text-danger"
            >
              <Trash2 size={15} />
              <span className="hidden sm:inline">Delete</span>
            </button>
          </>
        }
      />

      {tracks.length ? (
        <TrackList
          tracks={tracks}
          origin={playlist.name}
          onReorder={(from, to) => void reorderPlaylistTrack(playlist.id, from, to)}
          onRemove={async (track) => {
            await removeTrackFromPlaylist(playlist.id, track.id);
            pushToast("Removed from the playlist", "success", {
              label: "Undo",
              run: () => void addTracksToPlaylist(playlist.id, [track]),
            });
          }}
        />
      ) : (
        <EmptyState
          icon={Search}
          title="This playlist is empty"
          message="Find a song, open its menu and choose Save to playlist. You can drag rows to reorder them once there is more than one."
          action={
            <Link
              href="/search"
              className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-accent-ink transition hover:opacity-90"
            >
              <Search size={16} />
              Find songs
            </Link>
          }
        />
      )}

      <Modal
        open={isEditing}
        onClose={() => setIsEditing(false)}
        title="Edit playlist"
        footer={
          <>
            <button
              onClick={() => setIsEditing(false)}
              className="rounded-lg px-4 py-2 text-sm text-ink-muted transition hover:text-ink"
            >
              Cancel
            </button>
            <button
              onClick={async () => {
                await renamePlaylist(playlist.id, draftName, draftDescription);
                setIsEditing(false);
                pushToast("Playlist updated", "success");
              }}
              disabled={!draftName.trim()}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink transition disabled:opacity-40"
            >
              Save
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-ink-muted">Name</span>
            <input
              autoFocus
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              maxLength={80}
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-ink-muted">Description</span>
            <textarea
              value={draftDescription}
              onChange={(event) => setDraftDescription(event.target.value)}
              maxLength={200}
              rows={3}
              className="w-full resize-none rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </label>
        </div>
      </Modal>

      <Modal
        open={isConfirmingDelete}
        onClose={() => setIsConfirmingDelete(false)}
        title={`Delete "${playlist.name}"?`}
        footer={
          <>
            <button
              onClick={() => setIsConfirmingDelete(false)}
              className="rounded-lg px-4 py-2 text-sm text-ink-muted transition hover:text-ink"
            >
              Cancel
            </button>
            <button
              onClick={async () => {
                await deletePlaylist(playlist.id);
                setIsConfirmingDelete(false);
                pushToast(`Deleted "${playlist.name}"`, "success");
                router.push("/library");
              }}
              className="rounded-lg bg-danger px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
            >
              Delete
            </button>
          </>
        }
      >
        <p className="text-sm text-ink-muted">
          The playlist and its ordering are removed from this device. The songs themselves stay available, and anything
          you favorited stays in Favorites.
        </p>
      </Modal>
    </>
  );
}
