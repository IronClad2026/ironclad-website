"use client";

import { useReducedMotion } from "framer-motion";
import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

export default function GlobalSmoke() {
  const isHydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const reduceMotion = useReducedMotion();

  if (!isHydrated || reduceMotion !== false) {
    return null;
  }

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[5] h-[100dvh] w-screen overflow-hidden opacity-[0.16] motion-reduce:hidden"
    >
      <video
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        className="absolute inset-0 block h-full w-full object-cover object-center"
      >
        <source src="/effects/smoke.webm" type="video/webm" />
      </video>
    </div>
  );
}
