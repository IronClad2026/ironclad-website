"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";
import { READY_DOCK_POSTER_DATA } from "@/lib/ready/poster-data";
import { readyWardrobeOpenEvent } from "@/lib/wardrobe/catalogue";

const wardrobeId = "ready-wardrobe";
const wardrobeHash = `#${wardrobeId}`;
const panelId = `${wardrobeId}-panel`;
const headingId = `${wardrobeId}-heading`;

const WardrobePilot = dynamic(() => import("@/components/ready/WardrobePilot"), {
  ssr: false,
  loading: () => <p className="py-3 text-sm text-zinc-300" role="status">Loading Ready’s wardrobe…</p>,
});

function writeWardrobeLocation(open: boolean) {
  const url = new URL(window.location.href);
  if (open) {
    url.searchParams.set("wardrobe", "open");
    url.hash = wardrobeHash;
  } else {
    url.searchParams.delete("wardrobe");
    if (url.hash === wardrobeHash) url.hash = "";
  }
  if (url.href !== window.location.href) window.history.replaceState(null, "", url);
}

export default function DashboardReadyWardrobe() {
  const open = useSearchParams()?.get("wardrobe") === "open";
  const section = useRef<HTMLElement>(null);
  const focusSection = useCallback(() => {
    section.current?.focus({ preventScroll: true });
    section.current?.scrollIntoView({ block: "start" });
  }, []);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(focusSection);
    return () => window.cancelAnimationFrame(frame);
  }, [open, focusSection]);

  useEffect(() => {
    function openFromInvitation() {
      writeWardrobeLocation(true);
      if (open) focusSection();
    }
    function focusFromHash() {
      if (open && window.location.hash === wardrobeHash) focusSection();
    }
    window.addEventListener(readyWardrobeOpenEvent, openFromInvitation);
    window.addEventListener("hashchange", focusFromHash);
    return () => {
      window.removeEventListener(readyWardrobeOpenEvent, openFromInvitation);
      window.removeEventListener("hashchange", focusFromHash);
    };
  }, [open, focusSection]);

  return (
    <section
      ref={section}
      id={wardrobeId}
      tabIndex={-1}
      aria-labelledby={headingId}
      className="my-3 min-w-0 scroll-mt-28 rounded-xl border border-white/15 bg-zinc-950/85 px-3 py-2.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300 sm:scroll-mt-32"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="mr-auto flex min-w-0 items-center gap-2">
          {!open ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt="" src={READY_DOCK_POSTER_DATA} width={44} height={44} className="size-11 shrink-0 object-contain" />
          ) : null}
          <h3 id={headingId} className="break-words text-sm font-bold text-zinc-100">Ready Wardrobe</h3>
        </div>
        <button
          type="button"
          aria-controls={panelId}
          aria-expanded={open}
          onClick={() => writeWardrobeLocation(!open)}
          className="min-h-11 max-w-full rounded-md border border-orange-300/50 px-3 py-2 text-left text-sm font-semibold text-orange-200 transition hover:border-orange-300 hover:bg-orange-500/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300"
        >
          {open ? "Close wardrobe" : "Open wardrobe"}
        </button>
      </div>
      <div id={panelId} hidden={!open}>
        {open ? <WardrobePilot embedded /> : null}
      </div>
    </section>
  );
}
