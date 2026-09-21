import { Compass } from "lucide-react";
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line px-6 py-20 text-center">
      <div className="mb-4 grid h-14 w-14 place-items-center rounded-full bg-surface-raised">
        <Compass size={24} className="text-ink-faint" />
      </div>
      <h1 className="text-lg font-semibold">This page does not exist</h1>
      <p className="mt-2 max-w-sm text-sm text-ink-muted">The link may be out of date, or the page has moved.</p>
      <Link
        href="/"
        className="mt-6 inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-accent-ink transition hover:opacity-90"
      >
        Back to home
      </Link>
    </div>
  );
}
