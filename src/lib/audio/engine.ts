"use client";

import type Hls from "hls.js";
import type { PlaybackMode } from "@/types/music";

export type EngineEvent =
  | { type: "time"; currentTime: number; buffered: number }
  | { type: "duration"; duration: number }
  | { type: "playing" }
  | { type: "paused" }
  | { type: "waiting" }
  | { type: "ended" }
  | { type: "error"; message: string }
  /** Fires once a rendition's dimensions are known, so the UI can show a stage. */
  | { type: "videoavailable"; hasVideo: boolean }
  /** A video rendition could not be resolved, but the audio one could. */
  | { type: "videounavailable" };

type Listener = (event: EngineEvent) => void;

/**
 * Owns the single <audio> element for the whole app.
 *
 * React effects are a poor fit for media elements: a `currentTime` round-trip
 * through state makes seeking fight `timeupdate`, and re-running an effect can
 * tear down a stream mid-play. So the element lives here, the store subscribes
 * to events, and every command (play/seek/load) is an explicit method call.
 */
class AudioEngine {
  /**
   * A <video> element, even in audio mode.
   *
   * <video> plays audio-only sources exactly as <audio> does, so using one
   * element for both modes means switching between them never has to tear down
   * and rebuild the player — which would drop the buffer and the position.
   */
  private element: HTMLVideoElement | null = null;
  private hls: Hls | null = null;
  private listeners = new Set<Listener>();
  /** Guards against a slow stream resolution landing after the user moved on. */
  private loadToken = 0;
  private currentSourceId: string | null = null;

  private ensureElement(): HTMLVideoElement {
    if (this.element) return this.element;

    const element = document.createElement("video");
    element.preload = "metadata";
    // Without this, iOS Safari hijacks playback into its native fullscreen player.
    element.playsInline = true;
    element.setAttribute("playsinline", "");
    // crossOrigin is deliberately unset. It is only needed to read raw samples
    // (Web Audio analysis), which this player never does, and setting it makes
    // the browser *require* CORS headers on the stream. Leaving it off keeps
    // playback working on instances that do not send them.

    element.addEventListener("timeupdate", () => {
      this.emit({
        type: "time",
        currentTime: element.currentTime,
        buffered: element.buffered.length ? element.buffered.end(element.buffered.length - 1) : 0,
      });
    });
    element.addEventListener("durationchange", () => {
      this.emit({ type: "duration", duration: Number.isFinite(element.duration) ? element.duration : 0 });
    });
    element.addEventListener("playing", () => this.emit({ type: "playing" }));
    element.addEventListener("play", () => this.emit({ type: "playing" }));
    element.addEventListener("pause", () => this.emit({ type: "paused" }));
    element.addEventListener("waiting", () => this.emit({ type: "waiting" }));
    element.addEventListener("ended", () => this.emit({ type: "ended" }));
    element.addEventListener("loadedmetadata", () => {
      this.emit({ type: "videoavailable", hasVideo: element.videoWidth > 0 });
    });
    element.addEventListener("error", () => {
      if (!element.src && !this.hls) return;
      this.emit({ type: "error", message: "This track could not be played." });
    });

    this.element = element;
    return element;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: EngineEvent) {
    for (const listener of this.listeners) listener(event);
  }

  private teardownHls() {
    this.hls?.destroy();
    this.hls = null;
  }

  /** Resolves a stream URL for `sourceId` and starts playback. */
  async load(
    sourceId: string,
    { autoplay = true, mode = "audio", startAt = 0 }: { autoplay?: boolean; mode?: PlaybackMode; startAt?: number } = {},
  ): Promise<void> {
    const element = this.ensureElement();
    const token = ++this.loadToken;
    this.currentSourceId = sourceId;

    this.emit({ type: "waiting" });

    let stream: { url: string; isHls: boolean; kind?: PlaybackMode };
    try {
      stream = await this.resolveStream(sourceId, mode);
    } catch (error) {
      if (token !== this.loadToken) return;

      // A video rendition failing does not mean the track is unplayable.
      // Extraction fails far more often for real music-video uploads than for
      // audio — labels restrict them — and dropping the whole track over it
      // means the queue skips past songs that would have played fine.
      if (mode === "video") {
        try {
          stream = await this.resolveStream(sourceId, "audio");
          if (token !== this.loadToken) return;
          this.emit({ type: "videounavailable" });
        } catch {
          this.emit({ type: "error", message: "This track could not be played." });
          return;
        }
      } else {
        this.emit({ type: "error", message: error instanceof Error ? error.message : "Playback failed." });
        return;
      }
    }

    // The user skipped while we were resolving — drop this result on the floor.
    if (token !== this.loadToken) return;

    this.teardownHls();
    element.removeAttribute("src");

    const nativeHls = element.canPlayType("application/vnd.apple.mpegurl") !== "";
    if (stream.isHls && !nativeHls) {
      const { default: HlsCtor } = await import("hls.js");
      if (token !== this.loadToken) return;
      if (!HlsCtor.isSupported()) {
        this.emit({ type: "error", message: "Live streams are not supported in this browser." });
        return;
      }
      const hls = new HlsCtor({ enableWorker: true, lowLatencyMode: true });
      hls.loadSource(stream.url);
      hls.attachMedia(element);
      hls.on(HlsCtor.Events.ERROR, (_event, data) => {
        if (data.fatal) this.emit({ type: "error", message: "The live stream dropped out." });
      });
      this.hls = hls;
    } else {
      element.src = stream.url;
      element.load();
    }

    // Preserves position when only the rendition changed, e.g. audio -> video.
    if (startAt > 0) {
      const seekOnce = () => {
        element.currentTime = startAt;
        element.removeEventListener("loadedmetadata", seekOnce);
      };
      element.addEventListener("loadedmetadata", seekOnce);
    }

    if (autoplay) await this.play();
  }

