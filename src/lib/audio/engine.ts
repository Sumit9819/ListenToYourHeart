"use client";

import type Hls from "hls.js";

export type EngineEvent =
  | { type: "time"; currentTime: number; buffered: number }
  | { type: "duration"; duration: number }
  | { type: "playing" }
  | { type: "paused" }
  | { type: "waiting" }
  | { type: "ended" }
  | { type: "error"; message: string };

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
  private element: HTMLAudioElement | null = null;
  private hls: Hls | null = null;
  private listeners = new Set<Listener>();
  /** Guards against a slow stream resolution landing after the user moved on. */
  private loadToken = 0;
  private currentSourceId: string | null = null;

  private ensureElement(): HTMLAudioElement {
    if (this.element) return this.element;

    const element = new Audio();
    element.preload = "metadata";
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
  async load(sourceId: string, { autoplay = true }: { autoplay?: boolean } = {}): Promise<void> {
    const element = this.ensureElement();
    const token = ++this.loadToken;
    this.currentSourceId = sourceId;

    this.emit({ type: "waiting" });

    let stream: { url: string; isHls: boolean };
    try {
      const response = await fetch(`/api/streams/${encodeURIComponent(sourceId)}`);
      const body = (await response.json()) as { stream?: { url: string; isHls: boolean }; error?: string };
      if (!response.ok || !body.stream) throw new Error(body.error ?? "No playable stream was found.");
      stream = body.stream;
    } catch (error) {
      if (token !== this.loadToken) return;
      this.emit({ type: "error", message: error instanceof Error ? error.message : "Playback failed." });
      return;
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

    if (autoplay) await this.play();
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
    this.ensureElement().playbackRate = rate;
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
