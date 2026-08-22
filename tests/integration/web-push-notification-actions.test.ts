import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const createSupabaseAdminClientMock = vi.hoisted(() => vi.fn());
const loadUnreadNotificationCountMock = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("@/lib/supabase-admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock,
}));
vi.mock("@/lib/notifications", () => ({
  deleteNotifications: vi.fn(),
  loadUnreadNotificationCount: loadUnreadNotificationCountMock,
  markAllNotificationsRead: vi.fn(),
  markNotificationRead: vi.fn(),
  markNotificationsRead: vi.fn(),
}));

import {
  checkWebPushSubscriptionOwnership,
  deleteWebPushSubscription,
  getNotificationPushConfiguration,
  loadAuthoritativeNotificationUnreadCount,
  saveWebPushSubscription,
} from "@/app/notifications/actions";

const PLAYER_ID = "user_push_player";
const ADMIN_ID = "user_push_admin";
const SUBSCRIPTION_ID = "11111111-1111-4111-8111-111111111111";
const ENDPOINT = "https://fcm.googleapis.com/fcm/send/private-capability";
const P256DH = Buffer.concat([
  Buffer.from([0x04]),
  Buffer.alloc(64, 0x01),
]).toString("base64url");
const AUTH = Buffer.alloc(16, 0x02).toString("base64url");
const PRIVATE_KEY = Buffer.alloc(32, 0x03).toString("base64url");

function createRpcClient(
  result: { data: unknown; error: unknown } = {
    data: SUBSCRIPTION_ID,
    error: null,
  }
) {
  const rpc = vi.fn(async () => result);
  return { client: { rpc }, rpc };
}

