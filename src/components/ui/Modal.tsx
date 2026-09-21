"use client";

import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  widthClass?: string;
}

/**
 * A focus-trapped dialog. Built on `<dialog>` so Escape, the top layer and
 * inertness of the rest of the page come from the platform rather than from
 * hand-rolled key handlers.
 */
export function Modal({ open, onClose, title, description, children, footer, widthClass = "max-w-md" }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    // Fires for Escape as well as a programmatic close.
    const onCancel = (event: Event) => {
      event.preventDefault();
      onClose();
    };
    dialog.addEventListener("cancel", onCancel);
    return () => dialog.removeEventListener("cancel", onCancel);
  }, [onClose]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="modal-title"
      onClick={(event) => {
        // Clicking the backdrop lands on the dialog element itself.
        if (event.target === dialogRef.current) onClose();
      }}
      className={`w-[calc(100vw-2rem)] ${widthClass} animate-rise rounded-2xl border border-line bg-surface-overlay p-0 text-ink shadow-2xl backdrop:bg-black/60 backdrop:backdrop-blur-sm`}
    >
      <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
        <div>
          <h2 id="modal-title" className="text-base font-semibold">
            {title}
          </h2>
          {description && <p className="mt-1 text-sm text-ink-muted">{description}</p>}
        </div>
        <button
          onClick={onClose}
          aria-label="Close dialog"
          className="rounded-full p-1.5 text-ink-muted transition hover:bg-white/10 hover:text-ink"
        >
          <X size={18} />
        </button>
      </div>

      <div className="px-5 py-4">{children}</div>

      {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-4">{footer}</div>}
    </dialog>
  );
}
