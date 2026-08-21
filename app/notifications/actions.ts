"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import {
  deleteNotifications,
  loadUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead,
  markNotificationsRead,
  type NotificationScope,
} from "@/lib/notifications";

type CustomClaims = {
  metadata?: {
    role?: string;
  };
};

export type NotificationMutationResult =
  | { ok: true; unreadCount: number }
  | { ok: false; code: "unavailable" };

const unavailableResult = (): NotificationMutationResult => ({
  ok: false,
  code: "unavailable",
});

export async function markInAppNotificationRead(
  formData: FormData
): Promise<NotificationMutationResult> {
  const { userId, sessionClaims } = await auth();
  const scope = getScope(formData);

  if (!userId || !scope) {
    return unavailableResult();
  }

  if (scope === "admin" && !isAdmin(sessionClaims as CustomClaims | null)) {
    return unavailableResult();
  }

  const notificationId = String(formData.get("notificationId") ?? "");

  if (!notificationId) {
    return unavailableResult();
  }

  const updated = await markNotificationRead({
    notificationId,
    scope,
    clerkUserId: scope === "player" ? userId : null,
  });

  return finishMutation(updated, scope, userId);
}

export async function markVisibleInAppNotificationsRead(
  formData: FormData
): Promise<NotificationMutationResult> {
  const { userId, sessionClaims } = await auth();
  const scope = getScope(formData);

  if (!userId || !scope) {
    return unavailableResult();
  }

  if (scope === "admin" && !isAdmin(sessionClaims as CustomClaims | null)) {
    return unavailableResult();
  }

  const notificationIds = formData
    .getAll("notificationId")
    .map((value) => String(value))
    .filter(Boolean);

  const updated = await markNotificationsRead({
    notificationIds,
    scope,
    clerkUserId: scope === "player" ? userId : null,
  });

  return finishMutation(updated, scope, userId);
}

export async function markAllInAppNotificationsRead(
  formData: FormData
): Promise<NotificationMutationResult> {
  const { userId, sessionClaims } = await auth();
  const scope = getScope(formData);

  if (!userId || !scope) {
    return unavailableResult();
  }

  if (scope === "admin" && !isAdmin(sessionClaims as CustomClaims | null)) {
    return unavailableResult();
  }

  const updated = await markAllNotificationsRead({
    scope,
    clerkUserId: scope === "player" ? userId : null,
  });

  return finishMutation(updated, scope, userId);
}

export async function deleteSelectedInAppNotifications(
  formData: FormData
): Promise<NotificationMutationResult> {
  const { userId, sessionClaims } = await auth();
  const scope = getScope(formData);

  if (!userId || !scope) {
    return unavailableResult();
  }

  if (scope === "admin" && !isAdmin(sessionClaims as CustomClaims | null)) {
    return unavailableResult();
  }

  const notificationIds = formData
    .getAll("notificationId")
    .map((value) => String(value))
    .filter(Boolean);

  const updated = await deleteNotifications({
    notificationIds,
    scope,
    clerkUserId: scope === "player" ? userId : null,
  });

  return finishMutation(updated, scope, userId);
}

async function finishMutation(
  updated: boolean,
  scope: NotificationScope,
  clerkUserId: string
): Promise<NotificationMutationResult> {
  if (!updated) {
    return unavailableResult();
  }

  revalidateNotificationPaths(scope);

  const unreadCount = await loadUnreadNotificationCount({
    scope,
    clerkUserId: scope === "player" ? clerkUserId : null,
  });

  if (unreadCount === null) {
    return unavailableResult();
  }

  return { ok: true, unreadCount };
}

function getScope(formData: FormData): NotificationScope | null {
  const scope = String(formData.get("scope") ?? "");
  return scope === "player" || scope === "admin" ? scope : null;
}

function isAdmin(claims: CustomClaims | null) {
  return claims?.metadata?.role === "admin";
}

function revalidateNotificationPaths(scope: NotificationScope) {
  if (scope === "admin") {
    revalidatePath("/admin");
  } else {
    revalidatePath("/dashboard");
  }
}
