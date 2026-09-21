import { NextResponse } from "next/server";
import { auth, ensureAuthSchema } from "@/lib/auth/server";

export const runtime = "nodejs";
// Sign-in state is per request by definition; nothing here may be cached.
export const dynamic = "force-dynamic";

/**
 * Better Auth's own handler, behind a configuration check.
 *
 * `auth.handler` is used directly rather than `toNextJsHandler`, because the
 * wrapper assumes the instance exists and this one is null on a deployment
 * without a database — the state the app ships in until the operator adds one.
 */
async function handle(request: Request): Promise<Response> {
  if (!auth) {
    return NextResponse.json(
      { error: "Accounts are not configured for this deployment." },
      { status: 501, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    await ensureAuthSchema();
  } catch (error) {
    console.error("Auth schema migration failed:", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: "The accounts database could not be prepared." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  return auth.handler(request);
}

export const GET = handle;
export const POST = handle;
