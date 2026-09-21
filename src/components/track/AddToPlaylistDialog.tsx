"use client";

import { Check, Plus } from "lucide-react";
import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { usePlaylists, usePlaylistsContaining } from "@/hooks/useLibrary";
import { addTracksToPlaylist, createPlaylist, removeTrackFromPlaylist } from "@/lib/db/library";
import { cleanTrackTitle, pluralize } from "@/lib/format";
import { useUiStore } from "@/store/uiStore";

/**
 * Save-to-playlist checklist. Mounted once in the shell and driven by
 * `uiStore.addToPlaylistTarget`, so any track row can open it.
 */
export function AddToPlaylistDialog() {
  const target = useUiStore((state) => state.addToPlaylistTarget);
  const close = useUiStore((state) => state.openAddToPlaylist);
  const pushToast = useUiStore((state) => state.pushToast);
  const { data: playlists } = usePlaylists();
  const containing = usePlaylistsContaining(target?.id);
  const [newName, setNewName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const dismiss = () => {
    close(null);
    setNewName("");
    setIsCreating(false);
  };

  const toggleMembership = async (playlistId: string, alreadyIn: boolean) => {
    if (!target) return;
    if (alreadyIn) {
      await removeTrackFromPlaylist(playlistId, target.id);
      pushToast("Removed from the playlist", "success");
      return;
    }
    await addTracksToPlaylist(playlistId, [target]);
    pushToast("Saved to the playlist", "success");
  };

  const createAndAdd = async () => {
    if (!target || !newName.trim()) return;
    const playlist = await createPlaylist(newName);
    await addTracksToPlaylist(playlist.id, [target]);
    pushToast(`Created "${playlist.name}"`, "success");
    setNewName("");
    setIsCreating(false);
  };

  return (
    <Modal
      open={Boolean(target)}
      onClose={dismiss}
      title="Save to playlist"
      description={target ? cleanTrackTitle(target.title) : undefined}
    >
      <div className="max-h-72 space-y-1 overflow-y-auto">
        {(playlists ?? []).map((playlist) => {
          const alreadyIn = containing.has(playlist.id);
          return (
            <button
              key={playlist.id}
              onClick={() => toggleMembership(playlist.id, alreadyIn)}
              aria-pressed={alreadyIn}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition hover:bg-white/[0.06]"
            >
              <span
                className={`grid h-5 w-5 shrink-0 place-items-center rounded border transition ${
                  alreadyIn ? "border-accent bg-accent text-accent-ink" : "border-line"
                }`}
              >
                {alreadyIn && <Check size={13} strokeWidth={3} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{playlist.name}</span>
                <span className="block text-xs text-ink-faint">{pluralize(playlist.trackCount, "song")}</span>
              </span>
            </button>
          );
        })}

        {playlists?.length === 0 && !isCreating && (
          <p className="px-3 py-6 text-center text-sm text-ink-muted">
            You have no playlists yet. Create your first one below.
          </p>
        )}
      </div>

      <div className="mt-3 border-t border-line pt-3">
        {isCreating ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void createAndAdd();
            }}
            className="flex gap-2"
          >
            <input
              autoFocus
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="Playlist name"
              aria-label="New playlist name"
              maxLength={80}
              className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <button
              type="submit"
              disabled={!newName.trim()}
              className="shrink-0 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink disabled:opacity-40"
            >
              Create
            </button>
          </form>
        ) : (
          <button
            onClick={() => setIsCreating(true)}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-accent transition hover:bg-white/[0.06]"
          >
            <Plus size={17} />
            New playlist
          </button>
        )}
      </div>
    </Modal>
  );
}
