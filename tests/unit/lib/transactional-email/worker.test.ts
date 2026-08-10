import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  callOrder: [] as string[],
  checkEligibility: vi.fn(),
  clerkClient: vi.fn(),
  createIdempotencyKey: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  getUser: vi.fn(),
  loadConfig: vi.fn(),
  renderEmail: vi.fn(),
  rpc: vi.fn(),
  sendEmail: vi.fn(),
}));

vi.mock("@/lib/supabase-admin", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}));

vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: mocks.clerkClient,
}));

vi.mock("@/lib/transactional-email/config", () => ({
  loadTransactionalEmailConfig: mocks.loadConfig,
}));

vi.mock("@/lib/transactional-email/eligibility", () => ({
  checkTransactionalEmailEligibility: mocks.checkEligibility,
}));

vi.mock("@/lib/transactional-email/templates", () => ({
  TRANSACTIONAL_EMAIL_TEMPLATE_KEYS: [
    "registration_approved",
    "division_started_first_match",
    "later_round_match_ready",
    "deadline_reminder_72h",
    "deadline_reminder_24h",
  ],
  renderTransactionalEmail: mocks.renderEmail,
}));

vi.mock("@/lib/transactional-email/resend", () => ({
  createTransactionalEmailIdempotencyKey: mocks.createIdempotencyKey,
  sendTransactionalEmail: mocks.sendEmail,
}));

import {
  runTransactionalEmailWorker,
  TransactionalEmailWorkerError,
} from "@/lib/transactional-email/worker";

const NOTIFICATION_ID_PREFIX = "00000000-0000-4000-8000-";
const CLAIM_TOKEN_PREFIX = "10000000-0000-4000-8000-";

function claimRow(
  index = 1,
  overrides: Record<string, unknown> = {}
) {
  const suffix = String(index).padStart(12, "0");
  return {
    notification_id: `${NOTIFICATION_ID_PREFIX}${suffix}`,
    recipient_clerk_user_id: `user_${index}`,
    notification_type: "registration.approved",
    event_key: `registration:event-${index}:approved`,
    email_template_key: "registration_approved",
    tournament_id: `20000000-0000-4000-8000-${suffix}`,
    registration_id: `30000000-0000-4000-8000-${suffix}`,
    match_id: null,
    metadata: { fixture: index },
    email_attempt_count: 1,
    email_claim_token: `${CLAIM_TOKEN_PREFIX}${suffix}`,
    ...overrides,
  };
}

function enabledConfig() {
  return {
    mode: "enabled" as const,
    resendApiKey: "provider-key",
    from: "IronClad <sender@example.test>",
    replyTo: "operations@example.test",
    appOrigin: "https://ironclad.example.test",
    allowedClerkUserIds: new Set<string>(),
    workerSecret: "worker-secret",
  };
}

function eligibleResult() {
  return {
    eligible: true as const,
    templateKey: "registration_approved" as const,
    data: {
      templateKey: "registration_approved" as const,
      tournamentName: "IronClad Cup",
      divisionName: "Division One",
      registrationId: "30000000-0000-4000-8000-000000000001",
    },
  };
}

function verifiedUser(emailAddress = "recipient@example.test") {
  return {
    primaryEmailAddressId: "email_primary",
    emailAddresses: [
      {
        id: "email_primary",
        emailAddress,
        verification: { status: "verified" },
      },
    ],
  };
}

function completionCalls() {
  return mocks.rpc.mock.calls.filter(
    ([functionName]) =>
      functionName === "complete_transactional_email_notification"
  );
}

function completionFor(index: number) {
  return completionCalls().find(
    ([, parameters]) =>
      parameters.p_notification_id === claimRow(index).notification_id
  )?.[1];
}

function arrangeClaims(rows: unknown[]) {
  mocks.rpc.mockImplementation(async (functionName: string) => {
    if (functionName === "claim_transactional_email_notifications") {
      return { data: rows, error: null };
    }

    return { data: true, error: null };
  });
}

