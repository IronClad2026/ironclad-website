"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Music2, Pause, Play, Volume2, VolumeX } from "lucide-react";

const audioSource = "/audio/ironclad-theme.mp3";
const inactivityDelay = 7000;

function formatTime(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return "0:00";
  }

  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60)
    .toString()
    .padStart(2, "0");

  return `${minutes}:${seconds}`;
}

export default function SiteMusicPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasActivePointerRef = useRef(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.72);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);

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

    if (!audio) return;

    const syncMetadata = () => {
      if (!Number.isFinite(audio.duration) || audio.duration <= 0) {
        return;
      }

      setDuration(audio.duration);
      setPlaybackError(null);
    };
    const syncTime = () => {
      if (!Number.isFinite(audio.duration) || audio.duration <= 0) {
        return;
      }

      setCurrentTime(audio.currentTime || 0);
    };
    const handlePlay = () => {
      setPlaybackError(null);
      setSoundEnabled(true);
      setIsPlaying(true);
      resetInactivityTimer();
    };
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };
    const handleError = () => {
      setIsPlaying(false);
      setPlaybackError("Theme unavailable");
      console.error("IronClad theme audio failed to load.", {
        src: audio.currentSrc || audioSource,
        networkState: audio.networkState,
        readyState: audio.readyState,
        mediaErrorCode: audio.error?.code ?? null,
        mediaErrorMessage: audio.error?.message ?? null,
      });
    };

    audio.addEventListener("loadedmetadata", syncMetadata);
    audio.addEventListener("durationchange", syncMetadata);
    audio.addEventListener("canplay", syncMetadata);
    audio.addEventListener("timeupdate", syncTime);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);

    syncMetadata();

    return () => {
      audio.removeEventListener("loadedmetadata", syncMetadata);
      audio.removeEventListener("durationchange", syncMetadata);
      audio.removeEventListener("canplay", syncMetadata);
      audio.removeEventListener("timeupdate", syncTime);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
    };
  }, [resetInactivityTimer]);

  useEffect(() => {
    const audio = audioRef.current;

    if (!audio) return;

    audio.volume = volume;
    audio.muted = isMuted;
  }, [isMuted, volume]);

  const startPlayback = async () => {
    const audio = audioRef.current;

    if (!audio) return false;

    try {
      await audio.play();
      return true;
    } catch {
      setIsPlaying(false);
      setPlaybackError("Playback blocked");
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

    if (!audio) return;

    resetInactivityTimer();

    if (isPlaying) {
      audio.pause();
      return;
    }

    await startPlayback();
  };

  const enableSound = async () => {
    resetInactivityTimer();
    await startPlayback();
  };

  const handleSeek = (value: string) => {
    const audio = audioRef.current;
    const nextTime = Number(value);

    if (
      !audio ||
      !Number.isFinite(nextTime) ||
      !Number.isFinite(duration) ||
      duration <= 0
    ) {
      return;
    }

    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
    resetInactivityTimer();
  };

  const handleVolume = (value: string) => {
    const nextVolume = Number(value);

    if (!Number.isFinite(nextVolume)) return;

    setVolume(nextVolume);

    if (nextVolume > 0 && isMuted) {
      setIsMuted(false);
    }

    resetInactivityTimer();
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
      aria-label="IronClad theme music player"
      className={
        isCollapsed
          ? "fixed right-4 bottom-4 z-30 border border-orange-400/30 bg-black/78 p-2 text-white shadow-2xl shadow-black/40 backdrop-blur-md motion-safe:transition-all motion-safe:duration-300 sm:right-6 sm:bottom-6"
          : "fixed right-4 bottom-4 z-30 w-[min(calc(100vw-2rem),24rem)] border border-orange-400/30 bg-black/78 p-3 text-white shadow-2xl shadow-black/40 backdrop-blur-md motion-safe:transition-all motion-safe:duration-300 sm:right-6 sm:bottom-6"
      }
      {...(!isCollapsed ? interactionHandlers : {})}
    >
      <audio ref={audioRef} src={audioSource} preload="metadata" loop />

      {isCollapsed ? (
        <button
          type="button"
          onClick={resetInactivityTimer}
          aria-label="Open music player"
          className="relative grid h-12 w-12 place-items-center border border-orange-400/45 bg-orange-500/10 text-orange-200 transition hover:border-orange-300/70 hover:bg-orange-500/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300"
        >
          {isPlaying ? (
            <Volume2 size={20} aria-hidden="true" />
          ) : (
            <Music2 size={20} aria-hidden="true" />
          )}
          <span
            aria-hidden="true"
            className={`absolute top-2 right-2 h-2 w-2 rounded-full ${
              isPlaying
                ? "bg-orange-300 shadow-[0_0_10px_rgba(251,146,60,0.75)] motion-safe:animate-pulse"
                : "bg-zinc-500"
            }`}
          />
          <span className="sr-only">
            {isPlaying ? "Audio playing" : "Audio paused"}
          </span>
        </button>
      ) : (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={togglePlayback}
            aria-label={
              isPlaying ? "Pause IronClad theme" : "Play IronClad theme"
            }
            className="grid h-11 w-11 shrink-0 place-items-center border border-orange-400 bg-orange-500 text-black transition hover:border-orange-300 hover:bg-orange-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300"
          >
            {isPlaying ? (
              <Pause size={19} aria-hidden="true" />
            ) : (
              <Play size={19} aria-hidden="true" />
            )}
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3">
              <p className="flex min-w-0 items-center gap-2 text-xs font-black uppercase text-orange-200">
                <Music2 size={14} className="shrink-0" aria-hidden="true" />
                <span className="truncate">IronClad Theme</span>
              </p>
              {soundEnabled ? (
                <span className="shrink-0 text-[11px] font-bold text-zinc-500">
                  {playbackError ??
                    `${formatTime(currentTime)} / ${formatTime(duration)}`}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={enableSound}
                  className="motion-safe:animate-pulse inline-flex min-h-9 shrink-0 items-center justify-center border border-orange-400/45 bg-orange-500/10 px-3 text-[11px] font-black uppercase text-orange-200 transition hover:border-orange-300/70 hover:bg-orange-500/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300"
                >
                  Enable Sound
                </button>
              )}
            </div>

            <input
              type="range"
              min="0"
              max={duration || 0}
              step="0.1"
              value={Math.min(currentTime, duration || 0)}
              onChange={(event) => handleSeek(event.target.value)}
              aria-label="Seek IronClad theme"
              className="mt-2 h-1 w-full cursor-pointer accent-orange-400"
            />
          </div>

          <div className="hidden items-center gap-2 sm:flex">
            <button
              type="button"
              onClick={() => setIsMuted((current) => !current)}
              aria-label={
                isMuted ? "Unmute IronClad theme" : "Mute IronClad theme"
              }
              className="grid h-9 w-9 shrink-0 place-items-center border border-white/12 bg-white/[0.04] text-zinc-200 transition hover:border-orange-400/60 hover:text-orange-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300"
            >
              {isMuted || volume === 0 ? (
                <VolumeX size={17} aria-hidden="true" />
              ) : (
                <Volume2 size={17} aria-hidden="true" />
              )}
            </button>

            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={volume}
              onChange={(event) => handleVolume(event.target.value)}
              aria-label="IronClad theme volume"
              className="h-1 w-16 cursor-pointer accent-orange-400"
            />
          </div>
        </div>
      )}
    </aside>
  );
}
