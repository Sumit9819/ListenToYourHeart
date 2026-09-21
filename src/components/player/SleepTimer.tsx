"use client";

import { Moon } from "lucide-react";
import { useCallback, useSyncExternalStore } from "react";
import { Menu, type MenuItem } from "@/components/ui/Menu";
import { usePlayerStore } from "@/store/playerStore";
import { useUiStore } from "@/store/uiStore";

const PRESETS = [15, 30, 45, 60];

/**
 * Shows the countdown once a timer is running, so it is never a mystery.
 *
 * The clock is an external mutable source, so it is read through
 * useSyncExternalStore rather than mirrored into state by an effect.
 */
function useCountdown(endsAt: number | null): string | null {
  const subscribe = useCallback((onChange: () => void) => {
    if (!endsAt) return () => {};
    const interval = window.setInterval(onChange, 1000);
    return () => window.clearInterval(interval);
  }, [endsAt]);

  // Truncated to whole seconds so the snapshot is stable within a render pass;
  // returning a raw timestamp would look like a change on every read.
  const nowSeconds = useSyncExternalStore(
    subscribe,
    () => Math.floor(Date.now() / 1000),
    () => 0,
  );

  if (!endsAt) return null;
  const remaining = Math.max(0, endsAt - nowSeconds * 1000);
  const minutes = Math.floor(remaining / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1000);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function SleepTimer() {
  const endsAt = usePlayerStore((state) => state.sleepTimerEndsAt);
  const setSleepTimer = usePlayerStore((state) => state.setSleepTimer);
  const pushToast = useUiStore((state) => state.pushToast);
  const countdown = useCountdown(endsAt);

  const items: MenuItem[] = [
    ...PRESETS.map((minutes) => ({
      label: `${minutes} minutes`,
      icon: Moon,
      onSelect: () => {
        setSleepTimer(minutes);
        pushToast(`Playback stops in ${minutes} minutes`, "success");
      },
    })),
    {
      label: "Cancel timer",
      icon: Moon,
      tone: "danger" as const,
      when: endsAt !== null,
      onSelect: () => {
        setSleepTimer(null);
        pushToast("Sleep timer cancelled");
      },
    },
  ];

  return (
    <Menu
      items={items}
      label="Sleep timer"
      trigger={({ toggle, ref, open }) => (
        <button
          ref={ref}
          onClick={toggle}
          aria-label={endsAt ? `Sleep timer: ${countdown} remaining` : "Set a sleep timer"}
          aria-expanded={open}
          className={`flex items-center gap-1.5 rounded-full px-2 py-2 transition ${
            endsAt ? "text-accent" : "text-ink-muted hover:text-ink"
          }`}
        >
          <Moon size={17} />
          {countdown && <span className="text-[11px] font-medium tabular-nums">{countdown}</span>}
        </button>
      )}
    />
  );
}
