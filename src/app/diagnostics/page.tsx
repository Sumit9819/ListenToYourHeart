"use client";

import { AlertTriangle, CheckCircle2, CircleDashed, RefreshCw, Trash2, XCircle } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { musicDatabase } from "@/lib/db/database";

/** A track that has been reliably extractable; only used to prove the path works. */
const PROBE_VIDEO_ID = "dvgZkm1xWPE";

type Status = "pending" | "running" | "pass" | "warn" | "fail";

interface Check {
  id: string;
  label: string;
  status: Status;
  detail: string;
  /** Shown when the check fails, in plain language. */
  fix?: string;
}

const ICONS: Record<Status, typeof CheckCircle2> = {
  pending: CircleDashed,
  running: CircleDashed,
  pass: CheckCircle2,
  warn: AlertTriangle,
  fail: XCircle,
};

const TONES: Record<Status, string> = {
  pending: "text-ink-faint",
  running: "text-ink-muted animate-pulse",
  pass: "text-success",
  warn: "text-warning",
  fail: "text-danger",
};

const INITIAL: Check[] = [
  { id: "version", label: "This page is running the latest version", status: "pending", detail: "" },
  { id: "servers", label: "The music servers can be reached", status: "pending", detail: "" },
  { id: "search", label: "Searching works", status: "pending", detail: "" },
  { id: "link", label: "A playable link can be found", status: "pending", detail: "" },
  { id: "audio", label: "This browser can actually play it", status: "pending", detail: "" },
];

/**
 * A self-service answer to "nothing is playing".
 *
 * Every check the server can run has already passed by the time someone reads
 * this — the interesting failures are the ones only the visitor's own browser
 * can see: a cached bundle from an older deploy, an extension blocking the
 * media host, saved state left in a bad shape. So the checks run here, in that
 * browser, and each failure says what to do about it rather than reporting a
 * status code.
 */
