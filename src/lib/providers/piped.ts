import "server-only";

import type { AudioStream, SearchFilter, Track } from "@/types/music";

type ProviderKind = "piped" | "invidious";

type ProviderInstance = {
  kind: ProviderKind;
  origin: string;
};

type PipedSearchItem = {
  url?: string;
  id?: string;
  videoId?: string;
  title?: string;
  uploaderName?: string;
  uploader?: string;
  thumbnail?: string;
  thumbnailUrl?: string;
  duration?: number;
  isLive?: boolean;
  type?: string;
};

type PipedSearchResponse = { items?: PipedSearchItem[] } | PipedSearchItem[];

type PipedStreamResponse = {
  videoStreams?: Array<{
    url?: string;
    format?: string;
    mimeType?: string;
    codec?: string;
    bitrate?: number;
    quality?: string;
    videoOnly?: boolean;
  }>;
  audioStreams?: Array<{
    url?: string;
    format?: string;
    mimeType?: string;
    codec?: string;
    bitrate?: number;
    quality?: string;
  }>;
  relatedStreams?: PipedSearchItem[];
  hls?: string;
  duration?: number;
  isLive?: boolean;
  title?: string;
  uploader?: string;
  thumbnailUrl?: string;
};

type InvidiousSearchItem = {
  videoId?: string;
  title?: string;
  author?: string;
  videoThumbnails?: Array<{ url?: string; quality?: string }>;
  lengthSeconds?: number;
  liveNow?: boolean;
  type?: string;
};

type InvidiousVideoResponse = {
  videoId?: string;
  title?: string;
  author?: string;
  lengthSeconds?: number;
  liveNow?: boolean;
  recommendedVideos?: InvidiousSearchItem[];
  adaptiveFormats?: Array<{
    url?: string;
    mimeType?: string;
    bitrate?: number;
    type?: string;
    audioQuality?: string;
    quality?: string;
    container?: string;
  }>;
  hlsUrl?: string;
};

/**
 * Public API instances, verified reachable on 2026-09-21.
 *
 * These are API origins, not web frontends: a frontend such as piped.video
 * answers 200 with HTML and would silently poison every result. Instances come
 * and go, so treat this list as a default and override it through the
 * PIPED_INSTANCES / INVIDIOUS_INSTANCES environment variables.
 */
const DEFAULT_PIPED = [
  "https://api.piped.private.coffee",
  "https://pipedapi.ducks.party",
];

const DEFAULT_INVIDIOUS = [
  "https://invidious.f5.si",
];

const requestTimeoutMs = 8_000;
/** Circuit breaker: an instance that just failed is skipped for 30 seconds. */
const failedUntil = new Map<string, number>();

function getConfiguredProviders(): ProviderInstance[] {
  const piped =
    process.env.PIPED_INSTANCES?.split(",")
      .map((origin) => origin.trim().replace(/\/$/, ""))
      .filter(Boolean) ?? DEFAULT_PIPED;

  const invidious =
    process.env.INVIDIOUS_INSTANCES?.split(",")
      .map((origin) => origin.trim().replace(/\/$/, ""))
      .filter(Boolean) ?? DEFAULT_INVIDIOUS;

  const providers: ProviderInstance[] = [
    ...piped.map((origin) => ({ origin, kind: "piped" as const })),
    ...invidious.map((origin) => ({ origin, kind: "invidious" as const })),
  ];

  return providers.filter(({ origin }) => {
    try {
      return new URL(origin).protocol === "https:";
    } catch {
      return false;
    }
  });
}

