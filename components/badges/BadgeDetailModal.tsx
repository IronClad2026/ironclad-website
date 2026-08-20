"use client";

import { CalendarDays, LockKeyhole, ShieldCheck, X } from "lucide-react";
import { useEffect } from "react";
import { createPortal } from "react-dom";

import BadgeArtwork from "@/components/badges/BadgeArtwork";
import PremiumBadgeEffects from "@/components/badges/PremiumBadgeEffects";
import {
  BADGE_RARITY_TOKENS,
  getAwardDisplayDate,
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

export type BadgeDetailModalProps = {
  item: BadgeCollectionItem;
  entitlement?: BadgePresentationEntitlement;
  onClose: () => void;
};

export default function BadgeDetailModal({
  item,
  entitlement = defaultEntitlement,
  onClose,
}: BadgeDetailModalProps) {
  const tokens = BADGE_RARITY_TOKENS[item.definition.rarity];
  const rarityLabel = getBadgeRarityLabel(item.definition.rarity);
  const presentation = getBadgeSlotPresentation(item, entitlement);
  const awardDate = getAwardDisplayDate(item);
  const portalTarget =
    typeof document === "undefined" ? null : document.body;

  useEffect(() => {
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
  }, [onClose]);

  if (!portalTarget) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[10000] grid place-items-center p-4 sm:p-6">
      <button
        type="button"
        aria-label="Dismiss badge details"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-black/78 backdrop-blur-md"
      />
      <article
        role="dialog"
        aria-modal="true"
        aria-labelledby={`badge-detail-${item.definition.slug}`}
        className={`relative max-h-[calc(100dvh-2rem)] w-full max-w-4xl overflow-y-auto rounded-lg border bg-[linear-gradient(180deg,rgba(24,24,27,0.98),rgba(8,8,9,0.98))] shadow-2xl shadow-black/55 ${tokens.borderClassName}`}
      >
        <PremiumBadgeEffects
          active={presentation.premiumEffectsEnabled}
          rarity={item.definition.rarity}
        />

        <header className="relative z-10 flex items-start justify-between gap-5 border-b border-white/10 p-5 sm:p-6">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.25em] text-orange-300">
              IronClad badge
            </p>
            <p className="mt-2 text-[10px] font-black uppercase tracking-wider text-zinc-500">
              Badge {getBadgeFallbackLabel(item.definition)}
            </p>
            <h2
              id={`badge-detail-${item.definition.slug}`}
              className="mt-2 break-words text-2xl font-black text-white"
            >
              {item.definition.name}
            </h2>
            <span
              className={`mt-3 inline-flex rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-wider ${tokens.badgeClassName}`}
            >
              {rarityLabel}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close badge details"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/[0.04] text-zinc-400 transition hover:border-orange-400/45 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </header>

        <div className="relative z-10 grid gap-5 p-5 sm:grid-cols-[minmax(260px,340px)_1fr] sm:p-6">
          <BadgeArtwork
            item={item}
            variant="detail"
            className="mx-auto max-w-[340px]"
          />

          <div className="grid gap-4">
            <div className="rounded-lg border border-orange-300/10 bg-black/35 p-4">
              <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
                Unlock meaning
              </p>
              <p className="mt-2 text-sm leading-6 text-zinc-200">
                {item.definition.unlockMeaning}
              </p>
            </div>

            <div className="rounded-lg border border-orange-300/10 bg-black/35 p-4">
              <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-zinc-500">
                {item.state === "earned" ? (
                  <ShieldCheck size={14} aria-hidden="true" />
                ) : (
                  <LockKeyhole size={14} aria-hidden="true" />
                )}
                Status
              </p>
              <p className="mt-2 text-sm font-bold text-white">
                {item.state === "earned" ? "Earned" : "Locked"}
              </p>
            </div>

            {awardDate ? (
              <div className="rounded-lg border border-orange-300/10 bg-black/35 p-4">
                <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-zinc-500">
                  <CalendarDays size={14} aria-hidden="true" />
                  Original awarded
                </p>
                <time
                  dateTime={awardDate}
                  className="mt-2 block text-sm font-bold text-white"
                >
                  {formatBadgeDate(awardDate)}
                </time>
              </div>
            ) : null}
          </div>
        </div>
      </article>
    </div>,
    portalTarget
  );
}

function formatBadgeDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(date);
}
