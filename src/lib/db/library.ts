"use client";

import { musicDatabase, type ListeningHistoryRecord, type PlaylistRecord } from "@/lib/db/database";
import type { Playlist, Track } from "@/types/music";

const HISTORY_LIMIT = 500;
const SEARCH_HISTORY_LIMIT = 12;
/** Gap between positions so an insert between two rows rarely needs a rewrite. */
const POSITION_STEP = 1024;

function newId(prefix: string): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2, 12);
  return `${prefix}_${random}`;
}

/* -------------------------------------------------------------------------- */
/* Playlists                                                                  */
/* -------------------------------------------------------------------------- */

export async function createPlaylist(name: string, description?: string): Promise<Playlist> {
  const now = Date.now();
  const playlist: PlaylistRecord = {
    id: newId("pl"),
    name: name.trim() || "Untitled playlist",
    description: description?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
    trackCount: 0,
  };
  await musicDatabase.playlists.add(playlist);
  return playlist;
}

export async function renamePlaylist(playlistId: string, name: string, description?: string): Promise<void> {
  await musicDatabase.playlists.update(playlistId, {
    name: name.trim() || "Untitled playlist",
    description: description?.trim() || undefined,
    updatedAt: Date.now(),
  });
}

export async function deletePlaylist(playlistId: string): Promise<void> {
  await musicDatabase.transaction("rw", musicDatabase.playlists, musicDatabase.playlistTracks, async () => {
    await musicDatabase.playlistTracks.where("playlistId").equals(playlistId).delete();
    await musicDatabase.playlists.delete(playlistId);
  });
}

export async function getPlaylist(playlistId: string): Promise<Playlist | undefined> {
  return musicDatabase.playlists.get(playlistId);
}

export async function listPlaylists(): Promise<Playlist[]> {
  const playlists = await musicDatabase.playlists.toArray();
  return playlists.sort((left, right) => right.updatedAt - left.updatedAt);
}

export async function getPlaylistTracks(playlistId: string): Promise<Track[]> {
  const rows = await musicDatabase.playlistTracks.where("playlistId").equals(playlistId).toArray();
  return rows.sort((left, right) => left.position - right.position).map((row) => row.track);
}

/** Adds tracks, skipping any already in the playlist. Returns how many landed. */
export async function addTracksToPlaylist(playlistId: string, tracks: Track[]): Promise<number> {
  if (!tracks.length) return 0;

  return musicDatabase.transaction("rw", musicDatabase.playlists, musicDatabase.playlistTracks, async () => {
    const existing = await musicDatabase.playlistTracks.where("playlistId").equals(playlistId).toArray();
    const existingIds = new Set(existing.map((row) => row.trackId));
    const additions = tracks.filter((track) => !existingIds.has(track.id));
    if (!additions.length) return 0;

    const highestPosition = existing.reduce((max, row) => Math.max(max, row.position), 0);
    const now = Date.now();

    await musicDatabase.playlistTracks.bulkAdd(
      additions.map((track, offset) => ({
        playlistId,
        trackId: track.id,
        track,
        position: highestPosition + POSITION_STEP * (offset + 1),
        addedAt: now,
      })),
    );
    await musicDatabase.playlists.update(playlistId, {
      trackCount: existing.length + additions.length,
      updatedAt: now,
      // First track added supplies the cover until the user sets one.
      ...(existing.length === 0 && additions[0]?.albumArtUrl ? { coverUrl: additions[0].albumArtUrl } : {}),
    });
    return additions.length;
  });
}

export async function removeTrackFromPlaylist(playlistId: string, trackId: string): Promise<void> {
  await musicDatabase.transaction("rw", musicDatabase.playlists, musicDatabase.playlistTracks, async () => {
    await musicDatabase.playlistTracks.where({ playlistId, trackId }).delete();
    const remaining = await musicDatabase.playlistTracks.where("playlistId").equals(playlistId).count();
    await musicDatabase.playlists.update(playlistId, { trackCount: remaining, updatedAt: Date.now() });
  });
}

/** Moves the track at `from` to index `to` within the playlist's own order. */
export async function reorderPlaylistTrack(playlistId: string, from: number, to: number): Promise<void> {
  await musicDatabase.transaction("rw", musicDatabase.playlists, musicDatabase.playlistTracks, async () => {
    const rows = (await musicDatabase.playlistTracks.where("playlistId").equals(playlistId).toArray()).sort(
      (left, right) => left.position - right.position,
    );
    if (from === to || !rows[from] || to < 0 || to >= rows.length) return;

    const reordered = [...rows];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);

    // Renumber from scratch: playlists are small, and this keeps gaps even.
    await Promise.all(
      reordered.map((row, index) =>
        row.position === (index + 1) * POSITION_STEP
          ? Promise.resolve(0)
          : musicDatabase.playlistTracks.update(row.id as number, { position: (index + 1) * POSITION_STEP }),
      ),
    );
    await musicDatabase.playlists.update(playlistId, { updatedAt: Date.now() });
  });
}

export async function playlistsContainingTrack(trackId: string): Promise<Set<string>> {
  const rows = await musicDatabase.playlistTracks.where("trackId").equals(trackId).toArray();
  return new Set(rows.map((row) => row.playlistId));
}

/* -------------------------------------------------------------------------- */
/* Favorites                                                                  */
/* -------------------------------------------------------------------------- */

