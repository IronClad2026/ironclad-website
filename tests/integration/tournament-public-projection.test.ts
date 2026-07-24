import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  adminIdentity,
  anonymousIdentity,
  playerIdentity,
} from "@/tests/fixtures/auth";
import { createSupabaseQueryMock } from "@/tests/helpers/supabase-query-mock";
import type { TournamentRow } from "@/lib/tournaments";

const authMock = vi.hoisted(() => vi.fn());
const createSupabaseAdminClientMock = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
}));

vi.mock("@/lib/supabase-admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock,
}));

import {
  loadAdminTournamentMatchAudit,
  loadGeneratedBracketPageRows,
  mapGeneratedBrackets,
} from "@/lib/tournament-bracket-data";

const generatedBracketRow = {
  id: "generated-bracket-1",
  tournament_bracket_id: "tournament-bracket-1",
  format: "single_elimination",
  slot_count: 8,
  generated_at: "2026-07-01T00:00:00.000Z",
  generated_by: "synthetic-private-generator",
  bracket_rounds: [
    {
      id: "unused-round-id",
      round_number: 1,
      name: "Quarterfinals",
      tournament_matches: [
        {
          id: "match-1",
          match_number: 1,
          series_best_of: 3,
          status: "completed",
          player_one_slot: 1,
          player_two_slot: 2,
          player_one_registration_id: "registration-1",
          player_two_registration_id: "registration-2",
          player_one_score: 2,
          player_two_score: 1,
          winner_registration_id: "registration-1",
          official_result_submission_id: "submission_must_not_leak",
          official_result_decided_by: "synthetic-private-admin",
          official_result_decided_at: "2026-07-02T00:00:00.000Z",
        },
      ],
    },
  ],
  tournament_standings: [
    {
      registration_id: "registration-1",
      wins: 1,
      losses: 0,
      points: 3,
      rank: 1,
    },
  ],
};

const tournamentRows = [
  {
    id: "tournament-1",
    tournament_brackets: [
      {
        id: "tournament-bracket-1",
      },
    ],
  },
] as TournamentRow[];

describe("public tournament bracket data boundary", () => {
  beforeEach(() => {
    authMock.mockReset();
    createSupabaseAdminClientMock.mockReset();
  });

  it("returns required public fields without selecting or serializing audit identifiers", async () => {
    const publicQuery = createSupabaseQueryMock({
      data: [generatedBracketRow],
    });
    createSupabaseAdminClientMock.mockReturnValue(publicQuery.client);

    const result = await loadGeneratedBracketPageRows({
      includeAdminAudit: false,
    });
    const select = publicQuery.calls.find(
      (call) => call.method === "select"
    )?.args[0];
    const mapped = mapGeneratedBrackets(result.data, tournamentRows);
    const publicPayload = JSON.stringify(mapped.get("tournament-1"));

    expect(publicQuery.from).toHaveBeenCalledWith("generated_brackets");
    expect(select).toContain("tournament_matches(");
    expect(select).toContain("winner_registration_id");
    expect(select).not.toContain("generated_by");
    expect(select).not.toContain("official_result_");
    expect(select).not.toContain("competition_locked_at");
    expect(result.error).toBeNull();
    expect(mapped.get("tournament-1")?.[0]).toMatchObject({
      id: "generated-bracket-1",
      matches: [
        {
          id: "match-1",
          playerOneRegistrationId: "registration-1",
          playerTwoRegistrationId: "registration-2",
          winnerRegistrationId: "registration-1",
        },
      ],
      standings: [
        {
          registrationId: "registration-1",
          wins: 1,
          losses: 0,
          points: 3,
          rank: 1,
        },
      ],
    });
    expect(publicPayload).not.toContain("generated_by");
    expect(publicPayload).not.toContain("officialResult");
    expect(publicPayload).not.toContain("submission_must_not_leak");
    expect(publicPayload).not.toContain("synthetic-private-admin");
    expect(authMock).not.toHaveBeenCalled();
    expect(createSupabaseAdminClientMock).toHaveBeenCalledOnce();
  });

  it.each([
    ["anonymous", anonymousIdentity],
    ["ordinary player", playerIdentity],
  ])(
    "rejects %s audit access before creating a service-role client",
    async (_name, identity) => {
      authMock.mockResolvedValue(identity);

      await expect(
        loadAdminTournamentMatchAudit(["match-1"])
      ).rejects.toThrow("Unauthorized");
      expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
    }
  );

  it("loads and serializes audit identifiers only for a re-authorized administrator", async () => {
    const publicQuery = createSupabaseQueryMock({
      data: [generatedBracketRow],
    });
    const auditQuery = createSupabaseQueryMock({
      data: [
        {
          id: "match-1",
          official_result_submission_id: "submission_admin_only",
          official_result_decided_by: "synthetic-authorized-admin",
          official_result_decided_at: "2026-07-03T00:00:00.000Z",
        },
      ],
    });
    authMock.mockResolvedValue(adminIdentity);
    createSupabaseAdminClientMock
      .mockReturnValueOnce(publicQuery.client)
      .mockReturnValueOnce(auditQuery.client);

    const result = await loadGeneratedBracketPageRows({
      includeAdminAudit: true,
    });
    const mapped = mapGeneratedBrackets(result.data, tournamentRows);
    const adminMatch = mapped.get("tournament-1")?.[0].matches[0];

    expect(authMock).toHaveBeenCalledOnce();
    expect(auditQuery.from).toHaveBeenCalledWith("tournament_matches");
    expect(
      auditQuery.calls.find((call) => call.method === "select")?.args[0]
    ).toBe(
      "id, official_result_submission_id, official_result_decided_by, official_result_decided_at"
    );
    expect(auditQuery.calls).toContainEqual({
      method: "in",
      args: ["id", ["match-1"]],
    });
    expect(adminMatch).toMatchObject({
      officialResultSubmissionId: "submission_admin_only",
      officialResultDecidedBy: "synthetic-authorized-admin",
      officialResultDecidedAt: "2026-07-03T00:00:00.000Z",
    });
  });

  it("fails closed to the public projection when the admin audit query fails", async () => {
    const publicQuery = createSupabaseQueryMock({
      data: [generatedBracketRow],
    });
    const auditQuery = createSupabaseQueryMock({
      error: { message: "audit unavailable" },
    });
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    authMock.mockResolvedValue(adminIdentity);
    createSupabaseAdminClientMock
      .mockReturnValueOnce(publicQuery.client)
      .mockReturnValueOnce(auditQuery.client);

    const result = await loadGeneratedBracketPageRows({
      includeAdminAudit: true,
    });
    const payload = JSON.stringify(
      mapGeneratedBrackets(result.data, tournamentRows).get("tournament-1")
    );

    expect(result.error).toBeNull();
    expect(payload).not.toContain("officialResult");
    expect(payload).not.toContain("submission_must_not_leak");
    expect(consoleError).toHaveBeenCalledWith(
      "Tournament match audit load failed:",
      "audit unavailable"
    );
  });

  it("returns no bracket data when the safe public query fails", async () => {
    const publicQuery = createSupabaseQueryMock({
      error: { message: "public query unavailable" },
    });
    createSupabaseAdminClientMock.mockReturnValue(publicQuery.client);

    await expect(
      loadGeneratedBracketPageRows({
        includeAdminAudit: false,
      })
    ).resolves.toEqual({
      data: [],
      error: { message: "public query unavailable" },
    });
    expect(authMock).not.toHaveBeenCalled();
  });
});
