"use client";

import { CloudOff, LogIn, LogOut, RefreshCw, User } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Menu, type MenuItem } from "@/components/ui/Menu";
import { signIn, signOut, useSession } from "@/lib/auth/client";
import {
  getServerSyncStatus,
  getSyncStatus,
  startSync,
  subscribeToSyncStatus,
  syncNow,
} from "@/lib/sync/engine";
import { useUiStore } from "@/store/uiStore";

/** Google's mark, so the button is recognisable at a glance. */
function GoogleIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
      />
      <path
        fill="#FBBC05"
        d="M11.69 28.18A13.2 13.2 0 0 1 11 24c0-1.45.25-2.86.69-4.18v-5.7H4.34A21.99 21.99 0 0 0 2 24c0 3.55.85 6.91 2.34 9.88l7.35-5.7z"
      />
      <path
        fill="#EA4335"
        d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
      />
    </svg>
  );
}

function describeSync(state: string, lastSyncedAt: number | null): string {
  if (state === "syncing") return "Syncing...";
  if (state === "error") return "Sync failed — will retry";
  if (!lastSyncedAt) return "Not synced yet";
  const minutes = Math.round((Date.now() - lastSyncedAt) / 60_000);
  if (minutes < 1) return "Synced just now";
  if (minutes === 1) return "Synced a minute ago";
  if (minutes < 60) return `Synced ${minutes} minutes ago`;
  return "Synced earlier today";
}

/**
 * Sign-in and cross-device sync.
 *
 * Renders nothing at all when the deployment has no database configured, which
 * is the app's default state: the local-first library works without an account
 * and this is purely additive.
 */
export function AccountMenu() {
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/accounts", { signal: controller.signal })
      .then((response) => response.json())
      .then((body: { enabled?: boolean }) => setEnabled(Boolean(body.enabled)))
      .catch(() => {
        // Treated as "no accounts": better to hide the control than to offer
        // a sign-in that cannot complete.
      });
    return () => controller.abort();
  }, []);

  // The session hook polls /api/auth, which answers 501 on a deployment with
  // no database. Mounting it only once accounts are known to exist keeps a
  // supported configuration from logging errors it can do nothing about.
  if (enabled !== true) return null;
  return <AccountControl />;
}

function AccountControl() {
  const { data: session, isPending } = useSession();
  const pushToast = useUiStore((state) => state.pushToast);
  const status = useSyncExternalStore(subscribeToSyncStatus, getSyncStatus, getServerSyncStatus);

  const userId = session?.user.id ?? null;

  // The engine owns the timers and listeners; this only starts and stops it.
  useEffect(() => {
    if (!userId) return;
    return startSync(userId);
  }, [userId]);

  if (!session) {
    return (
      <button
        onClick={() =>
          void signIn.social({ provider: "google", callbackURL: window.location.pathname }).catch(() => {
            pushToast("Sign-in could not start. Try again in a moment.", "error");
          })
        }
        disabled={isPending}
        className="flex shrink-0 items-center gap-2 rounded-full border border-line bg-surface-raised px-3 py-1.5 text-xs font-semibold transition hover:border-accent/50 hover:text-accent disabled:opacity-50 sm:text-[13px]"
      >
        <GoogleIcon />
        <span className="hidden sm:inline">Sign in</span>
        <LogIn size={15} className="sm:hidden" />
      </button>
    );
  }

  const name = session.user.name || session.user.email || "Your account";
  const items: MenuItem[] = [
    {
      label: describeSync(status.state, status.lastSyncedAt),
      icon: status.state === "error" ? CloudOff : RefreshCw,
      onSelect: syncNow,
    },
    {
      label: "Sign out",
      icon: LogOut,
      tone: "danger",
      onSelect: () =>
        void signOut().then(() => pushToast("Signed out. Your library stays on this device.", "success")),
    },
  ];

  return (
    <Menu
      items={items}
      label={`Account: ${name}`}
      trigger={({ toggle, ref, open }) => (
        <button
          ref={ref}
          onClick={toggle}
          aria-label={`Account: ${name}`}
          aria-expanded={open}
          className={`grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full border transition ${
            open ? "border-accent" : "border-line hover:border-accent/50"
          }`}
        >
          {session.user.image ? (
            // A plain img, as everywhere else here: the avatar host is
            // Google's CDN, which remotePatterns cannot know at build time.
            <img src={session.user.image} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            <User size={16} className="text-ink-muted" />
          )}
        </button>
      )}
    />
  );
}
