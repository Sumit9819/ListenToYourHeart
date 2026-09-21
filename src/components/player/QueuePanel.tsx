"use client";

import { GripVertical, ListMusic, Trash2, X } from "lucide-react";
import { useRef } from "react";
import { Artwork } from "@/components/ui/Artwork";
import { EmptyState } from "@/components/ui/States";
import { cleanArtistName, cleanTrackTitle, formatDuration } from "@/lib/format";
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
  const order = usePlayerStore((state) => state.order);
  const currentIndex = usePlayerStore((state) => state.currentIndex);
  const queueOrigin = usePlayerStore((state) => state.queueOrigin);
  const { jumpTo, removeFromQueue, moveInQueue, clearQueue } = usePlayerStore.getState();

  const dragFrom = useRef<number | null>(null);
  const position = order.indexOf(currentIndex);
  const upcoming = position >= 0 ? order.slice(position + 1) : order;
  const nowPlaying = queue[currentIndex];

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
          {nowPlaying && (
            <section className="mb-4">
              <h3 className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
                Now playing
              </h3>
              <div className="flex items-center gap-3 rounded-xl bg-white/[0.07] px-2 py-2">
                <Artwork src={nowPlaying.albumArtUrl} className="h-10 w-10" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-accent">{cleanTrackTitle(nowPlaying.title)}</p>
                  <p className="truncate text-xs text-ink-muted">{cleanArtistName(nowPlaying.artist)}</p>
                </div>
              </div>
            </section>
          )}

          <h3 className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
            Next in queue
          </h3>

          {upcoming.length === 0 ? (
            <EmptyState
              icon={ListMusic}
              title="Nothing queued"
              message="Use the track menu to add songs here, or turn on repeat to loop what is playing."
            />
          ) : (
            <div className="space-y-0.5">
              {upcoming.map((queueIndex) => {
                const track = queue[queueIndex];
                if (!track) return null;
                return (
                  <div
                    key={`${track.id}-${queueIndex}`}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", String(queueIndex));
                      dragFrom.current = queueIndex;
                    }}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      const from = dragFrom.current;
                      dragFrom.current = null;
                      if (from !== null && from !== queueIndex) moveInQueue(from, queueIndex);
                    }}
                    className="group flex items-center gap-2 rounded-xl px-1 py-1.5 transition hover:bg-white/[0.05]"
                  >
                    <GripVertical
                      size={15}
                      className="shrink-0 cursor-grab text-ink-faint opacity-0 transition group-hover:opacity-100"
                      aria-hidden="true"
                    />
                    <button onClick={() => jumpTo(queueIndex)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                      <Artwork src={track.albumArtUrl} className="h-9 w-9" rounded="rounded-md" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{cleanTrackTitle(track.title)}</span>
                        <span className="block truncate text-xs text-ink-faint">{cleanArtistName(track.artist)}</span>
                      </span>
                    </button>
                    <span className="shrink-0 text-xs tabular-nums text-ink-faint">
                      {formatDuration(track.durationSeconds)}
                    </span>
                    <button
                      onClick={() => removeFromQueue(queueIndex)}
                      aria-label={`Remove ${cleanTrackTitle(track.title)} from the queue`}
                      className="shrink-0 rounded-full p-1.5 text-ink-faint opacity-0 transition hover:text-danger group-hover:opacity-100 focus-visible:opacity-100"
                    >
                      <X size={15} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
