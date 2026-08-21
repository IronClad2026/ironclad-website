export const NOTIFICATION_BADGE_RECONCILE_EVENT =
  "ironclad:notification-badge-reconcile";

const IRONCLAD_NOTIFICATION_TAG_PREFIX = "ironclad-notification:";
const NOTIFICATION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type BadgeNavigator = Navigator & {
  clearAppBadge?: () => Promise<void>;
  setAppBadge?: (contents?: number) => Promise<void>;
};

export type AppBadgeResult = "applied" | "invalid" | "unsupported" | "failed";

type DisplayedNotificationScope = "player" | "admin";

type CloseDisplayedNotificationsOptions = {
  notificationIds?: readonly string[];
  scope?: DisplayedNotificationScope;
};

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

export async function closeDisplayedIronCladNotifications(
  options: CloseDisplayedNotificationsOptions = {}
): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }

  const targetTags = options.notificationIds
    ? new Set(
        options.notificationIds
          .filter((notificationId) =>
            NOTIFICATION_ID_PATTERN.test(notificationId)
          )
          .map(
            (notificationId) =>
              `${IRONCLAD_NOTIFICATION_TAG_PREFIX}${notificationId}`
          )
      )
    : null;

  if (targetTags?.size === 0) {
    return;
  }

  try {
    const registration = await navigator.serviceWorker.getRegistration("/");
    if (!registration || typeof registration.getNotifications !== "function") {
      return;
    }

    const displayedNotifications = await registration.getNotifications();
    for (const displayedNotification of displayedNotifications) {
      if (!isIronCladNotificationTag(displayedNotification.tag)) {
        continue;
      }

      if (targetTags && !targetTags.has(displayedNotification.tag)) {
        continue;
      }

      if (
        options.scope &&
        readDisplayedNotificationScope(displayedNotification.data) !==
          options.scope
      ) {
        continue;
      }

      try {
        displayedNotification.close();
      } catch {
        // Displayed-notification cleanup is best effort and must never undo a
        // successful authoritative notification mutation.
      }
    }
  } catch {
    // Some browsers do not expose persistent-notification inspection. The
    // durable database mutation and badge reconciliation remain authoritative.
  }
}

function isIronCladNotificationTag(tag: string) {
  if (!tag.startsWith(IRONCLAD_NOTIFICATION_TAG_PREFIX)) {
    return false;
  }

  return NOTIFICATION_ID_PATTERN.test(
    tag.slice(IRONCLAD_NOTIFICATION_TAG_PREFIX.length)
  );
}

function readDisplayedNotificationScope(
  data: unknown
): DisplayedNotificationScope | null {
  if (!data || typeof data !== "object" || !("scope" in data)) {
    return null;
  }

  const scope = data.scope;
  return scope === "player" || scope === "admin" ? scope : null;
}
