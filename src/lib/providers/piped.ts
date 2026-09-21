import "server-only";

import type { AudioStream, PlaybackMode, SearchFilter, Track } from "@/types/music";

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

type InvidiousFormatStream = {
  url?: string;
  itag?: string | number;
  mimeType?: string;
  type?: string;
  quality?: string;
  qualityLabel?: string;
  bitrate?: number | string;
};

type InvidiousVideoResponse = {
  videoId?: string;
  formatStreams?: InvidiousFormatStream[];
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

/**
 * Ordered by stream-resolution reliability, because that is the scarce
 * capability: Piped handles nearly all search traffic, and Invidious is reached
 * mainly as the stream fallback in getAudioStream. darkness.services is the one
 * instance verified to return playable audio (2026-09-21); f5.si is kept behind
 * it because its search still answers when Piped is down.
 */
const DEFAULT_INVIDIOUS = [
  "https://invidious.darkness.services",
  "https://invidious.f5.si",
];

const requestTimeoutMs = 8_000;
/**
 * Stream resolution gets longer than search.
 *
 * The instance has to extract the media server-side before answering, and it is
 * measurably slower from datacenter IPs than from a home connection — so the
 * search timeout is tight enough to abandon a request that would have worked.
 */
const streamDeadlineMs = 9_000;
/** The Piped fallback rarely succeeds for streams, so it gets a short leash. */
const pipedStreamDeadlineMs = 5_000;

/**
 * Upper bound for a result on the "Songs" tab.
 *
 * Provider search happily returns 90-minute concert compilations and "best of"
 * mixes alongside actual tracks, which are wrong for a music player.
 *
 * This is a relevance filter only. It was first added on the theory that long
 * results were also the ones failing extraction; a controlled test later showed
 * the real predictor is the upload, not the length — official-channel uploads
 * return 206 while auto-generated "- Topic" uploads of the same song are
 * 403-blocked. Do not expect this to affect whether playback succeeds.
 */
const MAX_SONG_SECONDS = 900;
/** Circuit breaker: an instance that just failed is skipped for 30 seconds. */
const failedUntil = new Map<string, number>();

/**
 * Parses a comma-separated origin list, falling back when it yields nothing.
 *
 * `??` is deliberately avoided here: a variable defined as an empty string is
 * not `undefined`, so `??` would hand back an empty list and silently disable
 * every provider. A hosting dashboard makes empty variables very easy to
 * create, and the symptom (search returns nothing, no error anywhere) is
 * almost impossible to trace back to its cause.
 */
function parseOrigins(raw: string | undefined, fallback: string[]): string[] {
  const parsed = (raw ?? "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean);

  return parsed.length > 0 ? parsed : fallback;
}

function getConfiguredProviders(): ProviderInstance[] {
  const piped = parseOrigins(process.env.PIPED_INSTANCES, DEFAULT_PIPED);
  const invidious = parseOrigins(process.env.INVIDIOUS_INSTANCES, DEFAULT_INVIDIOUS);

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

interface ProviderResponse<T> {
  body: T;
  /** Origin of the instance that answered; needed to resolve relative URLs. */
  origin: string;
}

/** One attempt against one instance. Throws on any unusable answer. */
async function fetchFromInstance<T>(
  provider: ProviderInstance,
  path: string,
  signal: AbortSignal,
): Promise<ProviderResponse<T>> {
  const response = await fetch(`${provider.origin}${path}`, {
    headers: { Accept: "application/json" },
    signal,
    cache: "no-store",
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  // A web frontend answers 200 with HTML. Without this check the JSON parse
  // would throw somewhere far less obvious.
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("json")) throw new Error(`non-JSON (${contentType || "no content type"})`);

  const body: unknown = await response.json();

  // Both Piped and Invidious report upstream failures as 200 + {error}.
  // Treating that as success would pin us to a broken instance.
  if (body && typeof body === "object" && "error" in body) {
    const detail = (body as { error?: unknown }).error;
    throw new Error(typeof detail === "string" ? detail.slice(0, 120) : "provider reported an error");
  }

  return { body: body as T, origin: provider.origin };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Asks every configured instance, hedged, and returns the first usable answer.
 *
 * Previously this walked the list one instance at a time, each with its own
 * timeout. With four instances and a 15s timeout the worst case was a full
 * minute of waiting before reporting failure — and because these instances are
 * individually unreliable, the worst case happened often.
 *
 * Instead the first instance starts immediately and each subsequent one joins
 * `hedgeMs` later, so a healthy first instance still answers alone and costs
 * the others nothing, while a slow one no longer blocks the rest. The first
 * success wins and cancels the stragglers; `deadlineMs` bounds the whole thing
 * regardless of how many instances are configured.
 */
async function requestProvider<T>(
  path: string,
  kind: ProviderKind,
  {
    deadlineMs = requestTimeoutMs,
    hedgeMs = 2_000,
  }: { deadlineMs?: number; hedgeMs?: number } = {},
): Promise<ProviderResponse<T>> {
  const all = getConfiguredProviders().filter((provider) => provider.kind === kind);
  const available = all.filter(
    (provider) => (failedUntil.get(`${provider.kind}:${provider.origin}`) ?? 0) <= Date.now(),
  );

  // If every instance is inside its cooldown, try them anyway. The breaker
  // sheds load from a flaky instance onto a healthy sibling; with no sibling
  // left it would otherwise guarantee the failure it exists to avoid.
  const providers = available.length > 0 ? available : all;
  if (providers.length === 0) throw new Error("No provider instance is configured");

  // With a single instance there is nothing to fail over to, and the one that
  // still resolves streams fails transiently — observed returning HTTP 400 and
  // then succeeding minutes later, unchanged. A second staggered attempt at the
  // same instance is the only redundancy available, and it costs nothing when
  // the first attempt succeeds, because the winner cancels the straggler.
  const attempts = providers.length === 1 ? [providers[0], providers[0]] : providers;

  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), deadlineMs);

  try {
    return await Promise.any(
      attempts.map(async (provider, index) => {
        // Stagger the starts so a healthy first instance serves alone.
        if (index > 0) await sleep(index * hedgeMs);
        if (controller.signal.aborted) throw new Error("superseded");

        const key = `${provider.kind}:${provider.origin}`;
        try {
          const result = await fetchFromInstance<T>(provider, path, controller.signal);
          failedUntil.delete(key);
          return result;
        } catch (error) {
          // Losing a race is not evidence the instance is unhealthy.
          if (!controller.signal.aborted) failedUntil.set(key, Date.now() + 30_000);
          throw new Error(`${provider.origin}: ${error instanceof Error ? error.message : "failed"}`);
        }
      }),
    );
  } catch (error) {
    const reasons =
      error instanceof AggregateError
        ? error.errors.map((e) => (e instanceof Error ? e.message : String(e))).join("; ")
        : String(error);
    throw new Error(`No ${kind} instance answered: ${reasons}`.slice(0, 300));
  } finally {
    clearTimeout(deadline);
    // Cancel any straggler still in flight once we have what we need.
    controller.abort();
  }
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

/** Keeps long compilations off the Songs tab; other tabs stay unfiltered. */
function isReasonableForFilter(track: Track, filter: SearchFilter): boolean {
  if (filter !== "music_songs") return true;
  // A live stream has no meaningful duration, so never exclude one on length.
  if (track.isLive || track.durationSeconds == null) return true;
  return track.durationSeconds <= MAX_SONG_SECONDS;
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

/**
 * Records what the caller was searching for on every result.
 *
 * The distinction is load-bearing at playback time, not just in the UI: a
 * "video" already has footage and must play its own upload, while a "song" is
 * usually a still image and needs a music-video lookup before it can be watched.
 */
function tagKind(tracks: Track[], filter: SearchFilter): Track[] {
  const kind = filter === "music_songs" ? "song" : filter === "videos" ? "video" : undefined;
  if (!kind) return tracks;
  return tracks.map((track) => ({ ...track, kind }));
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
    const { body } = await requestProvider<PipedSearchResponse>(
      `/search?q=${encodeURIComponent(normalizedQuery)}&filter=${encodeURIComponent(PIPED_FILTERS[filter])}`,
      "piped",
    );
    anyProviderResponded = true;
    const results = unwrapPipedSearch(body)
      .map(normalizePipedTrack)
      .filter((track): track is Track => track !== null)
      .filter((track) => isReasonableForFilter(track, filter));
    if (results.length > 0) return tagKind(results, filter);
    failures.push("piped:empty");
  } catch (error) {
    failures.push(`piped:${error instanceof Error ? error.message : "unknown"}`);
  }

  try {
    const { body: invidious } = await requestProvider<InvidiousSearchItem[]>(
      `/api/v1/search?q=${encodeURIComponent(normalizedQuery)}&type=video`,
      "invidious",
    );
    anyProviderResponded = true;
    const results = invidious
      .map(normalizeInvidiousTrack)
      .filter((track): track is Track => track !== null)
      .filter((track) => isReasonableForFilter(track, filter));
    if (results.length > 0) return tagKind(results, filter);
    failures.push("invidious:empty");
  } catch (error) {
    failures.push(`invidious:${error instanceof Error ? error.message : "unknown"}`);
  }

  console.warn("Search returned nothing:", failures.join("; "));
  if (!anyProviderResponded) throw new ProvidersUnavailableError(failures);
  return [];
}

export interface SplitSearchResults {
  songs: Track[];
  videos: Track[];
}

/**
 * Songs and videos for one query, fetched together.
 *
 * Two searches rather than one filtered list, because the provider's own
 * "music_songs" and "videos" filters return genuinely different catalogues —
 * the first is the audio release, the second the artist's upload. Running them
 * concurrently costs the same wall-clock as running one, since the hedging in
 * requestProvider already overlaps instances.
 *
 * Either half may legitimately be empty; only a total failure of both throws.
 */
export async function searchSplit(query: string): Promise<SplitSearchResults> {
  const [songs, videos] = await Promise.allSettled([
    searchTracks(query, "music_songs"),
    searchTracks(query, "videos"),
  ]);

  if (songs.status === "rejected" && videos.status === "rejected") {
    throw songs.reason instanceof Error ? songs.reason : new Error("Search failed");
  }

  const songResults = songs.status === "fulfilled" ? songs.value : [];
  // The same upload showing up under both headings reads as a duplicate bug.
  const songIds = new Set(songResults.map((track) => track.sourceId));
  const videoResults = (videos.status === "fulfilled" ? videos.value : []).filter(
    (track) => !songIds.has(track.sourceId),
  );

  return { songs: songResults, videos: videoResults };
}

/**
 * Finds the real music video for a track.
 *
 * A music search mostly returns YouTube Art Tracks — the auto-generated
 * "<artist> - Topic" uploads, which are one still image plus audio. They are
 * ideal for listening and useless for watching, so video mode looks up the
 * artist's actual upload instead.
 *
 * Returns null when nothing convincing is found; the caller then keeps playing
 * what it already had rather than substituting something wrong.
 */
export async function findMusicVideo(
  artist: string,
  title: string,
  durationSeconds?: number,
): Promise<Track | null> {
  const cleanArtist = artist.replace(/\s*-\s*Topic\s*$/i, "").trim();
  const candidates = await searchTracks(`${cleanArtist} ${title}`, "videos");

  const scored = candidates
    .filter((track) => !/-\s*Topic$/i.test(track.artist))
    // A compilation is never the video for one song.
    .filter((track) => (track.durationSeconds ?? 0) <= MAX_SONG_SECONDS)
    .map((track) => {
      let score = 0;
      const haystack = track.title.toLowerCase();

      // Duration is the strongest signal that this is the same recording.
      if (durationSeconds && track.durationSeconds) {
        const drift = Math.abs(track.durationSeconds - durationSeconds);
        if (drift <= 3) score += 50;
        else if (drift <= 10) score += 35;
        else if (drift <= 25) score += 15;
        else score -= 25;
      }

      if (track.artist.toLowerCase() === cleanArtist.toLowerCase()) score += 30;
      else if (track.artist.toLowerCase().includes(cleanArtist.toLowerCase())) score += 15;

      if (/official\s*(music\s*)?video/.test(haystack)) score += 25;
      if (haystack.includes(title.toLowerCase())) score += 10;

      // These are re-uploads or the wrong recording, not the video.
      if (/(lyrics?|lyric video|official audio|audio only)/.test(haystack)) score -= 30;
      if (/(cover|remix|karaoke|instrumental|reaction|tutorial|8d|slowed|sped up)/.test(haystack)) score -= 40;
      if (/(live|concert|tour)/.test(haystack) && !/live/i.test(title)) score -= 20;

      return { track, score };
    })
    .sort((left, right) => right.score - left.score);

  const best = scored[0];
  // Below this the match is a guess, and playing the wrong song is worse than
  // leaving the still image in place.
  return best && best.score >= 30 ? best.track : null;
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
    const { body: response } = await requestProvider<PipedStreamResponse>(
      `/streams/${encodeURIComponent(videoId)}`,
      "piped",
    );
    const related = (response.relatedStreams ?? [])
      .map(normalizePipedTrack)
      .filter((track): track is Track => track !== null);
    if (related.length) return related;
  } catch {
    // Fall through to Invidious.
  }

  try {
    const { body: video } = await requestProvider<InvidiousVideoResponse>(
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
    const { body } = await requestProvider<string[] | { suggestions?: string[] }>(
      `/suggestions?query=${encodeURIComponent(trimmed)}`,
      "piped",
    );
    const suggestions = Array.isArray(body) ? body : (body.suggestions ?? []);
    if (suggestions.length) return suggestions.slice(0, 8);
  } catch {
    // Fall through to Invidious.
  }

  try {
    const { body } = await requestProvider<{ suggestions?: string[] }>(
      `/api/v1/search/suggestions?q=${encodeURIComponent(trimmed)}`,
      "invidious",
    );
    return (body.suggestions ?? []).slice(0, 8);
  } catch {
    return [];
  }
}

/**
 * Picks the muxed (video+audio) rendition for video playback.
 *
 * Only muxed formats are usable here. Adaptive video renditions carry no audio
 * and would need Media Source Extensions to be stitched to a separate audio
 * track — far more machinery than a 360p music video warrants.
 */
function selectMuxedStream(streams: InvidiousFormatStream[]): InvidiousFormatStream | undefined {
  return streams
    .filter((stream) => Boolean(stream.url) && /video/i.test(`${stream.type ?? ""}${stream.mimeType ?? ""}`))
    .sort((left, right) => Number(right.bitrate ?? 0) - Number(left.bitrate ?? 0))[0];
}

export async function getAudioStream(videoId: string, mode: PlaybackMode = "audio"): Promise<AudioStream> {
  if (!/^[\w-]{6,}$/.test(videoId)) throw new Error("Invalid video ID");

  // Invidious is tried first, for both modes.
  //
  // Piped hands back direct upstream URLs, which are refused with 403 for most
  // uploads, and its /streams endpoint has been answering HTTP 500 besides — so
  // leading with it spent seconds on a guaranteed failure before reaching the
  // provider that works. It stays on as a fallback in case that changes.
  try {
    return await getInvidiousStream(videoId, mode);
  } catch (invidiousError) {
    console.warn(
      `Invidious stream resolution failed for ${videoId}:`,
      invidiousError instanceof Error ? invidiousError.message : invidiousError,
    );
  }

  try {
    if (mode === "video") throw new Error("Piped cannot supply a muxed rendition");
    const { body: response } = await requestProvider<PipedStreamResponse>(
      `/streams/${encodeURIComponent(videoId)}`,
      "piped",
      { deadlineMs: pipedStreamDeadlineMs },
    );

    const hlsUrl = response.hls;
    if (hlsUrl) {
      return {
        trackId: `youtube:${videoId}`,
        url: hlsUrl,
        mimeType: "application/vnd.apple.mpegurl",
        isHls: true,
        isLive: response.isLive ?? true,
        durationSeconds: response.duration,
        kind: mode,
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
        kind: "audio",
      };
    }
  } catch {
    // Both providers are exhausted.
  }

  throw new Error("No provider instance could resolve a stream for this track");
}

async function getInvidiousStream(videoId: string, mode: PlaybackMode): Promise<AudioStream> {
  // `local=true` asks the instance to serve the media from its own domain
  // instead of handing back a direct googlevideo URL.
  //
  // This is what makes playback work at all. Direct URLs are refused with 403
  // for a large share of uploads — every auto-generated "- Topic" upload, which
  // is most of what a music search returns — because the upstream only honours
  // them for the session that extracted them. Proxied through the instance, the
  // same track returns 206 and plays. Audio still travels browser -> instance,
  // never through this deployment.
  const { body: video, origin } = await requestProvider<InvidiousVideoResponse>(
    `/api/v1/videos/${encodeURIComponent(videoId)}?local=true`,
    "invidious",
    { deadlineMs: streamDeadlineMs },
  );

  /** Instances may return proxy URLs relative to their own origin. */
  const absolute = (url: string) => (url.startsWith("http") ? url : `${origin}${url.startsWith("/") ? "" : "/"}${url}`);

  const durationSeconds = typeof video.lengthSeconds === "number" ? video.lengthSeconds : undefined;

  const hlsUrl = video.hlsUrl;
  if (hlsUrl) {
    // HLS carries video already, so it satisfies either mode.
    return {
      trackId: `youtube:${videoId}`,
      url: absolute(hlsUrl),
      mimeType: "application/vnd.apple.mpegurl",
      isHls: true,
      isLive: Boolean(video.liveNow),
      durationSeconds,
      kind: mode,
    };
  }

  if (mode === "video") {
    const muxed = selectMuxedStream(video.formatStreams ?? []);
    if (muxed?.url) {
      return {
        trackId: `youtube:${videoId}`,
        url: absolute(muxed.url),
        mimeType: muxed.mimeType ?? muxed.type ?? "video/mp4",
        bitrate: Number(muxed.bitrate) || undefined,
        quality: muxed.quality,
        qualityLabel: muxed.qualityLabel ?? muxed.quality,
        isHls: false,
        isLive: Boolean(video.liveNow),
        durationSeconds,
        kind: "video",
      };
    }
    // No muxed rendition: fall through to audio so playback still happens.
    // The caller sees kind: "audio" and can tell the listener why.
  }

  const audioStreams = (video.adaptiveFormats ?? [])
    .filter((stream) => Boolean(stream.url) && /audio/i.test(stream.type ?? "") && !/video/i.test(stream.type ?? ""))
    .sort((left, right) => streamScoreForInvidious(right) - streamScoreForInvidious(left));

  const selected = audioStreams[0];
  if (!selected?.url) throw new Error("Provider returned no playable audio stream");

  return {
    trackId: `youtube:${videoId}`,
    url: absolute(selected.url),
    mimeType: selected.mimeType ?? "audio/mp4",
    codec: selected.audioQuality,
    bitrate: selected.bitrate,
    quality: selected.quality,
    isHls: false,
    isLive: Boolean(video.liveNow),
    durationSeconds,
    kind: "audio",
  };
}
