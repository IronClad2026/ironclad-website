"use client";

import { ArrowRight, Award, LockKeyhole, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import BadgeArtwork from "@/components/badges/BadgeArtwork";
import BadgeDetailModal from "@/components/badges/BadgeDetailModal";
import {
  BADGE_RARITY_TOKENS,
  getBadgeProgressSummary,
  getBadgeRarityLabel,
} from "@/lib/badges/presentation";
import {
  getDashboardBadgeShowcaseItems,
  type DashboardBadgeData,
} from "@/lib/badges/dashboard";
import type { BadgeCollectionItem } from "@/lib/badges/types";

export type DashboardBadgesSectionProps = {
  badgeData: DashboardBadgeData;
};

const SHOWCASE_LIMIT = 6;

export default function DashboardBadgesSection({
  badgeData,
}: DashboardBadgesSectionProps) {
  const [selectedItem, setSelectedItem] = useState<BadgeCollectionItem | null>(
    null
  );
  const progress = getBadgeProgressSummary(badgeData.collection);
  const showcaseItems = getDashboardBadgeShowcaseItems(
    badgeData.collection,
    SHOWCASE_LIMIT
  );
  const hasEarnedBadges = progress.earnedCount > 0;

  return (
    <section
      id="dashboard-badges"
      aria-labelledby="dashboard-badges-title"
      className="mt-10 scroll-mt-28 border border-orange-500/20 bg-black/65 p-5 shadow-2xl shadow-black/30 backdrop-blur-xl sm:p-6"
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-orange-400">
            <Award size={15} aria-hidden="true" />
            Badges
          </p>
          <h2
            id="dashboard-badges-title"
            className="mt-3 text-3xl font-bold text-white"
          >
            IronClad badge collection
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
            {hasEarnedBadges
              ? "Your latest IronClad achievements are displayed here."
              : "Earn badges by competing, winning, and reaching milestones across IronClad tournaments."}
          </p>
        </div>

        <div className="min-w-[11rem] border border-white/10 bg-black/35 p-4">
          <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
            Earned
          </p>
          <p
            aria-label={`${progress.earnedCount}/${progress.totalCount} earned`}
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
        aria-label="Featured dashboard badges"
        className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6"
        data-dashboard-badge-showcase-count={showcaseItems.length}
      >
        {showcaseItems.map((item) => (
          <div key={item.definition.slug} role="listitem">
            <DashboardBadgeShowcaseCard
              item={item}
              onSelect={() => setSelectedItem(item)}
            />
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-5 text-zinc-500">
          {hasEarnedBadges
            ? "Open the full collection to inspect every earned and locked badge."
            : "Explore every badge and see what it takes to unlock them."}
        </p>
        <Link
          href="/dashboard/badges"
          className="inline-flex min-h-11 items-center justify-center gap-2 border border-orange-400 bg-orange-500 px-5 py-3 text-sm font-black uppercase tracking-wider text-black transition hover:border-orange-300 hover:bg-orange-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300"
        >
          View badge collection
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>

      {selectedItem ? (
        <BadgeDetailModal
          item={selectedItem}
          entitlement={badgeData.entitlement}
          onClose={() => setSelectedItem(null)}
        />
      ) : null}
    </section>
  );
}

function DashboardBadgeShowcaseCard({
  item,
  onSelect,
}: {
  item: BadgeCollectionItem;
  onSelect: () => void;
}) {
  const isEarned = item.state === "earned";
  const tokens = BADGE_RARITY_TOKENS[item.definition.rarity];
  const rarityLabel = getBadgeRarityLabel(item.definition.rarity);
  const StatusIcon = isEarned ? ShieldCheck : LockKeyhole;

  return (
    <button
      type="button"
      data-dashboard-badge-showcase-item="true"
      data-badge-slug={item.definition.slug}
      data-badge-state={item.state}
      aria-label={`${item.definition.name}, ${rarityLabel}, ${
        isEarned ? "earned" : "locked"
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
      className={`group flex h-full min-h-[13.5rem] w-full cursor-pointer flex-col border p-3 text-left transition hover:-translate-y-0.5 hover:border-orange-300/45 hover:bg-black/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300 ${
        isEarned
          ? `${tokens.borderClassName} bg-[linear-gradient(180deg,rgba(31,26,21,0.88),rgba(7,7,8,0.94))] shadow-[0_18px_34px_rgba(0,0,0,0.25)]`
          : "border-zinc-800/80 bg-[linear-gradient(180deg,rgba(24,24,27,0.72),rgba(8,8,9,0.9))]"
      }`}
    >
      <BadgeArtwork item={item} variant="slot" className="mx-auto max-w-32" />
      <span className="mt-3 flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider">
          <StatusIcon size={13} aria-hidden="true" />
          <span className={isEarned ? tokens.textClassName : "text-zinc-500"}>
            {isEarned ? "Earned" : "Locked"}
          </span>
          <span className="ml-auto text-zinc-500">
            {String(item.definition.number).padStart(2, "0")}
          </span>
        </span>
        <span className="mt-2 line-clamp-2 text-sm font-black leading-5 text-white">
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
