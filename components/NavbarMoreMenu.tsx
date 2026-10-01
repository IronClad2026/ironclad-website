"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";

type NavbarMoreMenuProps = {
  label: string;
  aboutLabel: string;
  active: boolean;
};

export default function NavbarMoreMenu({
  label,
  aboutLabel,
  active,
}: NavbarMoreMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const aboutRef = useRef<HTMLAnchorElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;

    const handleOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus({ preventScroll: true });
    };

    document.addEventListener("pointerdown", handleOutsidePointer);
    document.addEventListener("keydown", handleEscape);
    aboutRef.current?.focus({ preventScroll: true });

    return () => {
      document.removeEventListener("pointerdown", handleOutsidePointer);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className="relative shrink-0"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            if (open) aboutRef.current?.focus();
            else setOpen(true);
          }
        }}
        className={`inline-flex min-h-11 items-center gap-1 whitespace-nowrap transition hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300 ${active ? "font-bold text-orange-300" : "text-zinc-300"}`}
      >
        {label}
        <ChevronDown size={14} aria-hidden="true" className={open ? "rotate-180" : ""} />
      </button>
      {open ? (
        <div
          id={panelId}
          className="absolute right-0 top-full z-[100] mt-2 min-w-44 border border-white/15 bg-zinc-950 p-2 text-sm shadow-xl shadow-black/50"
        >
          <Link
            ref={aboutRef}
            href="/about"
            aria-current={active ? "page" : undefined}
            onClick={() => setOpen(false)}
            className="flex min-h-11 items-center px-3 py-2 text-zinc-200 transition hover:bg-white/5 hover:text-orange-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-300"
          >
            {aboutLabel}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