async function requestProvider<T>(path: string, kind: ProviderKind): Promise<T> {
  const providers = getConfiguredProviders().filter((provider) => provider.kind === kind);
  let lastError: unknown;

  for (const provider of providers) {
    const key = `${provider.kind}:${provider.origin}`;
    if ((failedUntil.get(key) ?? 0) > Date.now()) continue;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

    try {
      const response = await fetch(`${provider.origin}${path}`, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
        cache: "no-store",
      });

      if (!response.ok) throw new Error(`Provider returned ${response.status}`);

      // A web frontend answers 200 with HTML. Without this check the JSON parse
      // would throw somewhere far less obvious.
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("json")) throw new Error(`Provider returned ${contentType || "no content type"}`);

      const body: unknown = await response.json();

      // Both Piped and Invidious report upstream failures as 200 + {error}.
      // Treating that as success would pin us to a broken instance instead of
      // failing over to the next one.
      if (body && typeof body === "object" && "error" in body) {
        const detail = (body as { error?: unknown }).error;
        throw new Error(typeof detail === "string" ? detail.slice(0, 120) : "Provider reported an error");
      }

      failedUntil.delete(key);
      return body as T;
    } catch (error) {
      lastError = error;
      failedUntil.set(key, Date.now() + 30_000);
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error(lastError instanceof Error ? lastError.message : "No provider instance is available");
}

function sourceIdFromUrl(url: string | undefined, fallback?: string, videoId?: string): string | null {
  if (fallback) return fallback;
  if (videoId) return videoId;
  const match = url?.match(/(?:v=|\/watch\/|youtu\.be\/)([\w-]{6,})/);
  return match?.[1] ?? null;
}

function normalizePipedTrack(item: PipedSearchItem): Track | null {
  // Search results interleave channels and playlists; keep only playable videos.
  if (item.type && item.type !== "stream") return null;
  const sourceId = sourceIdFromUrl(item.url, item.id ?? item.videoId, item.videoId);
  if (!sourceId || !item.title) return null;

  return {
    id: `youtube:${sourceId}`,
    source: "youtube",
    sourceId,
    title: item.title,
    artist: item.uploaderName || item.uploader || "Unknown artist",
    albumArtUrl: item.thumbnail ?? item.thumbnailUrl,
    durationSeconds: item.duration && item.duration > 0 ? item.duration : undefined,
    isLive: item.isLive ?? false,
  };
}

function normalizeInvidiousTrack(item: InvidiousSearchItem): Track | null {
  if (item.type && item.type !== "video") return null;
  const sourceId = item.videoId;
  if (!sourceId || !item.title) return null;

  return {
    id: `youtube:${sourceId}`,
    source: "youtube",
    sourceId,
    title: item.title,
    artist: item.author || "Unknown artist",
    albumArtUrl:
      item.videoThumbnails?.find((thumb) => thumb.quality === "medium")?.url ?? item.videoThumbnails?.[0]?.url,
    durationSeconds:
      typeof item.lengthSeconds === "number" && item.lengthSeconds > 0 ? item.lengthSeconds : undefined,
    isLive: Boolean(item.liveNow),
  };
}

/** Prefers ~128-160 kbps AAC: the sweet spot for streaming audio only. */
function streamScoreForPiped(stream: NonNullable<PipedStreamResponse["audioStreams"]>[number]): number {
  const mime = `${stream.mimeType ?? ""} ${stream.format ?? ""}`.toLowerCase();
  const bitrate = stream.bitrate ?? 0;
  const codecScore = mime.includes("m4a") || mime.includes("aac") ? 40 : mime.includes("webm") ? 20 : 0;
  const bitrateScore =
    bitrate >= 128_000 && bitrate <= 160_000 ? 30 : Math.max(0, 20 - Math.abs(bitrate - 144_000) / 10_000);
  return codecScore + bitrateScore;
}

function streamScoreForInvidious(stream: NonNullable<InvidiousVideoResponse["adaptiveFormats"]>[number]): number {
  const mime = (stream.mimeType ?? "").toLowerCase();
  const bitrate = stream.bitrate ?? 0;
  const mimeScore = mime.includes("audio/mp4") || mime.includes("audio/aac") ? 40 : mime.includes("audio/webm") ? 25 : 0;
  const bitrateScore =
    bitrate >= 128_000 && bitrate <= 160_000 ? 30 : Math.max(0, 20 - Math.abs(bitrate - 144_000) / 10_000);
  return mimeScore + bitrateScore;
}

/** Piped returns either a bare array or `{ items }` depending on the version. */
function unwrapPipedSearch(body: PipedSearchResponse): PipedSearchItem[] {
  if (Array.isArray(body)) return body;
  return body.items ?? [];
}

