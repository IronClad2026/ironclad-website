"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";

const audioSource = "/audio/ironclad-theme.mp3";
const defaultVolume = 0.72;

export default function SiteMusicPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackError, setPlaybackError] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    audio.volume = defaultVolume;

    const handlePlay = () => {
      setPlaybackError(false);
      setIsPlaying(true);
    };
    const handlePause = () => setIsPlaying(false);
    const handleError = () => {
      setIsPlaying(false);
      setPlaybackError(true);
    };

    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handlePause);
    audio.addEventListener("error", handleError);

    return () => {
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handlePause);
      audio.removeEventListener("error", handleError);
    };
  }, []);

  const togglePlayback = async () => {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    if (!audio.paused) {
      audio.pause();
      return;
    }

    setPlaybackError(false);

    try {
      await audio.play();
    } catch {
      setIsPlaying(false);
      setPlaybackError(true);
    }
  };

  return (
    <aside
      aria-label="IronClad theme music player"
      className="fixed right-4 bottom-24 z-30 flex items-center gap-2 border border-orange-400/30 bg-black/80 p-2 text-white shadow-2xl shadow-black/40 backdrop-blur-md motion-safe:transition sm:right-6 lg:bottom-6"
    >
      <audio ref={audioRef} src={audioSource} preload="metadata" loop />

      <button
        type="button"
        onClick={togglePlayback}
        aria-label={isPlaying ? "Pause IronClad theme" : "Play IronClad theme"}
        aria-pressed={isPlaying}
        className="grid h-12 w-12 shrink-0 place-items-center border border-orange-400/45 bg-orange-500/10 text-orange-200 transition hover:border-orange-300/70 hover:bg-orange-500/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300"
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
          className="max-w-28 pr-2 text-xs leading-5 text-amber-200"
        >
          Music unavailable
        </span>
      )}
    </aside>
  );
}
