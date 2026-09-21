"use client";

import { Heart, History, ListMusic, Play, Search, Shuffle, Sparkles } from "lucide-react";
import Link from "next/link";
import { useMemo, useSyncExternalStore } from "react";
import { TrackCard } from "@/components/track/TrackCard";
import { Artwork } from "@/components/ui/Artwork";
import { CardShelfSkeleton, EmptyState } from "@/components/ui/States";
import { CardGrid, Shelf } from "@/components/ui/Shelf";
import { useHistory, useLikedTracks, usePlaylists, useTopTracks } from "@/hooks/useLibrary";
import { pluralize } from "@/lib/format";
import { usePlayerStore } from "@/store/playerStore";
import type { Track } from "@/types/music";

function greetingForHour(hour: number): string {
  if (hour < 5) return "Still up?";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/**
 * The server and the visitor are rarely in the same timezone, so reading the
 * clock while rendering produced two different greetings and a hydration
 * mismatch (React error #418). useSyncExternalStore exists for exactly this:
 * it takes a separate server snapshot, so both renders emit the same markup and
 * the real greeting appears on hydration.
 */
function useGreeting(): string {
  return useSyncExternalStore(
    // The greeting never changes while the page is open.
    () => () => {},
    // Client: the real greeting. Stable for the whole hour, so it is a valid
    // snapshot to compare against.
    () => greetingForHour(new Date().getHours()),
    // Server: a neutral heading, so both renders emit the same markup.
    () => "Welcome back",
  );
}

/** Quick-access tiles: the three things a returning listener reaches for. */
function QuickTiles({ likedCount, historyCount }: { likedCount: number; historyCount: number }) {
  const tiles = [
    { href: "/liked", label: "Favorites", meta: pluralize(likedCount, "song"), icon: Heart, accent: true },
    { href: "/history", label: "Recently played", meta: pluralize(historyCount, "track"), icon: History, accent: false },
    { href: "/library", label: "Your library", meta: "Playlists and more", icon: ListMusic, accent: false },
  ] as const;

  return (
    <div className="mb-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {tiles.map(({ href, label, meta, icon: Icon, accent }) => (
        <Link
          key={href}
          href={href}
          className="group flex items-center gap-4 overflow-hidden rounded-xl border border-line bg-surface-raised pr-4 transition hover:border-accent/40 hover:bg-white/[0.06]"
        >
          <span
            className={`grid h-16 w-16 shrink-0 place-items-center ${
              accent ? "bg-accent/15 text-accent" : "bg-white/[0.06] text-ink-muted"
            }`}
          >
            <Icon size={22} fill={accent ? "currentColor" : "none"} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{label}</span>
            <span className="block truncate text-xs text-ink-faint">{meta}</span>
          </span>
        </Link>
      ))}
    </div>
  );
}

