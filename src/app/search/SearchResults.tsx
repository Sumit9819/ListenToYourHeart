"use client";

import { ListPlus, Play, Search, SearchX, Shuffle } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { TrackList } from "@/components/track/TrackList";
import { ErrorNotice, EmptyState, TrackRowSkeleton } from "@/components/ui/States";
import { useRecentSearches } from "@/hooks/useLibrary";
import { formatTotalRuntime, pluralize } from "@/lib/format";
import { usePlayerStore } from "@/store/playerStore";
import { useUiStore } from "@/store/uiStore";
import type { SearchFilter, Track } from "@/types/music";

const FILTERS: Array<{ value: SearchFilter; label: string }> = [
  { value: "music_songs", label: "Songs" },
  { value: "videos", label: "Videos" },
  { value: "all", label: "Everything" },
];

interface SearchOutcome {
  /** The query+filter pair this outcome belongs to. */
  key: string;
  tracks: Track[];
  error: string | null;
}

export function SearchResults() {
  const searchParams = useSearchParams();
  const query = searchParams.get("q") ?? "";
  const [filter, setFilter] = useState<SearchFilter>("music_songs");
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
  const key = `${attempt}|${filter}|${query}`;
  // Derived rather than stored: an outcome from an older key means the current
  // search is still in flight.
  const isLoading = isQueryValid && outcome?.key !== key;

  useEffect(() => {
    if (!isQueryValid) return;
    const controller = new AbortController();

    fetch(`/api/search?q=${encodeURIComponent(query)}&filter=${filter}`, { signal: controller.signal })
      .then(async (response) => {
        const body = (await response.json()) as { tracks?: Track[]; error?: string };
        setOutcome({
          key,
          tracks: body.tracks ?? [],
          error: response.ok ? null : (body.error ?? "Search is temporarily unavailable."),
        });
      })
      .catch((error: Error) => {
        if (error.name === "AbortError") return;
        setOutcome({
          key,
          tracks: [],
          error: "Search failed. The public provider instances may be down right now.",
        });
      });

    return () => controller.abort();
  }, [key, query, filter, isQueryValid]);

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

  const tracks = outcome?.key === key ? outcome.tracks : [];
  const error = outcome?.key === key ? outcome.error : null;

  return (
    <>
      <header className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Results for <span className="text-accent">{query}</span>
        </h1>
        {tracks.length > 0 && (
          <p className="mt-1 text-sm text-ink-muted">
            {pluralize(tracks.length, "result")}
            {formatTotalRuntime(tracks) && ` · ${formatTotalRuntime(tracks)}`}
          </p>
        )}
      </header>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        {FILTERS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setFilter(value)}
            aria-pressed={filter === value}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
              filter === value
                ? "bg-ink text-surface"
                : "border border-line bg-surface-raised text-ink-muted hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}

        {tracks.length > 0 && (
          <div className="ml-auto flex gap-2">
            <button
              onClick={() => playQueue(tracks, 0, `Search: ${query}`)}
              className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-accent-ink transition hover:opacity-90"
            >
              <Play size={15} fill="currentColor" />
              Play all
            </button>
            <button
              onClick={() => {
                if (!isShuffled) toggleShuffle();
                playQueue(tracks, Math.floor(Math.random() * tracks.length), `Search: ${query}`);
              }}
              aria-label="Shuffle these results"
              className="inline-flex items-center gap-2 rounded-full border border-line px-4 py-1.5 text-sm font-medium transition hover:bg-white/10"
            >
              <Shuffle size={15} />
              <span className="hidden sm:inline">Shuffle</span>
            </button>
            <button
              onClick={() => {
                addToQueue(tracks);
                pushToast(`${pluralize(tracks.length, "song")} added to the queue`, "success");
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
        <TrackRowSkeleton count={10} />
      ) : tracks.length > 0 ? (
        <TrackList tracks={tracks} origin={`Search: ${query}`} />
      ) : (
        !error && (
          <EmptyState
            icon={SearchX}
            title="No results"
            message="Nothing came back for that search. Try a different spelling, or switch the filter to Everything."
          />
        )
      )}
    </>
  );
}
