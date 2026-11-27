"use client";

import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type FocusEvent, type KeyboardEvent, type PointerEvent } from "react";
import PublicCasterCard from "@/components/caster/PublicCasterCard";
import type { PublicCasterCopy } from "@/lib/caster/public-copy";
import type { PublicCasterCard as Caster } from "@/lib/caster/publication";
import styles from "./CasterShowcaseCarousel.module.css";

export const CASTER_SHOWCASE_PIXELS_PER_SECOND = 22;
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

export default function CasterShowcaseCarousel({ casters, copy, documentNavigation }: {
  casters: Caster[]; copy: PublicCasterCopy; documentNavigation?: boolean;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const original = useRef<HTMLUListElement>(null);
  const pendingPosition = useRef<number | null>(null);
  const blockedClick = useRef(false);
  const touch = useRef<{ x: number; y: number; position: number | null } | null>(null);
  const [dimensions, setDimensions] = useState({ distance: 0, repetitions: 0, canScroll: true });
  const [paused, setPaused] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  const [focused, setFocused] = useState(false);
  const [touching, setTouching] = useState(false);
  const reducedMotion = useSyncExternalStore(subscribeToMotion, () => window.matchMedia?.(REDUCED_MOTION).matches ?? false, () => false);
  const documentHidden = useSyncExternalStore(subscribeToVisibility, () => document.hidden, () => false);
  const count = casters.length;
  const staticTrack = !dimensions.distance || reducedMotion || browsing || focused;
  const pausedByUser = browsing || paused;

  useEffect(() => {
    const tray = viewport.current;
    const group = original.current;
    if (!tray || !group || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const distance = group.getBoundingClientRect().width;
      const visible = tray.clientWidth;
      if (distance <= 0 || visible <= 0) return;
      const repetitions = Math.ceil(visible / distance);
      const canScroll = distance > visible;
      setDimensions((current) => current.distance === distance && current.repetitions === repetitions && current.canScroll === canScroll
        ? current : { distance, repetitions, canScroll });
    });
    observer.observe(tray);
    observer.observe(group);
    return () => observer.disconnect();
  }, [count]);

  function reveal(position: number) {
    const card = original.current?.children[position];
    if (viewport.current && card instanceof HTMLElement) viewport.current.scrollLeft = card.offsetLeft;
  }

  useEffect(() => {
    if (!staticTrack || pendingPosition.current === null) return;
    reveal(pendingPosition.current);
    pendingPosition.current = null;
  }, [staticTrack]);

  if (!count) return null;
  if (count === 1) return <PublicCasterCard caster={casters[0]} copy={copy} promote documentNavigation={documentNavigation} />;

  function itemPosition(target: EventTarget) {
    const item = target instanceof Element ? target.closest("[data-caster-position]") : null;
    return item ? Number(item.getAttribute("data-caster-position")) : null;
  }

  function firstVisiblePosition() {
    const tray = viewport.current;
    const group = original.current;
    const scroll = tray && group
      ? staticTrack ? tray.scrollLeft : tray.getBoundingClientRect().left - group.getBoundingClientRect().left
      : 0;
    let position = 0;
    let best = Infinity;
    Array.from(original.current?.children ?? []).forEach((item, index) => {
      if (!(item instanceof HTMLElement)) return;
      const distance = Math.abs(item.offsetLeft - scroll);
      if (distance < best) {
        best = distance;
        position = index;
      }
    });
    return position;
  }

  function browse(direction: -1 | 1, position = firstVisiblePosition()) {
    const next = (position + count + direction) % count;
    setBrowsing(true);
    if (staticTrack) reveal(next);
    else pendingPosition.current = next;
  }

  function handleKeys(event: KeyboardEvent<HTMLDivElement>) {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const focusedPosition = itemPosition(event.target);
    const direction = event.key === "ArrowLeft" ? -1 : 1;
    if (focusedPosition !== null) {
      const next = original.current?.children[(focusedPosition + count + direction) % count]?.querySelector("a");
      next?.focus();
    } else browse(direction);
  }

  function focusCard(event: FocusEvent<HTMLDivElement>) {
    if (!(event.target instanceof Element) || !event.target.matches(":focus-visible") ||
      event.target.closest("[data-caster-repeat]")) return;
    const position = itemPosition(event.target);
    if (position === null) return;
    setFocused(true);
    if (staticTrack) reveal(position);
    else pendingPosition.current = position;
  }

  function startTouch(event: PointerEvent<HTMLDivElement>) {
    blockedClick.current = false;
    if (event.pointerType !== "touch" || !event.isPrimary || staticTrack) return;
    touch.current = { x: event.clientX, y: event.clientY, position: itemPosition(event.target) };
    setTouching(true);
  }

  function finishTouch(event: PointerEvent<HTMLDivElement>) {
    const start = touch.current;
    touch.current = null;
    setTouching(false);
    if (!start || !event.isPrimary || event.pointerType !== "touch") return;
    const horizontal = event.clientX - start.x;
    const vertical = event.clientY - start.y;
    if (Math.abs(horizontal) < 32 || Math.abs(horizontal) < Math.abs(vertical) * 1.25) return;
    blockedClick.current = true;
    browse(horizontal < 0 ? 1 : -1, start.position ?? undefined);
  }

  const trackStyle = {
    "--caster-distance": `${dimensions.distance}px`,
    "--caster-duration": `${dimensions.distance / CASTER_SHOWCASE_PIXELS_PER_SECOND}s`,
  } as CSSProperties;

  return (
    <div role="group" aria-labelledby="official-caster-showcase" className="min-w-0" onKeyDown={handleKeys}>
      <div className="mb-4 flex min-h-11 flex-wrap items-center justify-between gap-2">
        {!reducedMotion && dimensions.distance ? (
          <button type="button" className={control} onClick={() => {
            if (pausedByUser) {
              setPaused(false);
              setBrowsing(false);
              if (browsing && viewport.current) viewport.current.scrollLeft = 0;
            } else setPaused(true);
          }}>
            {pausedByUser ? <Play size={16} aria-hidden="true" /> : <Pause size={16} aria-hidden="true" />}
            {pausedByUser ? copy.resume : copy.pause}
          </button>
        ) : null}
        {dimensions.canScroll ? (
          <div className="ml-auto flex items-center gap-2">
            <button type="button" className={control} aria-label={copy.previous} onClick={() => browse(-1)}><ChevronLeft size={20} aria-hidden="true" /></button>
            <button type="button" className={control} aria-label={copy.next} onClick={() => browse(1)}><ChevronRight size={20} aria-hidden="true" /></button>
          </div>
        ) : null}
      </div>
      <div
        ref={viewport} className={styles.viewport} data-caster-showcase-viewport
        data-mode={staticTrack ? "browse" : "moving"} data-paused={paused || documentHidden || touching ? "true" : undefined}
        onFocus={focusCard} onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
        }}
        onPointerDown={startTouch} onPointerUp={finishTouch} onPointerCancel={() => { touch.current = null; setTouching(false); }}
        onClickCapture={(event) => {
          if (!blockedClick.current || !event.detail) return;
          blockedClick.current = false;
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        <div className={styles.track} style={trackStyle} data-caster-showcase-track>
          <ul ref={original} className={styles.group} data-caster-original>
            {casters.map((caster, position) => (
              <li key={caster.slug} data-caster-position={position}>
                <PublicCasterCard caster={caster} copy={copy} promote documentNavigation={documentNavigation} />
              </li>
            ))}
          </ul>
          {Array.from({ length: dimensions.repetitions }, (_, repetition) => (
            <ul key={repetition} aria-hidden="true" className={styles.group} data-caster-repeat>
              {casters.map((caster, position) => (
                <li key={caster.slug} data-caster-position={position}>
                  <PublicCasterCard caster={caster} copy={copy} promote repeat documentNavigation={documentNavigation} />
                </li>
              ))}
            </ul>
          ))}
        </div>
      </div>
    </div>
  );
}
