"use client";

import { useMemo, useState } from "react";

import BadgeRevealOverlay from "@/components/badges/BadgeRevealOverlay";
import type {
  BadgePresentationEntitlement,
  BadgeRevealAcknowledgeResult,
  BadgeRevealQueueItem,
} from "@/lib/badges/types";

const defaultEntitlement: BadgePresentationEntitlement = {
  premiumEffectsEnabled: false,
};

export type BadgeQueueProps = {
  items: readonly BadgeRevealQueueItem[];
  entitlement?: BadgePresentationEntitlement;
  onItemSeen?: (item: BadgeRevealQueueItem) => void;
  acknowledgeItemAction?: (
    awardId: string
  ) => Promise<BadgeRevealAcknowledgeResult>;
  reducedMotion?: boolean;
};

export default function BadgeQueue({
  items,
  entitlement = defaultEntitlement,
  onItemSeen,
  acknowledgeItemAction,
  reducedMotion,
}: BadgeQueueProps) {
  const [dismissed, setDismissed] = useState(false);
  const [acknowledgedItemIds, setAcknowledgedItemIds] = useState<
    readonly string[]
  >([]);
  const [isAcknowledging, setIsAcknowledging] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const pendingItems = useMemo(
    () =>
      items.filter(
        (item) =>
          item.seenAt === null && !acknowledgedItemIds.includes(item.id)
      ),
    [acknowledgedItemIds, items]
  );
  const activeItem = pendingItems[0] ?? null;
  const initialPendingCount = items.filter(
    (item) => item.seenAt === null
  ).length;

  if (dismissed || !activeItem) {
    return null;
  }

  return (
    <BadgeRevealOverlay
      item={activeItem.item}
      entitlement={
        activeItem.entitlement.premiumEffectsEnabled
          ? activeItem.entitlement
          : entitlement
      }
      reason={activeItem.reason}
      onClose={() => setDismissed(true)}
      onContinue={async () => {
        if (isAcknowledging) return;

        setIsAcknowledging(true);
        setErrorMessage(null);

        try {
          if (acknowledgeItemAction) {
            const result = await acknowledgeItemAction(activeItem.id);

            if (result.status === "error") {
              setErrorMessage(result.message);
              return;
            }
          }

          onItemSeen?.(activeItem);
          setAcknowledgedItemIds((current) => [...current, activeItem.id]);
        } catch {
          setErrorMessage(
            "Your badge reveal was not saved. Check your connection and retry."
          );
        } finally {
          setIsAcknowledging(false);
        }
      }}
      pending={isAcknowledging}
      errorMessage={errorMessage}
      queuePosition={{
        current: initialPendingCount - pendingItems.length + 1,
        total: initialPendingCount,
      }}
      reducedMotion={reducedMotion}
    />
  );
}
