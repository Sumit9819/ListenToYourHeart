"use client";

import { useEffect } from "react";
import { toggleVideoFullscreen } from "@/components/player/VideoStage";
import { toggleLike } from "@/lib/db/library";
import { usePlayerStore } from "@/store/playerStore";
import { useUiStore } from "@/store/uiStore";

export interface ShortcutHelp {
  keys: string[];
  description: string;
}

/** Single source of truth: the handler below and the help dialog both use it. */
export const SHORTCUTS: ShortcutHelp[] = [
  { keys: ["Space", "K"], description: "Play or pause" },
  { keys: ["J"], description: "Rewind 10 seconds" },
  { keys: ["L"], description: "Forward 10 seconds" },
  { keys: ["←", "→"], description: "Seek 5 seconds" },
  { keys: ["Shift", "←/→"], description: "Previous or next track" },
  { keys: ["↑", "↓"], description: "Volume up or down" },
  { keys: ["M"], description: "Mute or unmute" },
  { keys: ["S"], description: "Toggle shuffle" },
  { keys: ["R"], description: "Cycle repeat" },
  { keys: ["F"], description: "Fullscreen while watching, otherwise add to favorites" },
  { keys: ["Q"], description: "Toggle the queue" },
  { keys: ["N"], description: "Open the now playing view" },
  { keys: ["V"], description: "Switch between video and audio only" },
  { keys: ["P"], description: "Picture in picture (video mode)" },
  { keys: ["/"], description: "Focus the search field" },
  { keys: ["?"], description: "Show this list" },
];

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

export function useKeyboardShortcuts() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;

      const player = usePlayerStore.getState();
      const ui = useUiStore.getState();
      const key = event.key.toLowerCase();

      // A dialog owns Escape; everything else is fair game.
      switch (true) {
        case event.code === "Space" || key === "k":
          event.preventDefault();
          player.togglePlay();
          break;
        case key === "j":
          event.preventDefault();
          player.nudge(-10);
          break;
        case key === "l":
          event.preventDefault();
          player.nudge(10);
          break;
        case event.key === "ArrowRight":
          event.preventDefault();
          if (event.shiftKey) player.next();
          else player.nudge(5);
          break;
        case event.key === "ArrowLeft":
          event.preventDefault();
          if (event.shiftKey) player.previous();
          else player.nudge(-5);
          break;
        case event.key === "ArrowUp":
          event.preventDefault();
          player.setVolume(player.volume + 0.05);
          break;
        case event.key === "ArrowDown":
          event.preventDefault();
          player.setVolume(player.volume - 0.05);
          break;
        case key === "m":
          player.toggleMuted();
          break;
        case key === "s":
          player.toggleShuffle();
          ui.pushToast(usePlayerStore.getState().isShuffled ? "Shuffle on" : "Shuffle off");
          break;
        case key === "r":
          player.cycleRepeat();
          ui.pushToast(`Repeat: ${usePlayerStore.getState().repeatMode}`);
          break;
        case key === "f": {
          // While something is on screen, F means what it means in every video
          // player. Elsewhere it keeps its original meaning.
          if (player.playbackMode === "video" && player.hasVideo) {
            event.preventDefault();
            void toggleVideoFullscreen();
            break;
          }
          const track = player.queue[player.currentIndex];
          if (!track) break;
          void toggleLike(track).then((liked) =>
            ui.pushToast(liked ? "Added to favorites" : "Removed from favorites", "success"),
          );
          break;
        }
        case key === "q":
          ui.toggleQueue();
          break;
        case key === "n":
          if (player.currentIndex >= 0) ui.setNowPlayingOpen(true);
          break;
        case key === "v":
          player.togglePlaybackMode();
          ui.pushToast(
            usePlayerStore.getState().playbackMode === "video" ? "Video mode" : "Audio only",
            "success",
          );
          break;
        case key === "p":
          player.togglePictureInPicture();
          break;
        case event.key === "?":
          ui.setShortcutsOpen(true);
          break;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
