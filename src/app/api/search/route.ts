import { NextResponse } from "next/server";
import { searchSplit, searchTracks } from "@/lib/providers/piped";
import type { SearchFilter } from "@/types/music";

export const runtime = "nodejs";

const ALLOWED_FILTERS: SearchFilter[] = ["all", "music_songs", "videos", "playlists"];

/** Identical searches within the minute reuse the edge response. */
const CACHE_HEADERS = { "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300" };

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") ?? "";
  const requested = searchParams.get("filter") as SearchFilter | null;
  const filter: SearchFilter = requested && ALLOWED_FILTERS.includes(requested) ? requested : "music_songs";
  // The combined tab needs both catalogues in one round trip; the single-type
  // tabs still return a flat list so nothing downstream has to branch.
  const wantsSplit = searchParams.get("split") === "1";

  if (query.trim().length < 2) {
    return NextResponse.json({ error: "Search query must contain at least two characters." }, { status: 400 });
  }

  try {
    if (wantsSplit) {
      const { songs, videos } = await searchSplit(query);
      return NextResponse.json({ songs, videos }, { headers: CACHE_HEADERS });
    }
    const tracks = await searchTracks(query, filter);
    return NextResponse.json({ tracks }, { headers: CACHE_HEADERS });
  } catch (error) {
    console.warn("Search failed:", error instanceof Error ? error.message : error);
    return NextResponse.json(
      {
        tracks: [],
        songs: [],
        videos: [],
        error:
          "No search provider could be reached. Check /api/health to see which instances are failing from this deployment.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