export default function HomePage() {
  const greeting = useGreeting();
  const { data: history, isLoading: historyLoading } = useHistory(24);
  const { data: liked } = useLikedTracks();
  const { data: topTracks } = useTopTracks(12);
  const { data: playlists } = usePlaylists();
  const playQueue = usePlayerStore((state) => state.playQueue);
  const toggleShuffle = usePlayerStore((state) => state.toggleShuffle);
  const isShuffled = usePlayerStore((state) => state.isShuffled);

  // History can list the same track many times; a shelf should not.
  const recentTracks = useMemo(() => {
    const seen = new Set<string>();
    const unique: Track[] = [];
    for (const row of history ?? []) {
      if (seen.has(row.trackId)) continue;
      seen.add(row.trackId);
      unique.push(row.track);
    }
    return unique.slice(0, 12);
  }, [history]);

  const isNewListener = !historyLoading && recentTracks.length === 0 && (liked?.length ?? 0) === 0;

  const shuffleFavorites = () => {
    if (!liked?.length) return;
    if (!isShuffled) toggleShuffle();
    playQueue(liked, Math.floor(Math.random() * liked.length), "Favorites");
  };

  return (
    <>
      <header className="mb-8">
        <p className="mb-1 text-xs font-semibold uppercase tracking-[0.2em] text-accent">Listen To Your Heart</p>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{greeting}</h1>
      </header>

      {isNewListener ? (
        <EmptyState
          icon={Sparkles}
          title="Your library starts empty"
          message="Search for a song to play it. Anything you favorite, queue or save to a playlist is stored in this browser, so it is here the next time you open the app."
          action={
            <Link
              href="/search"
              className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-accent-ink transition hover:opacity-90"
            >
              <Search size={16} />
              Find your first song
            </Link>
          }
        />
      ) : (
        <>
          <QuickTiles likedCount={liked?.length ?? 0} historyCount={history?.length ?? 0} />

          {(liked?.length ?? 0) > 0 && (
            <section className="mb-10 overflow-hidden rounded-2xl border border-line bg-gradient-to-br from-accent/15 via-surface-raised to-surface-raised p-5 sm:p-7">
              <div className="flex flex-wrap items-center gap-5">
                <div className="flex -space-x-4">
                  {liked?.slice(0, 3).map((track) => (
                    <Artwork
                      key={track.id}
                      src={track.albumArtUrl}
                      className="h-16 w-16 border-2 border-surface-raised sm:h-20 sm:w-20"
                      rounded="rounded-xl"
                    />
                  ))}
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-bold sm:text-xl">Your favorites</h2>
                  <p className="text-sm text-ink-muted">{pluralize(liked?.length ?? 0, "song")} you loved</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    onClick={() => liked && playQueue(liked, 0, "Favorites")}
                    className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-accent-ink transition hover:opacity-90"
                  >
                    <Play size={16} fill="currentColor" />
                    Play
                  </button>
                  <button
                    onClick={shuffleFavorites}
                    aria-label="Shuffle your favorites"
                    className="inline-flex items-center gap-2 rounded-full border border-line px-5 py-2.5 text-sm font-semibold transition hover:bg-white/10"
                  >
                    <Shuffle size={16} />
                    Shuffle
                  </button>
                </div>
              </div>
            </section>
          )}

          {historyLoading ? (
            <Shelf title="Jump back in">
              <CardShelfSkeleton />
            </Shelf>
          ) : (
            recentTracks.length > 0 && (
              <Shelf title="Jump back in" subtitle="Picked up where you left off" href="/history">
                <CardGrid>
                  {recentTracks.map((track, index) => (
                    <TrackCard
                      key={track.id}
                      track={track}
                      index={index}
                      context={recentTracks}
                      origin="Recently played"
                    />
                  ))}
                </CardGrid>
              </Shelf>
            )
          )}

          {(topTracks?.length ?? 0) > 3 && (
            <Shelf title="On repeat" subtitle="What you have played the most">
              <CardGrid>
                {topTracks?.map(({ track, playCount }, index) => (
                  <TrackCard
                    key={track.id}
                    track={track}
                    index={index}
                    context={topTracks.map((entry) => entry.track)}
                    origin="On repeat"
                    caption={`${pluralize(playCount, "play")} · ${track.artist}`}
                  />
                ))}
              </CardGrid>
            </Shelf>
          )}

          {(playlists?.length ?? 0) > 0 && (
            <Shelf title="Your playlists" href="/library">
              <CardGrid>
                {playlists?.slice(0, 6).map((playlist) => (
                  <Link key={playlist.id} href={`/playlist/${playlist.id}`} className="group">
                    <Artwork
                      src={playlist.coverUrl}
                      className="aspect-square w-full transition duration-300 group-hover:scale-105"
                      rounded="rounded-card"
                    />
                    <p className="mt-2.5 truncate text-sm font-medium">{playlist.name}</p>
                    <p className="truncate text-xs text-ink-muted">{pluralize(playlist.trackCount, "song")}</p>
                  </Link>
                ))}
              </CardGrid>
            </Shelf>
          )}
        </>
      )}
    </>
  );
}
