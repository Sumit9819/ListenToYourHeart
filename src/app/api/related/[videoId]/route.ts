import { NextResponse } from "next/server";
import { getRelatedTracks } from "@/lib/providers/piped";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ videoId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { videoId } = await context.params;

  try {
    return NextResponse.json(
      { tracks: await getRelatedTracks(videoId) },
      { headers: { "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=900" } },
    );
  } catch {
    // Autoplay is optional; an empty list degrades gracefully.
    return NextResponse.json({ tracks: [] });
  }
}
