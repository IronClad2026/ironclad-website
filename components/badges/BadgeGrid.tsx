"use client";

import { useMemo, useState } from "react";

import BadgeDetailModal from "@/components/badges/BadgeDetailModal";
import BadgeSlot from "@/components/badges/BadgeSlot";
import { getBadgeProgressSummary } from "@/lib/badges/presentation";
import type {
  BadgeCollection,
  BadgeCollectionItem,
  BadgePresentationEntitlement,
} from "@/lib/badges/types";

const defaultEntitlement: BadgePresentationEntitlement = {
  premiumEffectsEnabled: false,
};

export type BadgeGridProps = {
  collection: BadgeCollection;
  entitlement?: BadgePresentationEntitlement;
  title?: string;
  className?: string;
};

export default function BadgeGrid({
  collection,
  entitlement = defaultEntitlement,
  title = "IronClad badges",
  className = "",
}: BadgeGridProps) {
  const [selectedItem, setSelectedItem] = useState<BadgeCollectionItem | null>(
    null
  );
  const orderedItems = useMemo(
    () =>
      [...collection.items].sort(
        (left, right) => left.definition.number - right.definition.number
      ),
    [collection.items]
  );
  const progress = getBadgeProgressSummary(collection);

  return (
    <section
      aria-labelledby="badge-grid-title"
      className={`rounded-lg border border-orange-500/20 bg-black/65 p-4 shadow-2xl shadow-black/25 backdrop-blur sm:p-5 ${className}`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.28em] text-orange-300">
            Badge collection
          </p>
          <h2 id="badge-grid-title" className="mt-2 text-2xl font-black text-white">
            {title}
          </h2>
        </div>
        <p className="text-sm font-bold text-zinc-400">
          {progress.earnedCount}/{progress.totalCount} earned
        </p>
      </div>

      <div
        role="list"
        aria-label="IronClad badge collection slots"
        className="mt-5 grid grid-cols-2 gap-3 min-[440px]:grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-10"
      >
        {orderedItems.map((item) => (
          <div key={item.definition.slug} role="listitem">
            <BadgeSlot
              item={item}
              entitlement={entitlement}
              onSelect={setSelectedItem}
            />
          </div>
        ))}
      </div>

      {selectedItem ? (
        <BadgeDetailModal
          item={selectedItem}
          entitlement={entitlement}
          onClose={() => setSelectedItem(null)}
        />
      ) : null}
    </section>
  );
}
