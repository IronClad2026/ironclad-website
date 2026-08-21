"use strict";

const DEFAULT_DESTINATION = "/";
const NOTIFICATION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_TITLE_LENGTH = 80;
const MAX_BODY_LENGTH = 180;
const MAX_UNREAD_COUNT = 999_999;

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
