"use client";

import { AlertTriangle, RotateCw } from "lucide-react";
import { useEffect } from "react";

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Route error:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line px-6 py-20 text-center">
      <div className="mb-4 grid h-14 w-14 place-items-center rounded-full bg-danger/15">
        <AlertTriangle size={24} className="text-danger" />
      </div>
      <h1 className="text-lg font-semibold">Something went wrong on this page</h1>
      <p className="mt-2 max-w-md text-sm text-ink-muted">
        Your music keeps playing. Reloading this view usually clears it; if it persists, a public provider instance may
        be down.
      </p>
      <button
        onClick={reset}
        className="mt-6 inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-accent-ink transition hover:opacity-90"
      >
        <RotateCw size={16} />
        Try again
      </button>
    </div>
  );
}
