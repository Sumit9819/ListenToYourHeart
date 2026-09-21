"use client";

import { ListPlus, Play, Search, SearchX, Shuffle } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { TrackList } from "@/components/track/TrackList";
import { VideoCard } from "@/components/track/VideoCard";
import { ErrorNotice, EmptyState, TrackRowSkeleton } from "@/components/ui/States";
import { useLikedIds, useRecentSearches } from "@/hooks/useLibrary";
import { formatTotalRuntime, pluralize } from "@/lib/format";
import { usePlayerStore } from "@/store/playerStore";
import { useUiStore } from "@/store/uiStore";
import type { Track } from "@/types/music";

/** Which catalogue the page is showing. Not the provider's filter names. */
type Tab = "all" | "songs" | "videos";

const TABS: Array<{ value: Tab; label: string }> = [
  { value: "all", label: "All" },
  { value: "songs", label: "Songs" },
  { value: "videos", label: "Videos" },
];

/** How many songs the combined tab shows before the videos start. */
const SONGS_ON_ALL_TAB = 6;

interface SearchOutcome {
  /** The query+tab pair this outcome belongs to. */
  key: string;
  songs: Track[];
  videos: Track[];
  error: string | null;
}

function VideoGrid({ tracks, origin }: { tracks: Track[]; origin: string }) {
  const likedIds = useLikedIds();
  return (
    <div className="grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {tracks.map((track, index) => (
        <VideoCard
          key={`${track.id}-${index}`}
          track={track}
          context={tracks}
          origin={origin}
          isLiked={likedIds.has(track.id)}
        />
      ))}
    </div>
  );
}

