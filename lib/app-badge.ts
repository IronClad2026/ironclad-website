export const NOTIFICATION_BADGE_RECONCILE_EVENT =
  "ironclad:notification-badge-reconcile";

const NOTIFICATION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CLOSE_DISPLAYED_NOTIFICATIONS_MESSAGE =
  "IRONCLAD_CLOSE_DISPLAYED_NOTIFICATIONS";
const CLOSE_DISPLAYED_NOTIFICATIONS_RESULT =
  "IRONCLAD_CLOSE_DISPLAYED_NOTIFICATIONS_RESULT";
const CLOSE_DISPLAYED_NOTIFICATIONS_TIMEOUT_MS = 1_500;
const MAX_CLOSE_NOTIFICATION_IDS = 100;

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
  if (
    typeof navigator === "undefined" ||
    !("serviceWorker" in navigator) ||
    typeof MessageChannel === "undefined"
  ) {
    return;
  }

  const notificationIds = options.notificationIds
    ? [...new Set(options.notificationIds)]
    : undefined;
  if (
    notificationIds?.length === 0 ||
    (notificationIds?.length ?? 0) > MAX_CLOSE_NOTIFICATION_IDS ||
    notificationIds?.some(
      (notificationId) => !NOTIFICATION_ID_PATTERN.test(notificationId)
    ) ||
    (options.scope !== undefined &&
      options.scope !== "player" &&
      options.scope !== "admin")
  ) {
    return;
  }

  try {
    const serviceWorkers = navigator.serviceWorker;
    const matchingRegistration = await serviceWorkers.getRegistration("/");
    if (!matchingRegistration?.active) {
      return;
    }

    await requestServiceWorkerNotificationCleanup(matchingRegistration.active, {
      type: CLOSE_DISPLAYED_NOTIFICATIONS_MESSAGE,
      ...(notificationIds ? { notificationIds } : {}),
      ...(options.scope ? { scope: options.scope } : {}),
    });
  } catch {
    // Persistent-notification cleanup is best effort. The durable database
    // mutation and authoritative badge reconciliation must remain successful.
  }
}

async function requestServiceWorkerNotificationCleanup(
  activeWorker: ServiceWorker,
  request: {
    type: typeof CLOSE_DISPLAYED_NOTIFICATIONS_MESSAGE;
    notificationIds?: string[];
    scope?: DisplayedNotificationScope;
  }
) {
  const channel = new MessageChannel();

  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeoutId);
      channel.port1.onmessage = null;
      channel.port1.onmessageerror = null;
      channel.port1.close();
      resolve();
    };
    const timeoutId = setTimeout(
      finish,
      CLOSE_DISPLAYED_NOTIFICATIONS_TIMEOUT_MS
    );

    channel.port1.onmessage = (event: MessageEvent<unknown>) => {
      if (isCloseDisplayedNotificationsResult(event.data)) {
        finish();
      }
    };
    channel.port1.onmessageerror = finish;
    channel.port1.start();

    try {
      activeWorker.postMessage(request, [channel.port2]);
    } catch {
      channel.port2.close();
      finish();
    }
  });
}

function isCloseDisplayedNotificationsResult(value: unknown) {
  if (!value || typeof value !== "object") {
    return false;
  }

  const result = value as Record<string, unknown>;
  return (
    result.type === CLOSE_DISPLAYED_NOTIFICATIONS_RESULT &&
    typeof result.ok === "boolean" &&
    Number.isSafeInteger(result.matchedCount) &&
    Number(result.matchedCount) >= 0 &&
    Number.isSafeInteger(result.closedCount) &&
    Number(result.closedCount) >= 0 &&
    Number(result.closedCount) <= Number(result.matchedCount)
  );
}
