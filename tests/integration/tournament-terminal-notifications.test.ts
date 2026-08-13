import { beforeEach, describe, expect, it, vi } from "vitest";

const createInAppNotificationMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/notifications", () => ({
  createInAppNotification: createInAppNotificationMock,
  createInAppNotifications: vi.fn(),
}));

import { notifyPlayersOfTournamentTerminalTransition } from "@/lib/notification-events";

function terminalNotificationClient({
  data = [],
  error = null,
}: {
  data?: unknown[];
  error?: { code?: string; message: string } | null;
} = {}) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const result = { data, error };
  type Query = PromiseLike<typeof result> & {
    select: (...args: unknown[]) => Query;
    eq: (...args: unknown[]) => Query;
    in: (...args: unknown[]) => Query;
  };
  const query = {} as Query;

  for (const method of ["select", "eq", "in"] as const) {
    query[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return query;
    };
  }
  query.then = (resolve, reject) =>
    Promise.resolve(result).then(resolve, reject);

  const from = vi.fn(() => query);
  return { calls, client: { from }, from };
}

describe("tournament terminal notifications", () => {
  beforeEach(() => {
    createInAppNotificationMock.mockReset();
    createInAppNotificationMock.mockResolvedValue(true);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("notifies only active or affected cancellation registrations with durable per-registration keys", async () => {
    const client = terminalNotificationClient({
      data: [
        registration({ id: "registration-pending", status: "pending" }),
        registration({
          id: "registration-waiting",
          clerkUserId: "user-waiting",
          status: "waitlisted",
          waitlistOfferStatus: null,
        }),
        registration({
          id: "registration-offered",
          clerkUserId: "user-offered",
          status: "waitlisted",
          waitlistOfferStatus: "offered",
        }),
        registration({
          id: "registration-declined",
          clerkUserId: "user-declined",
          status: "waitlisted",
          waitlistOfferStatus: "declined",
        }),
        registration({
          id: "registration-withdrawn",
          clerkUserId: "user-withdrawn",
          status: "withdrawn",
        }),
        registration({
          id: "registration-tombstone",
          clerkUserId: "deleted:player-id",
          status: "approved",
        }),
        registration({ id: "registration-pending", status: "pending" }),
      ],
    });

    await expect(
      notifyPlayersOfTournamentTerminalTransition(client.client as never, {
        tournamentId: "tournament-1",
        outcome: "cancelled",
      })
    ).resolves.toBe(true);

    expect(client.calls).toEqual(
      expect.arrayContaining([
        { method: "eq", args: ["tournament_id", "tournament-1"] },
        {
          method: "in",
          args: [
            "registration_status",
            ["pending", "manual_review", "approved", "waitlisted"],
          ],
        },
      ])
    );
    expect(createInAppNotificationMock).toHaveBeenCalledTimes(3);
    expect(createInAppNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientClerkUserId: "user-player",
        recipientRole: "player",
        type: "tournament.cancelled",
        tournamentId: "tournament-1",
        registrationId: "registration-pending",
        eventKey:
          "tournament:tournament-1:registration:registration-pending:cancelled",
      })
    );
    expect(JSON.stringify(createInAppNotificationMock.mock.calls)).not.toContain(
      "reason"
    );
    expect(JSON.stringify(createInAppNotificationMock.mock.calls)).not.toContain(
      "actor"
    );
  });

  it("notifies only the approved launched roster when a tournament is voided", async () => {
    const client = terminalNotificationClient({
      data: [
        registration({
          id: "registration-launched",
          bracket: { launched_at: "2026-08-13T04:00:00.000Z" },
        }),
        registration({
          id: "registration-draft",
          clerkUserId: "user-draft",
          bracket: { launched_at: null },
        }),
        registration({
          id: "registration-pending",
          clerkUserId: "user-pending",
          status: "pending",
          bracket: { launched_at: "2026-08-13T04:00:00.000Z" },
        }),
      ],
    });

    await expect(
      notifyPlayersOfTournamentTerminalTransition(client.client as never, {
        tournamentId: "tournament-2",
        outcome: "voided",
      })
    ).resolves.toBe(true);

    expect(createInAppNotificationMock).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        recipientClerkUserId: "user-player",
        type: "tournament.voided",
        registrationId: "registration-launched",
        eventKey:
          "tournament:tournament-2:registration:registration-launched:voided",
      })
    );
  });

  it("attempts every recipient and reports incomplete best-effort delivery", async () => {
    const client = terminalNotificationClient({
      data: [
        registration({ id: "registration-one" }),
        registration({
          id: "registration-two",
          clerkUserId: "user-two",
        }),
      ],
    });
    createInAppNotificationMock
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    await expect(
      notifyPlayersOfTournamentTerminalTransition(client.client as never, {
        tournamentId: "tournament-3",
        outcome: "cancelled",
      })
    ).resolves.toBe(false);
    expect(createInAppNotificationMock).toHaveBeenCalledTimes(2);
  });

  it("logs only a sanitized code when recipient discovery fails", async () => {
    const privateMessage = "private registration details";
    const client = terminalNotificationClient({
      error: { code: "42501", message: privateMessage },
    });

    await expect(
      notifyPlayersOfTournamentTerminalTransition(client.client as never, {
        tournamentId: "tournament-4",
        outcome: "cancelled",
      })
    ).resolves.toBe(false);
    expect(console.error).toHaveBeenCalledWith(
      "Notification operation failed.",
      { operation: "tournament-cancelled-context", code: "42501" }
    );
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
      privateMessage
    );
  });
});

function registration({
  id,
  clerkUserId = "user-player",
  status = "approved",
  waitlistOfferStatus = null,
  bracket = { launched_at: "2026-08-13T04:00:00.000Z" },
}: {
  id: string;
  clerkUserId?: string;
  status?: string;
  waitlistOfferStatus?: string | null;
  bracket?: { launched_at: string | null };
}) {
  return {
    id,
    clerk_user_id: clerkUserId,
    tournament_title: "IronClad Open",
    registration_status: status,
    waitlist_offer_status: waitlistOfferStatus,
    tournament_bracket: bracket,
  };
}
