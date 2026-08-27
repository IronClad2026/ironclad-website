"use client";

import { useEffect, useId, useRef, useState } from "react";

export type NavbarSupportPopoverProps = {
  href: string;
  triggerLabel: string;
  title: string;
  copy: string;
  actionLabel: string;
  placement?: "above" | "below";
};

export default function NavbarSupportPopover({
  href,
  triggerLabel,
  title,
  copy,
  actionLabel,
  placement = "below",
}: NavbarSupportPopoverProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const actionRef = useRef<HTMLAnchorElement>(null);
  const popoverId = useId();
  const titleId = `${popoverId}-title`;
  const copyId = `${popoverId}-copy`;

  useEffect(() => {
    if (!open) {
      return;
    }

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !rootRef.current?.contains(event.target)
      ) {
        setOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus({ preventScroll: true });
    };

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    actionRef.current?.focus({ preventScroll: true });

    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative inline-flex shrink-0">
      <button
        ref={triggerRef}
        type="button"
        aria-label={triggerLabel}
        aria-expanded={open}
        aria-controls={popoverId}
        aria-haspopup="dialog"
        onClick={() => setOpen((current) => !current)}
        className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-white/15 bg-white/[0.04] text-base font-black text-zinc-300 transition hover:border-orange-400/55 hover:bg-orange-400/10 hover:text-orange-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
      >
        <span aria-hidden="true">?</span>
      </button>

      {open ? (
        <section
          id={popoverId}
          role="dialog"
          aria-modal="false"
          aria-labelledby={titleId}
          aria-describedby={copyId}
          className={`absolute right-0 z-[1500] max-h-[calc(100dvh-6rem)] w-72 max-w-[calc(100vw-2rem)] overflow-y-auto overscroll-contain border border-orange-400/35 bg-zinc-950/98 p-4 text-left shadow-[0_20px_55px_rgba(0,0,0,0.75)] backdrop-blur-xl ${
            placement === "above" ? "bottom-full mb-3" : "top-full mt-3"
          }`}
        >
          <h2
            id={titleId}
            className="text-xs font-black uppercase tracking-[0.18em] text-orange-300"
          >
            {title}
          </h2>
          <p id={copyId} className="mt-2 text-sm leading-6 text-zinc-300">
            {copy}
          </p>
          <a
            ref={actionRef}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="mt-4 inline-flex min-h-11 w-full items-center justify-center border border-orange-400/55 bg-orange-500/10 px-4 py-2 text-center text-sm font-bold text-orange-200 transition hover:border-orange-300 hover:bg-orange-500/20 hover:text-orange-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
          >
            {actionLabel}
          </a>
        </section>
      ) : null}
    </div>
  );
}
