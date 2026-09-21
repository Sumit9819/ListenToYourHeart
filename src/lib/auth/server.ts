import "server-only";

import { betterAuth } from "better-auth";
import { accountsEnabled, getPool } from "@/lib/db/cloud";

/**
 * Where the OAuth round trip comes back to.
 *
 * Google validates the redirect URI exactly, so this has to match what is
 * registered in the Google console. Vercel supplies the production hostname,
 * but a preview deployment gets a new one every push, which is why an explicit
 * BETTER_AUTH_URL takes priority.
 */
function resolveBaseUrl(): string | undefined {
  if (process.env.BETTER_AUTH_URL) return process.env.BETTER_AUTH_URL;
  const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  return vercelHost ? `https://${vercelHost}` : undefined;
}

/**
 * Null until the deployment has a database and Google credentials.
 *
 * Every caller checks. The alternative — constructing this unconditionally —
 * throws at import time, which would take down search and playback too, and
 * those have nothing to do with accounts.
 */
export const auth = accountsEnabled
  ? betterAuth({
      database: getPool() ?? undefined,
      baseURL: resolveBaseUrl(),
      secret: process.env.BETTER_AUTH_SECRET,
      // Google only. Passwords would mean owning password reset, breach
      // response and rate limiting for a music player's favorites list.
      emailAndPassword: { enabled: false },
      socialProviders: {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID as string,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
        },
      },
      session: {
        expiresIn: 60 * 60 * 24 * 60,
        updateAge: 60 * 60 * 24,
        // Serves the session from a signed cookie for a few minutes, so the
        // common case of "who is this" costs no database round trip.
        cookieCache: { enabled: true, maxAge: 5 * 60 },
      },
    })
  : null;

export type AppAuth = NonNullable<typeof auth>;

let authSchemaReady: Promise<void> | null = null;

/**
 * Creates Better Auth's own tables on first use.
 *
 * Normally this is the `better-auth` CLI's job, run by hand against the
 * database. Doing it here removes a setup step that is easy to skip and whose
 * omission looks exactly like a broken sign-in button. The plan is a no-op
 * once the tables exist, so the cost after the first cold start is one query.
 */
export function ensureAuthSchema(): Promise<void> {
  if (!auth) return Promise.resolve();
  authSchemaReady ??= (async () => {
    const { getMigrations } = await import("better-auth/db/migration");
    const { runMigrations } = await getMigrations(auth.options);
    await runMigrations();
  })().catch((error: unknown) => {
    authSchemaReady = null;
    throw error;
  });
  return authSchemaReady;
}

/** The signed-in user's id, or null. Never throws on a missing session. */
export async function currentUserId(request: Request): Promise<string | null> {
  if (!auth) return null;
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    return session?.user.id ?? null;
  } catch {
    return null;
  }
}
