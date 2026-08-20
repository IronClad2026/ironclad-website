"use client";

import { ArrowLeft, Award, LockKeyhole, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import BadgeDetailModal from "@/components/badges/BadgeDetailModal";
import BadgeSlot from "@/components/badges/BadgeSlot";
import { getBadgeProgressSummary } from "@/lib/badges/presentation";
import type { DashboardBadgeData } from "@/lib/badges/dashboard";
import type { BadgeCollectionItem } from "@/lib/badges/types";

type BadgeCollectionFilter = "all" | "earned" | "locked";

export type DashboardBadgeCollectionProps = {
  badgeData: DashboardBadgeData;
};

const filterOptions: readonly {
  value: BadgeCollectionFilter;
  label: string;
}[] = [
  { value: "all", label: "All" },
  { value: "earned", label: "Earned" },
  { value: "locked", label: "Locked" },
];

export default function DashboardBadgeCollection({
  badgeData,
}: DashboardBadgeCollectionProps) {
  const [filter, setFilter] = useState<BadgeCollectionFilter>("all");
  const [selectedItem, setSelectedItem] = useState<BadgeCollectionItem | null>(
    null
  );
  const progress = getBadgeProgressSummary(badgeData.collection);
  const orderedItems = useMemo(
    () =>
      [...badgeData.collection.items].sort(
        (left, right) => left.definition.number - right.definition.number
      ),
    [badgeData.collection.items]
  );
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
    <section
      aria-labelledby="dashboard-badge-collection-title"
      className="mx-auto w-full max-w-7xl"
    >
      <Link
        href="/dashboard"
        className="inline-flex min-h-11 items-center gap-2 border border-white/10 bg-black/45 px-4 py-2 text-sm font-bold text-zinc-300 transition hover:border-orange-400/45 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300"
      >
        <ArrowLeft size={16} aria-hidden="true" />
        Dashboard
      </Link>

      <header className="mt-6 border border-orange-500/25 bg-black/70 p-6 shadow-2xl shadow-black/35 backdrop-blur-xl sm:p-8">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.3em] text-orange-400">
              <Award size={15} aria-hidden="true" />
              Badge collection
            </p>
            <h1
              id="dashboard-badge-collection-title"
              className="mt-3 text-4xl font-black tracking-tight text-white sm:text-5xl"
            >
              Your IronClad badge collection
            </h1>
          </div>

          <div className="min-w-[12rem] border border-white/10 bg-black/35 p-4">
            <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
              Earned
            </p>
            <p
              aria-label={`${progress.earnedCount}/${progress.totalCount} earned`}
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
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Badge collection filters">
            {filterOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                role="tab"
                aria-selected={filter === option.value}
                onClick={() => setFilter(option.value)}
                className={`inline-flex min-h-11 items-center gap-2 border px-4 py-2 text-xs font-black uppercase tracking-wider transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300 ${
                  filter === option.value
                    ? "border-orange-400 bg-orange-500/20 text-orange-100"
                    : "border-white/10 bg-black/35 text-zinc-400 hover:border-orange-400/35 hover:text-white"
                }`}
              >
                {option.value === "earned" ? (
                  <ShieldCheck size={14} aria-hidden="true" />
                ) : option.value === "locked" ? (
                  <LockKeyhole size={14} aria-hidden="true" />
                ) : (
                  <Award size={14} aria-hidden="true" />
                )}
                {option.label}
              </button>
            ))}
          </div>

          <p className="text-sm font-bold text-zinc-400">
            Showing {visibleItems.length} of {badgeData.collection.totalCount}
          </p>
        </div>

        {visibleItems.length > 0 ? (
          <div
            role="list"
            aria-label="IronClad badge collection slots"
            className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6"
          >
            {visibleItems.map((item) => (
              <div key={item.definition.slug} role="listitem">
                <BadgeSlot
                  item={item}
                  entitlement={badgeData.entitlement}
                  onSelect={setSelectedItem}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="border border-dashed border-white/15 bg-black/35 p-8 text-center">
            <p className="text-sm font-bold text-zinc-400">
              No badges match this filter yet.
            </p>
          </div>
        )}
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
