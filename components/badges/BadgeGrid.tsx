"use client";

import { useMemo, useState } from "react";

import BadgeDetailModal from "@/components/badges/BadgeDetailModal";
import BadgeSlot from "@/components/badges/BadgeSlot";
import {
  interpolateBadgeCopy,
  resolveBadgesDictionary,
} from "@/components/badges/badgeUi";
import { getBadgeProgressSummary } from "@/lib/badges/presentation";
import type {
  BadgeCollection,
  BadgeCollectionItem,
  BadgePresentationEntitlement,
} from "@/lib/badges/types";
import type { BadgesDictionary } from "@/lib/i18n/badges";

const defaultEntitlement: BadgePresentationEntitlement = {
  premiumEffectsEnabled: false,
};

export type BadgeGridProps = {
  collection: BadgeCollection;
  entitlement?: BadgePresentationEntitlement;
  title?: string;
  className?: string;
  onSelect?: (item: BadgeCollectionItem) => void;
  dictionary?: BadgesDictionary;
  locale?: string;
};

export default function BadgeGrid({
  collection,
  entitlement = defaultEntitlement,
  title,
  className = "",
  onSelect,
  dictionary,
  locale = "en",
}: BadgeGridProps) {
  const copy = resolveBadgesDictionary(dictionary);
  const [selectedItem, setSelectedItem] = useState<BadgeCollectionItem | null>(
    null
  );
  const handleSelect = onSelect ?? setSelectedItem;
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
            {copy.collection.eyebrow}
          </p>
          <h2 id="badge-grid-title" className="mt-2 text-2xl font-black text-white">
            {title ?? copy.collection.title}
          </h2>
        </div>
        <p className="text-sm font-bold text-zinc-400">
          {interpolateBadgeCopy(copy.dashboard.progressAria, {
            earned: progress.earnedCount,
            total: progress.totalCount,
          })}
        </p>
      </div>

      <div
        role="list"
        aria-label={copy.collection.slotsAria}
        className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6"
      >
        {orderedItems.map((item) => (
          <div key={item.definition.slug} role="listitem">
            <BadgeSlot
              item={item}
              entitlement={entitlement}
              dictionary={copy}
              onSelect={handleSelect}
            />
          </div>
        ))}
      </div>

      {!onSelect && selectedItem ? (
        <BadgeDetailModal
          item={selectedItem}
          entitlement={entitlement}
          dictionary={copy}
          locale={locale}
          onClose={() => setSelectedItem(null)}
        />
      ) : null}
    </section>
  );
}
