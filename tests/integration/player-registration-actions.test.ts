import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import accountDashboardEnglish from "@/lib/i18n/dictionaries/en/account-dashboard";
import { anonymousIdentity, playerIdentity } from "@/tests/fixtures/auth";

const authMock = vi.hoisted(() => vi.fn());
const createAuthenticatedSupabaseClientMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("@/lib/supabase-server", () => ({
  createAuthenticatedSupabaseClient: createAuthenticatedSupabaseClientMock,
}));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

import {
  respondToWaitlistOfferAction,
  withdrawTournamentRegistrationAction,
  type PlayerRegistrationActionState,
} from "@/app/dashboard/registration-actions";

const REGISTRATION_ID = "11111111-1111-4111-8111-111111111111";
const TOURNAMENT_ID = "22222222-2222-4222-8222-222222222222";
const BRACKET_ID = "33333333-3333-4333-8333-333333333333";
const RESOLVED_AT = "2026-08-06T03:00:00.000Z";
const initialState: PlayerRegistrationActionState = {
  status: "idle",
  message: "",
};

describe("player registration lifecycle actions", () => {
  beforeEach(() => {
    authMock.mockReset();
    authMock.mockResolvedValue(playerIdentity);
    createAuthenticatedSupabaseClientMock.mockReset();
    revalidatePathMock.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("requires authentication before an ownership lookup", async () => {
    authMock.mockResolvedValue(anonymousIdentity);

    const result = await withdrawTournamentRegistrationAction(
      initialState,
      formData({ registrationId: REGISTRATION_ID })
    );

    expect(result.status).toBe("error");
    expect(result.code).toBe("auth_required");
    expect(createAuthenticatedSupabaseClientMock).not.toHaveBeenCalled();
  });

  it("rejects a foreign registration before calling the owner RPC", async () => {
    const client = createClient({ owned: false });
    createAuthenticatedSupabaseClientMock.mockResolvedValue(client.client);

    const result = await withdrawTournamentRegistrationAction(
      initialState,
      formData({ registrationId: REGISTRATION_ID })
    );

    expect(result).toEqual({
      status: "error",
      code: "registration_unavailable",
      message: "The tournament registration is not available.",
    });
    expect(client.ownershipFilters).toEqual([
      ["id", REGISTRATION_ID],
      ["clerk_user_id", playerIdentity.userId],
    ]);
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("withdraws through the authenticated owner RPC and revalidates consumers", async () => {
    const client = createClient({
      rpcData: [
        {
          registration_id: REGISTRATION_ID,
          tournament_id: TOURNAMENT_ID,
          tournament_bracket_id: BRACKET_ID,
          registration_status: "withdrawn",
          withdrawn_at: RESOLVED_AT,
        },
      ],
    });
    createAuthenticatedSupabaseClientMock.mockResolvedValue(client.client);

    const result = await withdrawTournamentRegistrationAction(
      initialState,
      formData({ registrationId: REGISTRATION_ID })
    );

    expect(result).toEqual({
      status: "success",
      code: "withdrawn",
      message:
        "Registration withdrawn. This decision is final for this tournament.",
    });
    expect(client.rpc).toHaveBeenCalledWith(
      "withdraw_tournament_registration",
      { p_registration_id: REGISTRATION_ID }
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/dashboard");
    expect(revalidatePathMock).toHaveBeenCalledWith("/tournaments");
  });

  it.each([
    ["accept", "pending", "accepted"],
    ["decline", "waitlisted", "declined"],
  ] as const)(
    "%s responds through the authenticated owner RPC without auto-approval",
    async (response, registrationStatus, offerStatus) => {
      const client = createClient({
        rpcData: [
          {
            registration_id: REGISTRATION_ID,
            tournament_id: TOURNAMENT_ID,
            tournament_bracket_id: BRACKET_ID,
            registration_status: registrationStatus,
            waitlist_offer_status: offerStatus,
            waitlist_offer_resolved_at: RESOLVED_AT,
          },
        ],
      });
      createAuthenticatedSupabaseClientMock.mockResolvedValue(client.client);

      const result = await respondToWaitlistOfferAction(
        initialState,
        formData({ registrationId: REGISTRATION_ID, response })
      );

      expect(result.status).toBe("success");
      expect(result.code).toBe(
        response === "accept" ? "offer_accepted" : "offer_declined"
      );
      expect(client.rpc).toHaveBeenCalledWith("respond_to_waitlist_offer", {
        p_registration_id: REGISTRATION_ID,
        p_response: response,
      });
      expect(JSON.stringify(client.rpc.mock.calls)).not.toContain("approved");
    }
  );

  it.each([
    {
      operation: "withdraw",
      message: "The deadline expired after the Division launched.",
      expectedMessage: "Your tournament registration could not be withdrawn.",
    },
    {
      operation: "withdraw",
      message: "La inscripción ya fue retirada.",
      expectedMessage: "Your tournament registration could not be withdrawn.",
    },
    {
      operation: "accept",
      message: "Already resolved: offer cannot respond after deadline.",
      expectedMessage: "The waitlist offer could not be updated.",
    },
    {
      operation: "accept",
      message: "Срок предложения истёк.",
      expectedMessage: "The waitlist offer could not be updated.",
    },
  ])(
    "maps unstructured $operation RPC prose to the safe generic failure",
    async ({ operation, message, expectedMessage }) => {
      const client = createClient({
        rpcError: { code: "P0001", message },
      });
      createAuthenticatedSupabaseClientMock.mockResolvedValue(client.client);

      const result =
        operation === "withdraw"
          ? await withdrawTournamentRegistrationAction(
              initialState,
              formData({ registrationId: REGISTRATION_ID })
            )
          : await respondToWaitlistOfferAction(
              initialState,
              formData({ registrationId: REGISTRATION_ID, response: operation })
            );

      expect(result).toEqual({
        status: "error",
        code: "mutation_failed",
        message: expectedMessage,
      });
      expect(revalidatePathMock).not.toHaveBeenCalled();
    }
  );

  it("validates the response before loading owner data", async () => {
    const client = createClient();
    createAuthenticatedSupabaseClientMock.mockResolvedValue(client.client);

    const result = await respondToWaitlistOfferAction(
      initialState,
      formData({ registrationId: REGISTRATION_ID, response: "promote" })
    );

    expect(result).toEqual({
      status: "error",
      code: "invalid_registration",
      message: "Choose Accept or Decline for this waitlist offer.",
    });
    expect(createAuthenticatedSupabaseClientMock).not.toHaveBeenCalled();
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("does not import Relic or request snapshot fields", () => {
    const source = readFileSync(
      resolve(process.cwd(), "app/dashboard/registration-actions.ts"),
      "utf8"
    );

    expect(source.toLowerCase()).not.toContain("relic");
    expect(source).not.toMatch(/submitted_elo|steam_id64|elo_verified/);
    expect(source).not.toContain("admin_notes");
  });

  it("shows never-offered waitlisted registrations as closed after launch", () => {
    const source = readFileSync(
      resolve(process.cwd(), "app/dashboard/page.tsx"),
      "utf8"
    );

    expect(source).toContain("waiting: registration.launched_at");
    expect(source).toContain(
      't("dashboard.registrations.launchedWaitlistMessage")'
    );
    expect(
      accountDashboardEnglish.dashboard.registrations.launchedWaitlistMessage
    ).toBe(
      "This Division has started, and no place became available. Thank you for joining the Waitlist."
    );
  });
});

function formData(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) {
    data.set(key, value);
  }
  return data;
}

function createClient({
  owned = true,
  rpcData = null,
  rpcError = null,
}: {
  owned?: boolean;
  rpcData?: unknown;
  rpcError?: unknown;
} = {}) {
  const ownershipFilters: Array<[string, unknown]> = [];
  const ownershipQuery = {
    select: vi.fn(),
    eq: vi.fn((column: string, value: unknown) => {
      ownershipFilters.push([column, value]);
      return ownershipQuery;
    }),
    maybeSingle: vi.fn(async () => ({
      data: owned ? { id: REGISTRATION_ID } : null,
      error: null,
    })),
  };
  ownershipQuery.select.mockReturnValue(ownershipQuery);
  const rpc = vi.fn(async () => ({ data: rpcData, error: rpcError }));

  return {
    client: {
      from: vi.fn((table: string) => {
        if (table !== "registrations") {
          throw new Error(`Unexpected table: ${table}`);
        }
        return ownershipQuery;
      }),
      rpc,
    },
    ownershipFilters,
    rpc,
  };
}
