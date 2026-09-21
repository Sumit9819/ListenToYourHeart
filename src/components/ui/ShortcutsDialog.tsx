"use client";

import { Modal } from "@/components/ui/Modal";
import { SHORTCUTS } from "@/hooks/useKeyboardShortcuts";
import { useUiStore } from "@/store/uiStore";

export function ShortcutsDialog() {
  const open = useUiStore((state) => state.isShortcutsOpen);
  const setOpen = useUiStore((state) => state.setShortcutsOpen);

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      title="Keyboard shortcuts"
      description="These work anywhere except while you are typing."
      widthClass="max-w-lg"
    >
      <dl className="grid gap-1 sm:grid-cols-2">
        {SHORTCUTS.map((shortcut) => (
          <div key={shortcut.description} className="flex items-center justify-between gap-3 rounded-lg px-2 py-2">
            <dt className="min-w-0 truncate text-sm text-ink-muted">{shortcut.description}</dt>
            <dd className="flex shrink-0 gap-1">
              {shortcut.keys.map((key) => (
                <kbd
                  key={key}
                  className="rounded border border-line bg-surface-raised px-1.5 py-0.5 font-sans text-[11px] font-medium"
                >
                  {key}
                </kbd>
              ))}
            </dd>
          </div>
        ))}
      </dl>
    </Modal>
  );
}
