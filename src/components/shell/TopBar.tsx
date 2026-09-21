"use client";

import { ChevronLeft, ChevronRight, Keyboard, Moon, Sun } from "lucide-react";
import { useRouter } from "next/navigation";
import { Suspense } from "react";
import { SearchBox } from "@/components/shell/SearchBox";
import { useUiStore } from "@/store/uiStore";

/**
 * Sticky header: history controls, global search and display settings.
 *
 * `SearchBox` reads `useSearchParams`, so it sits behind a Suspense boundary —
 * without one it would opt the whole route tree into client-side rendering.
 */
export function TopBar() {
  const router = useRouter();
  const theme = useUiStore((state) => state.theme);
  const toggleTheme = useUiStore((state) => state.toggleTheme);
  const setShortcutsOpen = useUiStore((state) => state.setShortcutsOpen);

  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-surface/85 px-4 py-3 backdrop-blur-xl sm:px-6">
      <div className="hidden shrink-0 items-center gap-1 lg:flex">
        <button
          onClick={() => router.back()}
          aria-label="Go back"
          className="grid h-8 w-8 place-items-center rounded-full bg-surface-raised text-ink-muted transition hover:text-ink"
        >
          <ChevronLeft size={18} />
        </button>
        <button
          onClick={() => router.forward()}
          aria-label="Go forward"
          className="grid h-8 w-8 place-items-center rounded-full bg-surface-raised text-ink-muted transition hover:text-ink"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="flex min-w-0 flex-1 justify-center lg:justify-start">
        <Suspense fallback={<div className="h-9 w-full max-w-xl rounded-full bg-surface-raised" />}>
          <SearchBox />
        </Suspense>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <button
          onClick={() => setShortcutsOpen(true)}
          aria-label="Keyboard shortcuts"
          className="hidden rounded-full p-2 text-ink-muted transition hover:bg-white/10 hover:text-ink sm:block"
        >
          <Keyboard size={18} />
        </button>
        <button
          onClick={toggleTheme}
          aria-label={theme === "dark" ? "Switch to the light theme" : "Switch to the dark theme"}
          className="rounded-full p-2 text-ink-muted transition hover:bg-white/10 hover:text-ink"
        >
          {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>
    </header>
  );
}
