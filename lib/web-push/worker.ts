import "server-only";

import { clerkClient } from "@clerk/nextjs/server";
import webPush from "web-push";

import {
  CLERK_LOCALE_METADATA_KEY,
  resolveLocale,
} from "@/lib/i18n/config";
import { loadDictionary } from "@/lib/i18n/loaders";
import { localizePlayerNotificationCopy } from "@/lib/i18n/notification-copy";
import { loadUnreadNotificationCount } from "@/lib/notifications";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { loadWebPushConfig } from "@/lib/web-push/config";
import { createWebPushPayload } from "@/lib/web-push/payload";
import { isWebPushEligible } from "@/lib/web-push/policy";
import { parseWebPushSubscription } from "@/lib/web-push/validation";

const CLAIM_LIMIT = 10;
const MAX_CONCURRENCY = 3;
const CLERK_PAGE_SIZE = 100;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;
type ClerkServerClient = Awaited<ReturnType<typeof clerkClient>>;

type PushClaim = {
  id: string;
  recipientClerkUserId: string | null;
  recipientRole: "player" | "admin";
  type: string;
  eventKey: string;
  metadata: Record<string, unknown>;
  enqueuedAt: string;
  attemptCount: number;
  claimToken: string;
};

type SubscriptionRow = {
  id: string;
  ownerClerkUserId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

type CompletionOutcome =
  | "sent"
  | "skipped"
  | "retryable_failure"
  | "permanent_failure";

type ProcessedOutcome = CompletionOutcome;

export type WebPushWorkerResult = {
  enabled: boolean;
  claimed: number;
  sent: number;
  skipped: number;
  retryableFailures: number;
  permanentFailures: number;
};

export class WebPushWorkerError extends Error {
  readonly code: "PUSH_CLAIM_FAILED" | "PUSH_COMPLETION_FAILED";

  constructor(code: "PUSH_CLAIM_FAILED" | "PUSH_COMPLETION_FAILED") {
    super("Web Push worker database operation failed.");
    this.name = "WebPushWorkerError";
    this.code = code;
  }
}

export async function runWebPushWorker(): Promise<WebPushWorkerResult> {
  const config = loadWebPushConfig();
  if (config.mode === "disabled") return emptyResult(false);

  const supabase = createSupabaseAdminClient();
  const claims = await claimNotifications(supabase);
  const result = emptyResult(true);
  result.claimed = claims.length;

  let clerkPromise: Promise<ClerkServerClient> | null = null;
  const getClerkClient = () => {
    clerkPromise ??= clerkClient();
    return clerkPromise;
  };

  let adminIdsPromise: Promise<string[]> | null = null;
  const getAdminIds = () => {
    adminIdsPromise ??= resolveCurrentAdminIds(getClerkClient);
    return adminIdsPromise;
  };

  for (let index = 0; index < claims.length; index += MAX_CONCURRENCY) {
    const outcomes = await Promise.all(
      claims.slice(index, index + MAX_CONCURRENCY).map((claim) =>
        processClaim(
          supabase,
          claim,
          config,
          getClerkClient,
          getAdminIds
        )
      )
    );

    for (const outcome of outcomes) addOutcome(result, outcome);
  }

  return result;
}

function emptyResult(enabled: boolean): WebPushWorkerResult {
  return {
    enabled,
    claimed: 0,
    sent: 0,
    skipped: 0,
    retryableFailures: 0,
    permanentFailures: 0,
  };
}

async function claimNotifications(
  supabase: SupabaseAdminClient
): Promise<PushClaim[]> {
  const { data, error } = await supabase.rpc(
    "claim_web_push_notifications",
    { p_limit: CLAIM_LIMIT }
  );

  if (error || !Array.isArray(data)) {
    throw new WebPushWorkerError("PUSH_CLAIM_FAILED");
  }

  const claims = data.map(parseClaim);
  if (claims.some((claim) => claim === null)) {
    throw new WebPushWorkerError("PUSH_CLAIM_FAILED");
  }

  return claims as PushClaim[];
}

function parseClaim(value: unknown): PushClaim | null {
  if (!isRecord(value)) return null;

  const metadata = value.metadata;
  const recipientRole = value.recipient_role;
  const recipientClerkUserId = value.recipient_clerk_user_id;

  if (
    typeof value.notification_id !== "string" ||
    !UUID_PATTERN.test(value.notification_id) ||
    (recipientRole !== "player" && recipientRole !== "admin") ||
    (recipientClerkUserId !== null &&
      typeof recipientClerkUserId !== "string") ||
    typeof value.notification_type !== "string" ||
    typeof value.event_key !== "string" ||
    !isRecord(metadata) ||
    typeof value.push_enqueued_at !== "string" ||
    !Number.isFinite(Date.parse(value.push_enqueued_at)) ||
    typeof value.push_attempt_count !== "number" ||
    !Number.isInteger(value.push_attempt_count) ||
    typeof value.push_claim_token !== "string" ||
    !UUID_PATTERN.test(value.push_claim_token)
  ) {
    return null;
  }

  return {
    id: value.notification_id,
    recipientClerkUserId,
    recipientRole,
    type: value.notification_type,
    eventKey: value.event_key,
    metadata,
    enqueuedAt: value.push_enqueued_at,
    attemptCount: value.push_attempt_count,
    claimToken: value.push_claim_token,
  };
}

async function processClaim(
  supabase: SupabaseAdminClient,
  claim: PushClaim,
  config: Extract<ReturnType<typeof loadWebPushConfig>, { mode: "enabled" }>,
  getClerkClient: () => Promise<ClerkServerClient>,
  getAdminIds: () => Promise<string[]>
): Promise<ProcessedOutcome> {
  if (!isWebPushEligible(claim)) {
    await completeNotification(
      supabase,
      claim,
      "permanent_failure",
      "POLICY_MISMATCH"
    );
    return "permanent_failure";
  }

  const currentState = await loadClaimState(supabase, claim);
  if (currentState === "unavailable") {
    return completeFailure(
      supabase,
      claim,
      "retryable_failure",
      "NOTIFICATION_RECHECK_FAILED"
    );
  }

  if (currentState === "stale") {
    await completeNotification(
      supabase,
      claim,
      "skipped",
      "NO_LONGER_UNREAD"
    );
    return "skipped";
  }

  let ownerIds: string[];
  let locale = resolveLocale(undefined);
  let badgeScope: "player" | "admin" = claim.recipientRole;

  try {
    if (claim.recipientRole === "admin") {
      ownerIds = await getAdminIds();
    } else if (claim.recipientClerkUserId) {
      const client = await getClerkClient();
      const user = await client.users.getUser(claim.recipientClerkUserId);
      if (user.banned || user.locked) {
        await completeNotification(
          supabase,
          claim,
          "skipped",
          "RECIPIENT_INACTIVE"
        );
        return "skipped";
      }
      ownerIds = [user.id];
      badgeScope =
        user.publicMetadata?.role === "admin" ? "admin" : "player";
      locale = resolveLocale(
        user.privateMetadata?.[CLERK_LOCALE_METADATA_KEY]
      );
    } else {
      ownerIds = [];
    }
  } catch (error) {
    if (isClerkUserMissing(error)) {
      await completeNotification(
        supabase,
        claim,
        "permanent_failure",
        "CLERK_RECIPIENT_NOT_FOUND"
      );
      return "permanent_failure";
    }

    return completeFailure(
      supabase,
      claim,
      "retryable_failure",
      "CLERK_LOOKUP_FAILED"
    );
  }

  if (ownerIds.length === 0) {
    await completeNotification(
      supabase,
      claim,
      "skipped",
      "NO_CURRENT_RECIPIENT"
    );
    return "skipped";
  }

  const subscriptions = await loadEligibleSubscriptions(
    supabase,
    ownerIds,
    claim.enqueuedAt
  );
  if (subscriptions === null) {
    return completeFailure(
      supabase,
      claim,
      "retryable_failure",
      "SUBSCRIPTION_LOOKUP_FAILED"
    );
  }

  if (subscriptions.length === 0) {
    await completeNotification(
      supabase,
      claim,
      "skipped",
      "NO_ELIGIBLE_SUBSCRIPTION"
    );
    return "skipped";
  }

  const unreadCount = await loadUnreadNotificationCount({
    scope: badgeScope,
    clerkUserId:
      badgeScope === "player" ? claim.recipientClerkUserId : null,
  });
  if (unreadCount === null) {
    return completeFailure(
      supabase,
      claim,
      "retryable_failure",
      "UNREAD_COUNT_FAILED"
    );
  }

  if (unreadCount === 0 && badgeScope === claim.recipientRole) {
    await completeNotification(
      supabase,
      claim,
      "skipped",
      "NO_LONGER_UNREAD"
    );
    return "skipped";
  }

  let title: string;
  let body: string;
  if (claim.recipientRole === "admin") {
    ({ title, body } = adminCopy(claim.type));
  } else {
    const dictionary = await loadDictionary(locale, "notifications");
    const localized = localizePlayerNotificationCopy(
      { type: claim.type, tournamentTitle: null },
      dictionary
    );
    if (!localized) {
      await completeNotification(
        supabase,
        claim,
        "permanent_failure",
        "COPY_UNAVAILABLE"
      );
      return "permanent_failure";
    }
    title = localized.title;
    body = localized.message;
  }

  let payload: string;
  try {
    payload = JSON.stringify(
      createWebPushPayload({
        notificationId: claim.id,
        scope: claim.recipientRole,
        type: claim.type,
        title,
        body,
        unreadCount,
      })
    );
  } catch {
    await completeNotification(
      supabase,
      claim,
      "permanent_failure",
      "PAYLOAD_INVALID"
    );
    return "permanent_failure";
  }

  const deliveries = await Promise.all(
    subscriptions.map((subscription) =>
      sendToSubscription(supabase, subscription, payload, config)
    )
  );

  const transientFailures = deliveries.filter(
    (outcome) => outcome === "retryable_failure"
  ).length;
  const sent = deliveries.filter((outcome) => outcome === "sent").length;

  if (transientFailures > 0) {
    return completeFailure(
      supabase,
      claim,
      "retryable_failure",
      "PUSH_PROVIDER_TRANSIENT"
    );
  }

  if (sent > 0) {
    await completeNotification(supabase, claim, "sent");
    return "sent";
  }

  await completeNotification(
    supabase,
    claim,
    "permanent_failure",
    "NO_VALID_SUBSCRIPTION"
  );
  return "permanent_failure";
}

async function loadClaimState(
  supabase: SupabaseAdminClient,
  claim: PushClaim
): Promise<"unread" | "stale" | "unavailable"> {
  const { data, error } = await supabase
    .from("notifications")
    .select(
      "id, read_at, in_app_hidden_at, push_delivery_status, push_claim_token"
    )
    .eq("id", claim.id)
    .limit(1);

  if (error || !Array.isArray(data)) return "unavailable";
  if (data.length !== 1) return "stale";
  const row = data[0];
  return (
    isRecord(row) &&
    row.id === claim.id &&
    row.read_at === null &&
    row.in_app_hidden_at === null &&
    row.push_delivery_status === "processing" &&
    row.push_claim_token === claim.claimToken
  )
    ? "unread"
    : "stale";
}

async function resolveCurrentAdminIds(
  getClerkClient: () => Promise<ClerkServerClient>
) {
  const client = await getClerkClient();
  const ids: string[] = [];
  let offset = 0;

  while (true) {
    const page = await client.users.getUserList({
      limit: CLERK_PAGE_SIZE,
      offset,
      orderBy: "+created_at",
    });

    for (const user of page.data) {
      if (
        !user.banned &&
        !user.locked &&
        user.publicMetadata?.role === "admin"
      ) {
        ids.push(user.id);
      }
    }

    offset += page.data.length;
    if (page.data.length === 0 || offset >= page.totalCount) break;
  }

  return ids;
}

async function loadEligibleSubscriptions(
  supabase: SupabaseAdminClient,
  ownerIds: string[],
  enqueuedAt: string
): Promise<SubscriptionRow[] | null> {
  const query = supabase
    .from("push_subscriptions")
    .select("id, owner_clerk_user_id, endpoint, p256dh, auth")
    .lte("created_at", enqueuedAt);

  if (ownerIds.length === 1) {
    query.eq("owner_clerk_user_id", ownerIds[0]);
  } else {
    query.in("owner_clerk_user_id", ownerIds);
  }

  const { data, error } = await query;
  if (error || !Array.isArray(data)) return null;

  const rows = data.map(parseSubscriptionRow);
  if (rows.some((row) => row === null)) return null;
  return rows as SubscriptionRow[];
}

function parseSubscriptionRow(value: unknown): SubscriptionRow | null {
  const parsed = isRecord(value)
    ? parseWebPushSubscription({
        endpoint: value.endpoint,
        expirationTime: null,
        keys: { p256dh: value.p256dh, auth: value.auth },
      })
    : null;

  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    !UUID_PATTERN.test(value.id) ||
    typeof value.owner_clerk_user_id !== "string" ||
    !value.owner_clerk_user_id.trim() ||
    !parsed
  ) {
    return null;
  }

  return {
    id: value.id,
    ownerClerkUserId: value.owner_clerk_user_id,
    endpoint: parsed.endpoint,
    p256dh: parsed.p256dh,
    auth: parsed.auth,
  };
}

