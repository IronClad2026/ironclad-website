import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseQueryMock } from "@/tests/helpers/supabase-query-mock";

const createSupabaseAdminClientMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase-admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock,
}));

import {
  getEloVerificationSetting,
  updateEloVerificationSetting,
} from "@/lib/platform-settings";

describe("platform settings server client", () => {
  beforeEach(() => {
    createSupabaseAdminClientMock.mockReset();
  });

  it("reads settings only through the server-side service-role client", async () => {
    const supabase = createSupabaseQueryMock({
      data: {
        key: "elo_verification",
        value: { enabled: true },
        updated_at: "2026-07-01T00:00:00.000Z",
        updated_by_clerk_user_id: "synthetic-admin-actor",
      },
    });
    createSupabaseAdminClientMock.mockReturnValue(supabase.client);

    await expect(getEloVerificationSetting()).resolves.toEqual({
      enabled: true,
      updatedAt: "2026-07-01T00:00:00.000Z",
      updatedByClerkUserId: "synthetic-admin-actor",
      error: null,
    });
    expect(createSupabaseAdminClientMock).toHaveBeenCalledOnce();
    expect(supabase.from).toHaveBeenCalledWith("platform_settings");
    expect(
      supabase.calls.find((call) => call.method === "select")?.args[0]
    ).toBe("key, value, updated_at, updated_by_clerk_user_id");
    expect(supabase.calls).toContainEqual({
      method: "eq",
      args: ["key", "elo_verification"],
    });
  });

  it("writes settings through the service-role client used by the authorized action", async () => {
    const result = {
      data: {
        key: "elo_verification",
        value: { enabled: false },
        updated_at: "2026-07-02T00:00:00.000Z",
        updated_by_clerk_user_id: "synthetic-admin-actor",
      },
      error: null,
    };
    type Query = {
      select: (columns: string) => Query;
      single: () => Promise<typeof result>;
      upsert: (
        values: Record<string, unknown>,
        options: { onConflict: string }
      ) => Query;
    };
    const query = {} as Query;
    query.select = vi.fn(() => query);
    query.single = vi.fn(async () => result);
    query.upsert = vi.fn(() => query);
    const client = {
      from: vi.fn(() => query),
    };
    createSupabaseAdminClientMock.mockReturnValue(client);

    await expect(
      updateEloVerificationSetting({
        enabled: false,
        updatedByClerkUserId: "synthetic-admin-actor",
      })
    ).resolves.toEqual({
      enabled: false,
      updatedAt: "2026-07-02T00:00:00.000Z",
      updatedByClerkUserId: "synthetic-admin-actor",
      error: null,
    });
    expect(client.from).toHaveBeenCalledWith("platform_settings");
    expect(query.upsert).toHaveBeenCalledWith(
      {
        key: "elo_verification",
        value: { enabled: false },
        updated_by_clerk_user_id: "synthetic-admin-actor",
      },
      { onConflict: "key" }
    );
    expect(query.select).toHaveBeenCalledWith(
      "key, value, updated_at, updated_by_clerk_user_id"
    );
    expect(query.single).toHaveBeenCalledOnce();
  });
});
