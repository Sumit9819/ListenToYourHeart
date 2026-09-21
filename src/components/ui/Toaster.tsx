"use client";

import { AlertCircle, Check, Info, X } from "lucide-react";
import { useUiStore } from "@/store/uiStore";

const TONE_ICON = {
  info: Info,
  success: Check,
  error: AlertCircle,
} as const;

const TONE_CLASS = {
  info: "text-ink-muted",
  success: "text-emerald-400",
  error: "text-danger",
} as const;

/** Bottom-left toast stack, kept clear of the player bar. */
export function Toaster() {
  const toasts = useUiStore((state) => state.toasts);
  const dismissToast = useUiStore((state) => state.dismissToast);

  if (!toasts.length) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-32 left-1/2 z-60 flex w-[calc(100vw-2rem)] max-w-sm -translate-x-1/2 flex-col gap-2 sm:left-5 sm:translate-x-0 lg:bottom-28"
    >
      {toasts.map((toast) => {
        const Icon = TONE_ICON[toast.tone];
        return (
          <div
            key={toast.id}
            className="pointer-events-auto flex animate-rise items-center gap-3 rounded-xl border border-line bg-surface-overlay px-4 py-3 text-sm shadow-xl"
          >
            <Icon size={16} className={TONE_CLASS[toast.tone]} />
            <p className="min-w-0 flex-1">{toast.message}</p>
            {toast.action && (
              <button
                onClick={() => {
                  toast.action?.run();
                  dismissToast(toast.id);
                }}
                className="shrink-0 font-semibold text-accent hover:underline"
              >
                {toast.action.label}
              </button>
            )}
            <button
              onClick={() => dismissToast(toast.id)}
              aria-label="Dismiss notification"
              className="shrink-0 text-ink-faint transition hover:text-ink"
            >
              <X size={15} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
