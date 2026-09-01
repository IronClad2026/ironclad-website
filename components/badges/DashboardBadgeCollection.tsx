"use client";

import { ArrowLeft, Award, LockKeyhole, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import BadgeDetailModal from "@/components/badges/BadgeDetailModal";
import BadgeQueue from "@/components/badges/BadgeQueue";
import BadgeSlot from "@/components/badges/BadgeSlot";
import {
  interpolateBadgeCopy,
  resolveBadgesDictionary,
  retryBadgeLoad,
} from "@/components/badges/badgeUi";
import { useBadgeRevealDestinations } from "@/components/badges/useBadgeRevealDestinations";
import { getBadgeProgressSummary } from "@/lib/badges/presentation";
import type { DashboardBadgeData } from "@/lib/badges/dashboard";
import type {
  BadgeCollectionItem,
  BadgeRevealAcknowledgeResult,
  BadgeRevealQueueItem,
} from "@/lib/badges/types";
import type { BadgesDictionary } from "@/lib/i18n/badges";

type BadgeCollectionFilter = "all" | "earned" | "locked";

export type DashboardBadgeCollectionProps = {
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

const filterOptions: readonly BadgeCollectionFilter[] = [
  "all",
  "earned",
  "locked",
];

export default function DashboardBadgeCollection({
  badgeData,
  pendingReveals = [],
  acknowledgeRevealAction,
  loadError = null,
  revealLoadError = null,
  onRetry,
  dictionary,
  locale = "en",
  reducedMotion,
}: DashboardBadgeCollectionProps) {
  const copy = resolveBadgesDictionary(dictionary);
  const [filter, setFilter] = useState<BadgeCollectionFilter>("all");
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
  const orderedItems = useMemo(
    () =>
      badgeData
        ? [...badgeData.collection.items].sort(
            (left, right) => left.definition.number - right.definition.number
          )
        : [],
    [badgeData]
  );

  if (!badgeData || loadError || revealLoadError) {
    return (
      <section
        aria-labelledby="dashboard-badge-collection-title"
        className="mx-auto w-full max-w-7xl border border-red-400/25 bg-black/70 p-6"
      >
        <h1
          id="dashboard-badge-collection-title"
          className="text-3xl font-black text-white"
        >
          {copy.dashboard.loadErrorTitle}
        </h1>
        <p role="alert" className="mt-3 text-sm leading-6 text-zinc-300">
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
  const visibleItems = orderedItems.filter((item) => {
    if (filter === "earned") {
      return item.state === "earned";
    }

    if (filter === "locked") {
      return item.state === "locked";
    }

    return true;
  });

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
      aria-labelledby="dashboard-badge-collection-title"
      className="mx-auto w-full max-w-7xl"
      >
      <Link
        href="/dashboard"
        className="inline-flex min-h-11 items-center gap-2 border border-white/10 bg-black/45 px-4 py-2 text-sm font-bold text-zinc-300 transition hover:border-orange-400/45 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300"
      >
        <ArrowLeft size={16} aria-hidden="true" />
        {copy.collection.back}
      </Link>

      <header className="mt-6 border border-orange-500/25 bg-black/70 p-6 shadow-2xl shadow-black/35 backdrop-blur-xl sm:p-8">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.3em] text-orange-400">
              <Award size={15} aria-hidden="true" />
              {copy.collection.eyebrow}
            </p>
            <h1
              id="dashboard-badge-collection-title"
              className="mt-3 text-4xl font-black tracking-tight text-white sm:text-5xl"
            >
              {copy.collection.title}
            </h1>
          </div>

          <div className="min-w-[12rem] border border-white/10 bg-black/35 p-4">
            <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
              {copy.collection.earnedLabel}
            </p>
            <p
              aria-label={interpolateBadgeCopy(copy.dashboard.progressAria, {
                earned: progress.earnedCount,
                total: progress.totalCount,
              })}
              className="mt-2 text-3xl font-black text-white"
            >
              {progress.earnedCount}
              <span className="text-lg text-zinc-500">
                /{progress.totalCount}
              </span>
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
      </header>

      <div className="mt-6 flex flex-col gap-4 border border-orange-500/20 bg-black/65 p-4 shadow-2xl shadow-black/25 backdrop-blur sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label={copy.collection.filtersAria}>
            {filterOptions.map((option) => (
              <button
                key={option}
                type="button"
                role="tab"
                aria-selected={filter === option}
                onClick={() => setFilter(option)}
                className={`inline-flex min-h-11 items-center gap-2 border px-4 py-2 text-xs font-black uppercase tracking-wider transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300 ${
                  filter === option
                    ? "border-orange-400 bg-orange-500/20 text-orange-100"
                    : "border-white/10 bg-black/35 text-zinc-400 hover:border-orange-400/35 hover:text-white"
                }`}
              >
                {option === "earned" ? (
                  <ShieldCheck size={14} aria-hidden="true" />
                ) : option === "locked" ? (
                  <LockKeyhole size={14} aria-hidden="true" />
                ) : (
                  <Award size={14} aria-hidden="true" />
                )}
                {copy.collection.filters[option]}
              </button>
            ))}
          </div>

          <p className="text-sm font-bold text-zinc-400">
            {interpolateBadgeCopy(copy.collection.showing, {
              shown: visibleItems.length,
              total: badgeData.collection.totalCount,
            })}
          </p>
        </div>

        {visibleItems.length > 0 ? (
          <div
            role="list"
            aria-label={copy.collection.slotsAria}
            className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6"
          >
            {visibleItems.map((item) => (
              <div key={item.definition.slug} role="listitem">
                <BadgeSlot
                  item={item}
                  entitlement={badgeData.entitlement}
                  unrevealed={
                    item.state === "earned" &&
                    item.award.isUnrevealed === true &&
                    Boolean(item.award.awardId) &&
                    !acknowledgedAwardIds.includes(
                      item.award.awardId as string
                    )
                  }
                  settling={settlingSlug === item.definition.slug}
                  destinationRef={(element) =>
                    registerDestination(item.definition.slug, element)
                  }
                  dictionary={copy}
                  onSelect={setSelectedItem}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="border border-dashed border-white/15 bg-black/35 p-8 text-center">
            <p className="text-sm font-bold text-zinc-400">
              {copy.collection.empty}
            </p>
          </div>
        )}
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
