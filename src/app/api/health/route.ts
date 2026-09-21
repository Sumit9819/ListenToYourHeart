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

  return NextResponse.json(
    {
      healthy: healthy.length,
      total: instances.length,
      searchWorks: healthy.length > 0,
      instances,
      hint:
        healthy.length > 0
          ? undefined
          : "No configured instance responded. Set PIPED_INSTANCES / INVIDIOUS_INSTANCES to instances reachable from this deployment.",
    },
    { status: healthy.length > 0 ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
