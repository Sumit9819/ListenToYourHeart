import { NextResponse } from "next/server";
import { currentUserId, ensureAuthSchema } from "@/lib/auth/server";
import { accountsEnabled, ensureLibrarySchema, getPool } from "@/lib/db/cloud";
import type { SyncItem, SyncKind, SyncRequest, SyncResponse } from "@/lib/sync/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const KINDS: SyncKind[] = ["playlist", "playlist_track", "liked", "history"];
/** Enough for a large library in one call, small enough to stay under limits. */
const MAX_ITEMS = 2_000;

const NO_STORE = { "Cache-Control": "no-store" };

function isSyncItem(value: unknown): value is SyncItem {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Partial<SyncItem>;
  return (
    typeof item.itemId === "string" &&
    item.itemId.length > 0 &&
    item.itemId.length <= 512 &&
    typeof item.updatedAt === "number" &&
    Number.isFinite(item.updatedAt) &&
    typeof item.deleted === "boolean" &&
    KINDS.includes(item.kind as SyncKind)
  );
}

/**
 * One round trip: push local changes, pull everything newer than `since`.
 *
 * Combining the two halves is what keeps the client simple — there is no
 * window between "my changes are up" and "their changes are down" in which a
 * third device can interleave and leave the two sides disagreeing about the
 * cursor.
 */
export async function POST(request: Request): Promise<Response> {
  if (!accountsEnabled) {
    return NextResponse.json({ error: "Accounts are not configured." }, { status: 501, headers: NO_STORE });
  }

  const userId = await currentUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Sign in to sync your library." }, { status: 401, headers: NO_STORE });
  }

  let body: SyncRequest;
  try {
    body = (await request.json()) as SyncRequest;
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400, headers: NO_STORE });
  }

  const since = Number.isFinite(body?.since) ? Math.max(0, Math.floor(body.since)) : 0;
  const incoming = Array.isArray(body?.items) ? body.items.filter(isSyncItem).slice(0, MAX_ITEMS) : [];

  const pool = getPool();
  if (!pool) {
    return NextResponse.json({ error: "Accounts are not configured." }, { status: 501, headers: NO_STORE });
  }

  try {
    await Promise.all([ensureAuthSchema(), ensureLibrarySchema()]);

    if (incoming.length > 0) {
      // One statement for the whole batch: unnest turns the arrays into rows,
      // so a hundred favorites cost one round trip rather than a hundred.
      await pool.query(
        `insert into library_item (user_id, kind, item_id, payload, updated_at, deleted)
         select $1, k, i, p::jsonb, u, d
           from unnest($2::text[], $3::text[], $4::text[], $5::bigint[], $6::boolean[]) as t(k, i, p, u, d)
         on conflict (user_id, kind, item_id) do update
           set payload    = excluded.payload,
               updated_at = excluded.updated_at,
               deleted    = excluded.deleted
           -- Last write wins, and an older copy arriving late never
           -- overwrites a newer one. This is what makes the push idempotent.
           where excluded.updated_at > library_item.updated_at`,
        [
          userId,
          incoming.map((item) => item.kind),
          incoming.map((item) => item.itemId),
          incoming.map((item) => (item.deleted ? null : JSON.stringify(item.payload ?? null))),
          incoming.map((item) => Math.floor(item.updatedAt)),
          incoming.map((item) => item.deleted),
        ],
      );
    }

    const { rows } = await pool.query<{
      kind: SyncKind;
      item_id: string;
      payload: unknown;
      updated_at: string;
      deleted: boolean;
    }>(
      `select kind, item_id, payload, updated_at, deleted
         from library_item
        where user_id = $1 and updated_at > $2
        order by updated_at asc
        limit $3`,
      [userId, since, MAX_ITEMS],
    );

    const response: SyncResponse = {
      items: rows.map((row) => ({
        kind: row.kind,
        itemId: row.item_id,
        payload: row.payload,
        // bigint arrives as a string from node-postgres, by design: it will
        // not silently lose precision on the way into a JS number.
        updatedAt: Number(row.updated_at),
        deleted: row.deleted,
      })),
      // The newest row actually returned, not the wall clock: a row written
      // while this query ran would otherwise be skipped forever.
      serverTime: rows.length ? Number(rows[rows.length - 1].updated_at) : since,
    };

    return NextResponse.json(response, { headers: NO_STORE });
  } catch (error) {
    console.error("Sync failed:", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: "Your library could not be synced right now." },
      { status: 503, headers: NO_STORE },
    );
  }
}
