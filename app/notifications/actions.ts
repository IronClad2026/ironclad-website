"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import {
  deleteNotifications,
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

export async function markInAppNotificationRead(formData: FormData) {
  const { userId, sessionClaims } = await auth();
  const scope = getScope(formData);

  if (!userId || !scope) {
    return;
  }

  if (scope === "admin" && !isAdmin(sessionClaims as CustomClaims | null)) {
    throw new Error("Unauthorized");
  }

  const notificationId = String(formData.get("notificationId") ?? "");

  if (!notificationId) {
    return;
  }

  await markNotificationRead({
    notificationId,
    scope,
    clerkUserId: scope === "player" ? userId : null,
  });

  revalidateNotificationPaths(scope);
}

export async function markVisibleInAppNotificationsRead(formData: FormData) {
  const { userId, sessionClaims } = await auth();
  const scope = getScope(formData);

  if (!userId || !scope) {
    return;
  }

  if (scope === "admin" && !isAdmin(sessionClaims as CustomClaims | null)) {
    throw new Error("Unauthorized");
  }

  const notificationIds = formData
    .getAll("notificationId")
    .map((value) => String(value))
    .filter(Boolean);

  await markNotificationsRead({
    notificationIds,
    scope,
    clerkUserId: scope === "player" ? userId : null,
  });

  revalidateNotificationPaths(scope);
}

export async function markAllInAppNotificationsRead(formData: FormData) {
  const { userId, sessionClaims } = await auth();
  const scope = getScope(formData);

  if (!userId || !scope) {
    return;
  }

  if (scope === "admin" && !isAdmin(sessionClaims as CustomClaims | null)) {
    throw new Error("Unauthorized");
  }

  await markAllNotificationsRead({
    scope,
    clerkUserId: scope === "player" ? userId : null,
  });

  revalidateNotificationPaths(scope);
}

export async function deleteSelectedInAppNotifications(formData: FormData) {
  const { userId, sessionClaims } = await auth();
  const scope = getScope(formData);

  if (!userId || !scope) {
    return;
  }

  if (scope === "admin" && !isAdmin(sessionClaims as CustomClaims | null)) {
    throw new Error("Unauthorized");
  }

  const notificationIds = formData
    .getAll("notificationId")
    .map((value) => String(value))
    .filter(Boolean);

  await deleteNotifications({
    notificationIds,
    scope,
    clerkUserId: scope === "player" ? userId : null,
  });

  revalidateNotificationPaths(scope);
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
