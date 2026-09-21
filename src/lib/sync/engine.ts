"use client";

import { musicDatabase, type PlaylistTrackRecord } from "@/lib/db/database";
import { onLibraryChanged } from "@/lib/sync/dirty";
import { parsePlaylistTrackKey, playlistTrackKey, type SyncItem, type SyncResponse } from "@/lib/sync/types";
import type { Playlist, Track } from "@/types/music";

/** Quiet period after a change before pushing, so a burst costs one request. */
const DEBOUNCE_MS = 4_000;
/** Backstop poll, for changes made on another device while this tab is open. */
const POLL_MS = 5 * 60_000;

export type SyncState = "off" | "idle" | "syncing" | "error";

export interface SyncStatus {
  state: SyncState;
  lastSyncedAt: number | null;
  message: string | null;
}

/* -------------------------------------------------------------------------- */
/* Status, exposed to React through useSyncExternalStore                      */
/* -------------------------------------------------------------------------- */

let status: SyncStatus = { state: "off", lastSyncedAt: null, message: null };
const statusListeners = new Set<() => void>();

export function subscribeToSyncStatus(listener: () => void): () => void {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
}

export function getSyncStatus(): SyncStatus {
  return status;
}

/** A frozen snapshot for the server render, which never has a session. */
const SERVER_STATUS: SyncStatus = { state: "off", lastSyncedAt: null, message: null };
export function getServerSyncStatus(): SyncStatus {
  return SERVER_STATUS;
}

function setStatus(next: Partial<SyncStatus>) {
  // A new object every time: useSyncExternalStore compares by identity.
  status = { ...status, ...next };
  for (const listener of statusListeners) listener();
}

/* -------------------------------------------------------------------------- */
/* Cursor                                                                     */
/* -------------------------------------------------------------------------- */

const cursorKey = (userId: string) => `lyh-sync-cursor:${userId}`;
/** Which account this browser's library was first uploaded to. */
const OWNER_KEY = "lyh-sync-owner";

function readCursor(userId: string): number {
  try {
    return Number(window.localStorage.getItem(cursorKey(userId)) ?? 0) || 0;
  } catch {
    return 0;
  }
}

function writeCursor(userId: string, value: number) {
  try {
    window.localStorage.setItem(cursorKey(userId), String(value));
  } catch {
    // Private mode. Sync still works, it just re-sends more each time.
  }
}

/* -------------------------------------------------------------------------- */
/* Collecting local changes                                                   */
/* -------------------------------------------------------------------------- */

async function collectLocalChanges(since: number): Promise<SyncItem[]> {
  const items: SyncItem[] = [];

  const playlists = await musicDatabase.playlists.where("updatedAt").above(since).toArray();
  for (const playlist of playlists) {
    items.push({ kind: "playlist", itemId: playlist.id, payload: playlist, updatedAt: playlist.updatedAt, deleted: false });
  }

  // updatedAt is not an index on this table, and adding one would mean another
  // schema version for a table that is small by nature — a playlist holds
  // songs, not rows at database scale.
  const playlistTracks = await musicDatabase.playlistTracks.toArray();
  for (const row of playlistTracks) {
    const updatedAt = row.updatedAt ?? row.addedAt;
    if (updatedAt <= since) continue;
    items.push({
      kind: "playlist_track",
      itemId: playlistTrackKey(row.playlistId, row.trackId),
      payload: { playlistId: row.playlistId, trackId: row.trackId, track: row.track, position: row.position, addedAt: row.addedAt },
      updatedAt,
      deleted: false,
    });
  }

  const liked = await musicDatabase.likedTracks.where("likedAt").above(since).toArray();
  for (const row of liked) {
    items.push({ kind: "liked", itemId: row.trackId, payload: { track: row.track, likedAt: row.likedAt }, updatedAt: row.likedAt, deleted: false });
  }

  // History syncs as "when did this account last hear this track", one row per
  // track. Shipping every individual play would multiply the payload for no
  // gain: nothing in the app shows the same track twice in a history list.
  const plays = await musicDatabase.listeningHistory.where("playedAt").above(since).toArray();
  const latestPlay = new Map<string, { track: Track; playedAt: number }>();
  for (const row of plays) {
    const seen = latestPlay.get(row.trackId);
    if (!seen || row.playedAt > seen.playedAt) latestPlay.set(row.trackId, { track: row.track, playedAt: row.playedAt });
  }
  for (const [trackId, entry] of latestPlay) {
    items.push({ kind: "history", itemId: trackId, payload: entry, updatedAt: entry.playedAt, deleted: false });
  }

  const tombstones = await musicDatabase.tombstones.where("deletedAt").above(since).toArray();
  for (const stone of tombstones) {
    items.push({ kind: stone.kind, itemId: stone.itemId, payload: null, updatedAt: stone.deletedAt, deleted: true });
  }

  return items;
}