describe("Web Push notification Server Actions", () => {
  beforeEach(() => {
    authMock.mockResolvedValue({
      userId: PLAYER_ID,
      sessionClaims: { metadata: { role: "player" } },
    });
    loadUnreadNotificationCountMock.mockResolvedValue(4);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("does not re-export an imported type from the use-server action module", () => {
    const source = readFileSync(
      resolve(process.cwd(), "app/notifications/actions.ts"),
      "utf8"
    );

    expect(source).not.toMatch(
      /export\s+type\s*\{[^}]*WebPushSubscriptionInput[^}]*\}/
    );
  });

  it("returns only the validated public VAPID key to an authenticated caller", async () => {
    vi.stubEnv("WEB_PUSH_VAPID_PUBLIC_KEY", P256DH);
    vi.stubEnv("WEB_PUSH_VAPID_PRIVATE_KEY", PRIVATE_KEY);
    vi.stubEnv("WEB_PUSH_VAPID_SUBJECT", "mailto:operations@example.test");

    await expect(getNotificationPushConfiguration()).resolves.toEqual({
      ok: true,
      vapidPublicKey: P256DH,
    });
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it("fails closed for a missing or malformed public VAPID key", async () => {
    vi.stubEnv("WEB_PUSH_VAPID_PUBLIC_KEY", "malformed");

    await expect(getNotificationPushConfiguration()).resolves.toEqual({
      ok: false,
      code: "unavailable",
    });
  });

  it("does not expose Push configuration before authentication", async () => {
    authMock.mockResolvedValue({ userId: null, sessionClaims: null });
    vi.stubEnv("WEB_PUSH_VAPID_PUBLIC_KEY", P256DH);

    await expect(getNotificationPushConfiguration()).resolves.toEqual({
      ok: false,
      code: "authentication_required",
    });
  });

  it("saves a validated subscription under only the current Clerk account", async () => {
    const database = createRpcClient();
    const expirationTime = Date.now() + 60_000;
    createSupabaseAdminClientMock.mockReturnValue(database.client);

    await expect(
      saveWebPushSubscription({
        endpoint: ENDPOINT,
        expirationTime,
        keys: { p256dh: P256DH, auth: AUTH },
        clerkUserId: "forged-user",
      } as Parameters<typeof saveWebPushSubscription>[0] & {
        clerkUserId: string;
      })
    ).resolves.toEqual({ ok: true });

    expect(database.rpc).toHaveBeenCalledOnce();
    expect(database.rpc).toHaveBeenCalledWith(
      "upsert_web_push_subscription",
      {
        p_clerk_user_id: PLAYER_ID,
        p_endpoint: ENDPOINT,
        p_p256dh: P256DH,
        p_auth: AUTH,
        p_expires_at: new Date(expirationTime).toISOString(),
      }
    );
  });

  it("rejects an invalid subscription before service-role access", async () => {
    await expect(
      saveWebPushSubscription({
        endpoint: "https://example.test/push",
        expirationTime: null,
        keys: { p256dh: P256DH, auth: AUTH },
      })
    ).resolves.toEqual({ ok: false, code: "invalid_subscription" });

    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it("fails closed on a database error or malformed RPC result", async () => {
    const database = createRpcClient({ data: [SUBSCRIPTION_ID], error: null });
    createSupabaseAdminClientMock.mockReturnValue(database.client);

    await expect(
      saveWebPushSubscription({
        endpoint: ENDPOINT,
        expirationTime: null,
        keys: { p256dh: P256DH, auth: AUTH },
      })
    ).resolves.toEqual({ ok: false, code: "unavailable" });
  });

  it("deletes only the current account's validated endpoint", async () => {
    const database = createRpcClient({ data: true, error: null });
    createSupabaseAdminClientMock.mockReturnValue(database.client);

    await expect(deleteWebPushSubscription(ENDPOINT)).resolves.toEqual({
      ok: true,
    });
    expect(database.rpc).toHaveBeenCalledWith(
      "delete_web_push_subscription",
      {
        p_clerk_user_id: PLAYER_ID,
        p_endpoint: ENDPOINT,
      }
    );
  });

  it("rejects an invalid deletion endpoint before service-role access", async () => {
    await expect(
      deleteWebPushSubscription("https://example.test/private-capability")
    ).resolves.toEqual({ ok: false, code: "invalid_subscription" });

    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it("treats an already-absent owned endpoint as an idempotent deletion", async () => {
    const database = createRpcClient({ data: false, error: null });
    createSupabaseAdminClientMock.mockReturnValue(database.client);

    await expect(deleteWebPushSubscription(ENDPOINT)).resolves.toEqual({
      ok: true,
    });
  });

  it.each([
    { rows: [{ id: SUBSCRIPTION_ID }], owned: true },
    { rows: [], owned: false },
  ])("checks only current-account endpoint ownership", async ({ rows, owned }) => {
    const limit = vi.fn(async () => ({ data: rows, error: null }));
    const secondEq = vi.fn(() => ({ limit }));
    const firstEq = vi.fn(() => ({ eq: secondEq }));
    const select = vi.fn(() => ({ eq: firstEq }));
    createSupabaseAdminClientMock.mockReturnValue({
      from: vi.fn(() => ({ select })),
    });

    await expect(
      checkWebPushSubscriptionOwnership(ENDPOINT)
    ).resolves.toEqual({ ok: true, owned });
    expect(firstEq).toHaveBeenCalledWith("endpoint", ENDPOINT);
    expect(secondEq).toHaveBeenCalledWith("owner_clerk_user_id", PLAYER_ID);
  });

  it("does not report successful deletion when the trusted RPC fails", async () => {
    const database = createRpcClient({
      data: false,
      error: { code: "PGRST001", message: "private detail" },
    });
    createSupabaseAdminClientMock.mockReturnValue(database.client);

    await expect(deleteWebPushSubscription(ENDPOINT)).resolves.toEqual({
      ok: false,
      code: "unavailable",
    });
  });

  it("rejects unauthenticated subscription mutations before service-role access", async () => {
    authMock.mockResolvedValue({ userId: null, sessionClaims: null });

    await expect(
      saveWebPushSubscription({
        endpoint: ENDPOINT,
        expirationTime: null,
        keys: { p256dh: P256DH, auth: AUTH },
      })
    ).resolves.toEqual({ ok: false, code: "authentication_required" });
    await expect(deleteWebPushSubscription(ENDPOINT)).resolves.toEqual({
      ok: false,
      code: "authentication_required",
    });
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it("loads the current Player's authoritative unread count without an input scope", async () => {
    await expect(loadAuthoritativeNotificationUnreadCount()).resolves.toEqual({
      ok: true,
      unreadCount: 4,
    });
    expect(loadUnreadNotificationCountMock).toHaveBeenCalledWith({
      scope: "player",
      clerkUserId: PLAYER_ID,
    });
  });

  it("infers the global Admin unread scope only from current Clerk claims", async () => {
    authMock.mockResolvedValue({
      userId: ADMIN_ID,
      sessionClaims: { metadata: { role: "admin" } },
    });
    loadUnreadNotificationCountMock.mockResolvedValue(9);

    await expect(loadAuthoritativeNotificationUnreadCount()).resolves.toEqual({
      ok: true,
      unreadCount: 9,
    });
    expect(loadUnreadNotificationCountMock).toHaveBeenCalledWith({
      scope: "admin",
      clerkUserId: null,
    });
  });

  it("does not invent a badge count after a trusted count failure", async () => {
    loadUnreadNotificationCountMock.mockResolvedValue(null);

    await expect(loadAuthoritativeNotificationUnreadCount()).resolves.toEqual({
      ok: false,
      code: "unavailable",
    });
  });

  it("does not load an authoritative count before authentication", async () => {
    authMock.mockResolvedValue({ userId: null, sessionClaims: null });

    await expect(loadAuthoritativeNotificationUnreadCount()).resolves.toEqual({
      ok: false,
      code: "authentication_required",
    });
    expect(loadUnreadNotificationCountMock).not.toHaveBeenCalled();
  });
});
