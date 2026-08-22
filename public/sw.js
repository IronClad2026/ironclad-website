"use strict";

const DEFAULT_DESTINATION = "/";
const NOTIFICATION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IRONCLAD_NOTIFICATION_TAG_PREFIX = "ironclad-notification:";
const CLOSE_DISPLAYED_NOTIFICATIONS_MESSAGE =
  "IRONCLAD_CLOSE_DISPLAYED_NOTIFICATIONS";
const CLOSE_DISPLAYED_NOTIFICATIONS_RESULT =
  "IRONCLAD_CLOSE_DISPLAYED_NOTIFICATIONS_RESULT";
const MAX_TITLE_LENGTH = 80;
const MAX_BODY_LENGTH = 180;
const MAX_UNREAD_COUNT = 999_999;
const MAX_CLOSE_NOTIFICATION_IDS = 100;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  const payload = readPushPayload(event.data);

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(payload.title, {
        body: payload.body,
        icon: "/icons/icon-192x192.png",
        badge: "/icons/icon-96x96.png",
        tag: payload.tag,
        data: {
          notificationId: payload.notificationId,
          scope: payload.scope,
        },
      }),
      applyBackgroundBadge(payload.unreadCount),
    ])
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destination = buildNotificationClickDestination(
    event.notification.data?.notificationId,
    event.notification.data?.scope
  );

  event.waitUntil(focusOrOpenDestination(destination));
});

self.addEventListener("message", (event) => {
  const request = readCloseDisplayedNotificationsRequest(event.data);
  const responsePort = event.ports?.[0];
  if (!request || !responsePort) {
    return;
  }

  if (!isValidCloseMessageSource(event)) {
    postCloseDisplayedNotificationsResult(responsePort, {
      ok: false,
      status: "source_rejected",
      enumeratedCount: null,
      matchedCount: null,
      closedCount: null,
      remainingCount: null,
    });
    return;
  }

  event.waitUntil(
    closeDisplayedNotifications(request)
      .then((result) => {
        postCloseDisplayedNotificationsResult(responsePort, {
          ...result,
        });
      })
      .catch(() => {
        postCloseDisplayedNotificationsResult(responsePort, {
          ok: false,
          status: "enumeration_failed",
          enumeratedCount: null,
          matchedCount: null,
          closedCount: null,
          remainingCount: null,
        });
      })
  );
});

function isValidCloseMessageSource(event) {
  const source = event.source;
  if (
    !source ||
    source.type !== "window" ||
    typeof source.url !== "string"
  ) {
    return false;
  }

  try {
    if (new URL(source.url).origin !== self.location.origin) {
      return false;
    }
  } catch {
    return false;
  }

  return true;
}

function readPushPayload(data) {
  let value = {};

  try {
    value = data?.json() ?? {};
  } catch {
    value = {};
  }

  if (!isRecord(value) || value.version !== 1) {
    value = {};
  }

  const notificationId = readNotificationId(value.notificationId);
  const scope = readScope(value.scope);

  return {
    title: boundedString(value.title, MAX_TITLE_LENGTH) || "IronClad",
    body: boundedString(value.body, MAX_BODY_LENGTH),
    notificationId,
    scope,
    tag: notificationId ? `ironclad-notification:${notificationId}` : undefined,
    unreadCount: readUnreadCount(value.unreadCount),
  };
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedString(value, maximumLength) {
  return typeof value === "string"
    ? value.trim().slice(0, maximumLength)
    : "";
}

function readUnreadCount(value) {
  return Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= MAX_UNREAD_COUNT
    ? value
    : null;
}

function readNotificationId(value) {
  return typeof value === "string" && NOTIFICATION_ID_PATTERN.test(value)
    ? value
    : "";
}

function readScope(value) {
  return value === "player" || value === "admin" ? value : null;
}

function readCloseDisplayedNotificationsRequest(value) {
  if (!isRecord(value) || value.type !== CLOSE_DISPLAYED_NOTIFICATIONS_MESSAGE) {
    return null;
  }

  const allowedKeys = new Set(["type", "notificationIds", "scope"]);
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) {
    return null;
  }

  let notificationIds = null;
  if (Object.prototype.hasOwnProperty.call(value, "notificationIds")) {
    if (
      !Array.isArray(value.notificationIds) ||
      value.notificationIds.length === 0 ||
      value.notificationIds.length > MAX_CLOSE_NOTIFICATION_IDS
    ) {
      return null;
    }

    notificationIds = new Set();
    for (const valueNotificationId of value.notificationIds) {
      const notificationId = readNotificationId(valueNotificationId);
      if (!notificationId) {
        return null;
      }
      notificationIds.add(notificationId);
    }
  }

  let scope = null;
  if (Object.prototype.hasOwnProperty.call(value, "scope")) {
    scope = readScope(value.scope);
    if (!scope) {
      return null;
    }
  }

  return { notificationIds, scope };
}

