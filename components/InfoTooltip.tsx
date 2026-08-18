"use client";

import { CircleHelp } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEvent,
} from "react";

type InfoTooltipProps = {
  label: string;
  content: string;
  align?: "start" | "center" | "end";
};

const alignmentClasses = {
  start: "left-0",
  center: "left-1/2 -translate-x-1/2",
  end: "right-0",
} as const;

export default function InfoTooltip({
  label,
  content,
  align = "center",
}: InfoTooltipProps) {
  const tooltipId = useId();
  const containerRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const closeOutside = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("pointerdown", closeOutside);

    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("pointerdown", closeOutside);
    };
  }, [open]);

  const closeWhenFocusLeaves = (event: FocusEvent<HTMLSpanElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      setOpen(false);
    }
  };

  return (
    <span
      ref={containerRef}
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocusCapture={() => setOpen(true)}
      onBlurCapture={closeWhenFocusLeaves}
    >
      <button
        type="button"
        aria-label={label}
        aria-controls={tooltipId}
        aria-expanded={open}
        aria-describedby={open ? tooltipId : undefined}
        onClick={() => setOpen(true)}
        className="inline-grid h-7 w-7 place-items-center rounded-full border border-white/15 bg-black/45 text-zinc-400 transition hover:border-orange-400/45 hover:text-orange-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300"
      >
        <CircleHelp size={15} aria-hidden="true" />
      </button>

      {open ? (
        <span
          id={tooltipId}
          role="tooltip"
          className={`absolute top-full z-50 mt-2 w-72 max-w-[calc(100vw-2rem)] border border-orange-400/35 bg-zinc-950 p-3 text-left text-xs font-medium normal-case leading-5 tracking-normal text-zinc-200 shadow-2xl shadow-black/60 ${alignmentClasses[align]}`}
        >
          {content}
        </span>
      ) : null}
    </span>
  );
}
