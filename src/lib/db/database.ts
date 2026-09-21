"use client";

import Dexie, { type Table } from "dexie";
import type { Playlist, Track } from "@/types/music";

export type PlaylistRecord = Playlist;

export interface PlaylistTrackRecord {
  id?: number;
  playlistId: string;
  trackId: string;
  track: Track;
  /** Sparse ordering key so a reorder rewrites one row, not the whole list. */
  position: number;
  addedAt: number;
}

export interface LikedTrackRecord {
  trackId: string;
  track: Track;
  likedAt: number;
}

export interface ListeningHistoryRecord {
  id?: number;
  trackId: string;
  track: Track;
  playedAt: number;
  completed: boolean;
  progressSeconds: number;
}

export interface SearchHistoryRecord {
  query: string;
  searchedAt: number;
}

export class MusicDatabase extends Dexie {
  playlists!: Table<PlaylistRecord, string>;
  playlistTracks!: Table<PlaylistTrackRecord, number>;
  likedTracks!: Table<LikedTrackRecord, string>;
  listeningHistory!: Table<ListeningHistoryRecord, number>;
  searchHistory!: Table<SearchHistoryRecord, string>;

  constructor() {
    super("listen-to-your-heart");

    this.version(1).stores({
      playlists: "id, createdAt, updatedAt",
      playlistTracks: "++id, playlistId, trackId, addedAt, [playlistId+trackId]",
      likedTracks: "trackId, likedAt",
      listeningHistory: "++id, trackId, playedAt",
    });

    this.version(2)
      .stores({
        playlists: "id, createdAt, updatedAt, name",
        playlistTracks: "++id, playlistId, trackId, addedAt, position, [playlistId+trackId], [playlistId+position]",
        likedTracks: "trackId, likedAt",
        listeningHistory: "++id, trackId, playedAt",
        searchHistory: "query, searchedAt",
      })
      .upgrade(async (transaction) => {
        // v1 playlists carried their track ids inline; v2 reads counts from
        // playlistTracks, so backfill the denormalised count once.
        const playlists = transaction.table<PlaylistRecord & { trackIds?: string[] }>("playlists");
        await playlists.toCollection().modify((playlist) => {
          playlist.trackCount = playlist.trackCount ?? playlist.trackIds?.length ?? 0;
          delete playlist.trackIds;
        });
      });
  }
}

/** Guarded singleton so Fast Refresh does not open a second connection. */
const globalScope = globalThis as typeof globalThis & { __lyhDatabase?: MusicDatabase };
export const musicDatabase: MusicDatabase = globalScope.__lyhDatabase ?? new MusicDatabase();
if (typeof window !== "undefined") globalScope.__lyhDatabase = musicDatabase;
