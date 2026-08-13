import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  isTournamentBracketPublic,
  mapTournamentRow,
  type TournamentRow,
} from "@/lib/tournaments";

function readNormalizedSource(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8").replaceAll(
    "\r\n",
    "\n"
  );
}

function createTournamentRow(): TournamentRow {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    slug: "slice-one-open",
    title: "Slice One Open",
    description: "Eight-player cohort fixture.",
    banner_image_url: "/images/tournaments/1v1-operation-skyfall.jpeg",
    registration_open_at: "2026-08-01T00:00:00.000Z",
    registration_close_at: "2026-08-10T00:00:00.000Z",
    start_date: null,
    end_date: null,
    status: "registration_open",
    format: "1v1",
    rule_format: "format_a",
    result_confirmation_window_minutes: 30,
    prize_pool: "",
    rules_url: null,
    battlefy_url: null,
    registration_enabled: true,
    grand_final_at: null,
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-01T00:00:00.000Z",
    tournament_brackets: [
      {
        id: "22222222-2222-4222-8222-222222222221",
        tournament_id: "11111111-1111-4111-8111-111111111111",
        name: "Academy",
        elo_rules: "Below 1100 ELO",
        max_players: 16,
        registered_players: 2,
        active_cohort_players: 7,
        waitlisted_players: 0,
        launched_at: null,
        created_at: "2026-08-01T00:00:00.000Z",
        updated_at: "2026-08-01T00:00:00.000Z",
      },
      {
        id: "22222222-2222-4222-8222-222222222222",
        tournament_id: "11111111-1111-4111-8111-111111111111",
        name: "Challenge",
        elo_rules: "1100-1399 ELO",
        max_players: 32,
        registered_players: 5,
        active_cohort_players: 8,
        waitlisted_players: 2,
        launched_at: null,
        created_at: "2026-08-01T00:00:00.000Z",
        updated_at: "2026-08-01T00:00:00.000Z",
      },
      {
        id: "22222222-2222-4222-8222-222222222223",
        tournament_id: "11111111-1111-4111-8111-111111111111",
        name: "Main",
        elo_rules: "1400+ ELO",
        max_players: 64,
        registered_players: 1,
        active_cohort_players: 3,
        waitlisted_players: 1,
        launched_at: null,
        created_at: "2026-08-01T00:00:00.000Z",
        updated_at: "2026-08-01T00:00:00.000Z",
      },
    ],
  };
}

describe("registration cohort presentation", () => {
  it("keeps approved, active-cohort, and waitlist counts distinct per division", () => {
    const tournament = mapTournamentRow(createTournamentRow());
    const academy = tournament.brackets.find(
      (bracket) => bracket.name === "Academy Bracket"
    );
    const challenge = tournament.brackets.find(
      (bracket) => bracket.name === "Challenge Bracket"
    );
    const main = tournament.brackets.find(
      (bracket) => bracket.name === "Main / Pro Bracket"
    );

    expect(academy).toMatchObject({
      registeredPlayers: 2,
      activeCohortPlayers: 7,
      activeCohortSize: 8,
      waitlistedPlayers: 0,
      isWaitlistOnly: false,
      maxPlayers: "Max 16 players",
    });
    expect(challenge).toMatchObject({
      registeredPlayers: 5,
      activeCohortPlayers: 8,
      activeCohortSize: 8,
      waitlistedPlayers: 2,
      isWaitlistOnly: true,
      maxPlayers: "Max 32 players",
    });
    expect(main).toMatchObject({
      registeredPlayers: 1,
      activeCohortPlayers: 3,
      activeCohortSize: 8,
      waitlistedPlayers: 1,
      isWaitlistOnly: true,
      maxPlayers: "Max 64 players",
    });
    expect(tournament.registrationEnabled).toBe(true);
    expect(tournament.registrationCloseAt).toBe(
      "2026-08-10T00:00:00.000Z"
    );
  });

  it("keeps generated competition private until its division launches", () => {
    expect(isTournamentBracketPublic(null)).toBe(false);
    expect(
      isTournamentBracketPublic("2026-08-06T02:00:00.000Z")
    ).toBe(true);

    const pageSource = readNormalizedSource("app/tournaments/page.tsx");
    const filteredRowsIndex = pageSource.indexOf(
      "const publicGeneratedBracketRows"
    );
    const referencedRowsIndex = pageSource.indexOf(
      "getGeneratedBracketRegistrationIds(",
      filteredRowsIndex
    );
    const mappedRowsIndex = pageSource.indexOf(
      "mapGeneratedBrackets(\n    publicGeneratedBracketRows"
    );

    expect(filteredRowsIndex).toBeGreaterThanOrEqual(0);
    expect(referencedRowsIndex).toBeGreaterThan(filteredRowsIndex);
    expect(mappedRowsIndex).toBeGreaterThan(referencedRowsIndex);
  });

  it("exposes one administrator closing-time control and division readiness labels", () => {
    const adminPageSource = readNormalizedSource("app/admin/page.tsx");
    const tournamentFormSource = readNormalizedSource(
      "app/admin/tournaments/page.tsx"
    );
    const tournamentActionSource = readNormalizedSource(
      "app/admin/tournaments/actions.ts"
    );
    const tournamentExperienceSource = readNormalizedSource(
      "components/TournamentsExperience.tsx"
    );

    expect(adminPageSource).toContain(
      "approved — ready for private bracket preparation"
    );
    expect(adminPageSource).toContain("approved — review incomplete");
    expect(adminPageSource).toContain("Division launched — roster locked");
    expect(adminPageSource).toContain("Waiting for a FIFO spot offer");
    expect(tournamentFormSource).toContain('label="Registration Closes"');
    expect(tournamentFormSource).toContain('name="registrationCloseAt"');
    expect(tournamentActionSource).toContain(
      'parseOptionalDateTime(\n    formData,\n    "registrationCloseAt"\n  )'
    );
    expect(tournamentActionSource).toContain(
      "p_registration_close_at: toIsoDateTime(registrationCloseAt)"
    );
    expect(tournamentExperienceSource).toContain(
      "Active review cohort full - waitlist only"
    );
    expect(tournamentExperienceSource).not.toContain(
      "Approved roster full - waitlist only"
    );
  });
});
