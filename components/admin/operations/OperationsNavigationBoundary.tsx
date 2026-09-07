"use client";

import type { ReactNode } from "react";

const domainFragments = new Set(["players", "registrations", "tournaments", "matches", "website-traffic"]);

// Reveal hidden panels before positioning fragments. Prevent the native/default
// and global smooth-scroll handlers from racing that post-render positioning.
export default function OperationsNavigationBoundary({ children }: { children: ReactNode; }) {
  return <div className="mx-auto max-w-7xl space-y-5" onClick={(event) => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
    const href = (event.target as Element).closest("a")?.getAttribute("href");
    if (!href?.startsWith("#")) return;
    const id = href.slice(1);
    if (!document.getElementById(id)) return;
    event.preventDefault();
    event.stopPropagation();
    window.history.pushState(null, "", href);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    requestAnimationFrame(() => {
      const target = document.getElementById(domainFragments.has(id) ? "analytics" : id);
      if (!target) return;
      for (let node: HTMLElement | null = target; node; node = node.parentElement) {
        if (node instanceof HTMLDetailsElement) node.open = true;
      }
      target.tabIndex = -1;
      target.focus({ preventScroll: true });
      target.scrollIntoView({ block: "start", behavior: "instant" });
    });
  }}>{children}</div>;
}
