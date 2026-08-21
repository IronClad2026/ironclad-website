import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  clerkClient: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  deleteError: null as unknown,
  getUser: vi.fn(),
  getUserList: vi.fn(),
  loadConfig: vi.fn(),
  loadDictionary: vi.fn(),
  loadUnreadCount: vi.fn(),
  localizeCopy: vi.fn(),
  notificationStateError: null as unknown,
  notificationStateRows: [] as unknown[],
  rpc: vi.fn(),
  sendNotification: vi.fn(),
  subscriptionError: null as unknown,
  subscriptionRows: [] as unknown[],
  queryCalls: [] as Array<[string, string, unknown]>,
}));

vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: mocks.clerkClient,
}));

vi.mock("@/lib/supabase-admin", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}));

vi.mock("@/lib/web-push/config", () => ({
  loadWebPushConfig: mocks.loadConfig,
}));

vi.mock("@/lib/notifications", () => ({
  loadUnreadNotificationCount: mocks.loadUnreadCount,
}));

vi.mock("@/lib/i18n/loaders", () => ({
  loadDictionary: mocks.loadDictionary,
}));

vi.mock("@/lib/i18n/notification-copy", () => ({
  localizePlayerNotificationCopy: mocks.localizeCopy,
}));

vi.mock("web-push", () => ({
  default: { sendNotification: mocks.sendNotification },
}));

import { runWebPushWorker } from "@/lib/web-push/worker";

const NOTIFICATION_ID = "00000000-0000-4000-8000-000000000001";
const CLAIM_TOKEN = "10000000-0000-4000-8000-000000000001";
const SUBSCRIPTION_ID = "20000000-0000-4000-8000-000000000001";
const PUBLIC_KEY = Buffer.concat([
  Buffer.from([0x04]),
  Buffer.alloc(64, 0x11),
]).toString("base64url");
const PRIVATE_KEY = Buffer.alloc(32, 0x22).toString("base64url");
const P256DH = Buffer.concat([
  Buffer.from([0x04]),
  Buffer.alloc(64, 0x33),
]).toString("base64url");
const AUTH = Buffer.alloc(16, 0x44).toString("base64url");

function claimRow(overrides: Record<string, unknown> = {}) {
  return {
    notification_id: NOTIFICATION_ID,
    recipient_clerk_user_id: "user_player",
    recipient_role: "player",
    notification_type: "match.confirmation_required",
    event_key: "match:m:report-group:g:confirmation-required",
    tournament_id: null,
    registration_id: null,
    match_id: null,
    report_group_id: null,
    metadata: {},
    push_enqueued_at: "2026-08-21T01:00:00.000Z",
    push_attempt_count: 1,
    push_claim_token: CLAIM_TOKEN,
    ...overrides,
  };
}

function subscriptionRow(index = 1) {
  return {
    id:
      index === 1
        ? SUBSCRIPTION_ID
        : `20000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    owner_clerk_user_id: "user_player",
    endpoint: `https://fcm.googleapis.com/fcm/send/device-${index}`,
    p256dh: P256DH,
    auth: AUTH,
  };
}