  /** Asks the server for a playable URL. Throws with the provider's reason. */
  private async resolveStream(
    sourceId: string,
    mode: PlaybackMode,
  ): Promise<{ url: string; isHls: boolean; kind?: PlaybackMode }> {
    const response = await fetch(`/api/streams/${encodeURIComponent(sourceId)}?mode=${mode}`);
    const body = (await response.json()) as {
      stream?: { url: string; isHls: boolean; kind?: PlaybackMode };
      error?: string;
    };
    if (!response.ok || !body.stream) throw new Error(body.error ?? "No playable stream was found.");
    return body.stream;
  }

  /** Hands the media element to the component that renders the video stage. */
  getElement(): HTMLVideoElement {
    return this.ensureElement();
  }

  hasVideoTrack(): boolean {
    return (this.element?.videoWidth ?? 0) > 0;
  }

  /** Browser picture-in-picture. Returns false when unavailable or refused. */
  async togglePictureInPicture(): Promise<boolean> {
    const element = this.element;
    if (!element || !document.pictureInPictureEnabled) return false;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await element.requestPictureInPicture();
      return true;
    } catch {
      return false;
    }
  }

  async play(): Promise<void> {
    const element = this.element;
    if (!element) return;
    try {
      await element.play();
    } catch (error) {
      // Autoplay blocked before any user gesture is normal, not an error worth surfacing.
      if (error instanceof DOMException && error.name === "NotAllowedError") {
        this.emit({ type: "paused" });
        return;
      }
      this.emit({ type: "error", message: "Playback was interrupted." });
    }
  }

  pause(): void {
    this.element?.pause();
  }

  seek(seconds: number): void {
    const element = this.element;
    if (!element) return;
    const max = Number.isFinite(element.duration) ? element.duration : seconds;
    element.currentTime = Math.max(0, Math.min(seconds, max));
    this.emit({ type: "time", currentTime: element.currentTime, buffered: 0 });
  }

  nudge(deltaSeconds: number): void {
    if (!this.element) return;
    this.seek(this.element.currentTime + deltaSeconds);
  }

  setVolume(volume: number): void {
    this.ensureElement().volume = Math.max(0, Math.min(volume, 1));
  }

  setMuted(muted: boolean): void {
    this.ensureElement().muted = muted;
  }

  setPlaybackRate(rate: number): void {
    const element = this.ensureElement();
    // Loading a new resource resets playbackRate to defaultPlaybackRate, so
    // setting only the former would silently revert on the next track.
    element.defaultPlaybackRate = rate;
    element.playbackRate = rate;
  }

  stop(): void {
    this.loadToken += 1;
    this.currentSourceId = null;
    this.teardownHls();
    const element = this.element;
    if (!element) return;
    element.pause();
    element.removeAttribute("src");
    element.load();
  }

  getSourceId(): string | null {
    return this.currentSourceId;
  }

  getCurrentTime(): number {
    return this.element?.currentTime ?? 0;
  }
}

/**
 * Module-level singleton. Guarded so Fast Refresh does not leave a second
 * element playing over the first.
 */
const globalScope = globalThis as typeof globalThis & { __lyhAudioEngine?: AudioEngine };
export const audioEngine: AudioEngine = globalScope.__lyhAudioEngine ?? new AudioEngine();
if (typeof window !== "undefined") globalScope.__lyhAudioEngine = audioEngine;
