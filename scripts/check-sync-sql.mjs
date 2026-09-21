/**
 * Executes the sync route's SQL against a real Postgres.
 *
 * PGlite is the Postgres engine compiled to WebAssembly, so these are the
 * actual statements running through the actual planner — not a mock. It exists
 * because the sync rules (last write wins, tombstones, per-account isolation,
 * a cursor that terminates) live in SQL, and a type checker cannot tell you
 * whether an ON CONFLICT clause resolves a conflict the way you meant.
 *
 *   node scripts/check-sync-sql.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** The two statements, read from the source so they cannot drift from it. */
function extract(file, marker, opener = "`", closer = "`") {
  const source = readFileSync(join(root, file), "utf8");
  const after = source.split(marker)[1];
  if (after === undefined) throw new Error(`Could not find ${marker} in ${file}`);
  return after.split(opener)[1].split(closer)[0];
}

const SCHEMA = extract("src/lib/db/cloud.ts", "const SCHEMA =");
const routeSource = readFileSync(join(root, "src/app/api/sync/route.ts"), "utf8");
const UPSERT = routeSource.split("`insert into library_item")[1].split("`")[0];
const SELECT = routeSource.split("`select kind, item_id")[1].split("`")[0];

let failures = 0;
function check(label, condition, detail = "") {
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.error(`  FAIL ${label} ${detail}`);
  }
}

const db = new PGlite();

const push = (userId, items) =>
  db.query(`insert into library_item${UPSERT}`, [
    userId,
    items.map((item) => item.kind),
    items.map((item) => item.itemId),
    items.map((item) => (item.deleted ? null : JSON.stringify(item.payload ?? null))),
    items.map((item) => Math.floor(item.updatedAt)),
    items.map((item) => item.deleted),
  ]);

const pull = async (userId, since) =>
  (await db.query(`select kind, item_id${SELECT}`, [userId, since, 2000])).rows;

const row = (kind, itemId, updatedAt, payload, deleted = false) => ({ kind, itemId, updatedAt, payload, deleted });

console.log("sync SQL");

await db.exec(SCHEMA);
await db.exec(SCHEMA);
check("the schema is idempotent", true);

// One device saves a playlist, a track in it and a favorite.
await push("user-1", [
  row("playlist", "pl_1", 1000, { id: "pl_1", name: "Road trip" }),
  row("playlist_track", "pl_1::youtube:abc", 1000, { position: 1024 }),
  row("liked", "youtube:abc", 1000, { likedAt: 1000 }),
]);
check("a batch insert stores every row", (await pull("user-1", 0)).length === 3);

// A second device renames it; the first then replays its stale copy.
await push("user-1", [row("playlist", "pl_1", 2000, { id: "pl_1", name: "Road trip 2026" })]);
await push("user-1", [row("playlist", "pl_1", 1000, { id: "pl_1", name: "Road trip" })]);
const renamed = (await pull("user-1", 0)).find((entry) => entry.kind === "playlist");
check("a replayed older write never overwrites a newer one", renamed.payload.name === "Road trip 2026", renamed.payload.name);

const incremental = await pull("user-1", 1000);
check("a pull since T returns only rows newer than T", incremental.length === 1 && incremental[0].item_id === "pl_1");

await push("user-1", [row("liked", "youtube:abc", 3000, null, true)]);
const deleted = (await pull("user-1", 2000)).find((entry) => entry.kind === "liked");
check("a delete is stored as a tombstone, not a missing row", deleted?.deleted === true && deleted.payload === null);

check("one account cannot see another's rows", (await pull("user-2", 0)).length === 0);

// The cursor the route hands back must make the next pull terminate.
const all = await pull("user-1", 0);
const serverTime = Number(all[all.length - 1].updated_at);
check("the returned cursor drains the queue", (await pull("user-1", serverTime)).length === 0, `cursor=${serverTime}`);

// A first sync of a real library is one statement, not one per row.
const batch = Array.from({ length: 1500 }, (_, index) =>
  row("history", `youtube:t${index}`, 4000 + index, { playedAt: 4000 + index }),
);
const started = Date.now();
await push("user-1", batch);
const elapsed = Date.now() - started;
check(`a 1500-row library syncs in one statement (${elapsed}ms)`, (await pull("user-1", 3999)).length === 1500);

await db.close();

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nall sync SQL checks passed");