class QueryMock implements PromiseLike<{
  data: unknown;
  error: unknown;
}> {
  private mode: "select" | "delete" = "select";

  constructor(private readonly table: string) {}

  select() {
    this.mode = "select";
    return this;
  }

  delete() {
    this.mode = "delete";
    return this;
  }

  eq(column: string, value: unknown) {
    mocks.queryCalls.push([this.table, `eq:${column}`, value]);
    return this;
  }

  in(column: string, value: unknown) {
    mocks.queryCalls.push([this.table, `in:${column}`, value]);
    return this;
  }

  lte(column: string, value: unknown) {
    mocks.queryCalls.push([this.table, `lte:${column}`, value]);
    return this;
  }

  limit(value: number) {
    mocks.queryCalls.push([this.table, "limit", value]);
    return this;
  }

  then<TResult1 = { data: unknown; error: unknown }, TResult2 = never>(
    onfulfilled?:
      | ((value: { data: unknown; error: unknown }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    const result =
      this.mode === "delete"
        ? { data: null, error: mocks.deleteError }
        : this.table === "notifications"
          ? {
              data: mocks.notificationStateRows,
              error: mocks.notificationStateError,
            }
          : {
              data: mocks.subscriptionRows,
              error: mocks.subscriptionError,
            };
    return Promise.resolve(result).then(onfulfilled, onrejected);
  }
}

function completionCalls() {
  return mocks.rpc.mock.calls.filter(
    ([name]) => name === "complete_web_push_notification"
  );
}

describe("Web Push worker", () => {
  beforeEach(() => {
    mocks.loadConfig.mockReturnValue({
      mode: "enabled",
      publicKey: PUBLIC_KEY,
      privateKey: PRIVATE_KEY,
      subject: "mailto:operations@example.test",
    });
    mocks.rpc.mockImplementation(async (name: string) =>
      name === "claim_web_push_notifications"
        ? { data: [claimRow()], error: null }
        : { data: true, error: null }
    );
    mocks.createSupabaseAdminClient.mockReturnValue({
      rpc: mocks.rpc,
      from: (table: string) => new QueryMock(table),
    });
    mocks.notificationStateRows = [
      {
        id: NOTIFICATION_ID,
        read_at: null,
        in_app_hidden_at: null,
        push_delivery_status: "processing",
        push_claim_token: CLAIM_TOKEN,
      },
    ];
    mocks.subscriptionRows = [subscriptionRow()];
    mocks.notificationStateError = null;
    mocks.subscriptionError = null;
    mocks.deleteError = null;
    mocks.queryCalls.length = 0;
    mocks.loadUnreadCount.mockResolvedValue(2);
    mocks.loadDictionary.mockResolvedValue({ fixture: true });
    mocks.localizeCopy.mockReturnValue({
      title: "Match result needs confirmation",
      message: "A Match result is ready for your review.",
    });
    mocks.getUser.mockResolvedValue({
      id: "user_player",
      banned: false,
      locked: false,
      publicMetadata: { role: "player" },
      privateMetadata: { ironcladLocale: "fr" },
    });
    mocks.getUserList.mockResolvedValue({ data: [], totalCount: 0 });
    mocks.clerkClient.mockResolvedValue({
      users: {
        getUser: mocks.getUser,
        getUserList: mocks.getUserList,
      },
    });
    mocks.sendNotification.mockResolvedValue({ statusCode: 201 });
  });

  it("does not claim or construct delivery clients when VAPID is disabled", async () => {
    mocks.loadConfig.mockReturnValue({ mode: "disabled" });

    await expect(runWebPushWorker()).resolves.toEqual({
      enabled: false,
      claimed: 0,
      sent: 0,
      skipped: 0,
      retryableFailures: 0,
      permanentFailures: 0,
    });
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled();
    expect(mocks.sendNotification).not.toHaveBeenCalled();
  });

  it("delivers all current-device subscriptions with conservative localized payload and cutoff", async () => {
    mocks.subscriptionRows = [subscriptionRow(1), subscriptionRow(2)];

    const result = await runWebPushWorker();

    expect(result).toMatchObject({ enabled: true, claimed: 1, sent: 1 });
    expect(mocks.sendNotification).toHaveBeenCalledTimes(2);
    const payload = JSON.parse(mocks.sendNotification.mock.calls[0][1]);
    expect(payload).toEqual({
      version: 1,
      notificationId: NOTIFICATION_ID,
      scope: "player",
      type: "match.confirmation_required",
      title: "Match result needs confirmation",
      body: "A Match result is ready for your review.",
      unreadCount: 2,
    });
    expect(JSON.stringify(payload)).not.toMatch(/user_player|clerk|endpoint/i);
    expect(mocks.queryCalls).toContainEqual([
      "push_subscriptions",
      "lte:created_at",
      "2026-08-21T01:00:00.000Z",
    ]);
    expect(completionCalls().at(-1)?.[1]).toMatchObject({
      p_outcome: "sent",
      p_error_code: null,
    });
  });

  it("skips cleanly when no subscription existed by the notification cutover snapshot", async () => {
    mocks.subscriptionRows = [];

    await expect(runWebPushWorker()).resolves.toMatchObject({
      skipped: 1,
      sent: 0,
    });
    expect(mocks.sendNotification).not.toHaveBeenCalled();
    expect(completionCalls().at(-1)?.[1]).toMatchObject({
      p_outcome: "skipped",
      p_error_code: "NO_ELIGIBLE_SUBSCRIPTION",
    });
  });

  it.each([404, 410])(
    "removes a permanently expired %s endpoint without logging provider details",
    async (statusCode) => {
    mocks.sendNotification.mockRejectedValue({
      statusCode,
      body: "https://fcm.googleapis.com/private-token",
    });

    await expect(runWebPushWorker()).resolves.toMatchObject({
      permanentFailures: 1,
    });
    expect(mocks.queryCalls).toContainEqual([
      "push_subscriptions",
      "eq:id",
      SUBSCRIPTION_ID,
    ]);
    expect(completionCalls().at(-1)?.[1]).toMatchObject({
      p_outcome: "permanent_failure",
      p_error_code: "NO_VALID_SUBSCRIPTION",
    });
    }
  );

  it("retries bounded provider and database recheck failures", async () => {
    mocks.sendNotification.mockRejectedValueOnce(new Error("network"));
    await expect(runWebPushWorker()).resolves.toMatchObject({
      retryableFailures: 1,
    });
    expect(completionCalls().at(-1)?.[1]).toMatchObject({
      p_outcome: "retryable_failure",
      p_error_code: "PUSH_PROVIDER_TRANSIENT",
    });

    vi.clearAllMocks();
    // Re-establish the functions cleared above without changing the intended
    // unavailable notification-state query.
    mocks.loadConfig.mockReturnValue({
      mode: "enabled",
      publicKey: PUBLIC_KEY,
      privateKey: PRIVATE_KEY,
      subject: "mailto:operations@example.test",
    });
    mocks.rpc.mockImplementation(async (name: string) =>
      name === "claim_web_push_notifications"
        ? { data: [claimRow()], error: null }
        : { data: true, error: null }
    );
    mocks.createSupabaseAdminClient.mockReturnValue({
      rpc: mocks.rpc,
      from: (table: string) => new QueryMock(table),
    });
    mocks.notificationStateError = { code: "TEMPORARY" };

    await expect(runWebPushWorker()).resolves.toMatchObject({
      retryableFailures: 1,
    });
    expect(completionCalls().at(-1)?.[1]).toMatchObject({
      p_error_code: "NOTIFICATION_RECHECK_FAILED",
    });
  });

  it.each([401, 403])(
    "retries a fixable provider authorization response %s",
    async (statusCode) => {
      mocks.sendNotification.mockRejectedValue({ statusCode });

      await expect(runWebPushWorker()).resolves.toMatchObject({
        retryableFailures: 1,
      });
      expect(completionCalls().at(-1)?.[1]).toMatchObject({
        p_outcome: "retryable_failure",
        p_error_code: "PUSH_PROVIDER_TRANSIENT",
      });
    }
  );

  it("resolves only current active Clerk public-metadata Admins at delivery", async () => {
    mocks.rpc.mockImplementation(async (name: string) =>
      name === "claim_web_push_notifications"
        ? {
            data: [
              claimRow({
                recipient_clerk_user_id: null,
                recipient_role: "admin",
                notification_type: "match.dispute_opened",
                event_key: "match:m:dispute:g:opened",
              }),
            ],
            error: null,
          }
        : { data: true, error: null }
    );
    mocks.getUserList.mockResolvedValue({
      data: [
        {
          id: "admin_current",
          banned: false,
          locked: false,
          publicMetadata: { role: "admin" },
        },
        {
          id: "admin_removed",
          banned: false,
          locked: false,
          publicMetadata: { role: "player" },
        },
        {
          id: "admin_locked",
          banned: false,
          locked: true,
          publicMetadata: { role: "admin" },
        },
      ],
      totalCount: 3,
    });
    mocks.subscriptionRows = [
      { ...subscriptionRow(), owner_clerk_user_id: "admin_current" },
    ];

    await expect(runWebPushWorker()).resolves.toMatchObject({ sent: 1 });
    expect(mocks.queryCalls).toContainEqual([
      "push_subscriptions",
      "eq:owner_clerk_user_id",
      "admin_current",
    ]);
    expect(mocks.getUser).not.toHaveBeenCalled();
    const payload = JSON.parse(mocks.sendNotification.mock.calls[0][1]);
    expect(payload.scope).toBe("admin");
    expect(payload.body).toBe("A new Match dispute needs Admin attention.");
  });

  it("uses global Admin badge truth for a dual-role account's Player Push", async () => {
    mocks.getUser.mockResolvedValue({
      id: "user_player",
      banned: false,
      locked: false,
      publicMetadata: { role: "admin" },
      privateMetadata: {},
    });
    mocks.loadUnreadCount.mockResolvedValue(0);

    await expect(runWebPushWorker()).resolves.toMatchObject({
      sent: 1,
      skipped: 0,
    });

    expect(mocks.loadUnreadCount).toHaveBeenCalledWith({
      scope: "admin",
      clerkUserId: null,
    });
    const payload = JSON.parse(mocks.sendNotification.mock.calls[0][1]);
    expect(payload.scope).toBe("player");
    expect(payload.unreadCount).toBe(0);
    expect(completionCalls().at(-1)?.[1]).toMatchObject({
      p_outcome: "sent",
      p_error_code: null,
    });
  });

  it("still skips a zero unread snapshot when badge and claim scopes match", async () => {
    mocks.loadUnreadCount.mockResolvedValue(0);

    await expect(runWebPushWorker()).resolves.toMatchObject({
      sent: 0,
      skipped: 1,
    });
    expect(mocks.sendNotification).not.toHaveBeenCalled();
    expect(completionCalls().at(-1)?.[1]).toMatchObject({
      p_outcome: "skipped",
      p_error_code: "NO_LONGER_UNREAD",
    });
  });

  it("never allows an in-site-only Admin type through defense-in-depth policy", async () => {
    mocks.rpc.mockImplementation(async (name: string) =>
      name === "claim_web_push_notifications"
        ? {
            data: [
              claimRow({
                recipient_clerk_user_id: null,
                recipient_role: "admin",
                notification_type: "registration.submitted",
                event_key: "registration:r:submitted",
              }),
            ],
            error: null,
          }
        : { data: true, error: null }
    );

    await expect(runWebPushWorker()).resolves.toMatchObject({
      permanentFailures: 1,
    });
    expect(mocks.sendNotification).not.toHaveBeenCalled();
    expect(completionCalls().at(-1)?.[1]).toMatchObject({
      p_error_code: "POLICY_MISMATCH",
    });
  });
});
