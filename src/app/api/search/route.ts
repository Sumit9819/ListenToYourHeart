import { NextResponse } from "next/server";
import { searchTracks } from "@/lib/providers/piped";
import type { SearchFilter } from "@/types/music";

export const runtime = "nodejs";

const ALLOWED_FILTERS: SearchFilter[] = ["all", "music_songs", "videos", "playlists"];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") ?? "";
  const requested = searchParams.get("filter") as SearchFilter | null;
  const filter: SearchFilter = requested && ALLOWED_FILTERS.includes(requested) ? requested : "music_songs";

  if (query.trim().length < 2) {
    return NextResponse.json({ error: "Search query must contain at least two characters." }, { status: 400 });
  }

  try {
    const tracks = await searchTracks(query, filter);
    return NextResponse.json(
      { tracks },
      // Identical searches within the minute reuse the edge response.
      { headers: { "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300" } },
    );
  } catch (error) {
    console.warn("Search failed:", error instanceof Error ? error.message : error);
    return NextResponse.json(
      {
        tracks: [],
        error:
          "No search provider could be reached. Check /api/health to see which instances are failing from this deployment.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
