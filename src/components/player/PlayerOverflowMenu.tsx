"use client";

import { Moon, MoreHorizontal, PictureInPicture2, Repeat, Shuffle } from "lucide-react";
import { Menu, type MenuItem } from "@/components/ui/Menu";
import { usePlayerStore } from "@/store/playerStore";
import { useUiStore } from "@/store/uiStore";

const SLEEP_MINUTES = 30;

/**
 * Secondary player controls.
 *
 * The right-hand strip had grown to seven controls in a row, which is where the
 * layout started colliding — the queue badge was landing on the volume slider.
 * Only controls used mid-listen stay inline; the rest live here.
 */
export function PlayerOverflowMenu() {
  const sleepTimerEndsAt = usePlayerStore((state) => state.sleepTimerEndsAt);
  const setSleepTimer = usePlayerStore((state) => state.setSleepTimer);
  const togglePictureInPicture = usePlayerStore((state) => state.togglePictureInPicture);
  const playbackMode = usePlayerStore((state) => state.playbackMode);
  const hasVideo = usePlayerStore((state) => state.hasVideo);
  const isShuffled = usePlayerStore((state) => state.isShuffled);
  const repeatMode = usePlayerStore((state) => state.repeatMode);
  const toggleShuffle = usePlayerStore((state) => state.toggleShuffle);
  const cycleRepeat = usePlayerStore((state) => state.cycleRepeat);
  const pushToast = useUiStore((state) => state.pushToast);

  const items: MenuItem[] = [
    {
      label: "Picture in picture",
      icon: PictureInPicture2,
      when: playbackMode === "video" && hasVideo,
      onSelect: togglePictureInPicture,
    },
    {
      label: isShuffled ? "Shuffle: on" : "Shuffle: off",
      icon: Shuffle,
      onSelect: toggleShuffle,
    },
    {
      label: `Repeat: ${repeatMode}`,
      icon: Repeat,
      onSelect: cycleRepeat,
    },
    {
      label: sleepTimerEndsAt ? "Cancel sleep timer" : `Sleep timer (${SLEEP_MINUTES} min)`,
      icon: Moon,
      onSelect: () => {
        if (sleepTimerEndsAt) {
          setSleepTimer(null);
          pushToast("Sleep timer cancelled");
          return;
        }
        setSleepTimer(SLEEP_MINUTES);
        pushToast(`Playback stops in ${SLEEP_MINUTES} minutes`, "success");
      },
    },
  ];

  return (
    <Menu
      items={items}
      label="More player controls"
      trigger={({ toggle, ref, open }) => (
        <button
          ref={ref}
          onClick={toggle}
          aria-label="More player controls"
          aria-expanded={open}
          className={`shrink-0 rounded-full p-2 transition ${
            open || sleepTimerEndsAt ? "text-accent" : "text-ink-muted hover:text-ink"
          }`}
        >
          <MoreHorizontal size={18} />
        </button>
      )}
    />
  );
}
