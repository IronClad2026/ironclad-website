"use client";

import { useMemo, useState } from "react";

import BadgeRevealOverlay from "@/components/badges/BadgeRevealOverlay";
import { resolveBadgesDictionary } from "@/components/badges/badgeUi";
import type {
  BadgePresentationEntitlement,
  BadgeRevealAcknowledgeResult,
  BadgeRevealQueueItem,
} from "@/lib/badges/types";
import type { BadgesDictionary } from "@/lib/i18n/badges";

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
  getDestinationRect?: (item: BadgeRevealQueueItem) => DOMRect | null;
  onDestinationSettle?: (item: BadgeRevealQueueItem) => void;
  reducedMotion?: boolean;
  dictionary?: BadgesDictionary;
};

export default function BadgeQueue({
  items,
  entitlement = defaultEntitlement,
  onItemSeen,
  acknowledgeItemAction,
  getDestinationRect,
  onDestinationSettle,
  reducedMotion,
  dictionary,
}: BadgeQueueProps) {
  const copy = resolveBadgesDictionary(dictionary);
  const [dismissed, setDismissed] = useState(false);
  const [acknowledgedItemIds, setAcknowledgedItemIds] = useState<
    readonly string[]
  >([]);
  const [isAcknowledging, setIsAcknowledging] = useState(false);
  const [errorState, setErrorState] = useState<{
    itemId: string;
    message: string;
  } | null>(null);
  const pendingItems = useMemo(
    () =>
      items.filter(
        (item) =>
          item.seenAt === null && !acknowledgedItemIds.includes(item.id)
      ).sort(compareRevealQueueItems),
    [acknowledgedItemIds, items]
  );
  const activeItem = pendingItems[0] ?? null;
  const initialPendingCount = items.filter(
    (item) => item.seenAt === null
  ).length;
  const errorMessage =
    activeItem && errorState?.itemId === activeItem.id
      ? errorState.message
      : null;

  if (dismissed || !activeItem) {
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
      onClose={() => setDismissed(true)}
      getDestinationRect={() => getDestinationRect?.(activeItem) ?? null}
      onDestinationSettle={() => onDestinationSettle?.(activeItem)}
      onContinue={async () => {
        if (isAcknowledging) return false;

        setIsAcknowledging(true);
        setErrorState(null);

        try {
          if (!acknowledgeItemAction) {
            setErrorState({
              itemId: activeItem.id,
              message: copy.reveal.ackError,
            });
            return false;
          }

          const result = await acknowledgeItemAction(activeItem.id);

          if (result.status === "error") {
            setErrorState({
              itemId: activeItem.id,
              message: copy.reveal.ackError,
            });
            return false;
          }

          onItemSeen?.(activeItem);
          setAcknowledgedItemIds((current) => [...current, activeItem.id]);
          return true;
        } catch {
          setErrorState({
            itemId: activeItem.id,
            message: copy.reveal.ackError,
          });
          return false;
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
      dictionary={copy}
    />
  );
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
