import { beforeEach, describe, expect, it, vi } from "vitest";

const createSupabaseAdminClientMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase-admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock,
}));

import { createInAppNotification } from "@/lib/notifications";

describe("canonical notification event idempotency", () => {
  beforeEach(() => {
    createSupabaseAdminClientMock.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("treats a repeated deterministic recipient event as successful", async () => {
    const insert = vi.fn(async () => ({
      error: { code: "23505", message: "private duplicate detail" },
    }));
    const from = vi.fn(() => ({ insert }));
    createSupabaseAdminClientMock.mockReturnValue({ from });

    await expect(
      createInAppNotification({
        recipientClerkUserId: "user-player",
        recipientRole: "player",
        type: "tournament.cancelled",
        title: "Tournament Cancelled",
        message: "The tournament was cancelled.",
        eventKey: " tournament:tournament-1:registration:one:cancelled ",
      })
    ).resolves.toBe(true);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        event_key: "tournament:tournament-1:registration:one:cancelled",
      })
    );
    expect(console.error).not.toHaveBeenCalled();
  });

  it("fails closed with sanitized logging for other insert errors", async () => {
    const privateMessage = "private database detail";
    const insert = vi.fn(async () => ({
      error: { code: "42501", message: privateMessage },
    }));
    createSupabaseAdminClientMock.mockReturnValue({
      from: vi.fn(() => ({ insert })),
    });

    await expect(
      createInAppNotification({
        recipientClerkUserId: "user-player",
        recipientRole: "player",
        type: "tournament.voided",
        title: "Tournament Voided",
        message: "The tournament was voided.",
        eventKey: "tournament:tournament-1:registration:one:voided",
      })
    ).resolves.toBe(false);
    expect(console.error).toHaveBeenCalledWith(
      "Notification operation failed.",
      { operation: "create-one", code: "42501" }
    );
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
      privateMessage
    );
  });
});
