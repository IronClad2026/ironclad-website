import { useCallback, useEffect, useRef, useState } from "react";
import type { FocusEvent, PointerEvent, RefObject } from "react";

const hoverGraceMs = 300;

export function useMascotCloudMenu(grip: RefObject<HTMLButtonElement | null>, panel: RefObject<HTMLDivElement | null>) {
  const [open, setOpen] = useState(false);
  const hovering = useRef(false);
  const pinned = useRef<"keyboard" | "touch" | null>(null);
  const restoringFocus = useRef(false);
  const timer = useRef<number | null>(null);

  const isInside = useCallback((target: EventTarget | null) =>
    target instanceof Node && !!(grip.current?.contains(target) || panel.current?.contains(target)), [grip, panel]);

  const clearGrace = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const dismiss = useCallback((returnFocus = false) => {
    clearGrace();
    hovering.current = false;
    pinned.current = null;
    if (returnFocus && panel.current?.contains(document.activeElement)) {
      restoringFocus.current = true;
      grip.current?.focus({ preventScroll: true });
      restoringFocus.current = false;
    }
    setOpen(false);
  }, [clearGrace, grip, panel]);

  useEffect(() => clearGrace, [clearGrace]);

  useEffect(() => {
    if (!open) return;
    const outsidePress = (event: globalThis.PointerEvent) => {
      if (!isInside(event.target)) dismiss();
    };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      dismiss(true);
    };
    document.addEventListener("pointerdown", outsidePress, true);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outsidePress, true);
      document.removeEventListener("keydown", escape);
    };
  }, [dismiss, isInside, open]);

  const reveal = () => {
    clearGrace();
    setOpen(true);
  };

  function toggle(source: "keyboard" | "touch") {
    if (open) {
      dismiss(true);
    } else {
      pinned.current = source;
      reveal();
    }
  }

  function enter(event: PointerEvent<HTMLElement>) {
    if (event.pointerType !== "mouse" || event.buttons !== 0) return;
    hovering.current = true;
    reveal();
  }

  function leave(event: PointerEvent<HTMLElement>) {
    if (event.pointerType !== "mouse" || isInside(event.relatedTarget)) return;
    hovering.current = false;
    clearGrace();
    if (pinned.current) return;
    timer.current = window.setTimeout(() => dismiss(), hoverGraceMs);
  }

  function focus(event: FocusEvent<HTMLElement>) {
    if (restoringFocus.current || !event.target.matches(":focus-visible")) return;
    pinned.current = "keyboard";
    reveal();
  }

  function blur(event: FocusEvent<HTMLElement>) {
    if (pinned.current !== "keyboard" || isInside(event.relatedTarget)) return;
    pinned.current = null;
    if (!hovering.current) dismiss();
  }

  return { open, dismiss, toggle, events: { onPointerEnter: enter, onPointerLeave: leave, onFocus: focus, onBlur: blur } };
}
