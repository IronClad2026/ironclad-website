import "server-only";

import { clerkClient } from "@clerk/nextjs/server";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  loadTransactionalEmailConfig,
  type TransactionalEmailConfig,
} from "@/lib/transactional-email/config";
import {
  checkTransactionalEmailEligibility,
  type TransactionalEmailEligibilityClaim,
} from "@/lib/transactional-email/eligibility";
import {
  createTransactionalEmailIdempotencyKey,
  sendTransactionalEmail,
} from "@/lib/transactional-email/resend";
import {
  renderTransactionalEmail,
  TRANSACTIONAL_EMAIL_TEMPLATE_KEYS,
  type TransactionalEmailTemplateKey,
} from "@/lib/transactional-email/templates";

const CLAIM_LIMIT = 10;
const MAX_CONCURRENCY = 3;

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;
type ClerkServerClient = Awaited<ReturnType<typeof clerkClient>>;

type ClaimedNotificationRow = {
  notification_id: unknown;
  recipient_clerk_user_id: unknown;
  notification_type: unknown;
  event_key: unknown;
  email_template_key: unknown;
  tournament_id: unknown;
  registration_id: unknown;
  match_id: unknown;
  metadata: unknown;
  email_attempt_count: unknown;
  email_claim_token: unknown;
};

type CompletionOutcome =
  | "sent"
  | "skipped"
  | "retryable_failure"
  | "permanent_failure";

type ProcessedOutcome =
  | "sent"
  | "skipped"
  | "retryable_failure"
  | "permanent_failure";

export type TransactionalEmailWorkerResult = {
  claimed: number;
  sent: number;
  skipped: number;
  retryableFailures: number;
  permanentFailures: number;
};

export class TransactionalEmailWorkerError extends Error {
  readonly code: "EMAIL_CLAIM_FAILED" | "EMAIL_COMPLETION_FAILED";