describe("transactional email worker", () => {
  beforeEach(() => {
    mocks.callOrder.length = 0;
    mocks.loadConfig.mockImplementation(() => {
      mocks.callOrder.push("config");
      return enabledConfig();
    });
    mocks.createSupabaseAdminClient.mockImplementation(() => {
      mocks.callOrder.push("supabase");
      return { rpc: mocks.rpc };
    });
    mocks.clerkClient.mockImplementation(async () => {
      mocks.callOrder.push("clerk");
      return { users: { getUser: mocks.getUser } };
    });
    mocks.getUser.mockResolvedValue(verifiedUser());
    mocks.checkEligibility.mockResolvedValue(eligibleResult());
    mocks.renderEmail.mockReturnValue({
      subject: "Registration approved",
      html: "<p>Approved</p>",
      text: "Approved",
      from: "IronClad <sender@example.test>",
      replyTo: "operations@example.test",
    });
    mocks.createIdempotencyKey.mockReturnValue("ic_txn_v1_digest");
    mocks.sendEmail.mockResolvedValue({
      status: "accepted",
      providerMessageId: "provider-message-id",
    });
    arrangeClaims([claimRow()]);
  });

  it("validates configuration before constructing the Supabase client", async () => {
    mocks.loadConfig.mockImplementation(() => {
      throw new Error("safe configuration error");
    });

    await expect(runTransactionalEmailWorker()).rejects.toThrow(
      "safe configuration error"
    );

    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled();
    expect(mocks.clerkClient).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("claims at most ten and maps private snake_case claim context", async () => {
    await runTransactionalEmailWorker();

    expect(mocks.rpc).toHaveBeenNthCalledWith(
      1,
      "claim_transactional_email_notifications",
      { p_limit: 10 }
    );
    expect(mocks.checkEligibility).toHaveBeenCalledWith({
      id: claimRow().notification_id,
      recipientClerkUserId: "user_1",
      type: "registration.approved",
      eventKey: "registration:event-1:approved",
      templateKey: "registration_approved",
      tournamentId: claimRow().tournament_id,
      registrationId: claimRow().registration_id,
      matchId: null,
      metadata: { fixture: 1 },
      attemptCount: 1,
      claimToken: claimRow().email_claim_token,
    });
    expect(mocks.callOrder.slice(0, 2)).toEqual(["config", "supabase"]);
  });

  it("claims then skips disabled-mode work without Clerk, eligibility, rendering, or Resend", async () => {
    mocks.loadConfig.mockReturnValue({
      mode: "disabled",
      resendApiKey: null,
      from: null,
      replyTo: null,
      appOrigin: null,
      allowedClerkUserIds: new Set<string>(),
      workerSecret: "worker-secret",
    });
    arrangeClaims([claimRow(1), claimRow(2)]);

    await expect(runTransactionalEmailWorker()).resolves.toEqual({
      claimed: 2,
      sent: 0,
      skipped: 2,
      retryableFailures: 0,
      permanentFailures: 0,
    });

    expect(completionCalls()).toHaveLength(2);
    expect(completionFor(1)).toMatchObject({
      p_outcome: "skipped",
      p_error_code: "MODE_DISABLED",
      p_provider_message_id: null,
    });
    expect(mocks.checkEligibility).not.toHaveBeenCalled();
    expect(mocks.clerkClient).not.toHaveBeenCalled();
    expect(mocks.renderEmail).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("checks an allowlist before eligibility, Clerk, and Resend", async () => {
    mocks.loadConfig.mockReturnValue({
      ...enabledConfig(),
      mode: "allowlist",
      allowedClerkUserIds: new Set(["user_2"]),
    });
    arrangeClaims([claimRow(1), claimRow(2)]);

    await expect(runTransactionalEmailWorker()).resolves.toEqual({
      claimed: 2,
      sent: 1,
      skipped: 1,
      retryableFailures: 0,
      permanentFailures: 0,
    });

    expect(completionFor(1)).toMatchObject({
      p_outcome: "skipped",
      p_error_code: "RECIPIENT_NOT_ALLOWLISTED",
    });
    expect(mocks.checkEligibility).toHaveBeenCalledTimes(1);
    expect(mocks.checkEligibility.mock.calls[0][0].recipientClerkUserId).toBe(
      "user_2"
    );
    expect(mocks.getUser).toHaveBeenCalledTimes(1);
    expect(mocks.getUser).toHaveBeenCalledWith("user_2");
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
  });

  it("skips obsolete events before constructing Clerk or Resend clients", async () => {
    mocks.checkEligibility.mockResolvedValue({
      eligible: false,
      disposition: "skipped",
      code: "REGISTRATION_OBSOLETE",
    });

    await expect(runTransactionalEmailWorker()).resolves.toEqual({
      claimed: 1,
      sent: 0,
      skipped: 1,
      retryableFailures: 0,
      permanentFailures: 0,
    });

    expect(completionFor(1)).toMatchObject({
      p_outcome: "skipped",
      p_error_code: "REGISTRATION_OBSOLETE",
    });
    expect(mocks.clerkClient).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("resolves a verified primary Clerk email, renders, sends, and completes safely", async () => {
    const rawEmail = "private-recipient@example.test";
    mocks.getUser.mockResolvedValue(verifiedUser(rawEmail));

    const result = await runTransactionalEmailWorker();

    expect(result).toEqual({
      claimed: 1,
      sent: 1,
      skipped: 0,
      retryableFailures: 0,
      permanentFailures: 0,
    });
    expect(mocks.clerkClient).toHaveBeenCalledTimes(1);
    expect(mocks.getUser).toHaveBeenCalledTimes(1);
    expect(mocks.getUser).toHaveBeenCalledWith("user_1");
    expect(mocks.createIdempotencyKey).toHaveBeenCalledWith({
      notificationId: claimRow().notification_id,
      recipientClerkUserId: "user_1",
      eventKey: "registration:event-1:approved",
      templateKey: "registration_approved",
    });
    expect(mocks.sendEmail).toHaveBeenCalledWith({
      apiKey: "provider-key",
      recipient: rawEmail,
      subject: "Registration approved",
      html: "<p>Approved</p>",
      text: "Approved",
      from: "IronClad <sender@example.test>",
      replyTo: "operations@example.test",
      idempotencyKey: "ic_txn_v1_digest",
    });
    expect(completionFor(1)).toEqual({
      p_notification_id: claimRow().notification_id,
      p_claim_token: claimRow().email_claim_token,
      p_outcome: "sent",
      p_error_code: null,
      p_provider_message_id: "provider-message-id",
    });
    expect(JSON.stringify(completionCalls())).not.toContain(rawEmail);
  });

  it.each([
    [
      "a missing primary email ID",
      { primaryEmailAddressId: null, emailAddresses: [] },
      "CLERK_PRIMARY_EMAIL_MISSING",
    ],
    [
      "a missing primary email object",
      { primaryEmailAddressId: "missing", emailAddresses: [] },
      "CLERK_PRIMARY_EMAIL_MISSING",
    ],
    [
      "an unverified primary email",
      {
        primaryEmailAddressId: "email_primary",
        emailAddresses: [
          {
            id: "email_primary",
            emailAddress: "recipient@example.test",
            verification: { status: "unverified" },
          },
        ],
      },
      "CLERK_PRIMARY_EMAIL_UNVERIFIED",
    ],
  ])("permanently fails %s without calling Resend", async (_, user, code) => {
    mocks.getUser.mockResolvedValue(user);

    await expect(runTransactionalEmailWorker()).resolves.toEqual({
      claimed: 1,
      sent: 0,
      skipped: 0,
      retryableFailures: 0,
      permanentFailures: 1,
    });

    expect(completionFor(1)).toMatchObject({
      p_outcome: "permanent_failure",
      p_error_code: code,
    });
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("classifies a deleted Clerk user as a permanent failure", async () => {
    mocks.getUser.mockRejectedValue({ status: 404, private: "do not expose" });

    await expect(runTransactionalEmailWorker()).resolves.toMatchObject({
      permanentFailures: 1,
    });

    expect(completionFor(1)).toMatchObject({
      p_outcome: "permanent_failure",
      p_error_code: "CLERK_USER_NOT_FOUND",
    });
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("classifies transient eligibility and Clerk failures as retryable", async () => {
    arrangeClaims([claimRow(1), claimRow(2)]);
    mocks.checkEligibility.mockImplementation(async (claim) => {
      if (claim.recipientClerkUserId === "user_1") {
        throw new Error("database context unavailable");
      }
      return eligibleResult();
    });
    mocks.getUser.mockRejectedValue({ status: 503 });

    await expect(runTransactionalEmailWorker()).resolves.toEqual({
      claimed: 2,
      sent: 0,
      skipped: 0,
      retryableFailures: 2,
      permanentFailures: 0,
    });

    expect(completionFor(1)).toMatchObject({
      p_outcome: "retryable_failure",
      p_error_code: "ELIGIBILITY_LOOKUP_FAILED",
    });
    expect(completionFor(2)).toMatchObject({
      p_outcome: "retryable_failure",
      p_error_code: "CLERK_LOOKUP_FAILED",
    });
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("treats template failures as permanent and adapter throws as retryable", async () => {
    arrangeClaims([claimRow(1), claimRow(2)]);
    mocks.renderEmail
      .mockImplementationOnce(() => {
        throw new Error("private invalid input");
      })
      .mockReturnValueOnce({
        subject: "Registration approved",
        html: "<p>Approved</p>",
        text: "Approved",
        from: "IronClad <sender@example.test>",
        replyTo: "operations@example.test",
      });
    mocks.sendEmail.mockRejectedValue(new Error("private network detail"));

    await expect(runTransactionalEmailWorker()).resolves.toEqual({
      claimed: 2,
      sent: 0,
      skipped: 0,
      retryableFailures: 1,
      permanentFailures: 1,
    });

    expect(completionFor(1)).toMatchObject({
      p_outcome: "permanent_failure",
      p_error_code: "TEMPLATE_RENDER_FAILED",
    });
    expect(completionFor(2)).toMatchObject({
      p_outcome: "retryable_failure",
      p_error_code: "RESEND_ADAPTER_FAILED",
    });
  });

  it("passes provider classifications through and counts a fifth retry as permanent", async () => {
    arrangeClaims([
      claimRow(1),
      claimRow(2),
      claimRow(3, { email_attempt_count: 5 }),
    ]);
    mocks.sendEmail
      .mockResolvedValueOnce({
        status: "retryable_failure",
        errorCode: "RESEND_RATE_LIMITED",
      })
      .mockResolvedValueOnce({
        status: "permanent_failure",
        errorCode: "RESEND_REQUEST_REJECTED",
      })
      .mockResolvedValueOnce({
        status: "retryable_failure",
        errorCode: "RESEND_NETWORK_TIMEOUT",
      });

    await expect(runTransactionalEmailWorker()).resolves.toEqual({
      claimed: 3,
      sent: 0,
      skipped: 0,
      retryableFailures: 1,
      permanentFailures: 2,
    });

    expect(completionFor(1)).toMatchObject({
      p_outcome: "retryable_failure",
      p_error_code: "RESEND_RATE_LIMITED",
    });
    expect(completionFor(2)).toMatchObject({
      p_outcome: "permanent_failure",
      p_error_code: "RESEND_REQUEST_REJECTED",
    });
    expect(completionFor(3)).toMatchObject({
      p_outcome: "retryable_failure",
      p_error_code: "RESEND_NETWORK_TIMEOUT",
    });
  });

  it("bounds concurrent claim processing at three", async () => {
    arrangeClaims(Array.from({ length: 8 }, (_, index) => claimRow(index + 1)));
    let active = 0;
    let maximumActive = 0;
    const releases: Array<() => void> = [];

    mocks.checkEligibility.mockImplementation(
      () =>
        new Promise((resolve) => {
          active += 1;
          maximumActive = Math.max(maximumActive, active);
          releases.push(() => {
            active -= 1;
            resolve(eligibleResult());
          });
        })
    );

    const run = runTransactionalEmailWorker();
    await vi.waitFor(() => expect(releases).toHaveLength(3));
    releases.splice(0, 3).forEach((release) => release());
    await vi.waitFor(() => expect(releases).toHaveLength(3));
    releases.splice(0, 3).forEach((release) => release());
    await vi.waitFor(() => expect(releases).toHaveLength(2));
    releases.splice(0, 2).forEach((release) => release());

    await expect(run).resolves.toMatchObject({ claimed: 8, sent: 8 });
    expect(maximumActive).toBe(3);
    expect(mocks.clerkClient).toHaveBeenCalledTimes(1);
  });

  it("fails the run when completion compare-and-set does not succeed", async () => {
    const rawEmail = "private-recipient@example.test";
    mocks.getUser.mockResolvedValue(verifiedUser(rawEmail));
    mocks.rpc.mockImplementation(async (functionName: string) => {
      if (functionName === "claim_transactional_email_notifications") {
        return { data: [claimRow()], error: null };
      }
      return { data: false, error: null };
    });

    const failure = runTransactionalEmailWorker();

    await expect(failure).rejects.toBeInstanceOf(TransactionalEmailWorkerError);
    await expect(failure).rejects.toMatchObject({
      code: "EMAIL_COMPLETION_FAILED",
      message: "Transactional email worker database operation failed.",
    });
  });

  it("fails safely on claim errors or malformed private claim rows", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "private database detail" },
    });

    await expect(runTransactionalEmailWorker()).rejects.toMatchObject({
      code: "EMAIL_CLAIM_FAILED",
      message: "Transactional email worker database operation failed.",
    });

    arrangeClaims([
      claimRow(1, { email_template_key: "not_an_approved_template" }),
    ]);

    await expect(runTransactionalEmailWorker()).rejects.toMatchObject({
      code: "EMAIL_CLAIM_FAILED",
      message: "Transactional email worker database operation failed.",
    });
    expect(mocks.clerkClient).not.toHaveBeenCalled();
  });

  it("does not log recipient, event, provider, or message details", async () => {
    const consoleSpies = [
      vi.spyOn(console, "debug").mockImplementation(() => undefined),
      vi.spyOn(console, "error").mockImplementation(() => undefined),
      vi.spyOn(console, "info").mockImplementation(() => undefined),
      vi.spyOn(console, "log").mockImplementation(() => undefined),
      vi.spyOn(console, "warn").mockImplementation(() => undefined),
    ];

    await runTransactionalEmailWorker();

    for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled();
  });
});
