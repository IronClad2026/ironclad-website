"use client";

import { Award, LockKeyhole, Sparkles } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

import PremiumBadgeEffects from "@/components/badges/PremiumBadgeEffects";
import {
  BADGE_RARITY_TOKENS,
  getBadgeAssetPath,
  getBadgeFallbackLabel,
  getBadgeRarityLabel,
  getBadgeSlotPresentation,
} from "@/lib/badges/presentation";
import type {
  BadgeCollectionItem,
  BadgePresentationEntitlement,
} from "@/lib/badges/types";

const defaultEntitlement: BadgePresentationEntitlement = {
  premiumEffectsEnabled: false,
};

export type BadgeSlotProps = {
  item: BadgeCollectionItem;
  entitlement?: BadgePresentationEntitlement;
  onSelect?: (item: BadgeCollectionItem) => void;
  className?: string;
};

export default function BadgeSlot({
  item,
  entitlement = defaultEntitlement,
  onSelect,
  className = "",
}: BadgeSlotProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const isEarned = item.state === "earned";
  const rarityLabel = getBadgeRarityLabel(item.definition.rarity);
  const tokens = BADGE_RARITY_TOKENS[item.definition.rarity];
  const presentation = getBadgeSlotPresentation(item, entitlement);
  const assetPath = getBadgeAssetPath(item);
  const fallbackLabel = getBadgeFallbackLabel(item.definition);
  const Icon = isEarned ? Award : LockKeyhole;

  return (
    <button
      type="button"
      aria-label={`${item.definition.name}, ${rarityLabel}, ${
        isEarned ? "earned" : "locked"
      }`}
      data-badge-slug={item.definition.slug}
      data-badge-state={item.state}
      onClick={() => onSelect?.(item)}
      className={`group relative flex h-full min-h-44 w-full flex-col overflow-hidden rounded-lg border p-3 text-left shadow-xl shadow-black/20 transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300 ${
        isEarned
          ? `${tokens.borderClassName} ${tokens.surfaceClassName} ${tokens.glowClassName}`
          : "border-white/10 bg-black/55 text-zinc-500 grayscale hover:border-orange-400/25 hover:grayscale-0"
      } ${className}`}
    >
      <PremiumBadgeEffects
        active={presentation.premiumEffectsEnabled}
        rarity={item.definition.rarity}
        compact
      />

      <span className="relative z-10 grid aspect-square min-h-0 w-full place-items-center overflow-hidden rounded-lg border border-white/10 bg-black/45">
        {!imageFailed ? (
          <Image
            src={assetPath}
            alt={`${item.definition.name} badge artwork`}
            width={128}
            height={128}
            unoptimized
            className={`h-full w-full object-contain p-3 ${
              isEarned ? "opacity-100" : "opacity-45"
            }`}
            onError={() => setImageFailed(true)}
          />
        ) : (
          <span
            data-testid="badge-asset-fallback"
            className={`grid h-16 w-16 place-items-center rounded-lg border text-xl font-black ${
              isEarned
                ? `${tokens.badgeClassName}`
                : "border-white/10 bg-zinc-900 text-zinc-500"
            }`}
          >
            {fallbackLabel}
          </span>
        )}

        {!isEarned ? (
          <span className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-lg border border-white/10 bg-black/70 text-zinc-500">
            <LockKeyhole size={16} aria-hidden="true" />
          </span>
        ) : null}
      </span>

      <span className="relative z-10 mt-3 flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider">
          <Icon size={14} aria-hidden="true" />
          <span className={isEarned ? tokens.textClassName : "text-zinc-500"}>
            {isEarned ? "Earned" : "Locked"}
          </span>
          {presentation.premiumEffectsEnabled ? (
            <Sparkles size={13} className="ml-auto text-orange-200" aria-hidden="true" />
          ) : null}
        </span>
        <span className="mt-2 line-clamp-2 text-sm font-black text-white">
          {item.definition.name}
        </span>
        <span
          className={`mt-auto w-fit rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${
            isEarned
              ? tokens.badgeClassName
              : "border-white/10 bg-white/[0.03] text-zinc-500"
          }`}
        >
          {rarityLabel}
        </span>
      </span>
    </button>
  );
}
