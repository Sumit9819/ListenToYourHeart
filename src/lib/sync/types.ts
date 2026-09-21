/**
 * The wire format shared by the sync route and the browser sync engine.
 *
 * Deliberately one shape for every kind of library row rather than a table per
 * feature. The cloud copy is a replica, not the source of truth — the browser
 * database stays authoritative for rendering — so the server never needs to
 * understand a playlist, only when a row last changed and whether it is gone.
 * Adding a new kind of saved thing later costs one string, not a migration.
 */
export type SyncKind = "playlist" | "playlist_track" | "liked" | "history";

export interface SyncItem {
  kind: SyncKind;
  /** Unique within its kind for one account. */
  itemId: string;
  /** The row itself. Null for a deletion. */
  payload: unknown;
  /** Epoch ms of the last local change. Conflicts resolve to the newer one. */
  updatedAt: number;
  deleted: boolean;
}

export interface SyncRequest {
  /** Server clock value from the last successful sync; 0 for a first run. */
  since: number;
  items: SyncItem[];
}

export interface SyncResponse {
  items: SyncItem[];
  /** Becomes the client's next `since`. Using the server clock throughout
   *  avoids a skewed device silently skipping its own changes. */
  serverTime: number;
}

/** Composite key for a track inside a playlist. */
export function playlistTrackKey(playlistId: string, trackId: string): string {
  return `${playlistId}::${trackId}`;
}

export function parsePlaylistTrackKey(key: string): { playlistId: string; trackId: string } | null {
  const separator = key.indexOf("::");
  if (separator < 0) return null;
  return { playlistId: key.slice(0, separator), trackId: key.slice(separator + 2) };
}
