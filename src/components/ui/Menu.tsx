"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export interface MenuItem {
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  tone?: "default" | "danger";
  /** Hidden entirely when false — used for context-dependent entries. */
  when?: boolean;
}

interface MenuProps {
  items: MenuItem[];
  trigger: (props: { open: boolean; toggle: () => void; ref: React.Ref<HTMLButtonElement> }) => ReactNode;
  align?: "left" | "right";
  label?: string;
}

/**
 * A small dropdown menu with roving focus.
 *
 * Deliberately dependency-free: a headless menu library would be a large add
 * for the one interaction pattern this app needs.
 */
export function Menu({ items, trigger, align = "right", label = "More actions" }: MenuProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  const visibleItems = items.filter((item) => item.when !== false);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((index) => (index + 1) % visibleItems.length);
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((index) => (index - 1 + visibleItems.length) % visibleItems.length);
      }
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        visibleItems[activeIndex]?.onSelect();
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open, activeIndex, visibleItems]);

  return (
    <div ref={containerRef} className="relative">
      {trigger({
        open,
        ref: triggerRef,
        toggle: () => {
          setActiveIndex(0);
          setOpen((value) => !value);
        },
      })}

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          className={`absolute z-50 mt-1 min-w-52 animate-rise overflow-hidden rounded-xl border border-line bg-surface-overlay p-1 shadow-2xl ${
            align === "right" ? "right-0" : "left-0"
          } bottom-full mb-1 sm:bottom-auto sm:mb-0`}
        >
          {visibleItems.map((item, index) => (
            <button
              key={item.label}
              role="menuitem"
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => {
                item.onSelect();
                setOpen(false);
              }}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition ${
                item.tone === "danger" ? "text-danger" : "text-ink"
              } ${index === activeIndex ? "bg-white/10" : ""}`}
            >
              <item.icon size={16} className="shrink-0 opacity-80" />
              <span className="truncate">{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
