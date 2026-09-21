"use client";

import { Trash2, X } from "lucide-react";
import { QueueList } from "@/components/player/QueueList";
import { usePlayerStore } from "@/store/playerStore";
import { useUiStore } from "@/store/uiStore";

/**
 * Side panel listing what plays next.
 *
 * The list follows the shuffle order rather than the raw queue, so what you
 * read is genuinely what you will hear.
 */
export function QueuePanel() {
  const isOpen = useUiStore((state) => state.isQueueOpen);
  const setQueueOpen = useUiStore((state) => state.setQueueOpen);

  const queue = usePlayerStore((state) => state.queue);
  const queueOrigin = usePlayerStore((state) => state.queueOrigin);
  const clearQueue = usePlayerStore((state) => state.clearQueue);

  if (!isOpen) return null;

  return (
    <>
      {/* Below xl the panel overlays the content, so it needs a scrim. */}
      <div
        className="fixed inset-0 z-40 bg-black/50 xl:hidden"
        onClick={() => setQueueOpen(false)}
        aria-hidden="true"
      />

      <aside
        aria-label="Playback queue"
        className="fixed bottom-14 right-0 top-0 z-50 flex w-full max-w-sm animate-rise flex-col border-l border-line bg-surface-raised sm:bottom-20 xl:bottom-24 xl:z-30"
      >
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">Up next</h2>
            {queueOrigin && <p className="truncate text-xs text-ink-faint">From {queueOrigin}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              onClick={clearQueue}
              aria-label="Clear the queue"
              disabled={!queue.length}
              className="rounded-full p-2 text-ink-muted transition hover:bg-white/10 hover:text-ink disabled:opacity-40"
            >
              <Trash2 size={16} />
            </button>
            <button
              onClick={() => setQueueOpen(false)}
              aria-label="Close the queue"
              className="rounded-full p-2 text-ink-muted transition hover:bg-white/10 hover:text-ink"
            >
              <X size={17} />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
          <QueueList />
        </div>
      </aside>
    </>
  );
}
