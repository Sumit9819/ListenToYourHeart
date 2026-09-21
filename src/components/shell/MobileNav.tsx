"use client";

import { Heart, Home, Library, Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Home", icon: Home },
  { href: "/search", label: "Search", icon: Search },
  { href: "/liked", label: "Favorites", icon: Heart },
  { href: "/library", label: "Library", icon: Library },
] as const;

/** Bottom tab bar, shown below the `lg` breakpoint where the sidebar hides. */
export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-surface-raised/95 backdrop-blur-xl sm:hidden"
    >
      {TABS.map(({ href, label, icon: Icon }) => {
        const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={`flex flex-1 flex-col items-center gap-1 py-2 text-[10px] font-medium transition ${
              isActive ? "text-accent" : "text-ink-faint"
            }`}
          >
            <Icon size={20} fill={isActive && href === "/liked" ? "currentColor" : "none"} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