  constructor(
    code: "EMAIL_CLAIM_FAILED" | "EMAIL_COMPLETION_FAILED"
  ) {
    super("Transactional email worker database operation failed.");
    this.name = "TransactionalEmailWorkerError";
    this.code = code;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isTemplateKey(value: unknown): value is TransactionalEmailTemplateKey {
  return (
    typeof value === "string" &&
    (TRANSACTIONAL_EMAIL_TEMPLATE_KEYS as readonly string[]).includes(value)
  );
}

function parseClaimedNotification(
  value: unknown
): TransactionalEmailEligibilityClaim | null {
  if (!isRecord(value)) return null;

  const row = value as ClaimedNotificationRow;
  if (
    typeof row.notification_id !== "string" ||
    typeof row.recipient_clerk_user_id !== "string" ||
    typeof row.notification_type !== "string" ||
    typeof row.event_key !== "string" ||
    !isTemplateKey(row.email_template_key) ||
    !isNullableString(row.tournament_id) ||
    !isNullableString(row.registration_id) ||
    !isNullableString(row.match_id) ||
    !isRecord(row.metadata) ||
    typeof row.email_attempt_count !== "number" ||
    !Number.isInteger(row.email_attempt_count) ||
    typeof row.email_claim_token !== "string"
  ) {
    return null;
  }

  return {
    id: row.notification_id,
    recipientClerkUserId: row.recipient_clerk_user_id,
    type: row.notification_type,
    eventKey: row.event_key,
    templateKey: row.email_template_key,
    tournamentId: row.tournament_id,
    registrationId: row.registration_id,
    matchId: row.match_id,
    metadata: row.metadata,
    attemptCount: row.email_attempt_count,
    claimToken: row.email_claim_token,
  };
}

async function claimNotifications(
  supabase: SupabaseAdminClient
): Promise<TransactionalEmailEligibilityClaim[]> {
  const { data, error } = await supabase.rpc(
    "claim_transactional_email_notifications",
    { p_limit: CLAIM_LIMIT }
  );

  if (error || !Array.isArray(data)) {
    throw new TransactionalEmailWorkerError("EMAIL_CLAIM_FAILED");
  }

  const claims = data.map(parseClaimedNotification);
  if (claims.some((claim) => claim === null)) {
    throw new TransactionalEmailWorkerError("EMAIL_CLAIM_FAILED");
  }

  return claims as TransactionalEmailEligibilityClaim[];
}

async function completeNotification(
  supabase: SupabaseAdminClient,
  claim: TransactionalEmailEligibilityClaim,
  outcome: CompletionOutcome,
  errorCode: string | null = null,
  providerMessageId: string | null = null
) {
  const { data, error } = await supabase.rpc(
    "complete_transactional_email_notification",
    {
      p_notification_id: claim.id,
      p_claim_token: claim.claimToken,
      p_outcome: outcome,
      p_error_code: errorCode,
      p_provider_message_id: providerMessageId,
    }
  );

  if (error || data !== true) {
    throw new TransactionalEmailWorkerError("EMAIL_COMPLETION_FAILED");
  }
}

function processedFailureOutcome(
  claim: TransactionalEmailEligibilityClaim,
  outcome: "retryable_failure" | "permanent_failure"
): ProcessedOutcome {
  if (outcome === "retryable_failure" && claim.attemptCount >= 5) {
    return "permanent_failure";
  }

  return outcome;
}

async function completeFailure(
  supabase: SupabaseAdminClient,
  claim: TransactionalEmailEligibilityClaim,
  outcome: "retryable_failure" | "permanent_failure",
  errorCode: string
): Promise<ProcessedOutcome> {
  await completeNotification(supabase, claim, outcome, errorCode);
  return processedFailureOutcome(claim, outcome);
}

function isClerkUserMissing(error: unknown) {
  if (!isRecord(error)) return false;

  return (
    error.status === 404 ||
    error.statusCode === 404 ||
    error.code === "resource_not_found"
  );
}

type ClerkEmailResolution =
  | { ok: true; emailAddress: string }
  | {
      ok: false;
      outcome: "retryable_failure" | "permanent_failure";
      errorCode: string;
    };

async function resolveVerifiedPrimaryEmail(
  getClerkClient: () => Promise<ClerkServerClient>,
  recipientClerkUserId: string
): Promise<ClerkEmailResolution> {
  let user: Awaited<ReturnType<ClerkServerClient["users"]["getUser"]>>;

  try {
    const client = await getClerkClient();
    user = await client.users.getUser(recipientClerkUserId);
  } catch (error) {
    if (isClerkUserMissing(error)) {
      return {
        ok: false,
        outcome: "permanent_failure",
        errorCode: "CLERK_USER_NOT_FOUND",
      };
    }

    return {
      ok: false,
      outcome: "retryable_failure",
      errorCode: "CLERK_LOOKUP_FAILED",
    };
  }

  if (!user.primaryEmailAddressId) {
    return {
      ok: false,
      outcome: "permanent_failure",
      errorCode: "CLERK_PRIMARY_EMAIL_MISSING",
    };
  }

  const primaryEmail = user.emailAddresses.find(
    (emailAddress) => emailAddress.id === user.primaryEmailAddressId
  );
  if (!primaryEmail || !primaryEmail.emailAddress.trim()) {
    return {
      ok: false,
      outcome: "permanent_failure",
      errorCode: "CLERK_PRIMARY_EMAIL_MISSING",
    };
  }

  if (primaryEmail.verification?.status !== "verified") {
    return {
      ok: false,
      outcome: "permanent_failure",
      errorCode: "CLERK_PRIMARY_EMAIL_UNVERIFIED",
    };
  }

  return { ok: true, emailAddress: primaryEmail.emailAddress };
}

async function processClaim(
  supabase: SupabaseAdminClient,
  config: TransactionalEmailConfig,
  claim: TransactionalEmailEligibilityClaim,
  getClerkClient: () => Promise<ClerkServerClient>
): Promise<ProcessedOutcome> {
  if (config.mode === "disabled") {
    await completeNotification(
      supabase,
      claim,
      "skipped",
      "MODE_DISABLED"
    );
    return "skipped";
  }

  if (
    config.mode === "allowlist" &&
    !config.allowedClerkUserIds.has(claim.recipientClerkUserId)
  ) {
    await completeNotification(
      supabase,
      claim,
      "skipped",
      "RECIPIENT_NOT_ALLOWLISTED"
    );
    return "skipped";
  }

  let eligibility: Awaited<
    ReturnType<typeof checkTransactionalEmailEligibility>
  >;
  try {
    eligibility = await checkTransactionalEmailEligibility(claim);
  } catch {
    return completeFailure(
      supabase,
      claim,
      "retryable_failure",
      "ELIGIBILITY_LOOKUP_FAILED"
    );
  }

  if (!eligibility.eligible) {
    if (eligibility.disposition === "skipped") {
      await completeNotification(
        supabase,
        claim,
        "skipped",
        eligibility.code
      );
      return "skipped";
    }

    return completeFailure(
      supabase,
      claim,
      "permanent_failure",
      eligibility.code
    );
  }

  const emailResolution = await resolveVerifiedPrimaryEmail(
    getClerkClient,
    claim.recipientClerkUserId
  );
  if (!emailResolution.ok) {
    return completeFailure(
      supabase,
      claim,
      emailResolution.outcome,
      emailResolution.errorCode
    );
  }

  let rendered: ReturnType<typeof renderTransactionalEmail>;
  try {
    rendered = renderTransactionalEmail(eligibility.data, {
      appOrigin: config.appOrigin,
      from: config.from,
      replyTo: config.replyTo,
    });
  } catch {
    return completeFailure(
      supabase,
      claim,
      "permanent_failure",
      "TEMPLATE_RENDER_FAILED"
    );
  }

  const idempotencyKey = createTransactionalEmailIdempotencyKey({
    notificationId: claim.id,
    recipientClerkUserId: claim.recipientClerkUserId,
    eventKey: claim.eventKey,
    templateKey: claim.templateKey,
  });

  let delivery: Awaited<ReturnType<typeof sendTransactionalEmail>>;
  try {
    delivery = await sendTransactionalEmail({
      apiKey: config.resendApiKey,
      recipient: emailResolution.emailAddress,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      from: rendered.from,
      replyTo: rendered.replyTo,
      idempotencyKey,
    });
  } catch {
    return completeFailure(
      supabase,
      claim,
      "retryable_failure",
      "RESEND_ADAPTER_FAILED"
    );
  }

  if (delivery.status === "accepted") {
    await completeNotification(
      supabase,
      claim,
      "sent",
      null,
      delivery.providerMessageId
    );
    return "sent";
  }

  return completeFailure(
    supabase,
    claim,
    delivery.status,
    delivery.errorCode
  );
}

function addOutcome(
  result: TransactionalEmailWorkerResult,
  outcome: ProcessedOutcome
) {
  if (outcome === "sent") result.sent += 1;
  else if (outcome === "skipped") result.skipped += 1;
  else if (outcome === "retryable_failure") {
    result.retryableFailures += 1;
  } else {
    result.permanentFailures += 1;
  }
}

export async function runTransactionalEmailWorker(): Promise<TransactionalEmailWorkerResult> {
  const config = loadTransactionalEmailConfig();
  const supabase = createSupabaseAdminClient();
  const claims = await claimNotifications(supabase);
  const result: TransactionalEmailWorkerResult = {
    claimed: claims.length,
    sent: 0,
    skipped: 0,
    retryableFailures: 0,
    permanentFailures: 0,
  };

  let clerkClientPromise: Promise<ClerkServerClient> | null = null;
  const getClerkClient = () => {
    clerkClientPromise ??= clerkClient();
    return clerkClientPromise;
  };

  for (let index = 0; index < claims.length; index += MAX_CONCURRENCY) {
    const outcomes = await Promise.all(
      claims
        .slice(index, index + MAX_CONCURRENCY)
        .map((claim) =>
          processClaim(supabase, config, claim, getClerkClient)
        )
    );

    for (const outcome of outcomes) addOutcome(result, outcome);
  }

  return result;
}
