"use client";

import { type ReactNode, useEffect, useRef } from "react";
import { Icon } from "./Icon";

/** Native <dialog>: focus trap, Escape and inert background for free. */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-label={title}
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {open && (
        <div className="px-5 pt-4 pb-[max(env(safe-area-inset-bottom),1.25rem)]">
          <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-line sm:hidden" />
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-lg font-medium">{title}</h2>
            <button type="button" onClick={onClose} className="-mr-2 rounded-full p-2 text-muted hover:text-fg" aria-label="Close">
              <Icon name="x" size={18} />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
