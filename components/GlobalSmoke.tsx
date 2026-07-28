"use client";

import { useEffect, useRef } from "react";

export default function GlobalSmoke() {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    video.muted = true;

    void video.play().catch((error) => {
      console.error("Smoke video playback failed:", error);
    });
  }, []);

  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100vh",
        zIndex: 9999,
        pointerEvents: "none",
        overflow: "hidden",
        opacity: 0.35,
      }}
    >
      <video
        ref={videoRef}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        src="/effects/smoke.webm"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
        }}
      />
    </div>
  );
}