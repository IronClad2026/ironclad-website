"use client";

import { motion, useReducedMotion } from "framer-motion";

import { BADGE_RARITY_TOKENS } from "@/lib/badges/presentation";
import type { BadgeRarity } from "@/lib/badges/types";

export type PremiumBadgeEffectsProps = {
  active: boolean;
  rarity: BadgeRarity;
  compact?: boolean;
  className?: string;
  reducedMotion?: boolean;
};

export default function PremiumBadgeEffects({
  active,
  rarity,
  compact = false,
  className = "",
  reducedMotion,
}: PremiumBadgeEffectsProps) {
  const prefersReducedMotion = useReducedMotion();
  const shouldReduceMotion = reducedMotion ?? Boolean(prefersReducedMotion);

  if (!active) {
    return null;
  }

  const tokens = BADGE_RARITY_TOKENS[rarity];

  return (
    <span
      aria-hidden="true"
      data-premium-badge-effects="true"
      data-motion={shouldReduceMotion ? "reduced" : "animated"}
      className={`pointer-events-none absolute inset-0 overflow-hidden rounded-lg ${className}`}
    >
      <span
        className={`absolute inset-0 rounded-lg border ${tokens.borderClassName} ${tokens.glowClassName}`}
      />
      <span className="absolute inset-x-2 top-2 h-px bg-gradient-to-r from-transparent via-white/45 to-transparent" />
      <span className="absolute inset-x-2 bottom-2 h-px bg-gradient-to-r from-transparent via-orange-200/30 to-transparent" />
      <motion.span
        className={`absolute inset-y-0 -left-1/2 ${
          compact ? "w-1/3" : "w-1/4"
        } skew-x-[-18deg] bg-gradient-to-r from-transparent via-white/18 to-transparent`}
        initial={shouldReduceMotion ? false : { x: "-20%" }}
        animate={shouldReduceMotion ? undefined : { x: ["0%", "460%"] }}
        transition={
          shouldReduceMotion
            ? undefined
            : {
                duration: compact ? 3.4 : 4.2,
                ease: "easeInOut",
                repeat: Number.POSITIVE_INFINITY,
                repeatDelay: compact ? 2.4 : 3,
              }
        }
      />
    </span>
  );
}