/* -------------------------------------------------------------------------- */
/* Applying remote changes                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Writes straight to Dexie rather than through the library helpers.
 *
 * Going through the helpers would mark each applied row dirty and record
 * tombstones for each applied delete, so the device would immediately push
 * back everything it just pulled — a loop between two devices that never
 * settles.
 */
async function applyRemoteChanges(items: SyncItem[]): Promise<number> {
  let applied = 0;
  const touchedPlaylists = new Set<string>();

  for (const item of items) {
    try {
      if (item.kind === "playlist") {
        touchedPlaylists.add(item.itemId);
        if (item.deleted) {
          await musicDatabase.playlistTracks.where("playlistId").equals(item.itemId).delete();
          await musicDatabase.playlists.delete(item.itemId);
          touchedPlaylists.delete(item.itemId);
        } else {
          const incoming = item.payload as Playlist;
          const local = await musicDatabase.playlists.get(item.itemId);
          if (!local || local.updatedAt < item.updatedAt) await musicDatabase.playlists.put(incoming);
        }
        applied += 1;
        continue;
      }

      if (item.kind === "playlist_track") {
        const parsed = parsePlaylistTrackKey(item.itemId);
        if (!parsed) continue;
        touchedPlaylists.add(parsed.playlistId);
        const existing = await musicDatabase.playlistTracks.where(parsed).first();

        if (item.deleted) {
          if (existing?.id !== undefined) await musicDatabase.playlistTracks.delete(existing.id);
        } else {
          const incoming = item.payload as Omit<PlaylistTrackRecord, "id" | "updatedAt">;
          const localStamp = existing ? (existing.updatedAt ?? existing.addedAt) : -1;
          if (localStamp < item.updatedAt) {
            await musicDatabase.playlistTracks.put({
              // Keeping the local autoincrement key turns this into an update
              // instead of a second row for the same track.
              ...(existing?.id !== undefined ? { id: existing.id } : {}),
              ...incoming,
              updatedAt: item.updatedAt,
            });
          }
        }
        applied += 1;
        continue;
      }

      if (item.kind === "liked") {
        const existing = await musicDatabase.likedTracks.get(item.itemId);
        if (item.deleted) {
          if (existing) await musicDatabase.likedTracks.delete(item.itemId);
        } else {
          const incoming = item.payload as { track: Track; likedAt: number };
          if (!existing || existing.likedAt < item.updatedAt) {
            await musicDatabase.likedTracks.put({ trackId: item.itemId, track: incoming.track, likedAt: incoming.likedAt });
          }
        }
        applied += 1;
        continue;
      }

      if (item.kind === "history" && !item.deleted) {
        const incoming = item.payload as { track: Track; playedAt: number };
        const already = await musicDatabase.listeningHistory.where("trackId").equals(item.itemId).toArray();
        // Only a strictly newer play is worth a row; anything else is either
        // this device's own entry coming back, or older than what it has.
        if (!already.some((row) => row.playedAt >= incoming.playedAt)) {
          await musicDatabase.listeningHistory.add({
            trackId: item.itemId,
            track: incoming.track,
            playedAt: incoming.playedAt,
            completed: false,
            progressSeconds: 0,
          });
        }
        applied += 1;
      }
    } catch {
      // One malformed row must not abort the rest of the batch.
    }
  }

  // Track counts are denormalised, so anything that changed a membership
  // leaves them to be recomputed.
  for (const playlistId of touchedPlaylists) {
    const playlist = await musicDatabase.playlists.get(playlistId);
    if (!playlist) continue;
    const trackCount = await musicDatabase.playlistTracks.where("playlistId").equals(playlistId).count();
    if (trackCount !== playlist.trackCount) {
      await musicDatabase.playlists.update(playlistId, { trackCount });
    }
  }

  return applied;
}

