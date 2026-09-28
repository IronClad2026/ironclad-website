"use client";

import Image from "next/image";
import { Trophy } from "lucide-react";
import { useState } from "react";

export default function TournamentHistoryArtwork({
  bannerImageUrl,
  className = "",
  tone = "orange",
}: {
  bannerImageUrl: string | null;
  className?: string;
  tone?: "orange" | "amber";
}) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const showImage = Boolean(bannerImageUrl && failedSource !== bannerImageUrl);

  return (
    <span
      aria-hidden="true"
      data-career-artwork={showImage ? "banner" : "fallback"}
      className={`relative grid overflow-hidden place-items-center bg-black/50 ${tone === "amber" ? "text-amber-300/70" : "text-orange-300/60"} ${className}`}
    >
      {showImage && bannerImageUrl ? (
        <Image
          src={bannerImageUrl}
          alt=""
          fill
          unoptimized
          sizes="(min-width: 1024px) 400px, (min-width: 640px) 50vw, 100vw"
          loading="lazy"
          className="object-cover"
          onError={() => setFailedSource(bannerImageUrl)}
        />
      ) : (
        <Trophy size={36} strokeWidth={1.25} />
      )}
      <span className="pointer-events-none absolute inset-0 border border-white/5 bg-gradient-to-t from-black/25 via-transparent to-transparent" />
    </span>
  );
}
