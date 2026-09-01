"use client";

import { CalendarDays, LockKeyhole, ShieldCheck, X } from "lucide-react";
import { useRef } from "react";
import { createPortal } from "react-dom";

import BadgeArtwork from "@/components/badges/BadgeArtwork";
import PremiumBadgeEffects from "@/components/badges/PremiumBadgeEffects";
import {
  getLocalizedRarity,
  interpolateBadgeCopy,
  localizeBadgeItem,
  resolveBadgesDictionary,
} from "@/components/badges/badgeUi";
import { useBadgeModalDialog } from "@/components/badges/useBadgeModalDialog";
import {
  BADGE_RARITY_TOKENS,
  getAwardDisplayDate,
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

export type BadgeDetailModalProps = {
  item: BadgeCollectionItem;
  entitlement?: BadgePresentationEntitlement;
  onClose: () => void;
  dictionary?: BadgesDictionary;
  locale?: string;
};

export default function BadgeDetailModal({
  item,
  entitlement = defaultEntitlement,
  onClose,
  dictionary,
  locale = "en",
}: BadgeDetailModalProps) {
  const copy = resolveBadgesDictionary(dictionary);
  const localizedItem = localizeBadgeItem(item, copy);
  const tokens = BADGE_RARITY_TOKENS[localizedItem.definition.rarity];
  const rarityLabel = getLocalizedRarity(
    copy,
    localizedItem.definition.rarity
  );
  const presentation = getBadgeSlotPresentation(localizedItem, entitlement);
  const awardDate = getAwardDisplayDate(localizedItem);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const isUnrevealed =
    localizedItem.state === "earned" &&
    localizedItem.award.isUnrevealed === true;
  const { dialogRef, overlayRootRef } = useBadgeModalDialog({
    open: true,
    onDismiss: onClose,
    initialFocusRef: closeButtonRef,
  });
  const portalTarget =
    typeof document === "undefined" ? null : document.body;

  if (!portalTarget) {
    return null;
  }

  return createPortal(
    <div
      ref={overlayRootRef}
      className="fixed inset-0 z-[10000] grid place-items-center p-4 sm:p-6"
    >
      <button
        type="button"
        aria-label={copy.detail.dismiss}
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-black/78 backdrop-blur-md"
      />
      <article
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        aria-labelledby={`badge-detail-${localizedItem.definition.slug}`}
        className={`relative max-h-[calc(100dvh-2rem)] w-full max-w-4xl overflow-y-auto rounded-lg border bg-[linear-gradient(180deg,rgba(24,24,27,0.98),rgba(8,8,9,0.98))] shadow-2xl shadow-black/55 ${tokens.borderClassName}`}
      >
        <PremiumBadgeEffects
          active={presentation.premiumEffectsEnabled && !isUnrevealed}
          rarity={localizedItem.definition.rarity}
        />

        <header className="relative z-10 flex items-start justify-between gap-5 border-b border-white/10 p-5 sm:p-6">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.25em] text-orange-300">
              {copy.detail.eyebrow}
            </p>
            <p className="mt-2 text-[10px] font-black uppercase tracking-wider text-zinc-500">
              {interpolateBadgeCopy(copy.detail.badgeNumber, {
                number: getBadgeFallbackLabel(localizedItem.definition),
              })}
            </p>
            <h2
              id={`badge-detail-${localizedItem.definition.slug}`}
              className="mt-2 break-words text-2xl font-black text-white"
            >
              {localizedItem.definition.name}
            </h2>
            <span
              className={`mt-3 inline-flex rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-wider ${tokens.badgeClassName}`}
            >
              {rarityLabel}
            </span>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label={copy.detail.close}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/[0.04] text-zinc-400 transition hover:border-orange-400/45 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </header>

        <div className="relative z-10 grid gap-5 p-5 sm:grid-cols-[minmax(260px,340px)_1fr] sm:p-6">
          <BadgeArtwork
            item={localizedItem}
            variant="detail"
            className="mx-auto max-w-[340px]"
            presentation={isUnrevealed ? "unrevealed" : "default"}
            dictionary={copy}
          />

          <div className="grid gap-4">
            <div className="rounded-lg border border-orange-300/10 bg-black/35 p-4">
              <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
                {copy.detail.unlockMeaning}
              </p>
              <p className="mt-2 text-sm leading-6 text-zinc-200">
                {localizedItem.definition.unlockMeaning}
              </p>
            </div>

            <div className="rounded-lg border border-orange-300/10 bg-black/35 p-4">
              <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-zinc-500">
                {localizedItem.state === "earned" ? (
                  <ShieldCheck size={14} aria-hidden="true" />
                ) : (
                  <LockKeyhole size={14} aria-hidden="true" />
                )}
                {copy.detail.status}
              </p>
              <p className="mt-2 text-sm font-bold text-white">
                {localizedItem.state === "earned"
                  ? copy.states.earned
                  : copy.states.locked}
              </p>
            </div>

            {awardDate ? (
              <div className="rounded-lg border border-orange-300/10 bg-black/35 p-4">
                <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-zinc-500">
                  <CalendarDays size={14} aria-hidden="true" />
                  {copy.detail.originalAwarded}
                </p>
                <time
                  dateTime={awardDate}
                  className="mt-2 block text-sm font-bold text-white"
                >
                  {formatBadgeDate(awardDate, locale)}
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

function formatBadgeDate(value: string, locale: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeZone: "UTC",
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en", {
      dateStyle: "medium",
      timeZone: "UTC",
    }).format(date);
  }
}
