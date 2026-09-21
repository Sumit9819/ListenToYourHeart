import { NextResponse } from "next/server";
import { findMusicVideo } from "@/lib/providers/piped";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Resolves a track to its real music video, for video mode.
 *
 * Kept separate from /api/streams because it changes *which* video plays, not
 * just which rendition — the caller needs to know that substitution happened.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const artist = searchParams.get("artist") ?? "";
  const title = searchParams.get("title") ?? "";
  const duration = Number(searchParams.get("duration")) || undefined;

  if (!artist.trim() || !title.trim()) {
    return NextResponse.json({ error: "artist and title are required." }, { status: 400 });
  }

  try {
    const track = await findMusicVideo(artist, title, duration);
    return NextResponse.json(
      { track },
      { headers: { "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400" } },
    );
  } catch {
    // No video is a normal outcome, not an error worth failing the request for.
    return NextResponse.json({ track: null });
  }
}
