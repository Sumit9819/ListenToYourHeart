"use client";

import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

interface ShelfProps {
  title: string;
  subtitle?: string;
  /** Renders a "See all" link when the section has a dedicated page. */
  href?: Route;
  children: ReactNode;
}

/** A titled horizontal section. Scrolls on phones, wraps into a grid above. */
export function Shelf({ title, subtitle, href, children }: ShelfProps) {
  return (
    <section className="mb-10">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-lg font-bold tracking-tight sm:text-xl">{title}</h2>
          {subtitle && <p className="mt-0.5 truncate text-sm text-ink-muted">{subtitle}</p>}
        </div>
        {href && (
          <Link
            href={href}
            className="shrink-0 text-xs font-semibold uppercase tracking-wider text-ink-muted transition hover:text-ink"
          >
            See all
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

/** Grid used inside a shelf; one place to change card density app-wide. */
export function CardGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
      {children}
    </div>
  );
}