export default function DiagnosticsPage() {
  const [checks, setChecks] = useState<Check[]>(INITIAL);
  const [running, setRunning] = useState(false);
  const [cleared, setCleared] = useState(false);
  /** Bumped to re-run; also lets a stale run drop its results on the floor. */
  const [attempt, setAttempt] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const update = useCallback((id: string, patch: Partial<Check>) => {
    setChecks((current) => current.map((check) => (check.id === id ? { ...check, ...patch } : check)));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const set = (id: string, patch: Partial<Check>) => {
      if (!cancelled) update(id, patch);
    };

    const run = async () => {
      if (cancelled) return;
      setRunning(true);

      // 1. Stale bundle ------------------------------------------------------
      set("version", { status: "running" });
      const localBuild = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";
      try {
        const response = await fetch("/api/version", { cache: "no-store" });
        const { buildId } = (await response.json()) as { buildId: string };
        if (buildId === localBuild) {
          set("version", { status: "pass", detail: `Build ${buildId.slice(0, 7)}` });
        } else {
          set("version", {
            status: "fail",
            detail: `This tab is running ${localBuild.slice(0, 7)}, the site is on ${buildId.slice(0, 7)}`,
            fix: "Your browser kept an old copy of the app. Hold Ctrl and press Shift+R (Cmd+Shift+R on a Mac) to force it to fetch the new one. This alone fixes most 'nothing plays' reports.",
          });
        }
      } catch {
        set("version", { status: "warn", detail: "Could not check", fix: "You may be offline." });
      }

      if (cancelled) return;

      // 2. Providers ---------------------------------------------------------
      set("servers", { status: "running" });
      try {
        const response = await fetch("/api/health", { cache: "no-store" });
        const body = (await response.json()) as { healthy: number; configured: number };
        if (body.healthy > 0) {
          set("servers", { status: "pass", detail: `${body.healthy} of ${body.configured} responding` });
        } else {
          set("servers", {
            status: "fail",
            detail: "None responding",
            fix: "Every public music server is down or blocking this deployment right now. Nothing in the app can fix that — it usually recovers within an hour.",
          });
        }
      } catch {
        set("servers", {
          status: "fail",
          detail: "Could not reach the site's own API",
          fix: "Something between your browser and the site is blocking requests — most often an ad blocker or a company/school network. Try disabling extensions for this site.",
        });
      }

      if (cancelled) return;

      // 3. Search ------------------------------------------------------------
      set("search", { status: "running" });
      try {
        const response = await fetch("/api/search?q=coldplay&filter=music_songs", { cache: "no-store" });
        const body = (await response.json()) as { tracks?: unknown[]; error?: string };
        const count = body.tracks?.length ?? 0;
        if (count > 0) set("search", { status: "pass", detail: `${count} results` });
        else {
          set("search", {
            status: "fail",
            detail: body.error ?? "No results",
            fix: "Search itself is failing, which points at the music servers rather than your browser.",
          });
        }
      } catch {
        set("search", { status: "fail", detail: "Request failed", fix: "Check the previous step first." });
      }

      if (cancelled) return;

      // 4. Stream resolution -------------------------------------------------
      set("link", { status: "running" });
      let mediaUrl: string | null = null;
      try {
        const started = Date.now();
        const response = await fetch(`/api/streams/${PROBE_VIDEO_ID}?mode=audio`, { cache: "no-store" });
        const body = (await response.json()) as { stream?: { url: string }; error?: string };
        if (body.stream?.url) {
          mediaUrl = body.stream.url;
          set("link", {
            status: "pass",
            detail: `${((Date.now() - started) / 1000).toFixed(1)}s via ${new URL(body.stream.url).host}`,
          });
        } else {
          set("link", {
            status: "fail",
            detail: body.error ?? "No link returned",
            fix: "The servers answered but could not extract audio. This is the known weak point — it is usually temporary, and affects some uploads more than others.",
          });
        }
      } catch {
        set("link", { status: "fail", detail: "Request failed" });
      }

      // 5. Actual playback in this browser -----------------------------------
      set("audio", { status: "running" });
      if (!mediaUrl) {
        set("audio", { status: "pending", detail: "Skipped — no link to try" });
        if (!cancelled) setRunning(false);
        return;
      }

      if (cancelled) return;

      try {
        // A fresh element per run, never a shared one. Two runs can overlap —
        // React mounts effects twice in development, and the retry button can
        // start a second pass — and the first to finish would otherwise pause
        // and unset the source out from under the second, failing a check that
        // would have passed.
        const audio = new Audio();
        audioRef.current = audio;
        // Muted so the check never makes a noise, and so autoplay rules,
        // which are about sound, cannot be what fails here.
        audio.muted = true;
        audio.src = mediaUrl;

        const played = await new Promise<boolean>((resolve) => {
          const done = (value: boolean) => {
            clearTimeout(timer);
            audio.removeEventListener("timeupdate", onTime);
            audio.removeEventListener("error", onError);
            resolve(value);
          };
          const onTime = () => {
            if (audio.currentTime > 0.2) done(true);
          };
          const onError = () => done(false);
          const timer = setTimeout(() => done(false), 15_000);
          audio.addEventListener("timeupdate", onTime);
          audio.addEventListener("error", onError);
          void audio.play().catch(() => done(false));
        });

        audio.pause();
        audio.removeAttribute("src");

        if (played) {
          set("audio", { status: "pass", detail: "Audio played in this tab" });
        } else {
          set("audio", {
            status: "fail",
            detail: "The link was found but this browser could not play it",
            fix: "The app and the servers are working, so something in this browser is stopping the audio: most often an ad blocker or privacy extension blocking the media host, or a network that filters it. Try an incognito window with extensions off — if it works there, an extension is the cause.",
          });
        }
      } catch {
        set("audio", { status: "fail", detail: "Playback threw an error" });
      }

      if (!cancelled) setRunning(false);
    };

    void run();
    return () => {
      cancelled = true;
      audioRef.current?.pause();
    };
  }, [attempt, update]);

  /** Wipes everything the app has saved in this browser. */
  const resetSavedData = async () => {
    try {
      localStorage.removeItem("lyh-player");
      localStorage.removeItem("lyh-ui");
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith("lyh-sync-")) localStorage.removeItem(key);
      }
      await musicDatabase.delete();
    } catch {
      // Nothing recoverable; the reload below still helps.
    }
    setCleared(true);
    setTimeout(() => window.location.replace("/"), 900);
  };

  const failures = checks.filter((check) => check.status === "fail");

  return (
    <>
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Why is nothing playing?</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-ink-muted">
          These checks run here, in this browser, and stop at the first thing that is actually broken. Whatever fails,
          the fix is written underneath it.
        </p>
      </header>

      <ol className="mb-8 space-y-2.5">
        {checks.map((check) => {
          const Icon = ICONS[check.status];
          return (
            <li
              key={check.id}
              className="rounded-xl border border-line bg-surface-raised p-4"
              aria-live={check.status === "running" ? "polite" : undefined}
            >
              <div className="flex items-start gap-3">
                <Icon size={19} className={`mt-0.5 shrink-0 ${TONES[check.status]}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{check.label}</p>
                  {check.detail && <p className="mt-0.5 text-xs text-ink-muted">{check.detail}</p>}
                  {check.status === "fail" && check.fix && (
                    <p className="mt-2 rounded-lg bg-danger/10 p-3 text-xs leading-relaxed text-ink">{check.fix}</p>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {!running && failures.length === 0 && (
        <p className="mb-8 rounded-xl border border-line bg-surface-raised p-4 text-sm">
          Everything passed, including playing real audio in this tab. If a particular song still will not play, it is
          that upload rather than the app — tell me which one and I can check it directly.
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => setAttempt((value) => value + 1)}
          disabled={running}
          className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-accent-ink transition hover:opacity-90 disabled:opacity-50"
        >
          <RefreshCw size={16} className={running ? "animate-spin" : ""} />
          {running ? "Checking..." : "Run the checks again"}
        </button>

        <button
          onClick={resetSavedData}
          disabled={cleared}
          className="inline-flex items-center gap-2 rounded-full border border-line px-5 py-2.5 text-sm font-medium text-ink-muted transition hover:border-danger/50 hover:text-danger disabled:opacity-50"
        >
          <Trash2 size={16} />
          {cleared ? "Cleared — reloading..." : "Reset saved data"}
        </button>
      </div>

      <p className="mt-3 max-w-2xl text-xs text-ink-faint">
        Resetting clears the queue, playlists, favorites and history stored in this browser, then reloads. It is the
        cure for a player stuck in a bad state. If you are signed in, anything already synced comes back afterwards.
      </p>
    </>
  );
}
