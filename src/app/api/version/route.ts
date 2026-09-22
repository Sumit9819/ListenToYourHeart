import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Which deploy is actually serving right now.
 *
 * Paired with the build id compiled into the browser bundle, this is how the
 * diagnostics page detects a stale cache: same value means the visitor has the
 * current code, different means their browser kept an older copy.
 */
export function GET() {
  return NextResponse.json(
    { buildId: process.env.VERCEL_GIT_COMMIT_SHA ?? "dev" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
