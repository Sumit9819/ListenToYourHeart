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
  /**
   * What the search that produced this track was looking for.
   *
   * "song" is an Art Track or similar audio upload, whose only picture is a
   * still, so watching it needs a separate music-video lookup. "video" is a real
   * upload that already has footage, so it plays as-is and must never be
   * swapped for something else. Undefined on tracks saved before this existed.
   */
  kind?: "song" | "video";
}

/** Which rendition to request: audio-only, or muxed video+audio. */
export type PlaybackMode = "audio" | "video";

/** One selectable video rendition. `id` is null for the automatic option. */
export interface VideoQuality {
  id: number | null;
  /** "Auto", "1080p", "720p"... */
  label: string;
  height: number;
}

export interface AudioStream {
  trackId: string;
  url: string;
  mimeType: string;
  codec?: string;
  bitrate?: number;
  quality?: string;
  isHls: boolean;
  /**
   * The URL is a DASH manifest rather than a single file.
   *
   * This is how anything above 360p is reached: YouTube only still serves one
   * combined video+audio rendition (itag 18, 360p), and every higher quality
   * exists solely as separate video-only and audio-only streams that a manifest
   * stitches back together.
   */
  isDash?: boolean;
  isLive: boolean;
  durationSeconds?: number;
  /** What the provider actually returned, which may differ from the request. */
  kind: PlaybackMode;
  /** Present for video renditions, e.g. "360p". */
  qualityLabel?: string;
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
  playbackMode: PlaybackMode;
  /** Real music video substituted for an Art Track, when one was found. */
  videoSourceId: string | null;
  isResolvingVideo: boolean;
  /** True once a video rendition is actually loaded and has dimensions. */
  hasVideo: boolean;
  /** Epoch ms at which playback should stop, or null when no timer is set. */
  sleepTimerEndsAt: number | null;
  /** Renditions the current video offers; empty when none or not watching. */
  videoQualities: VideoQuality[];
  /** Chosen rendition id, or null while quality is automatic. */
  videoQuality: number | null;
  /** Keep playing past the end of the queue with provider recommendations. */
  autoplayRadio: boolean;
  /** True while recommendations for the end of the queue are being fetched. */
  isExtendingQueue: boolean;
  /** 1 is normal speed. */
  playbackRate: number;
}
