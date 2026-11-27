"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type RefObject } from "react";
import { readyWardrobeHref, readyWardrobeOpenEvent } from "@/lib/wardrobe/catalogue";
import styles from "./ReadyAssistant.module.css";

const shownKey = "ironclad-ready:invitation:v1:shown";
const lastKey = "ironclad-ready:invitation:v1:last";
const quietTime = 30_000;
const activityEvents = ["pointerdown", "keydown", "scroll", "focusin", "focusout", "input"] as const;

type Invitation = "help" | "wardrobe";
type Position = { top: number; left: number; width: number; maxHeight: number };

function preferredInvitation(): Invitation | null {
  try {
    if (sessionStorage.getItem(shownKey)) return null;
    return localStorage.getItem(lastKey) === "help" ? "wardrobe" : "help";
  } catch {
    // If the tab limit cannot be retained, keep the assistant quiet.
    return null;
  }
}

function recordInvitation(kind: Invitation): boolean {
  try {
    if (sessionStorage.getItem(shownKey)) return false;
    sessionStorage.setItem(shownKey, "1");
    localStorage.setItem(lastKey, kind);
    return true;
  } catch {
    return false;
  }
}

function editingForm() {
  return Boolean(document.activeElement?.closest(
    "form, input, select, textarea, [contenteditable]:not([contenteditable='false']), [role='textbox']",
  ) || document.querySelector("dialog[open], [role='dialog'][aria-modal='true']:not([hidden]):not([inert])"));
}

function positionAtDock(dock: HTMLButtonElement): Position | null {
  const rect = dock.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const viewport = window.visualViewport;
  const margin = 12;
  const viewLeft = viewport?.offsetLeft ?? 0;
  const viewTop = viewport?.offsetTop ?? 0;
  const viewRight = viewLeft + (viewport?.width ?? window.innerWidth);
  const viewBottom = viewTop + (viewport?.height ?? window.innerHeight);
  if (rect.bottom <= viewTop || rect.top >= viewBottom) return null;

  const width = Math.min(288, viewRight - viewLeft - 2 * margin);
  const left = Math.max(viewLeft + margin, Math.min(rect.left, viewRight - margin - width));
  const headerBottom = dock.closest("header")?.getBoundingClientRect().bottom ?? rect.bottom;
  const top = Math.max(viewTop, rect.bottom, headerBottom) + 8;
  const music = document.querySelector("[data-site-music-player]")?.getBoundingClientRect();
  const overlapsMusicColumn = music && music.height > 0 && music.left < left + width &&
    music.right > left && music.bottom > top;
  const bottom = Math.min(viewBottom, overlapsMusicColumn ? music.top : viewBottom) - margin;
  if (width < 180 || bottom - top < 120) return null;
  return { top, left, width, maxHeight: bottom - top };
}

async function canInviteToWardrobe(sessionId: string, signal: AbortSignal) {
  try {
    const response = await fetch("/api/ready/wardrobe", { cache: "no-store", signal });
    if (!response.ok) return false;
    const state = await response.json();
    return state?.sessionId === sessionId && (state.access === "admin" || state.access === "subscriber");
  } catch {
    return false;
  }
}

