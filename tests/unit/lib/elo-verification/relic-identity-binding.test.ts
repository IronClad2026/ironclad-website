import { expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { getRelic1v1Elo } from "@/lib/elo-verification/relic";
import { mockServer } from "@/tests/mocks/server";

const STEAM_ID64 = "76561198000000000";
const RELIC_PROFILE_ID = 42;
const PERSONAL_STAT_GROUP_ID = 7_001;

it("retains the canonical Relic profile ID after a successful Steam-owned ELO resolution", async () => {
  const payload = {
    result: { code: 0, message: "SUCCESS" },
    statGroups: [
      {
        id: PERSONAL_STAT_GROUP_ID,
        members: [
          {
            profile_id: RELIC_PROFILE_ID,
            name: `/steam/${STEAM_ID64}`,
            alias: "Synthetic verifier fixture",
            personal_statgroup_id: PERSONAL_STAT_GROUP_ID,
          },
        ],
      },
    ],
    leaderboardStats: [
      {
        statgroup_id: PERSONAL_STAT_GROUP_ID,
        leaderboard_id: 2_130_255,
        rating: 1_200,
        wins: 1,
        losses: 0,
        lastmatchdate: 1_700_000_000,
      },
    ],
  };

  mockServer.use(
    http.get(
      "https://coh3-api.reliclink.com/community/leaderboard/getpersonalstat",
      ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get("profile_names")).toBe(
          JSON.stringify([`/steam/${STEAM_ID64}`]),
        );
        return HttpResponse.json(payload);
      },
    ),
  );

  const result = await getRelic1v1Elo(STEAM_ID64);

  // Existing ELO verification succeeds against the exact Steam-owned member.
  expect(result).toMatchObject({
    status: "rated",
    elo: 1_200,
    faction: "US Forces",
    division: "Challenge",
    calculationVersion: "relic-highest-1v1-v2",
  });
  expect(payload.statGroups[0].members[0].profile_id).toBe(RELIC_PROFILE_ID);
  expect(RELIC_PROFILE_ID).not.toBe(PERSONAL_STAT_GROUP_ID);

  // Regression: the original resolver discarded this provider identity before
  // either trusted verification transaction could persist it.
  expect(result).toMatchObject({ relicProfileId: String(RELIC_PROFILE_ID) });
});
