"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Pause, Play } from "lucide-react";
import { usePathname } from "next/navigation";
import { useOptionalTranslations } from "@/components/i18n/LocaleProvider";
import englishCommon from "@/lib/i18n/dictionaries/en/common";

const audioSource = "/audio/ironclad-theme.mp3";
const inactivityDelay = 7000;
const defaultVolume = 0.72;

export default function SiteMusicPlayer() {
  const pathname = usePathname();
  const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/");

  return isAdminRoute ? null : <SiteMusicControls />;
}

function SiteMusicControls() {
  const t = useOptionalTranslations("common", englishCommon);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasActivePointerRef = useRef(false);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [playbackError, setPlaybackError] = useState(false);

  const clearInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
  }, []);

  const startInactivityTimer = useCallback(() => {
    clearInactivityTimer();

    inactivityTimerRef.current = setTimeout(() => {
      inactivityTimerRef.current = null;

      if (hasActivePointerRef.current) {
        return;
      }

      setIsCollapsed(true);
    }, inactivityDelay);
  }, [clearInactivityTimer]);

  const resetInactivityTimer = useCallback(() => {
    setIsCollapsed(false);
    startInactivityTimer();
  }, [startInactivityTimer]);

  useEffect(() => {
    return clearInactivityTimer;
  }, [clearInactivityTimer]);

  useEffect(() => {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    const handlePlay = () => {
      setPlaybackError(false);
      setIsPlaying(true);
      resetInactivityTimer();
    };

    const handlePause = () => {
      setIsPlaying(false);
    };

    const handleEnded = () => {
      setIsPlaying(false);
    };

    const handleError = () => {
      setIsPlaying(false);
      setPlaybackError(true);

      console.error("IronClad theme audio failed to load.", {
        src: audio.currentSrc || audioSource,
        networkState: audio.networkState,
        readyState: audio.readyState,
        mediaErrorCode: audio.error?.code ?? null,
        mediaErrorMessage: audio.error?.message ?? null,
      });
    };

    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);

    return () => {
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
    };
  }, [resetInactivityTimer]);

  useEffect(() => {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    audio.volume = defaultVolume;
    audio.muted = false;
  }, []);

  const startPlayback = async () => {
    const audio = audioRef.current;

    if (!audio) {
      return false;
    }

    setPlaybackError(false);

    try {
      await audio.play();
      return true;
    } catch {
      setIsPlaying(false);
      setPlaybackError(true);

      console.error("IronClad theme playback failed.", {
        src: audio.currentSrc || audioSource,
        networkState: audio.networkState,
        readyState: audio.readyState,
        mediaErrorCode: audio.error?.code ?? null,
        mediaErrorMessage: audio.error?.message ?? null,
      });

      return false;
    }
  };

  const togglePlayback = async () => {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    resetInactivityTimer();

    if (isPlaying) {
      audio.pause();
      return;
    }

    await startPlayback();
  };

  const handleFocus = () => {
    resetInactivityTimer();
  };

  const handlePointerDown = () => {
    hasActivePointerRef.current = true;
    resetInactivityTimer();
  };

  const handlePointerRelease = () => {
    hasActivePointerRef.current = false;
    resetInactivityTimer();
  };

  const interactionHandlers = {
    onFocusCapture: handleFocus,
    onClick: resetInactivityTimer,
    onKeyDown: resetInactivityTimer,
    onPointerMove: resetInactivityTimer,
    onPointerDownCapture: handlePointerDown,
    onPointerUpCapture: handlePointerRelease,
    onPointerCancelCapture: handlePointerRelease,
  };

  return (
    <aside
      aria-label={t("music.playerLabel")}
      className={
        isCollapsed
          ? "fixed right-4 bottom-4 z-30 grid place-items-center border border-orange-400/30 bg-black/78 p-2 text-white shadow-2xl shadow-black/40 backdrop-blur-md motion-safe:transition-all motion-safe:duration-300 sm:right-6 sm:bottom-6"
          : "fixed right-4 bottom-4 z-30 grid place-items-center border border-orange-400/30 bg-black/78 p-3 text-white shadow-2xl shadow-black/40 backdrop-blur-md motion-safe:transition-all motion-safe:duration-300 sm:right-6 sm:bottom-6"
      }
      {...(!isCollapsed ? interactionHandlers : {})}
    >
      <audio
        ref={audioRef}
        src={audioSource}
        preload="metadata"
        loop
      />

      <button
        type="button"
        onClick={togglePlayback}
        aria-label={isPlaying ? t("music.pause") : t("music.play")}
        aria-pressed={isPlaying}
        className="grid h-12 w-12 place-items-center border border-orange-400/45 bg-orange-500/10 text-orange-200 transition hover:border-orange-300/70 hover:bg-orange-500/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300 sm:h-11 sm:w-11"
      >
        {isPlaying ? (
          <Pause size={19} aria-hidden="true" />
        ) : (
          <Play size={19} aria-hidden="true" />
        )}
      </button>

      {playbackError && (
        <span
          role="status"
          aria-live="polite"
          className="mt-2 max-w-28 text-center text-xs leading-5 text-amber-200"
        >
          {t("music.unavailable")}
        </span>
      )}
    </aside>
  );
}