const PIPED_FILTERS: Record<SearchFilter, string> = {
  all: "all",
  music_songs: "music_songs",
  videos: "videos",
  playlists: "playlists",
};

/** Thrown when no configured instance could be reached at all. */
export class ProvidersUnavailableError extends Error {
  constructor(public readonly failures: string[]) {
    super(`No provider instance could be reached: ${failures.join("; ")}`);
    this.name = "ProvidersUnavailableError";
  }
}

export async function searchTracks(query: string, filter: SearchFilter): Promise<Track[]> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return [];

  const failures: string[] = [];
  // "Every instance is unreachable" and "the query genuinely has no matches"
  // are different answers and must not collapse into the same empty array —
  // otherwise a total outage renders as a cheerful "No results".
  let anyProviderResponded = false;

  try {
    const body = await requestProvider<PipedSearchResponse>(
      `/search?q=${encodeURIComponent(normalizedQuery)}&filter=${encodeURIComponent(PIPED_FILTERS[filter])}`,
      "piped",
    );
    anyProviderResponded = true;
    const results = unwrapPipedSearch(body)
      .map(normalizePipedTrack)
      .filter((track): track is Track => track !== null);
    if (results.length > 0) return results;
    failures.push("piped:empty");
  } catch (error) {
    failures.push(`piped:${error instanceof Error ? error.message : "unknown"}`);
  }

  try {
    const invidious = await requestProvider<InvidiousSearchItem[]>(
      `/api/v1/search?q=${encodeURIComponent(normalizedQuery)}&type=video`,
      "invidious",
    );
    anyProviderResponded = true;
    const results = invidious.map(normalizeInvidiousTrack).filter((track): track is Track => track !== null);
    if (results.length > 0) return results;
    failures.push("invidious:empty");
  } catch (error) {
    failures.push(`invidious:${error instanceof Error ? error.message : "unknown"}`);
  }

  console.warn("Search returned nothing:", failures.join("; "));
  if (!anyProviderResponded) throw new ProvidersUnavailableError(failures);
  return [];
}

export interface InstanceHealth {
  origin: string;
  kind: ProviderKind;
  ok: boolean;
  status: string;
  latencyMs: number;
}

/**
 * Probes every configured instance with a real search.
 *
 * The whole app rests on third-party instances that fail independently and
 * often block datacenter IPs, so "which of these actually works from where the
 * app is deployed" needs to be answerable without reading build logs.
 */
export async function checkInstances(): Promise<InstanceHealth[]> {
  const probe = async (provider: ProviderInstance): Promise<InstanceHealth> => {
    const path =
      provider.kind === "piped" ? "/search?q=test&filter=music_songs" : "/api/v1/search?q=test&type=video";
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

    try {
      const response = await fetch(`${provider.origin}${path}`, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
        cache: "no-store",
      });
      const contentType = response.headers.get("content-type") ?? "";

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (!contentType.includes("json")) throw new Error(`non-JSON response (${contentType || "no content type"})`);

      const body: unknown = await response.json();
      if (body && typeof body === "object" && "error" in body) {
        const detail = (body as { error?: unknown }).error;
        throw new Error(typeof detail === "string" ? detail.slice(0, 120) : "provider reported an error");
      }

      return { ...provider, ok: true, status: "ok", latencyMs: Date.now() - startedAt };
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      return {
        ...provider,
        ok: false,
        // An abort here is our own timeout firing, not a caller cancellation.
        status: error instanceof Error && error.name === "AbortError" ? `timeout after ${requestTimeoutMs}ms` : message,
        latencyMs: Date.now() - startedAt,
      };
    } finally {
      clearTimeout(timeout);
    }
  };

  return Promise.all(getConfiguredProviders().map(probe));
}

/**
 * Tracks related to `videoId`, used to keep playback going when the queue runs
 * dry. Returns an empty list rather than throwing: autoplay is a nicety.
 */