export async function isLiked(trackId: string): Promise<boolean> {
  return (await musicDatabase.likedTracks.get(trackId)) !== undefined;
}

/** Flips the like state and reports the state it landed on. */
export async function toggleLike(track: Track): Promise<boolean> {
  const existing = await musicDatabase.likedTracks.get(track.id);
  if (existing) {
    await musicDatabase.likedTracks.delete(track.id);
    return false;
  }
  await musicDatabase.likedTracks.put({ trackId: track.id, track, likedAt: Date.now() });
  return true;
}

export async function listLikedTracks(): Promise<Track[]> {
  const rows = await musicDatabase.likedTracks.orderBy("likedAt").reverse().toArray();
  return rows.map((row) => row.track);
}

export async function likedTrackIds(): Promise<Set<string>> {
  return new Set(await musicDatabase.likedTracks.toCollection().primaryKeys());
}

/* -------------------------------------------------------------------------- */
/* History                                                                    */
/* -------------------------------------------------------------------------- */

export async function recordPlay(track: Track): Promise<void> {
  try {
    await musicDatabase.transaction("rw", musicDatabase.listeningHistory, async () => {
      // Collapse an immediate replay into the existing row instead of stacking.
      const latest = await musicDatabase.listeningHistory.orderBy("playedAt").reverse().first();
      if (latest?.trackId === track.id) {
        await musicDatabase.listeningHistory.update(latest.id as number, { playedAt: Date.now() });
        return;
      }
      await musicDatabase.listeningHistory.add({
        trackId: track.id,
        track,
        playedAt: Date.now(),
        completed: false,
        progressSeconds: 0,
      });

      const total = await musicDatabase.listeningHistory.count();
      if (total > HISTORY_LIMIT) {
        const stale = await musicDatabase.listeningHistory
          .orderBy("playedAt")
          .limit(total - HISTORY_LIMIT)
          .primaryKeys();
        await musicDatabase.listeningHistory.bulkDelete(stale);
      }
    });
  } catch {
    // History is a convenience; never let it break playback.
  }
}

export async function listHistory(limit = 100): Promise<ListeningHistoryRecord[]> {
  return musicDatabase.listeningHistory.orderBy("playedAt").reverse().limit(limit).toArray();
}

/** Most-played tracks, used for the "On repeat" shelf on the home page. */
export async function listTopTracks(limit = 12): Promise<Array<{ track: Track; playCount: number }>> {
  const rows = await musicDatabase.listeningHistory.toArray();
  const counts = new Map<string, { track: Track; playCount: number }>();
  for (const row of rows) {
    const entry = counts.get(row.trackId);
    if (entry) entry.playCount += 1;
    else counts.set(row.trackId, { track: row.track, playCount: 1 });
  }
  return [...counts.values()].sort((left, right) => right.playCount - left.playCount).slice(0, limit);
}

export async function clearHistory(): Promise<void> {
  await musicDatabase.listeningHistory.clear();
}

/* -------------------------------------------------------------------------- */
/* Search history                                                             */
/* -------------------------------------------------------------------------- */

export async function recordSearch(query: string): Promise<void> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return;
  try {
    await musicDatabase.searchHistory.put({ query: trimmed, searchedAt: Date.now() });
    const total = await musicDatabase.searchHistory.count();
    if (total > SEARCH_HISTORY_LIMIT) {
      const stale = await musicDatabase.searchHistory
        .orderBy("searchedAt")
        .limit(total - SEARCH_HISTORY_LIMIT)
        .primaryKeys();
      await musicDatabase.searchHistory.bulkDelete(stale);
    }
  } catch {
    // Non-critical.
  }
}

export async function listRecentSearches(): Promise<string[]> {
  const rows = await musicDatabase.searchHistory.orderBy("searchedAt").reverse().toArray();
  return rows.map((row) => row.query);
}

export async function removeSearch(query: string): Promise<void> {
  await musicDatabase.searchHistory.delete(query);
}

/* -------------------------------------------------------------------------- */
/* Backup                                                                     */
/* -------------------------------------------------------------------------- */

export interface LibraryBackup {
  version: 2;
  exportedAt: number;
  playlists: Array<Playlist & { tracks: Track[] }>;
  liked: Track[];
}

export async function exportLibrary(): Promise<LibraryBackup> {
  const playlists = await listPlaylists();
  return {
    version: 2,
    exportedAt: Date.now(),
    playlists: await Promise.all(
      playlists.map(async (playlist) => ({ ...playlist, tracks: await getPlaylistTracks(playlist.id) })),
    ),
    liked: await listLikedTracks(),
  };
}

/** Merges a backup into the current library; never destructive. */
export async function importLibrary(backup: LibraryBackup): Promise<{ playlists: number; liked: number }> {
  if (backup?.version !== 2 || !Array.isArray(backup.playlists)) {
    throw new Error("That file is not a Listen To Your Heart backup.");
  }

  let importedPlaylists = 0;
  for (const entry of backup.playlists) {
    const existing = (await listPlaylists()).find((playlist) => playlist.name === entry.name);
    const target = existing ?? (await createPlaylist(entry.name, entry.description));
    await addTracksToPlaylist(target.id, entry.tracks ?? []);
    importedPlaylists += 1;
  }

  const liked = backup.liked ?? [];
  await musicDatabase.likedTracks.bulkPut(
    liked.map((track) => ({ trackId: track.id, track, likedAt: Date.now() })),
  );

  return { playlists: importedPlaylists, liked: liked.length };
}
