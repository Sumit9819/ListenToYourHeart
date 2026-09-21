"use client";

import { useLiveQuery } from "@/hooks/useLiveQuery";
import {
  getPlaylistTracks,
  likedTrackIds,
  listHistory,
  listLikedTracks,
  listPlaylists,
  listRecentSearches,
  listTopTracks,
  playlistsContainingTrack,
} from "@/lib/db/library";
import { musicDatabase } from "@/lib/db/database";
import type { Playlist, Track } from "@/types/music";

const EMPTY_IDS: ReadonlySet<string> = new Set();

/** Ids of every liked track, so lists can render heart state without N reads. */
export function useLikedIds(): ReadonlySet<string> {
  const { data } = useLiveQuery(() => likedTrackIds(), []);
  return data ?? EMPTY_IDS;
}

export function useLikedTracks() {
  return useLiveQuery(() => listLikedTracks(), []);
}

export function usePlaylists() {
  return useLiveQuery(() => listPlaylists(), []);
}

export function usePlaylist(playlistId: string) {
  return useLiveQuery(
    async (): Promise<{ playlist: Playlist | undefined; tracks: Track[] }> => ({
      playlist: await musicDatabase.playlists.get(playlistId),
      tracks: await getPlaylistTracks(playlistId),
    }),
    [playlistId],
  );
}

export function useHistory(limit = 100) {
  return useLiveQuery(() => listHistory(limit), [limit]);
}

export function useTopTracks(limit = 12) {
  return useLiveQuery(() => listTopTracks(limit), [limit]);
}

export function useRecentSearches() {
  return useLiveQuery(() => listRecentSearches(), []);
}

/** Which playlists already hold this track — drives the checklist dialog. */
export function usePlaylistsContaining(trackId: string | undefined) {
  const { data } = useLiveQuery(
    () => (trackId ? playlistsContainingTrack(trackId) : Promise.resolve(new Set<string>())),
    [trackId],
  );
  return data ?? EMPTY_IDS;
}
