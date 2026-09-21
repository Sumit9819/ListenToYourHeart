/** Formats seconds as m:ss, or h:mm:ss once the track runs past an hour. */
export function formatDuration(totalSeconds: number | undefined | null): string {
  if (totalSeconds == null || !Number.isFinite(totalSeconds) || totalSeconds < 0) return "--:--";
  const seconds = Math.floor(totalSeconds % 60);
  const minutes = Math.floor((totalSeconds / 60) % 60);
  const hours = Math.floor(totalSeconds / 3600);
  const paddedSeconds = String(seconds).padStart(2, "0");
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${paddedSeconds}`;
  return `${minutes}:${paddedSeconds}`;
}

/** "3 songs" / "1 song" — used wherever a count is rendered next to a noun. */
export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function formatRelativeTime(timestamp: number): string {
  const deltaSeconds = Math.round((Date.now() - timestamp) / 1000);
  const thresholds: Array<[number, Intl.RelativeTimeFormatUnit]> = [
    [60, "second"],
    [3600, "minute"],
    [86_400, "hour"],
    [604_800, "day"],
    [2_629_800, "week"],
    [31_557_600, "month"],
  ];
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  let previousLimit = 1;
  for (const [limit, unit] of thresholds) {
    if (deltaSeconds < limit) return formatter.format(-Math.floor(deltaSeconds / previousLimit), unit);
    previousLimit = limit;
  }
  return formatter.format(-Math.floor(deltaSeconds / 31_557_600), "year");
}

/** Total runtime of a list of tracks, e.g. "1 hr 24 min". */
export function formatTotalRuntime(tracks: Array<{ durationSeconds?: number }>): string {
  const total = tracks.reduce((sum, track) => sum + (track.durationSeconds ?? 0), 0);
  if (total <= 0) return "";
  const hours = Math.floor(total / 3600);
  const minutes = Math.round((total % 3600) / 60);
  if (hours > 0) return `${hours} hr ${minutes} min`;
  return `${minutes} min`;
}

/**
 * Provider titles are noisy ("Song (Official Music Video) [HD]"). Strip the
 * decoration so shelves and the player bar stay readable.
 */
export function cleanTrackTitle(title: string): string {
  return title
    .replace(/\s*[([][^)\]]*(official|lyric|audio|video|hd|4k|mv|visualizer|explicit)[^)\]]*[)\]]/gi, "")
    .replace(/\s*[|-]\s*(official\s+)?(music\s+)?video\s*$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim() || title;
}

/** YouTube channel names often carry a "- Topic" suffix on auto-generated art. */
export function cleanArtistName(artist: string): string {
  return artist.replace(/\s*-\s*Topic\s*$/i, "").trim() || artist;
}