export async function getRelatedTracks(videoId: string): Promise<Track[]> {
  if (!/^[\w-]{6,}$/.test(videoId)) return [];

  try {
    const response = await requestProvider<PipedStreamResponse>(`/streams/${encodeURIComponent(videoId)}`, "piped");
    const related = (response.relatedStreams ?? [])
      .map(normalizePipedTrack)
      .filter((track): track is Track => track !== null);
    if (related.length) return related;
  } catch {
    // Fall through to Invidious.
  }

  try {
    const video = await requestProvider<InvidiousVideoResponse>(
      `/api/v1/videos/${encodeURIComponent(videoId)}`,
      "invidious",
    );
    return (video.recommendedVideos ?? [])
      .map(normalizeInvidiousTrack)
      .filter((track): track is Track => track !== null);
  } catch {
    return [];
  }
}

/** Typeahead suggestions. Best-effort; an empty list just hides the dropdown. */
export async function getSuggestions(query: string): Promise<string[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  try {
    const body = await requestProvider<string[] | { suggestions?: string[] }>(
      `/suggestions?query=${encodeURIComponent(trimmed)}`,
      "piped",
    );
    const suggestions = Array.isArray(body) ? body : (body.suggestions ?? []);
    if (suggestions.length) return suggestions.slice(0, 8);
  } catch {
    // Fall through to Invidious.
  }

  try {
    const body = await requestProvider<{ suggestions?: string[] }>(
      `/api/v1/search/suggestions?q=${encodeURIComponent(trimmed)}`,
      "invidious",
    );
    return (body.suggestions ?? []).slice(0, 8);
  } catch {
    return [];
  }
}

export async function getAudioStream(videoId: string): Promise<AudioStream> {
  if (!/^[\w-]{6,}$/.test(videoId)) throw new Error("Invalid video ID");

  try {
    const response = await requestProvider<PipedStreamResponse>(`/streams/${encodeURIComponent(videoId)}`, "piped");

    const hlsUrl = response.hls;
    if (hlsUrl) {
      return {
        trackId: `youtube:${videoId}`,
        url: hlsUrl,
        mimeType: "application/vnd.apple.mpegurl",
        isHls: true,
        isLive: response.isLive ?? true,
        durationSeconds: response.duration,
      };
    }

    const audioStreams = (response.audioStreams ?? [])
      .filter((stream) => Boolean(stream.url))
      .sort((left, right) => streamScoreForPiped(right) - streamScoreForPiped(left));
    const selected = audioStreams[0];
    if (selected?.url) {
      return {
        trackId: `youtube:${videoId}`,
        url: selected.url,
        mimeType: selected.mimeType ?? "audio/mp4",
        codec: selected.codec,
        bitrate: selected.bitrate,
        quality: selected.quality,
        isHls: false,
        isLive: response.isLive ?? false,
        durationSeconds: response.duration,
      };
    }
  } catch {
    // Fall through to Invidious.
  }

  const video = await requestProvider<InvidiousVideoResponse>(
    `/api/v1/videos/${encodeURIComponent(videoId)}`,
    "invidious",
  );

  const hlsUrl = video.hlsUrl;
  if (hlsUrl) {
    return {
      trackId: `youtube:${videoId}`,
      url: hlsUrl,
      mimeType: "application/vnd.apple.mpegurl",
      isHls: true,
      isLive: Boolean(video.liveNow),
      durationSeconds: typeof video.lengthSeconds === "number" ? video.lengthSeconds : undefined,
    };
  }

  const audioStreams = (video.adaptiveFormats ?? [])
    .filter((stream) => Boolean(stream.url) && /audio/i.test(stream.type ?? "") && !/video/i.test(stream.type ?? ""))
    .sort((left, right) => streamScoreForInvidious(right) - streamScoreForInvidious(left));

  const selected = audioStreams[0];
  if (!selected?.url) throw new Error("Provider returned no playable audio stream");

  return {
    trackId: `youtube:${videoId}`,
    url: selected.url,
    mimeType: selected.mimeType ?? "audio/mp4",
    codec: selected.audioQuality,
    bitrate: selected.bitrate,
    quality: selected.quality,
    isHls: false,
    isLive: Boolean(video.liveNow),
    durationSeconds: typeof video.lengthSeconds === "number" ? video.lengthSeconds : undefined,
  };
}
