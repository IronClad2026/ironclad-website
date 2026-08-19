"use client";

import { useMemo, useState } from "react";

import BadgeRevealOverlay from "@/components/badges/BadgeRevealOverlay";
import type {
  BadgePresentationEntitlement,
  BadgeRevealQueueItem,
} from "@/lib/badges/types";

const defaultEntitlement: BadgePresentationEntitlement = {
  premiumEffectsEnabled: false,
};

export type BadgeQueueProps = {
  items: readonly BadgeRevealQueueItem[];
  entitlement?: BadgePresentationEntitlement;
  onItemSeen?: (item: BadgeRevealQueueItem) => void;
  reducedMotion?: boolean;
};

export default function BadgeQueue({
  items,
  entitlement = defaultEntitlement,
  onItemSeen,
  reducedMotion,
}: BadgeQueueProps) {
  const [dismissedItemIds, setDismissedItemIds] = useState<readonly string[]>(
    []
  );
  const pendingItems = useMemo(
    () =>
      items.filter(
        (item) =>
          item.seenAt === null && !dismissedItemIds.includes(item.id)
      ),
    [dismissedItemIds, items]
  );
  const activeItem = pendingItems[0] ?? null;

  if (!activeItem) {
    return null;
  }

  return (
    <BadgeRevealOverlay
      key={activeItem.id}
      item={activeItem.item}
      entitlement={
        activeItem.entitlement.premiumEffectsEnabled
          ? activeItem.entitlement
          : entitlement
      }
      reason={activeItem.reason}
      onClose={() => {
        onItemSeen?.(activeItem);
        setDismissedItemIds((current) => [...current, activeItem.id]);
      }}
      reducedMotion={reducedMotion}
    />
  );
}