export function SearchResults() {
  const searchParams = useSearchParams();
  const query = searchParams.get("q") ?? "";
  const [tab, setTab] = useState<Tab>("all");
  const [outcome, setOutcome] = useState<SearchOutcome | null>(null);
  /** Bumped by the retry button to force the effect to run again. */
  const [attempt, setAttempt] = useState(0);

  const playQueue = usePlayerStore((state) => state.playQueue);
  const addToQueue = usePlayerStore((state) => state.addToQueue);
  const toggleShuffle = usePlayerStore((state) => state.toggleShuffle);
  const isShuffled = usePlayerStore((state) => state.isShuffled);
  const pushToast = useUiStore((state) => state.pushToast);
  const { data: recentSearches } = useRecentSearches();

  const isQueryValid = query.trim().length >= 2;
  const key = `${attempt}|${tab}|${query}`;
  // Derived rather than stored: an outcome from an older key means the current
  // search is still in flight.
  const isLoading = isQueryValid && outcome?.key !== key;

  useEffect(() => {
    if (!isQueryValid) return;
    const controller = new AbortController();

    // The combined tab needs both catalogues, which the route fetches
    // concurrently; a single-type tab asks for just that one.
    const url =
      tab === "all"
        ? `/api/search?q=${encodeURIComponent(query)}&split=1`
        : `/api/search?q=${encodeURIComponent(query)}&filter=${tab === "songs" ? "music_songs" : "videos"}`;

    fetch(url, { signal: controller.signal })
      .then(async (response) => {
        const body = (await response.json()) as {
          tracks?: Track[];
          songs?: Track[];
          videos?: Track[];
          error?: string;
        };
        const flat = body.tracks ?? [];
        setOutcome({
          key,
          songs: body.songs ?? (tab === "songs" ? flat : []),
          videos: body.videos ?? (tab === "videos" ? flat : []),
          error: response.ok ? null : (body.error ?? "Search is temporarily unavailable."),
        });
      })
      .catch((error: Error) => {
        if (error.name === "AbortError") return;
        setOutcome({
          key,
          songs: [],
          videos: [],
          error: "Search failed. The public provider instances may be down right now.",
        });
      });

    return () => controller.abort();
  }, [key, query, tab, isQueryValid]);

  if (!isQueryValid) {
    return (
      <>
        <h1 className="mb-6 text-2xl font-bold tracking-tight sm:text-3xl">Search</h1>
        {(recentSearches?.length ?? 0) > 0 ? (
          <div>
            <h2 className="mb-3 text-sm font-semibold text-ink-muted">Recent searches</h2>
            <div className="flex flex-wrap gap-2">
              {recentSearches?.map((term) => (
                <a
                  key={term}
                  href={`/search?q=${encodeURIComponent(term)}`}
                  className="rounded-full border border-line bg-surface-raised px-4 py-2 text-sm transition hover:border-accent/40 hover:bg-white/[0.06]"
                >
                  {term}
                </a>
              ))}
            </div>
          </div>
        ) : (
          <EmptyState
            icon={Search}
            title="What do you want to hear?"
            message="Type an artist, a song or an album into the field above. Results come from public media provider instances, so nothing you search is tied to an account."
          />
        )}
      </>
    );
  }

  const current = outcome?.key === key ? outcome : null;
  const songs = current?.songs ?? [];
  const videos = current?.videos ?? [];
  const error = current?.error ?? null;
  const origin = `Search: ${query}`;

  // What the bulk actions operate on: whatever the visible tab is showing.
  const primary = tab === "videos" ? videos : songs;
  const total = songs.length + videos.length;

  return (
    <>
      <header className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Results for <span className="text-accent">{query}</span>
        </h1>
        {total > 0 && (
          <p className="mt-1 text-sm text-ink-muted">
            {pluralize(total, "result")}
            {formatTotalRuntime(primary) && ` · ${formatTotalRuntime(primary)}`}
          </p>
        )}
      </header>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        {TABS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            aria-pressed={tab === value}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
              tab === value
                ? "bg-ink text-surface"
                : "border border-line bg-surface-raised text-ink-muted hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}

        {primary.length > 0 && (
          <div className="ml-auto flex gap-2">
            <button
              onClick={() => playQueue(primary, 0, origin)}
              className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-accent-ink transition hover:opacity-90"
            >
              <Play size={15} fill="currentColor" />
              Play all
            </button>
            <button
              onClick={() => {
                if (!isShuffled) toggleShuffle();
                playQueue(primary, Math.floor(Math.random() * primary.length), origin);
              }}
              aria-label="Shuffle these results"
              className="inline-flex items-center gap-2 rounded-full border border-line px-4 py-1.5 text-sm font-medium transition hover:bg-white/10"
            >
              <Shuffle size={15} />
              <span className="hidden sm:inline">Shuffle</span>
            </button>
            <button
              onClick={() => {
                addToQueue(primary);
                pushToast(`${pluralize(primary.length, "song")} added to the queue`, "success");
              }}
              aria-label="Add all results to the queue"
              className="inline-flex items-center gap-2 rounded-full border border-line px-4 py-1.5 text-sm font-medium transition hover:bg-white/10"
            >
              <ListPlus size={15} />
              <span className="hidden sm:inline">Queue</span>
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="mb-5">
          <ErrorNotice message={error} onRetry={() => setAttempt((value) => value + 1)} />
        </div>
      )}

      {isLoading ? (
        <TrackRowSkeleton count={8} />
      ) : total > 0 ? (
        <div className="space-y-9">
          {songs.length > 0 && (
            <section>
              {tab === "all" && (
                <div className="mb-3 flex items-baseline justify-between gap-3">
                  <h2 className="text-lg font-bold">Songs</h2>
                  {songs.length > SONGS_ON_ALL_TAB && (
                    <button onClick={() => setTab("songs")} className="text-sm font-medium text-accent hover:underline">
                      Show all {songs.length}
                    </button>
                  )}
                </div>
              )}
              <TrackList
                tracks={tab === "all" ? songs.slice(0, SONGS_ON_ALL_TAB) : songs}
                origin={origin}
              />
            </section>
          )}

          {videos.length > 0 && (
            <section>
              {tab === "all" && (
                <div className="mb-3 flex items-baseline justify-between gap-3">
                  <h2 className="text-lg font-bold">Videos</h2>
                  <button onClick={() => setTab("videos")} className="text-sm font-medium text-accent hover:underline">
                    Show all {videos.length}
                  </button>
                </div>
              )}
              <VideoGrid tracks={videos} origin={origin} />
            </section>
          )}
        </div>
      ) : (
        !error && (
          <EmptyState
            icon={SearchX}
            title="No results"
            message="Nothing came back for that search. Try a different spelling, or switch to the All tab."
          />
        )
      )}
    </>
  );
}
