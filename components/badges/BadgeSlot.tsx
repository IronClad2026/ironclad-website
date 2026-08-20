"use client";

import { Award, LockKeyhole, Sparkles } from "lucide-react";

import BadgeArtwork from "@/components/badges/BadgeArtwork";
import PremiumBadgeEffects from "@/components/badges/PremiumBadgeEffects";
import {
  BADGE_RARITY_TOKENS,
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
  const isEarned = item.state === "earned";
  const rarityLabel = getBadgeRarityLabel(item.definition.rarity);
  const tokens = BADGE_RARITY_TOKENS[item.definition.rarity];
  const presentation = getBadgeSlotPresentation(item, entitlement);
  const fallbackLabel = getBadgeFallbackLabel(item.definition);
  const Icon = isEarned ? Award : LockKeyhole;
  const openBadge = () => onSelect?.(item);

  return (
    <button
      type="button"
      aria-label={`${item.definition.name}, ${rarityLabel}, ${
        isEarned ? "earned" : "locked"
      }`}
      data-badge-slug={item.definition.slug}
      data-badge-state={item.state}
      onClick={openBadge}
      onKeyDown={(event) => {
        if (
          event.key === "Enter" ||
          event.key === " " ||
          event.key === "Spacebar"
        ) {
          event.preventDefault();
          openBadge();
        }
      }}
      className={`group relative isolate flex h-full min-h-[16.5rem] w-full cursor-pointer flex-col overflow-hidden rounded-lg border p-3 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_14px_30px_rgba(0,0,0,0.28)] transition hover:-translate-y-0.5 hover:border-orange-300/45 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_18px_34px_rgba(0,0,0,0.34)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300 sm:p-4 ${
        isEarned
          ? `${tokens.borderClassName} bg-[linear-gradient(180deg,rgba(32,28,23,0.97),rgba(12,12,13,0.98))] ring-1 ring-orange-300/10`
          : "border-zinc-800/80 bg-[linear-gradient(180deg,rgba(25,25,27,0.96),rgba(10,10,11,0.98))] text-zinc-500"
      } ${className}`}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-4 top-0 z-10 h-px bg-gradient-to-r from-transparent via-orange-200/32 to-transparent"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(circle_at_50%_0%,rgba(249,115,22,0.1),transparent_38%)]"
      />
      <PremiumBadgeEffects
        active={presentation.premiumEffectsEnabled}
        rarity={item.definition.rarity}
        compact
      />

      <BadgeArtwork item={item} variant="slot" className="relative z-10" />

      <span className="relative z-10 mt-3 flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider">
          <Icon size={14} aria-hidden="true" />
          <span className={isEarned ? tokens.textClassName : "text-zinc-500"}>
            {isEarned ? "Earned" : "Locked"}
          </span>
          <span className="ml-auto text-zinc-500">{fallbackLabel}</span>
          {presentation.premiumEffectsEnabled ? (
            <Sparkles size={13} className="text-orange-200" aria-hidden="true" />
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
