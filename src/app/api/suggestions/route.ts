import { NextResponse } from "next/server";
import { getSuggestions } from "@/lib/providers/piped";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q") ?? "";
  if (query.trim().length < 2) return NextResponse.json({ suggestions: [] });

  return NextResponse.json(
    { suggestions: await getSuggestions(query) },
    { headers: { "Cache-Control": "public, max-age=0, s-maxage=600, stale-while-revalidate=3600" } },
  );
}