export default function ReadyDockInvitation({ dock, wardrobeSessionId, onAsk }: {
  dock: RefObject<HTMLButtonElement | null>;
  wardrobeSessionId: string | null;
  onAsk: () => void;
}) {
  const [offer, setOffer] = useState<{ kind: Invitation; position: Position } | null>(null);
  const shown = useRef<Invitation | null>(null);

  useEffect(() => {
    if (!preferredInvitation()) return;
    let timer: number | undefined;
    let request: AbortController | undefined;
    let observer: ResizeObserver | undefined;
    let stopped = false;

    function hide() {
      shown.current = null;
      observer?.disconnect();
      setOffer(null);
    }

    function reposition() {
      if (!shown.current || stopped) return;
      const position = dock.current && positionAtDock(dock.current);
      if (!position || document.hidden || editingForm()) hide();
      else setOffer({ kind: shown.current, position });
    }

    async function showWhenQuiet() {
      const preferred = preferredInvitation();
      const anchor = dock.current;
      if (!preferred || !anchor || document.hidden || editingForm() || !positionAtDock(anchor)) return;
      const attempt = new AbortController();
      request = attempt;
      const alreadyOpen = window.location.pathname === "/dashboard" &&
        new URLSearchParams(window.location.search).get("wardrobe") === "open";
      const wardrobe = preferred === "wardrobe" && wardrobeSessionId && !alreadyOpen &&
        await canInviteToWardrobe(wardrobeSessionId, attempt.signal);
      if (stopped || attempt.signal.aborted || document.hidden || editingForm()) return;
      const position = positionAtDock(anchor);
      if (!position) return;
      const kind = wardrobe ? "wardrobe" : "help";
      if (!recordInvitation(kind)) return;
      shown.current = kind;
      setOffer({ kind, position });
      if (typeof ResizeObserver !== "undefined") {
        observer = new ResizeObserver(reposition);
        observer.observe(anchor);
        const header = anchor.closest("header");
        if (header) observer.observe(header);
        const music = document.querySelector("[data-site-music-player]");
        if (music) observer.observe(music);
      }
    }

    function activity() {
      if (shown.current) {
        if (document.hidden || editingForm()) hide();
        return;
      }
      window.clearTimeout(timer);
      request?.abort();
      if (!document.hidden && preferredInvitation()) {
        timer = window.setTimeout(showWhenQuiet, quietTime);
      }
    }

    function viewportChanged() {
      if (shown.current) reposition();
      else activity();
    }

    activity();
    for (const type of activityEvents) window.addEventListener(type, activity, { capture: true, passive: true });
    document.addEventListener("visibilitychange", activity);
    window.addEventListener("resize", viewportChanged);
    window.visualViewport?.addEventListener("resize", viewportChanged);
    window.visualViewport?.addEventListener("scroll", viewportChanged);
    return () => {
      stopped = true;
      shown.current = null;
      observer?.disconnect();
      window.clearTimeout(timer);
      request?.abort();
      for (const type of activityEvents) window.removeEventListener(type, activity, true);
      document.removeEventListener("visibilitychange", activity);
      window.removeEventListener("resize", viewportChanged);
      window.visualViewport?.removeEventListener("resize", viewportChanged);
      window.visualViewport?.removeEventListener("scroll", viewportChanged);
    };
  }, [dock, wardrobeSessionId]);

  if (!offer || (offer.kind === "wardrobe" && !wardrobeSessionId)) return null;
  const wardrobe = offer.kind === "wardrobe";
  function close() {
    shown.current = null;
    setOffer(null);
  }
  function dismiss() {
    close();
    dock.current?.focus({ preventScroll: true });
  }

  return (
    <section aria-label="Ready invitation" className={styles.dockInvitation}
      data-ready-invitation={offer.kind} style={offer.position}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.stopPropagation();
        dismiss();
      }}>
      <p>{wardrobe ? "Want to change my look, Commander?" : "I’m Ready, Commander. Need a hand with IronClad?"}</p>
      <div className={styles.dockInvitationActions}>
        {wardrobe ? (
          <Link className={styles.dockInvitationAction} href={readyWardrobeHref} prefetch={false}
            onNavigate={(event) => {
              close();
              if (window.location.pathname !== "/dashboard") return;
              event.preventDefault();
              window.dispatchEvent(new Event(readyWardrobeOpenEvent));
            }}>Open wardrobe</Link>
        ) : <button className={styles.dockInvitationAction} onClick={onAsk} type="button">Ask Ready</button>}
        <button className={styles.dockInvitationDismiss} onClick={dismiss} type="button">Dismiss</button>
      </div>
    </section>
  );
}
