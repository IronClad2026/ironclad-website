"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { READY_DOCK_POSTER_DATA } from "@/lib/ready/poster-data";
import type { DashboardWardrobeMode } from "@/components/ready/WardrobePilot";

const WardrobePilot = dynamic(() => import("@/components/ready/WardrobePilot"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-20 items-center gap-3 rounded-lg border border-white/15 bg-[#1a1d1f] px-2.5 py-1.5" role="status">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img alt="" src={READY_DOCK_POSTER_DATA} width={64} height={64} className="size-16 shrink-0 object-contain" />
      <span className="text-sm text-zinc-300">Loading Ready’s wardrobe…</span>
    </div>
  ),
});

export default function DashboardReadyWardrobe({ mode, onOpen, onClose, active = true }: {
  mode: DashboardWardrobeMode;
  onOpen: () => void;
  onClose: () => void;
  active?: boolean;
}) {
  const open = mode === "wardrobe";
  const section = useRef<HTMLElement>(null);
  const [started, setStarted] = useState(active);
  if (active && !started) setStarted(true);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => section.current?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  return (
    <section
      ref={section}
      id="ready-wardrobe"
      tabIndex={-1}
      aria-labelledby={open ? "ready-wardrobe-heading" : undefined}
      aria-label={open ? undefined : "Ready Wardrobe"}
      data-wardrobe-expanded={open ? "true" : undefined}
      className="min-w-0 scroll-mt-28 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300 sm:scroll-mt-32"
    >
      {open && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h2 id="ready-wardrobe-heading" className="text-2xl font-semibold tracking-tight text-[#f5f2ed] sm:text-3xl">Ready Wardrobe</h2>
          <button type="button" onClick={onClose}
            className="min-h-11 rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm font-semibold text-zinc-100 hover:border-orange-400 focus-visible:outline-2 focus-visible:outline-orange-400">
            <span className="sm:hidden" aria-hidden="true">Close</span>
            <span className="sr-only sm:not-sr-only">Close wardrobe</span>
          </button>
        </div>
      )}
      {started && <WardrobePilot embedded dashboard={{ mode, onBrowseItems: onOpen, active }} />}
    </section>
  );
}
