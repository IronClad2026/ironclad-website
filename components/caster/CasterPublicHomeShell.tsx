"use client";

import { useEffect, type ReactNode } from "react";

export default function CasterPublicHomeShell({ children }: { children: ReactNode }) {
  useEffect(() => {
    // App Router can retain the previous page's root layout during client
    // navigation. A document load applies the restricted shell immediately.
    if (window.location.pathname === "/" && !document.body.hasAttribute("data-caster-public-home-document")) {
      window.location.replace(window.location.href);
    }
  }, []);

  return children;
}
