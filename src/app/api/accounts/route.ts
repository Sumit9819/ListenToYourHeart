import { NextResponse } from "next/server";
import { accountsEnabled, missingAccountsConfig } from "@/lib/db/cloud";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Whether this deployment has accounts wired up.
 *
 * The browser cannot read server environment variables, and rendering a
 * sign-in button that can only ever fail is worse than rendering none. The
 * list of missing variables is included because it is a deployment detail, not
 * a secret — and it turns "sign-in does nothing" into a one-line diagnosis.
 */
export function GET() {
  return NextResponse.json(
    { enabled: accountsEnabled, missing: missingAccountsConfig() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
