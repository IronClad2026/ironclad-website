"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Sparkles, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import PremiumBadgeEffects from "@/components/badges/PremiumBadgeEffects";
import {
  BADGE_RARITY_TOKENS,
  getBadgeAssetPath,
  getBadgeFallbackLabel,
  getBadgeRarityLabel,
} from "@/lib/badges/presentation";
import type {
  BadgePresentationEntitlement,
  EarnedBadgeCollectionItem,
} from "@/lib/badges/types";

const defaultEntitlement: BadgePresentationEntitlement = {
  premiumEffectsEnabled: false,
};

export type BadgeRevealOverlayProps = {
  item: EarnedBadgeCollectionItem;
  open?: boolean;
  entitlement?: BadgePresentationEntitlement;
  reason?: "new-unlock" | "retroactive-premium";
  onClose: () => void;
  reducedMotion?: boolean;
};

export default function BadgeRevealOverlay({
  item,
  open = true,
  entitlement = defaultEntitlement,
  reason = "new-unlock",
  onClose,
  reducedMotion,
}: BadgeRevealOverlayProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  const shouldReduceMotion = reducedMotion ?? Boolean(prefersReducedMotion);
  const premium = entitlement.premiumEffectsEnabled;
  const tokens = BADGE_RARITY_TOKENS[item.definition.rarity];
  const rarityLabel = getBadgeRarityLabel(item.definition.rarity);
  const portalTarget =
    typeof document === "undefined" ? null : document.body;

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose, open]);

  if (!portalTarget) {
    return null;
  }

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div
          className="fixed inset-0 z-[10000] grid place-items-center p-4 sm:p-6"
          data-motion={shouldReduceMotion ? "reduced" : "animated"}
        >
          <motion.button
            type="button"
            aria-label="Dismiss badge reveal"
            onClick={onClose}
            className="absolute inset-0 h-full w-full cursor-default bg-black/88 backdrop-blur-md"
            initial={shouldReduceMotion ? false : { opacity: 0 }}
            animate={shouldReduceMotion ? undefined : { opacity: 1 }}
            exit={shouldReduceMotion ? undefined : { opacity: 0 }}
          />

          <motion.article
            role="dialog"
            aria-modal="true"
            aria-labelledby={`badge-reveal-${item.definition.slug}`}
            className={`relative w-full max-w-md overflow-hidden rounded-lg border bg-[linear-gradient(145deg,#18181b,#030712)] p-5 text-center shadow-2xl shadow-black/70 sm:p-7 ${tokens.borderClassName}`}
            initial={
              shouldReduceMotion ? false : { opacity: 0, scale: 0.96, y: 18 }
            }
            animate={
              shouldReduceMotion ? undefined : { opacity: 1, scale: 1, y: 0 }
            }
            exit={
              shouldReduceMotion ? undefined : { opacity: 0, scale: 0.97, y: 12 }
            }
          >
            <PremiumBadgeEffects
              active={premium}
              rarity={item.definition.rarity}
              reducedMotion={shouldReduceMotion}
            />

            <button
              type="button"
              onClick={onClose}
              aria-label="Close badge reveal"
              className="absolute right-3 top-3 z-20 grid h-9 w-9 place-items-center rounded-lg border border-white/10 bg-white/[0.04] text-zinc-400 transition hover:border-orange-400/45 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300"
            >
              <X size={18} aria-hidden="true" />
            </button>

            <div className="relative z-10 mx-auto grid h-40 w-40 place-items-center overflow-hidden rounded-lg border border-white/10 bg-black/45">
              {!imageFailed ? (
                <Image
                  src={getBadgeAssetPath(item, "static")}
                  alt={`${item.definition.name} badge artwork`}
                  width={160}
                  height={160}
                  unoptimized
                  className="h-full w-full object-contain p-5"
                  onError={() => setImageFailed(true)}
                />
              ) : (
                <span
                  data-testid="badge-reveal-asset-fallback"
                  className={`grid h-24 w-24 place-items-center rounded-lg border text-3xl font-black ${tokens.badgeClassName}`}
                >
                  {getBadgeFallbackLabel(item.definition)}
                </span>
              )}
            </div>

            <p className="relative z-10 mt-6 flex items-center justify-center gap-2 text-xs font-black uppercase tracking-[0.24em] text-orange-300">
              <Sparkles size={15} aria-hidden="true" />
              {premium
                ? "Premium badge reveal"
                : reason === "retroactive-premium"
                  ? "Badge reveal"
                  : "Badge unlocked"}
            </p>
            <h2
              id={`badge-reveal-${item.definition.slug}`}
              className="relative z-10 mt-3 text-3xl font-black text-white"
            >
              {item.definition.name}
            </h2>
            <p className="relative z-10 mt-3 text-sm font-bold uppercase tracking-wider text-zinc-400">
              {rarityLabel}
            </p>
            <p className="relative z-10 mt-4 text-sm leading-6 text-zinc-300">
              {item.definition.unlockMeaning}
            </p>
          </motion.article>
        </div>
      ) : null}
    </AnimatePresence>,
    portalTarget
  );
}
