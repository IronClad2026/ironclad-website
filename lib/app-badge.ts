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
const WORKER_CLEANUP_STATUSES = new Set([
  "closed",
  "nothing_to_close",
  "not_found",
  "remaining",
  "close_failed",
  "enumeration_failed",
  "verification_failed",
  "source_rejected",
]);

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

type WorkerCleanupStatus =
  | "closed"
  | "nothing_to_close"
  | "not_found"
  | "remaining"
  | "close_failed"
  | "enumeration_failed"
  | "verification_failed"
  | "source_rejected";

export type DisplayedNotificationCleanupResult = {
  status:
    | WorkerCleanupStatus
    | "unsupported"
    | "invalid_request"
    | "registration_unavailable"
    | "worker_unavailable"
    | "message_failed"
    | "message_timeout";
  enumerated: number | null;
  matched: number | null;
  closed: number | null;
  remaining: number | null;
};

type WorkerCleanupResult = {
  type: typeof CLOSE_DISPLAYED_NOTIFICATIONS_RESULT;
  ok: boolean;
  status: WorkerCleanupStatus;
  enumeratedCount: number | null;
  matchedCount: number | null;
  closedCount: number | null;
  remainingCount: number | null;
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
): Promise<DisplayedNotificationCleanupResult> {
  if (
    typeof navigator === "undefined" ||
    !("serviceWorker" in navigator) ||
    typeof MessageChannel === "undefined"
  ) {
    return pageCleanupResult("unsupported");
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
    return pageCleanupResult("invalid_request");
  }

  const serviceWorkers = navigator.serviceWorker;
  let matchingRegistration: ServiceWorkerRegistration | undefined;
  try {
    matchingRegistration = await serviceWorkers.getRegistration("/");
  } catch {
    return pageCleanupResult("registration_unavailable");
  }
  if (!matchingRegistration) {
    return pageCleanupResult("registration_unavailable");
  }
  if (!matchingRegistration.active) {
    return pageCleanupResult("worker_unavailable");
  }

  try {
    return await requestServiceWorkerNotificationCleanup(
      matchingRegistration.active,
      {
        type: CLOSE_DISPLAYED_NOTIFICATIONS_MESSAGE,
        ...(notificationIds ? { notificationIds } : {}),
        ...(options.scope ? { scope: options.scope } : {}),
      }
    );
  } catch {
    // Persistent-notification cleanup is best effort. The durable database
    // mutation and authoritative badge reconciliation must remain successful.
    return pageCleanupResult("message_failed");
  }
}

async function requestServiceWorkerNotificationCleanup(
  activeWorker: ServiceWorker,
  request: {
    type: typeof CLOSE_DISPLAYED_NOTIFICATIONS_MESSAGE;
    notificationIds?: string[];
    scope?: DisplayedNotificationScope;
  }
): Promise<DisplayedNotificationCleanupResult> {
  const channel = new MessageChannel();

  return new Promise<DisplayedNotificationCleanupResult>((resolve) => {
    let settled = false;
    const finish = (result: DisplayedNotificationCleanupResult) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeoutId);
      channel.port1.onmessage = null;
      channel.port1.onmessageerror = null;
      channel.port1.close();
      resolve(result);
    };
    const timeoutId = setTimeout(
      () => finish(pageCleanupResult("message_timeout")),
      CLOSE_DISPLAYED_NOTIFICATIONS_TIMEOUT_MS
    );

    channel.port1.onmessage = (event: MessageEvent<unknown>) => {
      if (isCloseDisplayedNotificationsResult(event.data)) {
        finish(workerCleanupResult(event.data));
      }
    };
    channel.port1.onmessageerror = () =>
      finish(pageCleanupResult("message_failed"));
    channel.port1.start();

    try {
      activeWorker.postMessage(request, [channel.port2]);
    } catch {
      channel.port2.close();
      finish(pageCleanupResult("message_failed"));
    }
  });
}

function isCloseDisplayedNotificationsResult(
  value: unknown
): value is WorkerCleanupResult {
  if (!value || typeof value !== "object") {
    return false;
  }

  const result = value as Record<string, unknown>;
  return (
    result.type === CLOSE_DISPLAYED_NOTIFICATIONS_RESULT &&
    typeof result.ok === "boolean" &&
    typeof result.status === "string" &&
    WORKER_CLEANUP_STATUSES.has(result.status) &&
    hasConsistentCleanupCounts(result) &&
    isNullableNonNegativeSafeInteger(result.enumeratedCount) &&
    isNullableNonNegativeSafeInteger(result.matchedCount) &&
    isNullableNonNegativeSafeInteger(result.closedCount) &&
    (result.closedCount === null ||
      (result.matchedCount !== null &&
        Number(result.closedCount) <= Number(result.matchedCount))) &&
    isNullableNonNegativeSafeInteger(result.remainingCount)
  );
}

function hasConsistentCleanupCounts(result: Record<string, unknown>) {
  const counts = [
    result.enumeratedCount,
    result.matchedCount,
    result.closedCount,
    result.remainingCount,
  ];
  if (
    result.status === "enumeration_failed" ||
    result.status === "source_rejected"
  ) {
    return counts.every((count) => count === null);
  }

  if (result.status === "verification_failed") {
    return counts.slice(0, 3).every((count) => count !== null) &&
      result.remainingCount === null;
  }

  return counts.every((count) => count !== null);
}

function isNullableNonNegativeSafeInteger(value: unknown) {
  return value === null || (Number.isSafeInteger(value) && Number(value) >= 0);
}

function workerCleanupResult(
  result: WorkerCleanupResult
): DisplayedNotificationCleanupResult {
  return {
    status: result.status,
    enumerated: result.enumeratedCount,
    matched: result.matchedCount,
    closed: result.closedCount,
    remaining: result.remainingCount,
  };
}

function pageCleanupResult(
  status: Exclude<
    DisplayedNotificationCleanupResult["status"],
    WorkerCleanupStatus
  >,
  overrides: Partial<DisplayedNotificationCleanupResult> = {}
): DisplayedNotificationCleanupResult {
  return {
    status,
    enumerated: null,
    matched: null,
    closed: null,
    remaining: null,
    ...overrides,
  };
}
