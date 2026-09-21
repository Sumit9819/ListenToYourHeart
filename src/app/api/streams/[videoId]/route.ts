import { NextResponse } from "next/server";
import { getAudioStream } from "@/lib/providers/piped";

export const runtime = "nodejs";
/**
 * Resolution can chain several instances before one answers, and the instance
 * that serves streams is noticeably slower from datacenter IPs than from a
 * home connection. The platform default is too tight for that worst case.
 */
export const maxDuration = 30;

type RouteContext = { params: Promise<{ videoId: string }> };

export async function GET(request: Request, context: RouteContext) {
  const { videoId } = await context.params;
  const mode = new URL(request.url).searchParams.get("mode") === "video" ? "video" : "audio";

  try {
    const stream = await getAudioStream(videoId, mode);
    return NextResponse.json(
      { stream },
      // Resolved URLs are signed and short-lived, so they must never be cached.
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    // Stream extraction is the fragile half of this app: public instances get
    // rate-limited or blocked by the upstream source far more often than they
    // fail to find a video. Name that cause rather than implying the track is
    // at fault, and log the provider's own words for debugging.
    console.warn(`Stream resolution failed for ${videoId}:`, error instanceof Error ? error.message : error);

    return NextResponse.json(
      {
        error:
          "No provider instance could resolve audio for this track. Public instances are frequently blocked by the upstream source — try another track, or point PIPED_INSTANCES at an instance that works for you.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
