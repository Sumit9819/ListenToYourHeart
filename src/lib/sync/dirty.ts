"use client";

import { musicDatabase } from "@/lib/db/database";
import type { SyncKind } from "@/lib/sync/types";

/**
 * A one-way notification that the local library changed.
 *
 * The sync engine needs to know when to push, and the library module needs to
 * say so — but the engine reads the library, so having the library import the
 * engine would be a cycle. This tiny registry sits below both of them instead.
 */
let listener: (() => void) | null = null;

export function onLibraryChanged(callback: () => void): () => void {
  listener = callback;
  return () => {
    if (listener === callback) listener = null;
  };
}

export function libraryChanged(): void {
  listener?.();
}

/** Records a deletion so it can be replayed on other devices. */
export async function recordDeletion(kind: SyncKind, itemId: string): Promise<void> {
  try {
    await musicDatabase.tombstones.put({
      key: `${kind}:${itemId}`,
      kind,
      itemId,
      deletedAt: Date.now(),
    });
  } catch {
    // A missed tombstone costs a resurrected row, not a broken library.
  }
}
