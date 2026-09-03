import { beforeEach, describe, expect, it, vi } from "vitest";

const getRelic1v1EloMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/elo-verification/relic", () => ({
  getRelic1v1Elo: getRelic1v1EloMock,
}));

import {
  getRegistrationRelic1v1EloForProject,
  isConfirmedStagingSupabaseProjectUrl,
  STAGING_SUPABASE_PROJECT_REF,
  STAGING_SYNTHETIC_ACADEMY_CALCULATION_VERSION,
} from "@/lib/elo-verification/staging-synthetic-academy";

const STAGING_URL = `https://${STAGING_SUPABASE_PROJECT_REF}.supabase.co`;
const PRODUCTION_URL = "https://nsyjtqpvyxlzyujlbzos.supabase.co";
const IDENTITY = {
  playerId: "3401a4e2-76f2-4e58-97f6-2e5ea5d588a7",
  clerkUserId: "user_3ILOLoD32EQFN6QudR5N9aCHPzh",
  steamId64: "18446744073709551001",
};
const SYNTHETIC_ROW = {
  elo: 1_000,
  faction: "US Forces",
  division: "Academy",
  calculation_version: STAGING_SYNTHETIC_ACADEMY_CALCULATION_VERSION,
};
const REAL_RESULT = {
  status: "rated",
  elo: 1_250,
  faction: "British Forces",
  division: "Challenge",
  calculationVersion: "relic-highest-1v1-v1",
};

function clientWith(result: { data: unknown; error: unknown }) {
  return {
    rpc: vi.fn().mockResolvedValue(result),
  };
}

describe("permanent Staging synthetic Academy rating adapter", () => {
  beforeEach(() => {
    getRelic1v1EloMock.mockResolvedValue(REAL_RESULT);
  });

  it("accepts only the exact authoritative Staging Supabase origin", () => {
    expect(isConfirmedStagingSupabaseProjectUrl(STAGING_URL)).toBe(true);

    for (const rejected of [
      PRODUCTION_URL,
      `http://${STAGING_SUPABASE_PROJECT_REF}.supabase.co`,
      `https://${STAGING_SUPABASE_PROJECT_REF}.supabase.co/rest/v1`,
      `https://${STAGING_SUPABASE_PROJECT_REF}.supabase.co?ref=staging`,
      `https://${STAGING_SUPABASE_PROJECT_REF}.supabase.co.evil.invalid`,
      "not-a-url",
    ]) {
      expect(isConfirmedStagingSupabaseProjectUrl(rejected)).toBe(false);
    }
  });

  it("returns the deterministic Academy result for an authorized Staging identity", async () => {
    const supabase = clientWith({ data: [SYNTHETIC_ROW], error: null });

    await expect(
      getRegistrationRelic1v1EloForProject({
        supabase: supabase as never,
        identity: IDENTITY,
        projectUrl: STAGING_URL,
      })
    ).resolves.toEqual({
      status: "rated",
      elo: 1_000,
      faction: "US Forces",
      division: "Academy",
      calculationVersion: STAGING_SYNTHETIC_ACADEMY_CALCULATION_VERSION,
    });
    expect(supabase.rpc).toHaveBeenCalledWith(
      "resolve_staging_synthetic_academy_elo",
      {
        p_profile_id: IDENTITY.playerId,
        p_clerk_user_id: IDENTITY.clerkUserId,
        p_steam_id64: IDENTITY.steamId64,
      }
    );
    expect(getRelic1v1EloMock).not.toHaveBeenCalled();
  });

  it("makes the same synthetic account use real Relic outside confirmed Staging", async () => {
    const supabase = clientWith({ data: [SYNTHETIC_ROW], error: null });

    await expect(
      getRegistrationRelic1v1EloForProject({
        supabase: supabase as never,
        identity: IDENTITY,
        projectUrl: PRODUCTION_URL,
      })
    ).resolves.toEqual(REAL_RESULT);
    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(getRelic1v1EloMock).toHaveBeenCalledExactlyOnceWith(
      IDENTITY.steamId64
    );
  });

  it("keeps a normal Staging player on the real Relic path", async () => {
    const supabase = clientWith({ data: [], error: null });

    await expect(
      getRegistrationRelic1v1EloForProject({
        supabase: supabase as never,
        identity: {
          playerId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          clerkUserId: "user_normalPlayer",
          steamId64: "76561198000000000",
        },
        projectUrl: STAGING_URL,
      })
    ).resolves.toEqual(REAL_RESULT);
    expect(supabase.rpc).toHaveBeenCalledOnce();
    expect(getRelic1v1EloMock).toHaveBeenCalledExactlyOnceWith(
      "76561198000000000"
    );
  });

  it.each([
    { data: [SYNTHETIC_ROW, SYNTHETIC_ROW], error: null },
    { data: [{ ...SYNTHETIC_ROW, elo: 1_001 }], error: null },
    { data: null, error: { code: "42501" } },
  ])("fails safely to real Relic for an unavailable or invalid resolver response", async (result) => {
    const supabase = clientWith(result);

    await expect(
      getRegistrationRelic1v1EloForProject({
        supabase: supabase as never,
        identity: IDENTITY,
        projectUrl: STAGING_URL,
      })
    ).resolves.toEqual(REAL_RESULT);
    expect(getRelic1v1EloMock).toHaveBeenCalledExactlyOnceWith(
      IDENTITY.steamId64
    );
  });
});
