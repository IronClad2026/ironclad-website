"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { useReducedMotion } from "framer-motion";

const subscribe = () => () => {};

export default function GlobalSmoke() {
  const videoRef = useRef<HTMLVideoElement>(null);

  const isHydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const video = videoRef.current;

    if (!video || !isHydrated || reduceMotion !== false) {
      return;
    }

    video.muted = true;

    void video.play().catch((error) => {
      console.error("Smoke video playback failed:", error);
    });
  }, [isHydrated, reduceMotion]);

  if (!isHydrated || reduceMotion !== false) {
    return null;
  }

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[5] h-[100dvh] w-screen overflow-hidden opacity-[0.16] motion-reduce:hidden"
    >
      <video
        ref={videoRef}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        className="absolute inset-0 block h-full w-full object-cover object-center"
      >
        <source src="/effects/smoke.webm" type="video/webm" />
      </video>
    </div>
  );
}