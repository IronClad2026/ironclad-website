"use client";

import { Award, LockKeyhole, Sparkles } from "lucide-react";
import Image from "next/image";
import type { Ref } from "react";
import { useState } from "react";

import {
  getLocalizedRarity,
  interpolateBadgeCopy,
  localizeBadgeItem,
  resolveBadgesDictionary,
} from "@/components/badges/badgeUi";
import {
  BADGE_RARITY_TOKENS,
  getBadgeArtworkAsset,
  getBadgeFallbackLabel,
} from "@/lib/badges/presentation";
import type { BadgeCollectionItem } from "@/lib/badges/types";
import type { BadgesDictionary } from "@/lib/i18n/badges";

type BadgeArtworkVariant = "slot" | "detail" | "reveal";

const frameClassNames: Record<BadgeArtworkVariant, string> = {
  slot: "aspect-square w-full",
  detail: "aspect-square w-full",
  reveal: "aspect-square w-48 sm:w-56",
};

const imageDimensions: Record<BadgeArtworkVariant, number> = {
  slot: 280,
  detail: 340,
  reveal: 320,
};

const responsiveImageSizes: Record<BadgeArtworkVariant, string> = {
  slot:
    "(max-width: 639px) 42vw, (max-width: 1023px) 28vw, (max-width: 1535px) 20vw, 180px",
  detail: "(max-width: 639px) 80vw, 340px",
  reveal: "(max-width: 639px) 12rem, 14rem",
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
  presentation?: "default" | "unrevealed" | "revealed";
  alt?: string;
  dictionary?: BadgesDictionary;
  rootRef?: Ref<HTMLSpanElement>;
  revealDestination?: boolean;
  statusLabels?: {
    earned: string;
    locked: string;
    unrevealed: string;
  };
};

export default function BadgeArtwork({
  item,
  variant = "slot",
  className = "",
  presentation = "default",
  alt,
  dictionary,
  rootRef,
  revealDestination = false,
  statusLabels,
}: BadgeArtworkProps) {
  const copy = resolveBadgesDictionary(dictionary);
  const localizedItem = localizeBadgeItem(item, copy);
  const resolvedStatusLabels = statusLabels ?? {
    earned: copy.states.earned,
    locked: copy.states.locked,
    unrevealed: copy.states.new,
  };
  const artwork = getBadgeArtworkAsset(localizedItem.definition);
  const [failedArtworkSrc, setFailedArtworkSrc] = useState<string | null>(null);
  const isEarned = localizedItem.state === "earned";
  const isUnrevealed =
    isEarned &&
    (presentation === "unrevealed" ||
      (presentation === "default" && localizedItem.award.isUnrevealed === true));
  const isVisuallyEarned = isEarned && !isUnrevealed;
  const tokens = BADGE_RARITY_TOKENS[localizedItem.definition.rarity];
  const rarityLabel = getLocalizedRarity(
    copy,
    localizedItem.definition.rarity
  );
  const fallbackLabel = getBadgeFallbackLabel(localizedItem.definition);
  const showArtwork = Boolean(artwork && failedArtworkSrc !== artwork.src);
  const StatusIcon = isUnrevealed
    ? Sparkles
    : isEarned
      ? Award
      : LockKeyhole;
  const artworkScale = artwork?.scale ?? 1;

  return (
    <span
      ref={rootRef}
      data-badge-artwork={showArtwork ? "real" : "fallback"}
      data-badge-number={fallbackLabel}
      data-badge-artwork-surface={showArtwork ? "card" : "fallback"}
      data-badge-reveal-destination={revealDestination ? "true" : undefined}
      data-badge-presentation={
        isUnrevealed ? "unrevealed" : isEarned ? "earned" : "locked"
      }
      className={`pointer-events-none relative isolate grid place-items-center overflow-visible ${frameClassNames[variant]} ${className}`}
    >
      {showArtwork && artwork ? (
        <>
          <Image
            src={artwork.src}
            alt={
              alt ??
              interpolateBadgeCopy(copy.metadata.artworkAlt, {
                name: localizedItem.definition.name,
              })
            }
            width={imageDimensions[variant]}
            height={imageDimensions[variant]}
            sizes={responsiveImageSizes[variant]}
            data-testid="badge-artwork-image"
            className={`relative z-10 h-full w-full object-contain drop-shadow-[0_14px_18px_rgba(0,0,0,0.38)] ${
              isVisuallyEarned
                ? "opacity-100"
                : isUnrevealed
                  ? "opacity-90 grayscale brightness-[0.68] contrast-[1.14] saturate-0"
                  : "opacity-[0.8] grayscale brightness-[0.94] saturate-[0.78]"
            }`}
            style={{
              transform: `scale(${artworkScale})`,
              transformOrigin: "center",
            }}
            onError={() => setFailedArtworkSrc(artwork.src)}
          />
          {!isEarned ? (
            <span className="absolute right-1 top-1 z-30 grid h-8 w-8 place-items-center rounded-lg border border-white/10 bg-zinc-950/78 text-zinc-300 shadow-lg shadow-black/35">
              <LockKeyhole size={16} aria-hidden="true" />
            </span>
          ) : null}
          {isUnrevealed ? (
            <span
              aria-hidden="true"
              className="absolute inset-0 z-20 bg-[linear-gradient(112deg,transparent_30%,rgba(228,228,231,0.14)_48%,transparent_66%)] opacity-70 mix-blend-screen"
            />
          ) : null}
        </>
      ) : (
        <span
          data-testid="badge-artwork-fallback"
          className={`relative z-10 flex h-full w-full min-w-0 flex-col items-center justify-center gap-2 p-4 text-center ${
            isVisuallyEarned ? "text-white" : "text-zinc-500"
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
              isVisuallyEarned
                ? tokens.textClassName
                : "text-zinc-300"
            }`}
          >
            {fallbackLabel}
          </span>
          <span
            className={`relative z-10 line-clamp-2 max-w-full break-words font-black ${
              fallbackNameClassNames[variant]
            } ${isVisuallyEarned ? "text-white" : "text-zinc-400"}`}
          >
            {localizedItem.definition.name}
          </span>
          <span
            className={`relative z-10 max-w-full rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${
              isVisuallyEarned
                ? tokens.badgeClassName
                : "border-orange-300/10 bg-black/35 text-zinc-500"
            }`}
          >
            {rarityLabel}
          </span>
          <span className="relative z-10 flex max-w-full items-center justify-center gap-1 text-[9px] font-black uppercase tracking-wider">
            <StatusIcon size={11} aria-hidden="true" />
            {isUnrevealed
              ? resolvedStatusLabels.unrevealed
              : isEarned
                ? resolvedStatusLabels.earned
                : resolvedStatusLabels.locked}
          </span>
        </span>
      )}
    </span>
  );
}
