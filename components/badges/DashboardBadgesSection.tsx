"use client";

import { ArrowRight, Award, LockKeyhole, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { useMemo, useState } from "react";

import BadgeArtwork from "@/components/badges/BadgeArtwork";
import BadgeDetailModal from "@/components/badges/BadgeDetailModal";
import BadgeQueue from "@/components/badges/BadgeQueue";
import {
  getLocalizedRarity,
  interpolateBadgeCopy,
  localizeBadgeItem,
  resolveBadgesDictionary,
  retryBadgeLoad,
} from "@/components/badges/badgeUi";
import { useBadgeRevealDestinations } from "@/components/badges/useBadgeRevealDestinations";
import {
  BADGE_RARITY_TOKENS,
  getBadgeProgressSummary,
} from "@/lib/badges/presentation";
import {
  getDashboardBadgeShowcaseItems,
  type DashboardBadgeData,
} from "@/lib/badges/dashboard";
import type {
  BadgeCollectionItem,
  BadgeRevealAcknowledgeResult,
  BadgeRevealQueueItem,
} from "@/lib/badges/types";
import type { BadgesDictionary } from "@/lib/i18n/badges";

export type DashboardBadgesSectionProps = {
  badgeData: DashboardBadgeData | null;
  pendingReveals?: readonly BadgeRevealQueueItem[];
  acknowledgeRevealAction?: (
    awardId: string
  ) => Promise<BadgeRevealAcknowledgeResult>;
  loadError?: string | null;
  revealLoadError?: string | null;
  onRetry?: () => void;
  dictionary?: BadgesDictionary;
  locale?: string;
  reducedMotion?: boolean;
};

const SHOWCASE_LIMIT = 6;

export default function DashboardBadgesSection({
  badgeData,
  pendingReveals = [],
  acknowledgeRevealAction,
  loadError = null,
  revealLoadError = null,
  onRetry,
  dictionary,
  locale = "en",
  reducedMotion,
}: DashboardBadgesSectionProps) {
  const copy = resolveBadgesDictionary(dictionary);
  const [selectedItem, setSelectedItem] = useState<BadgeCollectionItem | null>(
    null
  );
  const [acknowledgedAwardIds, setAcknowledgedAwardIds] = useState<
    readonly string[]
  >([]);
  const {
    getDestinationRect,
    registerDestination,
    settleDestination,
    settlingSlug,
  } = useBadgeRevealDestinations();

  const activePendingReveal = useMemo(
    () =>
      pendingReveals
        .filter(
          (item) =>
            item.seenAt === null && !acknowledgedAwardIds.includes(item.id)
        )
        .sort(compareRevealQueueItems)[0] ?? null,
    [acknowledgedAwardIds, pendingReveals]
  );

  if (!badgeData || loadError || revealLoadError) {
    return (
      <section
        id="dashboard-badges"
        aria-labelledby="dashboard-badges-title"
        className="mt-10 scroll-mt-28 border border-red-400/25 bg-black/65 p-5 shadow-2xl shadow-black/30 backdrop-blur-xl sm:p-6"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-orange-400">
          {copy.dashboard.eyebrow}
        </p>
        <h2
          id="dashboard-badges-title"
          className="mt-3 text-2xl font-bold text-white"
        >
          {copy.dashboard.loadErrorTitle}
        </h2>
        <p role="alert" className="mt-3 max-w-2xl text-sm leading-6 text-zinc-300">
          {loadError ??
            revealLoadError ??
            copy.dashboard.loadErrorDescription}
        </p>
        <button
          type="button"
          onClick={() => retryBadgeLoad(onRetry)}
          className="mt-5 min-h-11 border border-orange-400 bg-orange-500 px-5 py-2.5 text-sm font-black uppercase tracking-wider text-black transition hover:bg-orange-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300"
        >
          {copy.dashboard.retry}
        </button>
      </section>
    );
  }

  const progress = getBadgeProgressSummary(badgeData.collection);
  const showcaseItems = ensureRevealDestinationIsMounted(
    getDashboardBadgeShowcaseItems(badgeData.collection, SHOWCASE_LIMIT),
    activePendingReveal
      ? badgeData.collection.items.find(
          (item) =>
            item.definition.slug === activePendingReveal.item.definition.slug
        ) ?? activePendingReveal.item
      : null,
    SHOWCASE_LIMIT
  );
  const hasEarnedBadges = progress.earnedCount > 0;

  return (
    <>
      <BadgeQueue
        items={pendingReveals}
        dictionary={copy}
        reducedMotion={reducedMotion}
        entitlement={badgeData.entitlement}
        acknowledgeItemAction={acknowledgeRevealAction}
        getDestinationRect={(item) =>
          getDestinationRect(item.item.definition.slug)
        }
        onDestinationSettle={(item) =>
          settleDestination(item.item.definition.slug)
        }
        onItemSeen={(item) =>
          setAcknowledgedAwardIds((current) => [...current, item.id])
        }
      />
      <section
        id="dashboard-badges"
        aria-labelledby="dashboard-badges-title"
        className="mt-10 scroll-mt-28 border border-orange-500/20 bg-black/65 p-5 shadow-2xl shadow-black/30 backdrop-blur-xl sm:p-6"
      >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-orange-400">
            <Award size={15} aria-hidden="true" />
            {copy.dashboard.eyebrow}
          </p>
          <h2
            id="dashboard-badges-title"
            className="mt-3 text-3xl font-bold text-white"
          >
            {copy.dashboard.title}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
            {hasEarnedBadges
              ? copy.dashboard.earnedWithBadges
              : copy.dashboard.empty}
          </p>
        </div>

        <div className="min-w-[11rem] border border-white/10 bg-black/35 p-4">
          <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
            {copy.dashboard.earnedLabel}
          </p>
          <p
            aria-label={interpolateBadgeCopy(copy.dashboard.progressAria, {
              earned: progress.earnedCount,
              total: progress.totalCount,
            })}
            className="mt-2 text-3xl font-black text-white"
          >
            {progress.earnedCount}
            <span className="text-lg text-zinc-500">/{progress.totalCount}</span>
          </p>
          <div
            className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10"
            aria-hidden="true"
          >
            <span
              className="block h-full rounded-full bg-gradient-to-r from-orange-500 via-amber-300 to-orange-200"
              style={{ width: `${progress.percentComplete}%` }}
            />
          </div>
        </div>
      </div>

      <div
        role="list"
        aria-label={copy.dashboard.featuredAria}
        className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6"
        data-dashboard-badge-showcase-count={showcaseItems.length}
      >
        {showcaseItems.map((item) => (
          <div key={item.definition.slug} role="listitem">
            <DashboardBadgeShowcaseCard
              item={item}
              isNew={
                item.state === "earned" &&
                item.award.isUnrevealed === true &&
                Boolean(item.award.awardId) &&
                !acknowledgedAwardIds.includes(item.award.awardId as string)
              }
              settling={settlingSlug === item.definition.slug}
              destinationRef={(element) =>
                registerDestination(item.definition.slug, element)
              }
              dictionary={copy}
              onSelect={() => setSelectedItem(item)}
            />
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-5 text-zinc-500">
          {hasEarnedBadges
            ? copy.dashboard.inspect
            : copy.dashboard.explore}
        </p>
        <Link
          href="/dashboard/badges"
          className="inline-flex min-h-11 items-center justify-center gap-2 border border-orange-400 bg-orange-500 px-5 py-3 text-sm font-black uppercase tracking-wider text-black transition hover:border-orange-300 hover:bg-orange-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300"
        >
          {copy.dashboard.viewCollection}
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>

      {selectedItem ? (
        <BadgeDetailModal
          item={selectedItem}
          entitlement={badgeData.entitlement}
          dictionary={copy}
          locale={locale}
          onClose={() => setSelectedItem(null)}
        />
      ) : null}
      </section>
    </>
  );
}

function DashboardBadgeShowcaseCard({
  item,
  isNew,
  settling,
  destinationRef,
  dictionary,
  onSelect,
}: {
  item: BadgeCollectionItem;
  isNew: boolean;
  settling: boolean;
  destinationRef: (element: HTMLElement | null) => void;
  dictionary: BadgesDictionary;
  onSelect: () => void;
}) {
  const localizedItem = localizeBadgeItem(item, dictionary);
  const isEarned = localizedItem.state === "earned";
  const tokens = BADGE_RARITY_TOKENS[localizedItem.definition.rarity];
  const rarityLabel = getLocalizedRarity(
    dictionary,
    localizedItem.definition.rarity
  );
  const StatusIcon = isEarned ? ShieldCheck : LockKeyhole;
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.button
      type="button"
      data-dashboard-badge-showcase-item="true"
      data-badge-slug={localizedItem.definition.slug}
      data-badge-state={localizedItem.state}
      data-badge-presentation={
        isNew ? "unrevealed" : isEarned ? "earned" : "locked"
      }
      aria-label={`${localizedItem.definition.name}, ${rarityLabel}, ${
        isNew
          ? `${dictionary.states.earned}, ${dictionary.states.new}`
          : isEarned
            ? dictionary.states.earned
            : dictionary.states.locked
      }`}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (
          event.key === "Enter" ||
          event.key === " " ||
          event.key === "Spacebar"
        ) {
          event.preventDefault();
          onSelect();
        }
      }}
      animate={
        settling
          ? prefersReducedMotion
            ? { opacity: [1, 0.82, 1] }
            : {
                scale: [1, 1.025, 1],
                boxShadow: [
                  "0 18px 34px rgba(0,0,0,0.25)",
                  "0 0 32px rgba(249,115,22,0.3)",
                  "0 18px 34px rgba(0,0,0,0.25)",
                ],
              }
          : { scale: 1 }
      }
      transition={{ duration: prefersReducedMotion ? 0.24 : 0.62 }}
      className={`group flex h-full min-h-[17rem] w-full cursor-pointer flex-col border p-3 text-left transition hover:-translate-y-0.5 hover:border-orange-300/45 hover:bg-black/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300 ${
        isEarned && !isNew
          ? `${tokens.borderClassName} bg-[linear-gradient(180deg,rgba(31,26,21,0.88),rgba(7,7,8,0.94))] shadow-[0_18px_34px_rgba(0,0,0,0.25)]`
          : isNew
            ? "border-zinc-500/35 bg-[linear-gradient(180deg,rgba(40,40,43,0.9),rgba(8,8,9,0.94))] shadow-[0_18px_34px_rgba(0,0,0,0.25)]"
          : "border-zinc-800/80 bg-[linear-gradient(180deg,rgba(24,24,27,0.72),rgba(8,8,9,0.9))]"
      }`}
    >
      <span
        ref={destinationRef}
        data-badge-reveal-destination={isEarned ? "true" : undefined}
        className="flex h-40 shrink-0 items-center justify-center"
      >
        <BadgeArtwork
          item={localizedItem}
          variant="slot"
          className="h-full w-full max-w-32"
          presentation={isNew ? "unrevealed" : "revealed"}
          dictionary={dictionary}
        />
      </span>
      <span className="mt-3 flex min-w-0 flex-1 flex-col">
        <span className="flex h-5 shrink-0 items-center gap-2 text-[10px] font-black uppercase tracking-wider">
          <StatusIcon size={13} aria-hidden="true" />
          <span className={isEarned ? tokens.textClassName : "text-zinc-500"}>
            {isNew
              ? dictionary.states.new
              : isEarned
                ? dictionary.states.earned
                : dictionary.states.locked}
          </span>
          <span className="ml-auto text-zinc-500">
            {String(localizedItem.definition.number).padStart(2, "0")}
          </span>
        </span>
        {isNew ? (
          <span className="mt-2 w-fit border border-orange-300/45 bg-orange-500/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.18em] text-orange-200">
            {dictionary.states.new}
          </span>
        ) : null}
        <span className="mt-2 flex h-10 shrink-0 items-start line-clamp-2 text-sm font-black leading-5 text-white">
          {localizedItem.definition.name}
        </span>
        <span
          className={`mt-auto flex min-h-7 w-fit items-center rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${
            isEarned
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

function ensureRevealDestinationIsMounted(
  showcaseItems: BadgeCollectionItem[],
  activeItem: BadgeCollectionItem | null,
  limit: number
) {
  if (!activeItem) return showcaseItems;

  if (
    showcaseItems.some(
      (item) => item.definition.slug === activeItem.definition.slug
    )
  ) {
    return showcaseItems;
  }

  return [...showcaseItems.slice(0, Math.max(limit - 1, 0)), activeItem];
}

function compareRevealQueueItems(
  left: BadgeRevealQueueItem,
  right: BadgeRevealQueueItem
) {
  const leftTime = Date.parse(left.queuedAt);
  const rightTime = Date.parse(right.queuedAt);

  return (
    (Number.isFinite(leftTime) ? leftTime : 0) -
      (Number.isFinite(rightTime) ? rightTime : 0) ||
    left.id.localeCompare(right.id)
  );
}
