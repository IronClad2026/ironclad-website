"use client";

import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type PointerEvent } from "react";
import PublicCasterCard from "@/components/caster/PublicCasterCard";
import type { PublicCasterCopy } from "@/lib/caster/public-copy";
import type { PublicCasterCard as Caster } from "@/lib/caster/publication";
import styles from "./CasterShowcaseCarousel.module.css";

export const CASTER_SHOWCASE_DWELL_MS = 7_000;
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
const control = "inline-flex min-h-11 items-center justify-center gap-1.5 border border-white/15 bg-black px-3 py-2 text-sm font-bold text-zinc-200 hover:border-orange-400/50 hover:text-white focus-visible:outline-2 focus-visible:outline-orange-300";

function subscribeToMotion(listener: () => void) {
  const query = window.matchMedia?.(REDUCED_MOTION);
  query?.addEventListener("change", listener);
  return () => query?.removeEventListener("change", listener);
}

function subscribeToVisibility(listener: () => void) {
  document.addEventListener("visibilitychange", listener);
  return () => document.removeEventListener("visibilitychange", listener);
}

export default function CasterShowcaseCarousel({ casters, copy }: { casters: Caster[]; copy: PublicCasterCopy }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const blockTouchClick = useRef(false);
  const reducedMotion = useSyncExternalStore(subscribeToMotion, () => window.matchMedia?.(REDUCED_MOTION).matches ?? false, () => false);
  const documentHidden = useSyncExternalStore(subscribeToVisibility, () => document.hidden, () => false);
  const count = casters.length;
  const position = count > 0 ? index % count : 0;
  const rotating = count > 1 && !paused && !hovered && !focused && !reducedMotion && !documentHidden;

  useEffect(() => {
    if (!rotating) return;
    const timeout = window.setTimeout(() => setIndex((current) => (current + 1) % count), CASTER_SHOWCASE_DWELL_MS);
    return () => window.clearTimeout(timeout);
  }, [count, position, rotating]);

  if (count === 0) return null;
  if (count === 1) return <PublicCasterCard caster={casters[0]} copy={copy} promote />;

  function step(direction: -1 | 1) {
    setPaused(true);
    setIndex((current) => (current % count + direction + count) % count);
  }

  function handleKeys(event: KeyboardEvent<HTMLDivElement>) {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    step(event.key === "ArrowLeft" ? -1 : 1);
  }

  function startTouch(event: PointerEvent<HTMLDivElement>) {
    blockTouchClick.current = false;
    if (event.pointerType !== "touch" || !event.isPrimary) return;
    touchStart.current = { x: event.clientX, y: event.clientY };
    setPaused(true);
  }

  function finishTouch(event: PointerEvent<HTMLDivElement>) {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start || event.pointerType !== "touch" || !event.isPrimary) return;
    const horizontal = event.clientX - start.x;
    const vertical = event.clientY - start.y;
    if (Math.abs(horizontal) < 40 || Math.abs(horizontal) < Math.abs(vertical) * 1.25) return;
    blockTouchClick.current = true;
    step(horizontal > 0 ? -1 : 1);
  }

  return (
    <div
      role="group" aria-roledescription={copy.slideshow} aria-labelledby="official-caster-showcase"
      className="min-w-0" onKeyDown={handleKeys}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)} onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {!reducedMotion ? (
          <button type="button" className={control} onClick={() => setPaused((current) => !current)}>
            {paused ? <Play size={16} aria-hidden="true" /> : <Pause size={16} aria-hidden="true" />}
            {paused ? copy.resume : copy.pause}
          </button>
        ) : null}
        <button type="button" className={control} aria-label={copy.previous} onClick={() => step(-1)}><ChevronLeft size={20} aria-hidden="true" /></button>
        <button type="button" className={control} aria-label={copy.next} onClick={() => step(1)}><ChevronRight size={20} aria-hidden="true" /></button>
        <p className="ml-auto text-sm font-semibold whitespace-nowrap text-zinc-400 tabular-nums" aria-live={rotating ? "off" : "polite"} aria-atomic="true">
          <span className="sr-only">{casters[position].display_name} </span>{position + 1} / {count}
        </p>
      </div>
      <div
        className={`${styles.slide} h-[19rem] min-w-0 sm:h-[18rem]`}
        onPointerDown={startTouch} onPointerUp={finishTouch} onPointerCancel={() => { touchStart.current = null; }}
        onClickCapture={(event) => {
          if (!blockTouchClick.current || event.detail === 0) return;
          blockTouchClick.current = false;
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        <PublicCasterCard caster={casters[position]} copy={copy} promote animate />
      </div>
    </div>
  );
}
