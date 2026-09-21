import { NextResponse } from "next/server";
import { checkInstances } from "@/lib/providers/piped";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Reports which configured provider instances are reachable *from wherever this
 * is running*. Public instances frequently allow home IPs while blocking
 * datacenter ranges, so a local check proves nothing about production.
 */
export async function GET() {
  const instances = await checkInstances();
  const healthy = instances.filter((instance) => instance.ok);

  // "Nothing is configured" and "nothing is reachable" need different fixes,
  // so they must never look alike here.
  const hint =
    instances.length === 0
      ? "No instances are configured. PIPED_INSTANCES / INVIDIOUS_INSTANCES are set but empty, or contain no valid https origins. Remove them to use the built-in defaults."
      : healthy.length === 0
        ? "Every configured instance failed from this deployment. Public instances often allow home IPs while blocking datacenter ranges — see the per-instance status below."
        : undefined;

  return NextResponse.json(
    {
      healthy: healthy.length,
      configured: instances.length,
      searchWorks: healthy.length > 0,
      instances,
      hint,
    },
    { status: healthy.length > 0 ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