/* -------------------------------------------------------------------------- */
/* The engine                                                                 */
/* -------------------------------------------------------------------------- */

let activeUserId: string | null = null;
let inFlight: Promise<void> | null = null;
/** Set when a change lands mid-sync, so the run repeats instead of dropping it. */
let dirtyDuringSync = false;

async function runSync(userId: string, { pushLocal = true }: { pushLocal?: boolean } = {}): Promise<void> {
  if (inFlight) {
    dirtyDuringSync = true;
    return inFlight;
  }

  const run = (async () => {
    setStatus({ state: "syncing", message: null });
    try {
      const since = readCursor(userId);
      const items = pushLocal ? await collectLocalChanges(since) : [];

      const response = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ since, items }),
        keepalive: true,
      });

      if (response.status === 401) {
        setStatus({ state: "off", message: null });
        return;
      }
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Sync failed");
      }

      const { items: remote, serverTime } = (await response.json()) as SyncResponse;
      await applyRemoteChanges(remote);

      // Only advance once the remote half is safely written: a cursor moved
      // before the write would skip those rows forever if the write failed.
      if (serverTime > since) writeCursor(userId, serverTime);
      setStatus({ state: "idle", lastSyncedAt: Date.now(), message: null });
    } catch (error) {
      setStatus({
        state: "error",
        message: error instanceof Error ? error.message : "Sync failed",
      });
    }
  })();

  inFlight = run;
  try {
    await run;
  } finally {
    inFlight = null;
  }

  if (dirtyDuringSync && activeUserId === userId) {
    dirtyDuringSync = false;
    await runSync(userId);
  }
}

/** Forces a sync now, e.g. from a "Sync now" button. */
export function syncNow(): void {
  if (activeUserId) void runSync(activeUserId);
}

/**
 * Starts syncing for a signed-in account and returns a stop function.
 *
 * The first run for a *new* account on this browser pulls only. Uploading
 * whatever happens to be in the browser would mean a friend signing in on
 * someone else's machine silently absorbs that person's playlists into their
 * account — a data-leak shaped bug, not a merge.
 */
export function startSync(userId: string): () => void {
  activeUserId = userId;

  let owner: string | null = null;
  try {
    owner = window.localStorage.getItem(OWNER_KEY);
  } catch {
    owner = null;
  }

  const isNewAccountHere = owner !== null && owner !== userId;
  if (owner === null) {
    try {
      window.localStorage.setItem(OWNER_KEY, userId);
    } catch {
      // Without this the next sign-in re-uploads; harmless.
    }
  }

  void runSync(userId, { pushLocal: !isNewAccountHere });

  let debounce: number | null = null;
  const stopListening = onLibraryChanged(() => {
    if (debounce !== null) window.clearTimeout(debounce);
    debounce = window.setTimeout(() => {
      debounce = null;
      if (activeUserId) void runSync(activeUserId);
    }, DEBOUNCE_MS);
  });

  const poll = window.setInterval(() => {
    if (activeUserId && document.visibilityState === "visible") void runSync(activeUserId);
  }, POLL_MS);

  // Leaving the tab is the last chance to flush a pending change before the
  // browser may discard the page entirely.
  const onHide = () => {
    if (document.visibilityState !== "hidden") return;
    if (debounce === null) return;
    window.clearTimeout(debounce);
    debounce = null;
    if (activeUserId) void runSync(activeUserId);
  };
  document.addEventListener("visibilitychange", onHide);

  return () => {
    activeUserId = null;
    stopListening();
    window.clearInterval(poll);
    document.removeEventListener("visibilitychange", onHide);
    if (debounce !== null) window.clearTimeout(debounce);
    setStatus({ state: "off", message: null });
  };
}
