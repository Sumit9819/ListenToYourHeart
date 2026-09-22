"use client";

import {
  Check,
  Gauge,
  Maximize,
  Minimize,
  Music2,
  Pause,
  PictureInPicture2,
  Play,
  Settings,
  SkipBack,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { SeekBar } from "@/components/player/SeekBar";
import { cleanArtistName, cleanTrackTitle, formatDuration } from "@/lib/format";
import { useCurrentTrack, usePlayerStore } from "@/store/playerStore";
import { useUiStore } from "@/store/uiStore";

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
/** How long the controls linger after the pointer stops moving. */
const HIDE_AFTER_MS = 2600;

/**
 * Resolution picker.
 *
 * Rendered inline rather than through the shared Menu, which portals to the
 * document body: in fullscreen the browser paints only descendants of the
 * promoted element, so a portalled menu would open somewhere invisible.
 */
function QualityMenu({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
  const qualities = usePlayerStore((state) => state.videoQualities);
  const active = usePlayerStore((state) => state.videoQuality);
  const setVideoQuality = usePlayerStore((state) => state.setVideoQuality);
  const [open, setOpen] = useState(false);

  // Reported upward because the controls hide themselves after a few idle
  // seconds, which would take an open menu with them mid-decision.
  const change = (next: boolean) => {
    setOpen(next);
    onOpenChange(next);
  };

  if (qualities.length === 0) return null;

  const activeLabel = qualities.find((quality) => quality.id === active)?.label ?? "Auto";

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => change(!open)}
        aria-label={`Resolution: ${activeLabel}`}
        aria-expanded={open}
        title="Resolution"
        className={`flex h-9 items-center gap-1 rounded-full px-2.5 text-xs font-semibold transition hover:bg-white/15 ${
          active === null ? "text-white/85 hover:text-white" : "text-accent"
        }`}
      >
        <Settings size={17} />
        {activeLabel}
      </button>

      {open && (
        <>
          {/* Catches the next click anywhere, without a portal. */}
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={() => change(false)}
            className="fixed inset-0 cursor-default"
          />
          <div
            role="menu"
            className="absolute bottom-full right-0 z-10 mb-2 max-h-64 min-w-32 overflow-y-auto rounded-xl border border-white/15 bg-black/90 p-1 shadow-2xl backdrop-blur"
          >
            {[{ id: null, label: "Auto", height: 0 }, ...qualities].map((quality) => (
              <button
                key={quality.id ?? "auto"}
                role="menuitemradio"
                aria-checked={active === quality.id}
                onClick={() => {
                  setVideoQuality(quality.id);
                  change(false);
                }}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium transition hover:bg-white/15 ${
                  active === quality.id ? "text-accent" : "text-white/85"
                }`}
              >
                <Check size={13} className={active === quality.id ? "opacity-100" : "opacity-0"} />
                {quality.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function IconButton({
  label,
  onClick,
  active,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`grid h-9 w-9 shrink-0 place-items-center rounded-full transition hover:bg-white/15 ${
        active ? "text-accent" : "text-white/85 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

function VolumeSlider() {
  const volume = usePlayerStore((state) => state.volume);
  const isMuted = usePlayerStore((state) => state.isMuted);
  const setVolume = usePlayerStore((state) => state.setVolume);
  const toggleMuted = usePlayerStore((state) => state.toggleMuted);

  const level = isMuted ? 0 : volume;
  const Icon = level === 0 ? VolumeX : level < 0.5 ? Volume1 : Volume2;

  return (
    // The slider stays collapsed until the group is hovered, so the control
    // strip does not crowd out the seek bar on a narrow window.
    <div className="group/vol flex items-center">
      <IconButton label={isMuted ? "Unmute" : "Mute"} onClick={toggleMuted}>
        <Icon size={19} />
      </IconButton>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={level}
        onChange={(event) => setVolume(Number(event.target.value))}
        aria-label="Volume"
        className="h-1 w-0 cursor-pointer appearance-none rounded-full opacity-0 transition-all duration-200 group-hover/vol:mr-1 group-hover/vol:w-20 group-hover/vol:opacity-100 focus:mr-1 focus:w-20 focus:opacity-100"
        style={{
          background: `linear-gradient(to right, #fff ${level * 100}%, rgb(255 255 255 / 0.3) ${level * 100}%)`,
        }}
      />
    </div>
  );
}

interface VideoControlsProps {
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
}

/**
 * Playback controls drawn over the video itself.
 *
 * They used to live in the page below the stage, which meant scrolling away
 * from the thing being watched in order to pause it, and there was no
 * fullscreen or volume at all. Overlaying them is also what makes fullscreen
 * work: the Fullscreen API only shows descendants of the promoted element, so
 * controls outside the stage would vanish the moment it went fullscreen.
 */
export function VideoControls({ isFullscreen, onToggleFullscreen }: VideoControlsProps) {
  const track = useCurrentTrack();
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const isLoading = usePlayerStore((state) => state.isLoading);
  const currentTime = usePlayerStore((state) => state.currentTime);
  const duration = usePlayerStore((state) => state.duration);
  const playbackRate = usePlayerStore((state) => state.playbackRate);
  const setPlaybackRate = usePlayerStore((state) => state.setPlaybackRate);
  const setPlaybackMode = usePlayerStore((state) => state.setPlaybackMode);
  const togglePictureInPicture = usePlayerStore((state) => state.togglePictureInPicture);
  const setNowPlayingOpen = useUiStore((state) => state.setNowPlayingOpen);

  const [isIdle, setIsIdle] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const hideTimer = useRef<number | null>(null);

  /** Any pointer or key activity wakes the controls and restarts the timer. */
  const wake = useCallback(() => {
    setIsIdle(false);
    if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setIsIdle(true), HIDE_AFTER_MS);
  }, []);

  // Only arms the timer — the controls already start visible, so there is no
  // state to set here, just an external timer to start and later clear.
  useEffect(() => {
    hideTimer.current = window.setTimeout(() => setIsIdle(true), HIDE_AFTER_MS);
    return () => {
      if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
    };
  }, []);

  // Hiding the controls over a paused video would just hide the play button.
  const visible = !isIdle || !isPlaying || isMenuOpen;

  const { togglePlay, next, previous } = usePlayerStore.getState();

  const cycleSpeed = () => {
    const index = SPEEDS.indexOf(playbackRate);
    setPlaybackRate(SPEEDS[(index + 1) % SPEEDS.length] ?? 1);
  };

  return (
    <div
      onPointerMove={wake}
      onPointerDown={wake}
      onPointerEnter={wake}
      onFocusCapture={wake}
      // The root keeps its pointer events even while hidden. Disabling them
      // here is what made the controls unrecoverable: this element is what
      // listens for the mouse moving, so switching it off meant no movement
      // could ever be seen, and the controls never came back. Only the chrome
      // below opts out, so an invisible button is never clickable.
      className={`absolute inset-0 flex flex-col justify-between transition-opacity duration-200 ${
        visible ? "opacity-100" : "opacity-0"
      } ${isPlaying && isIdle ? "cursor-none" : ""}`}
    >
      {/* Clicking the picture toggles playback, as every other player does. */}
      <button
        type="button"
        onClick={togglePlay}
        aria-label={isPlaying ? "Pause" : "Play"}
        className="absolute inset-0 cursor-default"
        tabIndex={-1}
      />

      <div className={`relative flex items-start gap-3 bg-gradient-to-b from-black/70 to-transparent px-3 pb-8 pt-2.5 sm:px-4${visible ? "" : " pointer-events-none"}`}>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">{cleanTrackTitle(track?.title ?? "")}</p>
          <p className="truncate text-xs text-white/70">{cleanArtistName(track?.artist ?? "")}</p>
        </div>
        {/* Only in fullscreen: windowed, the sheet header already carries this
            control directly above, and showing both read as a duplicate. */}
        {isFullscreen && (
          <button
            type="button"
            onClick={() => {
              if (document.fullscreenElement) void document.exitFullscreen();
              setPlaybackMode("audio");
              setNowPlayingOpen(false);
            }}
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-black/50 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-black/70"
          >
            <Music2 size={14} />
            Music only
          </button>
        )}
      </div>

      <div className={`pointer-events-none relative flex items-center justify-center gap-8${visible ? "" : " [&_button]:pointer-events-none"}`}>
        <button
          type="button"
          onClick={() => previous()}
          aria-label="Previous track"
          className="pointer-events-auto grid h-11 w-11 place-items-center rounded-full text-white/85 transition hover:bg-white/15 hover:text-white"
        >
          <SkipBack size={24} fill="currentColor" />
        </button>
        <button
          type="button"
          onClick={togglePlay}
          aria-label={isPlaying ? "Pause" : "Play"}
          className="pointer-events-auto grid h-16 w-16 place-items-center rounded-full bg-black/55 text-white transition hover:scale-105 hover:bg-black/70 active:scale-95"
        >
          {isLoading ? (
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          ) : isPlaying ? (
            <Pause size={28} fill="currentColor" />
          ) : (
            <Play size={28} fill="currentColor" className="ml-1" />
          )}
        </button>
        <button
          type="button"
          onClick={() => next()}
          aria-label="Next track"
          className="pointer-events-auto grid h-11 w-11 place-items-center rounded-full text-white/85 transition hover:bg-white/15 hover:text-white"
        >
          <SkipForward size={24} fill="currentColor" />
        </button>
      </div>

      <div className={`relative bg-gradient-to-t from-black/80 to-transparent px-3 pb-2 pt-8 sm:px-4${visible ? "" : " pointer-events-none"}`}>
        <SeekBar compact />
        <div className="mt-0.5 flex items-center gap-0.5">
          <span className="mr-1 shrink-0 text-[11px] tabular-nums text-white/80">
            {formatDuration(currentTime)} / {formatDuration(duration)}
          </span>
          <VolumeSlider />
          <div className="flex-1" />
          <button
            type="button"
            onClick={cycleSpeed}
            aria-label={`Playback speed: ${playbackRate}x`}
            title="Playback speed"
            className={`flex h-9 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs font-semibold transition hover:bg-white/15 ${
              playbackRate === 1 ? "text-white/85 hover:text-white" : "text-accent"
            }`}
          >
            <Gauge size={17} />
            {playbackRate}x
          </button>
          <QualityMenu onOpenChange={setIsMenuOpen} />
          <IconButton label="Picture in picture" onClick={togglePictureInPicture}>
            <PictureInPicture2 size={18} />
          </IconButton>
          <IconButton label={isFullscreen ? "Exit fullscreen" : "Fullscreen"} onClick={onToggleFullscreen}>
            {isFullscreen ? <Minimize size={19} /> : <Maximize size={19} />}
          </IconButton>
        </div>
      </div>
    </div>
  );
}
