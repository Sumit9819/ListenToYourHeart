import "server-only";

import { Pool } from "pg";

/**
 * The optional cloud half of the library.
 *
 * Everything here is gated on environment variables being present. With none
 * set the app is exactly what it was — a local-first player whose library
 * lives in the browser and needs no account — and every accounts route answers
 * "not configured" instead of crashing the deployment. That matters because
 * the app is deployed before the database exists, not after.
 */
const connectionString = process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? "";

export const accountsEnabled = Boolean(
  connectionString &&
    process.env.BETTER_AUTH_SECRET &&
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET,
);

/** Which required variables are missing, for the health endpoint to report. */
export function missingAccountsConfig(): string[] {
  const required = {
    DATABASE_URL: connectionString,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  };
  return Object.entries(required)
    .filter(([, value]) => !value)
    .map(([name]) => name);
}

const isLocal = /localhost|127\.0\.0\.1|sslmode=disable/.test(connectionString);

/**
 * One pool per server instance.
 *
 * A serverless function may be frozen and thawed many times, so the cap is
 * deliberately small: every warm instance holds its slice of the database's
 * connection limit. Hosted Postgres with a pooler (Neon, Supabase) is what
 * makes this safe at more than a handful of instances.
 */
const globalScope = globalThis as typeof globalThis & { __lyhPool?: Pool };

export function getPool(): Pool | null {
  if (!connectionString) return null;
  if (globalScope.__lyhPool) return globalScope.__lyhPool;

  const pool = new Pool({
    connectionString,
    ssl: isLocal ? undefined : { rejectUnauthorized: true },
    max: 3,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 8_000,
  });
  // An idle client dropped by the provider must not take the process with it.
  pool.on("error", (error) => console.warn("Postgres pool error:", error.message));
  globalScope.__lyhPool = pool;
  return pool;
}

/**
 * The one table the app itself owns.
 *
 * A single generic row shape rather than a table per feature: the server never
 * interprets a playlist, it only stores the newest version of an opaque row and
 * whether it was deleted. That keeps conflict resolution to one rule —
 * last write wins, by the row's own timestamp — for every kind of saved thing.
 */
const SCHEMA = `
  create table if not exists library_item (
    user_id    text    not null,
    kind       text    not null,
    item_id    text    not null,
    payload    jsonb,
    updated_at bigint  not null,
    deleted    boolean not null default false,
    primary key (user_id, kind, item_id)
  );
  create index if not exists library_item_cursor on library_item (user_id, updated_at);
`;

let schemaReady: Promise<void> | null = null;

/** Creates the app's own table once per server instance. */
export function ensureLibrarySchema(): Promise<void> {
  const pool = getPool();
  if (!pool) return Promise.resolve();
  // Cached as a promise so concurrent requests during a cold start share one
  // round trip rather than each issuing their own CREATE TABLE.
  schemaReady ??= pool
    .query(SCHEMA)
    .then(() => undefined)
    .catch((error: unknown) => {
      schemaReady = null;
      throw error;
    });
  return schemaReady;
}
