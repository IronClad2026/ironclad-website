"use client";

import { Award, LockKeyhole } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

import {
  BADGE_RARITY_TOKENS,
  getBadgeArtworkAsset,
  getBadgeFallbackLabel,
  getBadgeRarityLabel,
} from "@/lib/badges/presentation";
import type { BadgeCollectionItem } from "@/lib/badges/types";

type BadgeArtworkVariant = "slot" | "detail" | "reveal";

const frameClassNames: Record<BadgeArtworkVariant, string> = {
  slot: "aspect-square w-full",
  detail: "aspect-square w-full",
  reveal: "h-48 w-48 sm:h-56 sm:w-56",
};

const imageSizes: Record<BadgeArtworkVariant, number> = {
  slot: 280,
  detail: 340,
  reveal: 320,
};

const fallbackNumberClassNames: Record<BadgeArtworkVariant, string> = {
  slot: "text-5xl sm:text-6xl",
  detail: "text-6xl",
  reveal: "text-6xl",
};

const fallbackNameClassNames: Record<BadgeArtworkVariant, string> = {
  slot: "text-[11px] leading-4",
  detail: "text-sm leading-5",
  reveal: "text-sm leading-5",
};

export type BadgeArtworkProps = {
  item: BadgeCollectionItem;
  variant?: BadgeArtworkVariant;
  className?: string;
};

export default function BadgeArtwork({
  item,
  variant = "slot",
  className = "",
}: BadgeArtworkProps) {
  const artwork = getBadgeArtworkAsset(item.definition);
  const [failedArtworkSrc, setFailedArtworkSrc] = useState<string | null>(null);
  const isEarned = item.state === "earned";
  const tokens = BADGE_RARITY_TOKENS[item.definition.rarity];
  const rarityLabel = getBadgeRarityLabel(item.definition.rarity);
  const fallbackLabel = getBadgeFallbackLabel(item.definition);
  const showArtwork = Boolean(artwork && failedArtworkSrc !== artwork.src);
  const StatusIcon = isEarned ? Award : LockKeyhole;
  const surfaceClassName = showArtwork
    ? "overflow-visible rounded-lg bg-transparent"
    : "overflow-hidden rounded-lg bg-[radial-gradient(circle_at_50%_34%,rgba(249,115,22,0.14),rgba(39,39,42,0.32)_42%,transparent_72%)]";

  return (
    <span
      data-badge-artwork={showArtwork ? "real" : "fallback"}
      data-badge-number={fallbackLabel}
      data-badge-artwork-surface={showArtwork ? "card" : "fallback"}
      className={`pointer-events-none relative isolate grid place-items-center ${surfaceClassName} ${frameClassNames[variant]} ${className}`}
    >
      {showArtwork && artwork ? (
        <>
          <Image
            src={artwork.src}
            alt={artwork.alt}
            width={imageSizes[variant]}
            height={imageSizes[variant]}
            unoptimized
            data-testid="badge-artwork-image"
            className={`relative z-10 h-full w-full object-contain drop-shadow-[0_14px_18px_rgba(0,0,0,0.38)] ${
              isEarned
                ? "opacity-100"
                : "opacity-[0.72] grayscale brightness-[0.88] saturate-[0.72]"
            }`}
            onError={() => setFailedArtworkSrc(artwork.src)}
          />
          {!isEarned ? (
            <>
              <span
                aria-hidden="true"
                className="absolute inset-0 z-20 rounded-lg bg-black/12"
              />
              <span className="absolute right-1 top-1 z-30 grid h-8 w-8 place-items-center rounded-lg border border-white/10 bg-zinc-950/82 text-zinc-300 shadow-lg shadow-black/35">
                <LockKeyhole size={16} aria-hidden="true" />
              </span>
            </>
          ) : null}
        </>
      ) : (
        <span
          data-testid="badge-artwork-fallback"
          className={`relative z-10 flex h-full w-full min-w-0 flex-col items-center justify-center gap-2 p-4 text-center ${
            isEarned ? "text-white" : "text-zinc-500"
          }`}
        >
          <span
            aria-hidden="true"
            className="absolute left-[17%] top-[22%] h-[46%] w-[18%] rounded-l-full border-y border-l border-orange-300/12"
          />
          <span
            aria-hidden="true"
            className="absolute right-[17%] top-[22%] h-[46%] w-[18%] rounded-r-full border-y border-r border-orange-300/12"
          />
          <span
            className={`relative z-10 shrink-0 font-black leading-none tracking-normal ${
              fallbackNumberClassNames[variant]
            } ${
              isEarned
                ? tokens.textClassName
                : "text-zinc-300"
            }`}
          >
            {fallbackLabel}
          </span>
          <span
            className={`relative z-10 line-clamp-2 max-w-full break-words font-black ${
              fallbackNameClassNames[variant]
            } ${isEarned ? "text-white" : "text-zinc-400"}`}
          >
            {item.definition.name}
          </span>
          <span
            className={`relative z-10 max-w-full rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${
              isEarned
                ? tokens.badgeClassName
                : "border-orange-300/10 bg-black/35 text-zinc-500"
            }`}
          >
            {rarityLabel}
          </span>
          <span className="relative z-10 flex max-w-full items-center justify-center gap-1 text-[9px] font-black uppercase tracking-wider">
            <StatusIcon size={11} aria-hidden="true" />
            {isEarned ? "Earned" : "Locked"}
          </span>
        </span>
      )}
    </span>
  );
}
