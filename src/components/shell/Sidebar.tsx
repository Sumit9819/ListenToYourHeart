"use client";

import { Heart, History, Home, Library, ListMusic, Plus, Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { usePlaylists } from "@/hooks/useLibrary";
import { createPlaylist } from "@/lib/db/library";
import { pluralize } from "@/lib/format";
import { useUiStore } from "@/store/uiStore";

const PRIMARY_LINKS = [
  { href: "/", label: "Home", icon: Home },
  { href: "/search", label: "Search", icon: Search },
  { href: "/library", label: "Your library", icon: Library },
] as const;

const LIBRARY_LINKS = [
  { href: "/liked", label: "Favorites", icon: Heart },
  { href: "/history", label: "Recently played", icon: History },
] as const;

/** Create-playlist dialog, shared by the sidebar and the library page. */
export function NewPlaylistDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const pushToast = useUiStore((state) => state.pushToast);

  const submit = async () => {
    if (!name.trim()) return;
    const playlist = await createPlaylist(name, description);
    pushToast(`Created "${playlist.name}"`, "success");
    setName("");
    setDescription("");
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New playlist"
      description="Playlists are stored in this browser only."
      footer={
        <>
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-ink-muted transition hover:text-ink">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!name.trim()}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink transition disabled:opacity-40"
          >
            Create
          </button>
        </>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        className="space-y-3"
      >
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-ink-muted">Name</span>
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={80}
            placeholder="Late night drive"
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-ink-muted">Description (optional)</span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={200}
            rows={2}
            placeholder="What is this playlist for?"
            className="w-full resize-none rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </label>
      </form>
    </Modal>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { data: playlists } = usePlaylists();
  const [isCreating, setIsCreating] = useState(false);

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  const linkClass = (href: string) =>
    `flex items-center gap-4 rounded-lg px-3 py-2.5 text-sm transition ${
      isActive(href) ? "bg-white/[0.09] font-semibold text-ink" : "text-ink-muted hover:bg-white/[0.05] hover:text-ink"
    }`;

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-surface lg:flex xl:w-64">
        <div className="px-5 py-5">
          <Link href="/" className="flex items-center gap-2 text-lg font-bold tracking-tight">
            <Heart size={20} className="text-accent" fill="currentColor" />
            Listen
          </Link>
        </div>

        <nav aria-label="Primary" className="px-2.5">
          {PRIMARY_LINKS.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className={linkClass(href)} aria-current={isActive(href) ? "page" : undefined}>
              <Icon size={19} className="shrink-0" />
              {label}
            </Link>
          ))}
        </nav>

        <div className="mt-5 px-2.5">
          <div className="border-t border-line pt-4">
            {LIBRARY_LINKS.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={linkClass(href)}
                aria-current={isActive(href) ? "page" : undefined}
              >
                <Icon size={19} className="shrink-0" />
                {label}
              </Link>
            ))}
          </div>
        </div>

        <div className="mt-5 flex min-h-0 flex-1 flex-col px-2.5">
          <div className="flex items-center justify-between px-3 pb-1">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Playlists</h2>
            <button
              onClick={() => setIsCreating(true)}
              aria-label="Create a playlist"
              className="rounded-full p-1.5 text-ink-muted transition hover:bg-white/10 hover:text-ink"
            >
              <Plus size={16} />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto pb-40">
            {playlists?.length === 0 && (
              <p className="px-3 py-2 text-xs leading-relaxed text-ink-faint">
                No playlists yet. Use + to make your first one.
              </p>
            )}
            {playlists?.map((playlist) => (
              <Link
                key={playlist.id}
                href={`/playlist/${playlist.id}`}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 transition ${
                  pathname === `/playlist/${playlist.id}`
                    ? "bg-white/[0.09]"
                    : "text-ink-muted hover:bg-white/[0.05] hover:text-ink"
                }`}
              >
                <ListMusic size={16} className="shrink-0 text-ink-faint" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{playlist.name}</span>
                  <span className="block text-[11px] text-ink-faint">{pluralize(playlist.trackCount, "song")}</span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      </aside>

      <NewPlaylistDialog open={isCreating} onClose={() => setIsCreating(false)} />
    </>
  );
}
