"use client";

import { Clock, Search, TrendingUp, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { useRecentSearches } from "@/hooks/useLibrary";
import { recordSearch, removeSearch } from "@/lib/db/library";

/**
 * The global search field.
 *
 * Suggestions come from the provider; recent searches come from IndexedDB.
 * Navigation is a real route change to `/search?q=`, so results are linkable,
 * shareable and survive a reload.
 */
export function SearchBox() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlQuery = searchParams.get("q") ?? "";
  const [value, setValue] = useState(urlQuery);
  const [syncedQuery, setSyncedQuery] = useState(urlQuery);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const { data: recentSearches } = useRecentSearches();

  // Keep the field in step with the URL when the user navigates or goes back.
  // Adjusting during render (rather than in an effect) avoids a frame where
  // the field still shows the previous query.
  if (urlQuery !== syncedQuery) {
    setSyncedQuery(urlQuery);
    setValue(urlQuery);
  }

  useEffect(() => {
    const controller = new AbortController();
    // Every path updates state from inside the timer callback, never
    // synchronously in the effect body.
    const timer = window.setTimeout(async () => {
      const trimmed = value.trim();
      if (trimmed.length < 2) {
        setSuggestions([]);
        return;
      }
      try {
        const response = await fetch(`/api/suggestions?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
        });
        const body = (await response.json()) as { suggestions?: string[] };
        setSuggestions(body.suggestions ?? []);
      } catch {
        setSuggestions([]);
      }
    }, 180);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [value]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  // "/" focuses search from anywhere, the way every search-first app works.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "");
      if (event.key === "/" && !isTyping) {
        event.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const submit = (query: string) => {
    const trimmed = query.trim();
    if (trimmed.length < 2) return;
    void recordSearch(trimmed);
    setIsOpen(false);
    setActiveIndex(-1);
    inputRef.current?.blur();
    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
  };

  const options = value.trim().length >= 2 ? suggestions : (recentSearches ?? []);
  const showRecent = value.trim().length < 2;

  return (
    <div ref={containerRef} className="relative w-full max-w-xl">
      <form
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          submit(activeIndex >= 0 ? options[activeIndex] : value);
        }}
      >
        <div className="flex items-center gap-2.5 rounded-full border border-line bg-surface-raised px-4 py-2 transition focus-within:border-accent/60">
          <Search size={17} className="shrink-0 text-ink-faint" />
          <input
            ref={inputRef}
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              setIsOpen(true);
              setActiveIndex(-1);
            }}
            onFocus={() => setIsOpen(true)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" && options.length) {
                event.preventDefault();
                setIsOpen(true);
                setActiveIndex((index) => (index + 1) % options.length);
              }
              if (event.key === "ArrowUp" && options.length) {
                event.preventDefault();
                setActiveIndex((index) => (index - 1 + options.length) % options.length);
              }
              if (event.key === "Escape") {
                setIsOpen(false);
                setActiveIndex(-1);
              }
            }}
            type="search"
            role="combobox"
            placeholder="Search songs, artists, albums"
            aria-label="Search music"
            aria-autocomplete="list"
            aria-controls={listId}
            aria-expanded={isOpen && options.length > 0}
            enterKeyHint="search"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-faint [&::-webkit-search-cancel-button]:hidden"
          />
          {value && (
            <button
              type="button"
              onClick={() => {
                setValue("");
                inputRef.current?.focus();
              }}
              aria-label="Clear the search field"
              className="shrink-0 rounded-full p-0.5 text-ink-faint transition hover:text-ink"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </form>

      {isOpen && options.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-full z-50 mt-2 max-h-80 animate-rise overflow-y-auto rounded-2xl border border-line bg-surface-overlay p-1.5 shadow-2xl"
        >
          {showRecent && (
            <li className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
              Recent searches
            </li>
          )}
          {options.map((option, index) => (
            <li key={option} role="option" aria-selected={index === activeIndex}>
              <div
                className={`flex items-center gap-3 rounded-lg transition ${index === activeIndex ? "bg-white/10" : ""}`}
              >
                <button
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => submit(option)}
                  className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2 text-left text-sm"
                >
                  {showRecent ? (
                    <Clock size={15} className="shrink-0 text-ink-faint" />
                  ) : (
                    <TrendingUp size={15} className="shrink-0 text-ink-faint" />
                  )}
                  <span className="truncate">{option}</span>
                </button>
                {showRecent && (
                  <button
                    onClick={() => void removeSearch(option)}
                    aria-label={`Remove "${option}" from recent searches`}
                    className="mr-2 shrink-0 rounded-full p-1 text-ink-faint transition hover:text-ink"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
