import "server-only";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_TITLE_LENGTH = 80;
const MAX_BODY_LENGTH = 180;
const MAX_TYPE_LENGTH = 80;
const MAX_UNREAD_COUNT = 999_999;

export type WebPushPayload = {
  version: 1;
  notificationId: string;
  scope: "player" | "admin";
  type: string;
  title: string;
  body: string;
  unreadCount: number;
};

export function createWebPushPayload(input: {
  notificationId: string;
  scope: "player" | "admin";
  type: string;
  title: string;
  body: string;
  unreadCount: number;
}): WebPushPayload {
  if (
    !UUID_PATTERN.test(input.notificationId) ||
    (input.scope !== "player" && input.scope !== "admin") ||
    !isBoundedText(input.type, MAX_TYPE_LENGTH) ||
    !isBoundedText(input.title, MAX_TITLE_LENGTH) ||
    !isBoundedText(input.body, MAX_BODY_LENGTH) ||
    !Number.isSafeInteger(input.unreadCount) ||
    input.unreadCount < 0 ||
    input.unreadCount > MAX_UNREAD_COUNT
  ) {
    throw new Error("Invalid Web Push payload.");
  }

  return {
    version: 1,
    notificationId: input.notificationId,
    scope: input.scope,
    type: input.type,
    title: input.title,
    body: input.body,
    unreadCount: input.unreadCount,
  };
}

function isBoundedText(value: string, maximum: number) {
  return (
    value.length > 0 &&
    value.length <= maximum &&
    value === value.trim() &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}
