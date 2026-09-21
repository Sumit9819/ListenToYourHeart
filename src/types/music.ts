export type SearchFilter = "all" | "music_songs" | "videos" | "playlists";
export type RepeatMode = "off" | "all" | "one";
export type ThemeName = "dark" | "light";

export interface Track {
  id: string;
  source: "youtube";
  sourceId: string;
  title: string;
  artist: string;
  album?: string;
  albumArtUrl?: string;
  durationSeconds?: number;
  isLive?: boolean;
  addedAt?: number;
}

export interface AudioStream {
  trackId: string;
  url: string;
  mimeType: string;
  codec?: string;
  bitrate?: number;
  quality?: string;
  isHls: boolean;
  isLive: boolean;
  durationSeconds?: number;
}

export interface Playlist {
  id: string;
  name: string;
  description?: string;
  coverUrl?: string;
  createdAt: number;
  updatedAt: number;
  trackCount: number;
}

export interface ProviderError {
  code: "PROVIDER_UNAVAILABLE" | "INVALID_RESPONSE" | "NOT_FOUND" | "BAD_REQUEST";
  message: string;
  retryable: boolean;
}

/** What the player exposes to the UI. Playback position lives in the engine. */
export interface PlayerState {
  queue: Track[];
  /** Index into `queue`, not a track id — the same track can appear twice. */
  currentIndex: number;
  /** Playback order over `queue` indices. Identity order unless shuffled. */
  order: number[];
  isPlaying: boolean;
  isLoading: boolean;
  volume: number;
  isMuted: boolean;
  repeatMode: RepeatMode;
  isShuffled: boolean;
  currentTime: number;
  duration: number;
  bufferedTo: number;
  error: string | null;
  queueOrigin: string | null;
}
