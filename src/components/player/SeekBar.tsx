"use client";

import { useCallback, useRef, useState } from "react";
import { formatDuration } from "@/lib/format";
import { usePlayerStore } from "@/store/playerStore";

/**
 * Scrub bar with a buffered-ahead indicator and a hover time preview.
 *
 * While the user is dragging, the local `scrubTime` wins over the store so the
 * handle tracks the pointer instead of snapping back on each `timeupdate`.
 */
export function SeekBar({ compact = false }: { compact?: boolean }) {
  const currentTime = usePlayerStore((state) => state.currentTime);
  const duration = usePlayerStore((state) => state.duration);
  const bufferedTo = usePlayerStore((state) => state.bufferedTo);
  const seek = usePlayerStore((state) => state.seek);
  const hasTrack = usePlayerStore((state) => state.currentIndex >= 0);

  const trackRef = useRef<HTMLDivElement>(null);
  const [scrubTime, setScrubTime] = useState<number | null>(null);
  const [hoverRatio, setHoverRatio] = useState<number | null>(null);

  const effectiveTime = scrubTime ?? currentTime;
  const progress = duration > 0 ? Math.min(effectiveTime / duration, 1) : 0;
  const buffered = duration > 0 ? Math.min(bufferedTo / duration, 1) : 0;

  const ratioFromEvent = useCallback((clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    return Math.max(0, Math.min((clientX - rect.left) / rect.width, 1));
  }, []);

  const beginScrub = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!duration) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setScrubTime(ratioFromEvent(event.clientX) * duration);
  };

  return (
    <div className={`flex w-full items-center gap-2 ${compact ? "" : "sm:gap-3"}`}>
      {!compact && (
        <span className="w-10 shrink-0 text-right text-[11px] tabular-nums text-ink-faint">
          {formatDuration(effectiveTime)}
        </span>
      )}

      <div
        ref={trackRef}
        role="slider"
        tabIndex={hasTrack ? 0 : -1}
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration) || 0}
        aria-valuenow={Math.round(effectiveTime)}
        aria-valuetext={`${formatDuration(effectiveTime)} of ${formatDuration(duration)}`}
        aria-disabled={!hasTrack}
        onPointerDown={beginScrub}
        onPointerMove={(event) => {
          const ratio = ratioFromEvent(event.clientX);
          setHoverRatio(ratio);
          if (scrubTime !== null) setScrubTime(ratio * duration);
        }}
        onPointerUp={(event) => {
          if (scrubTime === null) return;
          event.currentTarget.releasePointerCapture(event.pointerId);
          seek(scrubTime);
          setScrubTime(null);
        }}
        onPointerLeave={() => setHoverRatio(null)}
        onKeyDown={(event) => {
          if (!duration) return;
          const step = event.shiftKey ? 30 : 5;
          if (event.key === "ArrowRight") {
            event.preventDefault();
            seek(currentTime + step);
          }
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            seek(currentTime - step);
          }
          if (event.key === "Home") {
            event.preventDefault();
            seek(0);
          }
          if (event.key === "End") {
            event.preventDefault();
            seek(duration);
          }
        }}
        className="group relative h-6 min-w-0 flex-1 cursor-pointer touch-none select-none"
      >
        {/* The visual bar is thin, but the hit area above stays finger-sized. */}
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-white/15">
          <div className="h-full rounded-full bg-white/25 transition-[width]" style={{ width: `${buffered * 100}%` }} />
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-accent"
            style={{ width: `${progress * 100}%` }}
          />
        </div>

        <div
          className={`absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent shadow transition-opacity ${
            scrubTime !== null ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
          }`}
          style={{ left: `${progress * 100}%` }}
        />

        {hoverRatio !== null && duration > 0 && (
          <span
            className="pointer-events-none absolute bottom-full mb-1 -translate-x-1/2 rounded bg-surface-overlay px-1.5 py-0.5 text-[11px] tabular-nums text-ink shadow"
            style={{ left: `${hoverRatio * 100}%` }}
          >
            {formatDuration(hoverRatio * duration)}
          </span>
        )}
      </div>

      {!compact && (
        <span className="w-10 shrink-0 text-[11px] tabular-nums text-ink-faint">{formatDuration(duration)}</span>
      )}
    </div>
  );
}
