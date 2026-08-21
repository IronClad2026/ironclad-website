export const NOTIFICATION_BADGE_RECONCILE_EVENT =
  "ironclad:notification-badge-reconcile";

type BadgeNavigator = Navigator & {
  clearAppBadge?: () => Promise<void>;
  setAppBadge?: (contents?: number) => Promise<void>;
};

export type AppBadgeResult = "applied" | "invalid" | "unsupported" | "failed";

export async function applyAuthoritativeAppBadge(
  unreadCount: number
): Promise<AppBadgeResult> {
  if (!Number.isSafeInteger(unreadCount) || unreadCount < 0) {
    return "invalid";
  }

  if (typeof navigator === "undefined") {
    return "unsupported";
  }

  const badgeNavigator = navigator as BadgeNavigator;

  try {
    if (unreadCount === 0) {
      if (typeof badgeNavigator.clearAppBadge === "function") {
        await badgeNavigator.clearAppBadge();
        return "applied";
      }

      if (typeof badgeNavigator.setAppBadge === "function") {
        await badgeNavigator.setAppBadge(0);
        return "applied";
      }

      return "unsupported";
    }

    if (typeof badgeNavigator.setAppBadge !== "function") {
      return "unsupported";
    }

    await badgeNavigator.setAppBadge(unreadCount);
    return "applied";
  } catch {
    return "failed";
  }
}

export function requestNotificationBadgeReconciliation() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new Event(NOTIFICATION_BADGE_RECONCILE_EVENT));
}
