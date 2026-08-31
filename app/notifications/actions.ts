"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { requireCurrentAccountLegalAcceptance } from "@/lib/account-legal-mutation-guard";
import {
  deleteNotifications,
  loadUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead,
  markNotificationsRead,
  type NotificationScope,
} from "@/lib/notifications";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { loadWebPushConfig } from "@/lib/web-push/config";
import {
  parseWebPushEndpoint,
  parseWebPushSubscription,
  type WebPushSubscriptionInput,
} from "@/lib/web-push/validation";

type CustomClaims = {
  metadata?: {
    role?: string;
  };
};

export type NotificationMutationResult =
  | { ok: true; unreadCount: number }
  | { ok: false; code: "unavailable" };

type NotificationPushFailureCode =
  | "authentication_required"
  | "invalid_subscription"
  | "unavailable";

export type NotificationPushConfigurationResult =
  | { ok: true; vapidPublicKey: string }
  | {
      ok: false;
      code: Extract<
        NotificationPushFailureCode,
        "authentication_required" | "unavailable"
      >;
    };

export type WebPushSubscriptionMutationResult =
  | { ok: true }
  | { ok: false; code: NotificationPushFailureCode };

export type NotificationUnreadCountResult =
  | { ok: true; unreadCount: number }
  | {
      ok: false;
      code: Extract<
        NotificationPushFailureCode,
        "authentication_required" | "unavailable"
      >;
    };

export type WebPushSubscriptionOwnershipResult =
  | { ok: true; owned: boolean }
  | { ok: false; code: NotificationPushFailureCode };

const unavailableResult = (): NotificationMutationResult => ({
  ok: false,
  code: "unavailable",
});

export async function getNotificationPushConfiguration(): Promise<NotificationPushConfigurationResult> {
  const identity = await loadNotificationIdentity();
  if (!identity) {
    return { ok: false, code: "authentication_required" };
  }

  try {
    const config = loadWebPushConfig();
    return config.mode === "enabled"
      ? { ok: true, vapidPublicKey: config.publicKey }
      : { ok: false, code: "unavailable" };
  } catch {
    return { ok: false, code: "unavailable" };
  }
}

export async function saveWebPushSubscription(
  input: WebPushSubscriptionInput
): Promise<WebPushSubscriptionMutationResult> {
  const identity = await loadNotificationIdentity();
  if (!identity) {
    return { ok: false, code: "authentication_required" };
  }

  await requireCurrentAccountLegalAcceptance();

  const subscription = parseWebPushSubscription(input);
  if (!subscription) {
    return { ok: false, code: "invalid_subscription" };
  }

  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase.rpc(
      "upsert_web_push_subscription",
      {
        p_clerk_user_id: identity.userId,
        p_endpoint: subscription.endpoint,
        p_p256dh: subscription.p256dh,
        p_auth: subscription.auth,
        p_expires_at: subscription.expiresAt,
      }
    );

    if (error || !isUuid(data)) {
      logPushActionFailure("save-subscription", error);
      return { ok: false, code: "unavailable" };
    }

    return { ok: true };
  } catch (error) {
    logPushActionFailure("save-subscription", error);
    return { ok: false, code: "unavailable" };
  }
}

export async function deleteWebPushSubscription(
  endpointInput: string
): Promise<WebPushSubscriptionMutationResult> {
  const identity = await loadNotificationIdentity();
  if (!identity) {
    return { ok: false, code: "authentication_required" };
  }

  const endpoint = parseWebPushEndpoint(endpointInput);
  if (!endpoint) {
    return { ok: false, code: "invalid_subscription" };
  }

  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase.rpc(
      "delete_web_push_subscription",
      {
        p_clerk_user_id: identity.userId,
        p_endpoint: endpoint,
      }
    );

    if (error || (data !== true && data !== false)) {
      logPushActionFailure("delete-subscription", error);
      return { ok: false, code: "unavailable" };
    }

    return { ok: true };
  } catch (error) {
    logPushActionFailure("delete-subscription", error);
    return { ok: false, code: "unavailable" };
  }
}

export async function checkWebPushSubscriptionOwnership(
  endpointInput: string
): Promise<WebPushSubscriptionOwnershipResult> {
  const identity = await loadNotificationIdentity();
  if (!identity) {
    return { ok: false, code: "authentication_required" };
  }

  const endpoint = parseWebPushEndpoint(endpointInput);
  if (!endpoint) {
    return { ok: false, code: "invalid_subscription" };
  }

  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("push_subscriptions")
      .select("id")
      .eq("endpoint", endpoint)
      .eq("owner_clerk_user_id", identity.userId)
      .limit(1);

    if (error || !Array.isArray(data) || data.length > 1) {
      logPushActionFailure("check-subscription-owner", error);
      return { ok: false, code: "unavailable" };
    }

    return { ok: true, owned: data.length === 1 };
  } catch (error) {
    logPushActionFailure("check-subscription-owner", error);
    return { ok: false, code: "unavailable" };
  }
}

export async function loadAuthoritativeNotificationUnreadCount(): Promise<NotificationUnreadCountResult> {
  const identity = await loadNotificationIdentity();
  if (!identity) {
    return { ok: false, code: "authentication_required" };
  }

  const scope: NotificationScope = isAdmin(identity.sessionClaims)
    ? "admin"
    : "player";
  let unreadCount: number | null;

  try {
    unreadCount = await loadUnreadNotificationCount({
      scope,
      clerkUserId: scope === "player" ? identity.userId : null,
    });
  } catch (error) {
    logPushActionFailure("load-unread-count", error);
    unreadCount = null;
  }

  return unreadCount === null
    ? { ok: false, code: "unavailable" }
    : { ok: true, unreadCount };
}

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

  await requireCurrentAccountLegalAcceptance();

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

  await requireCurrentAccountLegalAcceptance();

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

  await requireCurrentAccountLegalAcceptance();

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

  if (scope === "admin") {
    await requireCurrentAccountLegalAcceptance();
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

async function loadNotificationIdentity(): Promise<{
  userId: string;
  sessionClaims: CustomClaims | null;
} | null> {
  try {
    const { userId, sessionClaims } = await auth();
    return userId
      ? {
          userId,
          sessionClaims: sessionClaims as CustomClaims | null,
        }
      : null;
  } catch {
    return null;
  }
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
  );
}

function logPushActionFailure(operation: string, error: unknown) {
  const candidateCode =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
      ? error.code.toUpperCase()
      : "";
  const code = /^[A-Z0-9_]{3,64}$/.test(candidateCode)
    ? candidateCode
    : "PUSH_ACTION_FAILED";

  console.error("Web Push subscription operation failed.", {
    operation,
    code,
  });
}

function revalidateNotificationPaths(scope: NotificationScope) {
  if (scope === "admin") {
    revalidatePath("/admin");
  } else {
    revalidatePath("/dashboard");
  }
}
