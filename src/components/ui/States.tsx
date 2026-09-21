"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/** Row-shaped shimmer used while a track list loads. */
export function TrackRowSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="space-y-1" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex items-center gap-4 rounded-xl p-2">
          <div className="skeleton h-12 w-12 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="skeleton h-3.5 rounded" style={{ width: `${55 + ((index * 13) % 35)}%` }} />
            <div className="skeleton h-3 rounded" style={{ width: `${30 + ((index * 7) % 25)}%` }} />
          </div>
          <div className="skeleton h-3 w-10 rounded" />
        </div>
      ))}
    </div>
  );
}

/** Card-shaped shimmer used while a shelf loads. */
export function CardShelfSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="space-y-3">
          <div className="skeleton aspect-square rounded-card" />
          <div className="skeleton h-3.5 w-4/5 rounded" />
          <div className="skeleton h-3 w-3/5 rounded" />
        </div>
      ))}
    </div>
  );
}

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  message: string;
  action?: ReactNode;
}

export function EmptyState({ icon: Icon, title, message, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line px-6 py-16 text-center">
      <div className="mb-4 grid h-14 w-14 place-items-center rounded-full bg-surface-raised">
        <Icon size={24} className="text-ink-faint" />
      </div>
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm text-ink-muted">{message}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorNotice({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200"
    >
      <p className="min-w-0 flex-1">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="shrink-0 font-semibold underline underline-offset-4">
          Try again
        </button>
      )}
    </div>
  );
}