async function sendToSubscription(
  supabase: SupabaseAdminClient,
  subscription: SubscriptionRow,
  payload: string,
  config: Extract<ReturnType<typeof loadWebPushConfig>, { mode: "enabled" }>
): Promise<"sent" | "retryable_failure" | "permanent_failure"> {
  try {
    await webPush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.p256dh,
          auth: subscription.auth,
        },
      },
      payload,
      {
        TTL: 24 * 60 * 60,
        urgency: "high",
        timeout: 10_000,
        vapidDetails: {
          subject: config.subject,
          publicKey: config.publicKey,
          privateKey: config.privateKey,
        },
      }
    );
    return "sent";
  } catch (error) {
    const statusCode = webPushStatusCode(error);
    if (statusCode === 404 || statusCode === 410) {
      const { error: deleteError } = await supabase
        .from("push_subscriptions")
        .delete()
        .eq("id", subscription.id);
      if (deleteError) return "retryable_failure";
      return "permanent_failure";
    }

    if (
      statusCode !== null &&
      statusCode >= 400 &&
      statusCode < 500 &&
      statusCode !== 401 &&
      statusCode !== 403 &&
      statusCode !== 429
    ) {
      return "permanent_failure";
    }

    return "retryable_failure";
  }
}

function webPushStatusCode(error: unknown): number | null {
  if (!isRecord(error)) return null;
  const value = error.statusCode;
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

async function completeNotification(
  supabase: SupabaseAdminClient,
  claim: PushClaim,
  outcome: CompletionOutcome,
  errorCode: string | null = null
) {
  const { data, error } = await supabase.rpc(
    "complete_web_push_notification",
    {
      p_notification_id: claim.id,
      p_claim_token: claim.claimToken,
      p_outcome: outcome,
      p_error_code: errorCode,
    }
  );

  if (error || data !== true) {
    throw new WebPushWorkerError("PUSH_COMPLETION_FAILED");
  }
}

async function completeFailure(
  supabase: SupabaseAdminClient,
  claim: PushClaim,
  outcome: "retryable_failure" | "permanent_failure",
  errorCode: string
): Promise<ProcessedOutcome> {
  await completeNotification(supabase, claim, outcome, errorCode);
  return outcome === "retryable_failure" && claim.attemptCount >= 5
    ? "permanent_failure"
    : outcome;
}

function adminCopy(type: string) {
  if (type === "match.dispute_opened") {
    return {
      title: "Match dispute requires review",
      body: "A new Match dispute needs Admin attention.",
    };
  }

  if (type === "match.no_show_disputed") {
    return {
      title: "No-show dispute requires review",
      body: "A disputed no-show report needs Admin attention.",
    };
  }

  return {
    title: "Admin assistance requested",
    body: "A Player requested Admin assistance for a Match.",
  };
}

function isClerkUserMissing(error: unknown) {
  return (
    isRecord(error) &&
    (error.status === 404 ||
      error.statusCode === 404 ||
      error.code === "resource_not_found")
  );
}

function addOutcome(result: WebPushWorkerResult, outcome: ProcessedOutcome) {
  if (outcome === "sent") result.sent += 1;
  else if (outcome === "skipped") result.skipped += 1;
  else if (outcome === "retryable_failure") result.retryableFailures += 1;
  else result.permanentFailures += 1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
