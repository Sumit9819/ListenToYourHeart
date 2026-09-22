import { NextResponse } from "next/server";
import { findAlternateUpload } from "@/lib/providers/piped";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Another upload of the same song, for when one will not extract.
 *
 * Separate from /api/music-video because the goal is the opposite: that route
 * looks for the artist's real footage, this one looks for the same audio from
 * a different source, and will refuse rather than substitute a cover.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const artist = searchParams.get("artist") ?? "";
  const title = searchParams.get("title") ?? "";
  const exclude = searchParams.get("exclude") ?? "";
  const duration = Number(searchParams.get("duration"));

  if (!title.trim() || !exclude.trim()) {
    return NextResponse.json({ track: null }, { status: 400 });
  }

  try {
    const track = await findAlternateUpload(
      artist,
      title,
      exclude,
      Number.isFinite(duration) && duration > 0 ? duration : undefined,
    );
    return NextResponse.json(
      { track },
      { headers: { "Cache-Control": "public, max-age=0, s-maxage=600, stale-while-revalidate=1800" } },
    );
  } catch {
    // This is a recovery path; failing it just means the original skip stands.
    return NextResponse.json({ track: null }, { headers: { "Cache-Control": "no-store" } });
  }
}