async function closeDisplayedNotifications({ notificationIds, scope }) {
  const displayedNotifications = await self.registration.getNotifications();
  let matchedCount = 0;
  let closedCount = 0;

  for (const displayedNotification of displayedNotifications) {
    if (
      !matchesDisplayedNotification(
        displayedNotification,
        notificationIds,
        scope
      )
    ) {
      continue;
    }

    matchedCount += 1;
    try {
      displayedNotification.close();
      closedCount += 1;
    } catch {
      // Continue closing other matching IronClad notifications.
    }
  }

  let remainingNotifications;
  try {
    remainingNotifications = await self.registration.getNotifications();
  } catch {
    return {
      ok: false,
      status: "verification_failed",
      enumeratedCount: displayedNotifications.length,
      matchedCount,
      closedCount,
      remainingCount: null,
    };
  }
  const remainingCount = remainingNotifications.filter((notification) =>
    matchesDisplayedNotification(notification, notificationIds, scope)
  ).length;
  const targetedRequest = notificationIds !== null;
  const ok =
    closedCount === matchedCount &&
    remainingCount === 0 &&
    (!targetedRequest || matchedCount > 0);
  const status = ok
    ? matchedCount > 0
      ? "closed"
      : "nothing_to_close"
    : matchedCount === 0
      ? "not_found"
      : remainingCount > 0
        ? "remaining"
        : "close_failed";

  return {
    ok,
    status,
    enumeratedCount: displayedNotifications.length,
    matchedCount,
    closedCount,
    remainingCount,
  };
}

function matchesDisplayedNotification(notification, notificationIds, scope) {
  const notificationId = readDisplayedNotificationId(notification);
  const notificationScope = readScope(notification.data?.scope);
  if (!notificationId || !notificationScope) {
    return false;
  }

  if (notificationIds && !notificationIds.has(notificationId)) {
    return false;
  }

  return !scope || notificationScope === scope;
}

function readDisplayedNotificationId(notification) {
  const tag = typeof notification.tag === "string" ? notification.tag : "";
  const dataNotificationId = readNotificationId(
    notification.data?.notificationId
  );
  if (tag.startsWith(IRONCLAD_NOTIFICATION_TAG_PREFIX)) {
    const taggedNotificationId = readNotificationId(
      tag.slice(IRONCLAD_NOTIFICATION_TAG_PREFIX.length)
    );
    if (taggedNotificationId) {
      if (dataNotificationId && dataNotificationId !== taggedNotificationId) {
        return "";
      }
      return taggedNotificationId;
    }
  }

  return dataNotificationId;
}

function postCloseDisplayedNotificationsResult(
  responsePort,
  {
    ok,
    status,
    enumeratedCount,
    matchedCount,
    closedCount,
    remainingCount,
  }
) {
  try {
    responsePort.postMessage({
      type: CLOSE_DISPLAYED_NOTIFICATIONS_RESULT,
      ok,
      status,
      enumeratedCount,
      matchedCount,
      closedCount,
      remainingCount,
    });
  } catch {
    // The page may have navigated after its bounded acknowledgement window.
  }
}

function buildNotificationClickDestination(notificationId, scope) {
  const trustedNotificationId = readNotificationId(notificationId);
  const trustedScope = readScope(scope);
  if (!trustedNotificationId || !trustedScope) {
    return DEFAULT_DESTINATION;
  }

  return `/api/notifications/click?notificationId=${encodeURIComponent(
    trustedNotificationId
  )}&scope=${trustedScope}`;
}

async function applyBackgroundBadge(unreadCount) {
  if (unreadCount === null) {
    return;
  }

  try {
    if (unreadCount === 0) {
      if (typeof self.navigator.clearAppBadge === "function") {
        await self.navigator.clearAppBadge();
      } else if (typeof self.navigator.setAppBadge === "function") {
        await self.navigator.setAppBadge(0);
      }
      return;
    }

    if (typeof self.navigator.setAppBadge === "function") {
      await self.navigator.setAppBadge(unreadCount);
    }
  } catch {
    // Badging is best-effort and must never prevent the system notification.
  }
}

async function focusOrOpenDestination(destination) {
  const absoluteDestination = new URL(
    destination,
    self.location.origin
  ).href;
  const windows = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });

  for (const client of windows) {
    try {
      if (new URL(client.url).origin !== self.location.origin) {
        continue;
      }

      if (typeof client.navigate === "function") {
        const navigatedClient = await client.navigate(absoluteDestination);
        if (!navigatedClient) {
          continue;
        }
        await navigatedClient.focus();
        return;
      }

      if (client.url === absoluteDestination) {
        await client.focus();
        return;
      }
    } catch {
      // Try another same-origin client or open a new window below.
    }
  }

  await self.clients.openWindow(absoluteDestination);
}
