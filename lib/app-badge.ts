export const NOTIFICATION_BADGE_RECONCILE_EVENT =
  "ironclad:notification-badge-reconcile";

const NOTIFICATION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CLOSE_DISPLAYED_NOTIFICATIONS_MESSAGE =
  "IRONCLAD_CLOSE_DISPLAYED_NOTIFICATIONS";
const CLOSE_DISPLAYED_NOTIFICATIONS_RESULT =
  "IRONCLAD_CLOSE_DISPLAYED_NOTIFICATIONS_RESULT";
const CLEANUP_DIAGNOSTIC_WORKER_VERSION = "android-cleanup-diagnostic-v1";
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

type CleanupOriginStatus = "same" | "empty" | "mismatch";
type CleanupSourceStatus =
  | "same_origin_window"
  | "cross_origin_window"
  | "invalid";
type WorkerCleanupStatus =
  | "closed"
  | "nothing_to_close"
  | "not_found"
  | "remaining"
  | "close_failed"
  | "enumeration_failed"
  | "verification_failed"
  | "source_rejected";

export type DisplayedNotificationCleanupDiagnostic = {
  status:
    | WorkerCleanupStatus
    | "unsupported"
    | "invalid_request"
    | "registration_unavailable"
    | "worker_unavailable"
    | "message_failed"
    | "message_timeout"
    | "worker_version_mismatch";
  sent: 0 | 1;
  received: 0 | 1;
  enumerated: number | null;
  matched: number | null;
  closed: number | null;
  remaining: number | null;
  origin: CleanupOriginStatus | null;
  source: CleanupSourceStatus | null;
  workerVersion: string | null;
  controller: "current" | "different" | "none" | null;
};

type WorkerCleanupResult = {
  type: typeof CLOSE_DISPLAYED_NOTIFICATIONS_RESULT;
  workerVersion: typeof CLEANUP_DIAGNOSTIC_WORKER_VERSION;
  ok: boolean;
  status: WorkerCleanupStatus;
  receivedCount: 1;
  enumeratedCount: number | null;
  matchedCount: number | null;
  closedCount: number | null;
  remainingCount: number | null;
  originStatus: CleanupOriginStatus;
  sourceStatus: CleanupSourceStatus;
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
): Promise<DisplayedNotificationCleanupDiagnostic> {
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

  const controller = serviceWorkers.controller
    ? serviceWorkers.controller === matchingRegistration.active
      ? "current"
      : "different"
    : "none";
  try {
    const result = await requestServiceWorkerNotificationCleanup(
      matchingRegistration.active,
      {
        type: CLOSE_DISPLAYED_NOTIFICATIONS_MESSAGE,
        ...(notificationIds ? { notificationIds } : {}),
        ...(options.scope ? { scope: options.scope } : {}),
      }
    );
    return { ...result, controller };
  } catch {
    // Persistent-notification cleanup is best effort. The durable database
    // mutation and authoritative badge reconciliation must remain successful.
    return pageCleanupResult("message_failed", { controller });
  }
}

async function requestServiceWorkerNotificationCleanup(
  activeWorker: ServiceWorker,
  request: {
    type: typeof CLOSE_DISPLAYED_NOTIFICATIONS_MESSAGE;
    notificationIds?: string[];
    scope?: DisplayedNotificationScope;
  }
): Promise<DisplayedNotificationCleanupDiagnostic> {
  const channel = new MessageChannel();

  return new Promise<DisplayedNotificationCleanupDiagnostic>((resolve) => {
    let settled = false;
    const finish = (result: DisplayedNotificationCleanupDiagnostic) => {
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
      () => finish(pageCleanupResult("message_timeout", { sent: 1 })),
      CLOSE_DISPLAYED_NOTIFICATIONS_TIMEOUT_MS
    );

    channel.port1.onmessage = (event: MessageEvent<unknown>) => {
      if (isCloseDisplayedNotificationsResult(event.data)) {
        finish(workerCleanupResult(event.data));
      } else if (isCloseDisplayedNotificationsResultEnvelope(event.data)) {
        finish(
          pageCleanupResult("worker_version_mismatch", {
            sent: 1,
            received: 1,
          })
        );
      }
    };
    channel.port1.onmessageerror = () =>
      finish(pageCleanupResult("message_failed", { sent: 1 }));
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
    result.workerVersion === CLEANUP_DIAGNOSTIC_WORKER_VERSION &&
    typeof result.ok === "boolean" &&
    typeof result.status === "string" &&
    WORKER_CLEANUP_STATUSES.has(result.status) &&
    result.receivedCount === 1 &&
    hasConsistentCleanupCounts(result) &&
    isNullableNonNegativeSafeInteger(result.enumeratedCount) &&
    isNullableNonNegativeSafeInteger(result.matchedCount) &&
    isNullableNonNegativeSafeInteger(result.closedCount) &&
    (result.closedCount === null ||
      (result.matchedCount !== null &&
        Number(result.closedCount) <= Number(result.matchedCount))) &&
    isNullableNonNegativeSafeInteger(result.remainingCount) &&
    (result.originStatus === "same" ||
      result.originStatus === "empty" ||
      result.originStatus === "mismatch") &&
    (result.sourceStatus === "same_origin_window" ||
      result.sourceStatus === "cross_origin_window" ||
      result.sourceStatus === "invalid")
  );
}

function isCloseDisplayedNotificationsResultEnvelope(value: unknown) {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    (value as Record<string, unknown>).type ===
      CLOSE_DISPLAYED_NOTIFICATIONS_RESULT
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
): DisplayedNotificationCleanupDiagnostic {
  return {
    status: result.status,
    sent: 1,
    received: result.receivedCount,
    enumerated: result.enumeratedCount,
    matched: result.matchedCount,
    closed: result.closedCount,
    remaining: result.remainingCount,
    origin: result.originStatus,
    source: result.sourceStatus,
    workerVersion: result.workerVersion,
    controller: null,
  };
}

function pageCleanupResult(
  status: Exclude<
    DisplayedNotificationCleanupDiagnostic["status"],
    WorkerCleanupStatus
  >,
  overrides: Partial<DisplayedNotificationCleanupDiagnostic> = {}
): DisplayedNotificationCleanupDiagnostic {
  return {
    status,
    sent: 0,
    received: 0,
    enumerated: null,
    matched: null,
    closed: null,
    remaining: null,
    origin: null,
    source: null,
    workerVersion: null,
    controller: null,
    ...overrides,
  };
}
