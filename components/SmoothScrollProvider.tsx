"use client";

import type Lenis from "lenis";
import { useEffect, useRef, type ReactNode } from "react";

type SmoothScrollProviderProps = {
  children: ReactNode;
};

let lenisModulePromise: Promise<typeof import("lenis")> | null = null;

function loadLenis() {
  if (!lenisModulePromise) {
    lenisModulePromise = import("lenis").catch((error: unknown) => {
      lenisModulePromise = null;
      throw error;
    });
  }

  return lenisModulePromise;
}

function hasNativeScrollableAncestor(node: HTMLElement) {
  let current: HTMLElement | null = node;

  while (current && current !== document.body) {
    const style = window.getComputedStyle(current);
    const canScrollY =
      /(auto|scroll|overlay)/.test(style.overflowY) &&
      current.scrollHeight > current.clientHeight;

    if (canScrollY) return true;

    current = current.parentElement;
  }

  return false;
}

function shouldPreventLenis(node: HTMLElement) {
  return Boolean(
    node.closest(
      [
        "[data-lenis-prevent]",
        "[data-lenis-prevent-wheel]",
        "[role='dialog']",
        "[aria-modal='true']",
        ".cl-modalBackdrop",
        ".cl-modalContent",
        ".cl-rootBox",
      ].join(", ")
    ) || hasNativeScrollableAncestor(node)
  );
}

function isBodyScrollLocked() {
  return (
    document.body.style.overflow === "hidden" ||
    document.documentElement.style.overflow === "hidden"
  );
}

export default function SmoothScrollProvider({
  children,
}: SmoothScrollProviderProps) {
  const lenisRef = useRef<Lenis | null>(null);

  useEffect(() => {
    const reducedMotionQuery = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    );
    const coarsePointerQuery = window.matchMedia("(pointer: coarse)");
    const hoverNoneQuery = window.matchMedia("(hover: none)");
    const desktopQuery = window.matchMedia("(min-width: 1024px)");

    let mutationObserver: MutationObserver | null = null;
    let active = true;
    let loading = false;

    const shouldUseLenis = () =>
      desktopQuery.matches &&
      !reducedMotionQuery.matches &&
      !coarsePointerQuery.matches &&
      !hoverNoneQuery.matches &&
      (navigator.maxTouchPoints ?? 0) === 0;

    const stop = () => {
      lenisRef.current?.destroy();
      lenisRef.current = null;
      mutationObserver?.disconnect();
      mutationObserver = null;
    };

    const syncBodyLock = () => {
      const lenis = lenisRef.current;
      if (!lenis) return;

      if (isBodyScrollLocked()) {
        lenis.stop();
      } else {
        lenis.start();
      }
    };

    const start = async () => {
      if (!active || loading || lenisRef.current || !shouldUseLenis()) return;

      loading = true;
      try {
        const { default: Lenis } = await loadLenis();

        // Capabilities or this effect's lifetime may change while loading.
        if (!active || lenisRef.current || !shouldUseLenis()) return;

        lenisRef.current = new Lenis({
          anchors: true,
          autoRaf: true,
          autoResize: true,
          lerp: 0.08,
          smoothWheel: true,
          syncTouch: false,
          wheelMultiplier: 0.85,
          prevent: shouldPreventLenis,
        });

        mutationObserver = new MutationObserver(syncBodyLock);
        mutationObserver.observe(document.body, {
          attributes: true,
          attributeFilter: ["style", "class"],
        });
        mutationObserver.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ["style", "class"],
        });
        syncBodyLock();
      } catch {
        // A failed optional chunk must leave native scrolling available.
        if (active) stop();
      } finally {
        loading = false;
      }
    };

    const refresh = () => {
      if (shouldUseLenis()) {
        void start();
      } else {
        stop();
      }
    };

    refresh();

    reducedMotionQuery.addEventListener("change", refresh);
    coarsePointerQuery.addEventListener("change", refresh);
    hoverNoneQuery.addEventListener("change", refresh);
    desktopQuery.addEventListener("change", refresh);
    window.addEventListener("resize", refresh);

    return () => {
      active = false;
      reducedMotionQuery.removeEventListener("change", refresh);
      coarsePointerQuery.removeEventListener("change", refresh);
      hoverNoneQuery.removeEventListener("change", refresh);
      desktopQuery.removeEventListener("change", refresh);
      window.removeEventListener("resize", refresh);
      stop();
    };
  }, []);

  return <>{children}</>;
}
