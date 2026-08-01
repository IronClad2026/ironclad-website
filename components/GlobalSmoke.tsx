"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useSyncExternalStore,
} from "react";
import { useReducedMotion } from "framer-motion";

const subscribe = () => () => {};

export default function GlobalSmoke() {
  const videoRef = useRef<HTMLVideoElement>(null);

  const isHydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  );

  const reduceMotion = useReducedMotion();

  const resumePlayback = useCallback(async () => {
    const video = videoRef.current;

    if (
      !video ||
      document.visibilityState === "hidden" ||
      reduceMotion !== false
    ) {
      return;
    }

    video.muted = true;
    video.defaultMuted = true;

    try {
      await video.play();
    } catch (error) {
      console.error("Smoke video playback failed:", error);
    }
  }, [reduceMotion]);

  const restartLoop = useCallback(() => {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    video.currentTime = 0;
    void resumePlayback();
  }, [resumePlayback]);

  useEffect(() => {
    if (!isHydrated || reduceMotion !== false) {
      return;
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        return;
      }

      window.setTimeout(() => {
        void resumePlayback();
      }, 150);
    };

    const handlePageShow = () => {
      window.setTimeout(() => {
        void resumePlayback();
      }, 150);
    };

    const handleWindowFocus = () => {
      void resumePlayback();
    };

    void resumePlayback();

    document.addEventListener(
      "visibilitychange",
      handleVisibilityChange
    );
    window.addEventListener("pageshow", handlePageShow);
    window.addEventListener("focus", handleWindowFocus);

    return () => {
      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange
      );
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("focus", handleWindowFocus);
    };
  }, [isHydrated, reduceMotion, resumePlayback]);

  if (!isHydrated || reduceMotion !== false) {
    return null;
  }

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[5] h-[100dvh] w-screen overflow-hidden opacity-[0.38] mix-blend-screen motion-reduce:hidden md:opacity-[0.16] md:mix-blend-normal"
    >
      <video
        ref={videoRef}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        disablePictureInPicture
        onEnded={restartLoop}
        onPause={() => {
          if (document.visibilityState === "visible") {
            window.setTimeout(() => {
              void resumePlayback();
            }, 150);
          }
        }}
        className="absolute inset-0 block h-full w-full object-cover object-center contrast-125 brightness-110 md:contrast-100 md:brightness-100"
      >
        <source src="/effects/smoke.webm" type="video/webm" />
      </video>
    </div>
  );
}