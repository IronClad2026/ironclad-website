"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Award, LockKeyhole, Sparkles } from "lucide-react";

import BadgeArtwork from "@/components/badges/BadgeArtwork";
import PremiumBadgeEffects from "@/components/badges/PremiumBadgeEffects";
import {
  getLocalizedRarity,
  localizeBadgeItem,
  resolveBadgesDictionary,
} from "@/components/badges/badgeUi";
import {
  BADGE_RARITY_TOKENS,
  getBadgeFallbackLabel,
  getBadgeSlotPresentation,
} from "@/lib/badges/presentation";
import type {
  BadgeCollectionItem,
  BadgePresentationEntitlement,
} from "@/lib/badges/types";
import type { BadgesDictionary } from "@/lib/i18n/badges";

const defaultEntitlement: BadgePresentationEntitlement = {
  premiumEffectsEnabled: false,
};

export type BadgeSlotProps = {
  item: BadgeCollectionItem;
  entitlement?: BadgePresentationEntitlement;
  onSelect?: (item: BadgeCollectionItem) => void;
  className?: string;
  unrevealed?: boolean;
  settling?: boolean;
  destinationRef?: (element: HTMLElement | null) => void;
  dictionary?: BadgesDictionary;
};

export default function BadgeSlot({
  item,
  entitlement = defaultEntitlement,
  onSelect,
  className = "",
  unrevealed,
  settling = false,
  destinationRef,
  dictionary,
}: BadgeSlotProps) {
  const copy = resolveBadgesDictionary(dictionary);
  const localizedItem = localizeBadgeItem(item, copy);
  const isEarned = localizedItem.state === "earned";
  const isUnrevealed =
    isEarned && (unrevealed ?? localizedItem.award.isUnrevealed === true);
  const isVisuallyEarned = isEarned && !isUnrevealed;
  const rarityLabel = getLocalizedRarity(
    copy,
    localizedItem.definition.rarity
  );
  const tokens = BADGE_RARITY_TOKENS[localizedItem.definition.rarity];
  const presentation = getBadgeSlotPresentation(localizedItem, entitlement);
  const fallbackLabel = getBadgeFallbackLabel(localizedItem.definition);
  const Icon = isUnrevealed ? Sparkles : isEarned ? Award : LockKeyhole;
  const openBadge = () => onSelect?.(localizedItem);
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.button
      type="button"
      aria-label={`${localizedItem.definition.name}, ${rarityLabel}, ${
        isUnrevealed
          ? `${copy.states.earned}, ${copy.states.new}`
          : isEarned
            ? copy.states.earned
            : copy.states.locked
      }`}
      data-badge-slug={localizedItem.definition.slug}
      data-badge-state={localizedItem.state}
      data-badge-presentation={
        isUnrevealed ? "unrevealed" : isEarned ? "earned" : "locked"
      }
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
      animate={
        settling
          ? prefersReducedMotion
            ? { opacity: [1, 0.82, 1] }
            : {
                scale: [1, 1.025, 1],
                boxShadow: [
                  "0 14px 30px rgba(0,0,0,0.28)",
                  "0 0 34px rgba(249,115,22,0.32)",
                  "0 14px 30px rgba(0,0,0,0.28)",
                ],
              }
          : { scale: 1 }
      }
      transition={{ duration: prefersReducedMotion ? 0.24 : 0.62 }}
      className={`group relative isolate flex h-full min-h-[22rem] w-full cursor-pointer flex-col overflow-hidden rounded-lg border p-2.5 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_14px_30px_rgba(0,0,0,0.28)] transition hover:-translate-y-0.5 hover:border-orange-300/45 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_18px_34px_rgba(249,115,22,0.08),0_18px_34px_rgba(0,0,0,0.32)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300 sm:p-3 ${
        isVisuallyEarned
          ? `${tokens.borderClassName} bg-[linear-gradient(180deg,rgba(35,29,23,0.98),rgba(12,12,13,0.98))] ring-1 ring-orange-300/16 hover:ring-orange-300/28`
          : isUnrevealed
            ? "border-zinc-500/35 bg-[linear-gradient(180deg,rgba(40,40,43,0.98),rgba(11,11,12,0.98))] ring-1 ring-zinc-400/10"
            : "border-zinc-800/80 bg-[linear-gradient(180deg,rgba(28,28,31,0.96),rgba(11,11,12,0.98))] text-zinc-500"
      } ${className}`}
    >
      {isVisuallyEarned ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-4 top-0 z-10 h-px bg-gradient-to-r from-transparent via-orange-200/32 to-transparent"
        />
      ) : null}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(circle_at_50%_0%,rgba(249,115,22,0.1),transparent_38%)]"
      />
      <PremiumBadgeEffects
        active={presentation.premiumEffectsEnabled && !isUnrevealed}
        rarity={localizedItem.definition.rarity}
        compact
      />

      <span
        className="relative z-10 isolate flex h-60 shrink-0 items-center justify-center"
      >
        <BadgeArtwork
          item={localizedItem}
          variant="slot"
          className="relative z-10 w-full max-w-60"
          presentation={isUnrevealed ? "unrevealed" : "revealed"}
          dictionary={copy}
          rootRef={destinationRef}
          revealDestination={isEarned}
        />
      </span>

      <span className="relative z-10 mt-2.5 flex min-w-0 flex-1 flex-col">
        <span className="flex h-5 shrink-0 items-center gap-2 text-[10px] font-black uppercase tracking-wider">
          <Icon size={14} aria-hidden="true" />
          <span
            className={isVisuallyEarned ? tokens.textClassName : "text-zinc-400"}
          >
            {isUnrevealed
              ? copy.states.new
              : isEarned
                ? copy.states.earned
                : copy.states.locked}
          </span>
          <span className="ml-auto text-zinc-500">{fallbackLabel}</span>
          {presentation.premiumEffectsEnabled ? (
            <Sparkles size={13} className="text-orange-200" aria-hidden="true" />
          ) : null}
        </span>
        <span className="mt-2 flex h-10 shrink-0 items-start line-clamp-2 text-sm font-black text-white">
          {localizedItem.definition.name}
        </span>
        <span
          className={`mt-auto flex min-h-7 w-fit items-center rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${
            isVisuallyEarned
              ? tokens.badgeClassName
              : "border-white/10 bg-white/[0.03] text-zinc-500"
          }`}
        >
          {rarityLabel}
        </span>
      </span>
    </motion.button>
  );
}
