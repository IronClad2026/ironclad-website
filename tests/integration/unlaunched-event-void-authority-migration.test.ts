import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationName = "20260902100000_unlaunched_event_void_authority.sql";
const previousMigrationName =
  "20260831134000_staging_badge_fixture_eligibility_compatibility.sql";
const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations", migrationName),
  "utf8"
);
const compactMigration = migration.toLowerCase().replace(/\s+/g, " ").trim();
const phase4Migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260806130000_phase4_withdrawal_waitlist_division_launch.sql"
  ),
  "utf8"
)
  .toLowerCase()
  .replace(/\s+/g, " ")
  .trim();
const refusalMessage =
  "unlaunched tournament void requires zero competitive, scoring, season, or badge evidence";

function extractFunction(functionName: string) {
  const marker = `create or replace function public.${functionName}(`;
  const start = compactMigration.indexOf(marker);
  const end = compactMigration.indexOf("$$;", start);

  if (start < 0 || end < 0) {
    throw new Error(`${functionName} was not found in ${migrationName}.`);
  }

  return compactMigration.slice(start, end + 3);
}

function extractFunctionFromMigration(value: string, functionName: string) {
  const marker = `create or replace function public.${functionName}(`;
  const start = value.indexOf(marker);
  const end = value.indexOf("$$;", start);

  if (start < 0 || end < 0) {
    throw new Error(`${functionName} was not found in the comparison migration.`);
  }

  return value.slice(start, end + 3);
}

const voidTournament = extractFunction("void_tournament");
const registrationRefresh = extractFunction("refresh_phase4_registration_state");
const previousRegistrationRefresh = extractFunctionFromMigration(
  phase4Migration,
  "refresh_phase4_registration_state"
);

describe("unlaunched tournament Void authority migration", () => {
  it("replaces exactly the existing Void signature in one ordered transaction", () => {
    const migrationNames = readdirSync(
      resolve(process.cwd(), "supabase/migrations")
    ).sort();
    const definedFunctions = [
      ...compactMigration.matchAll(
        /create(?: or replace)? function ([a-z0-9_.]+)\(/g
      ),
    ].map((match) => match[1]);

    expect(migrationNames.indexOf(previousMigrationName)).toBeGreaterThan(-1);
    expect(migrationNames.indexOf(migrationName)).toBeGreaterThan(
      migrationNames.indexOf(previousMigrationName)
    );
    expect(compactMigration.startsWith("begin;")).toBe(true);
    expect(compactMigration.endsWith("commit;")).toBe(true);
    expect(definedFunctions.sort()).toEqual([
      "public.refresh_phase4_registration_state",
      "public.void_tournament",
    ]);
    expect(
      compactMigration.match(
        /create or replace function public\.void_tournament\(/g
      )
    ).toHaveLength(1);
    expect(voidTournament).toContain(
      "p_tournament_id uuid, p_reason text, p_actor_clerk_user_id text"
    );
    expect(voidTournament).toContain(
      "returns jsonb language plpgsql security definer set search_path = pg_catalog"
    );
    expect(compactMigration).not.toMatch(
      /create table public\.|alter table public\.|drop table public\.|create trigger|create index|create policy/
    );
  });

  it("allows only an evidence-free unlaunched tournament through the existing authority", () => {
    const launchedEvidence = voidTournament.indexOf(
      "bracket.launched_at is not null"
    );
    const terminalTransition = voidTournament.indexOf(
      "update public.tournaments set status = 'voided'"
    );

    expect(launchedEvidence).toBeGreaterThan(-1);
    expect(terminalTransition).toBeGreaterThan(launchedEvidence);
    expect(voidTournament).not.toContain(
      "only a launched tournament can be voided"
    );
    expect(voidTournament).toContain("if not v_has_launched");
    expect(voidTournament).toContain(refusalMessage);
    expect(voidTournament).toContain("errcode = '55000'");
    expect(voidTournament).toContain(
      "v_tournament.status is null or v_tournament.status not in ('upcoming', 'registration_open')"
    );
    expect(voidTournament).toContain(
      "v_tournament.status not in ('upcoming', 'registration_open')"
    );
    expect(voidTournament).toContain(
      "public.tournament_has_official_competition(p_tournament_id)"
    );
    expect(voidTournament).toContain(
      "public.tournament_has_linked_admin_adjustment(p_tournament_id)"
    );

    for (const evidence of [
      "from public.generated_brackets as generated",
      "from public.tournament_matches as match",
      "from public.match_result_report_groups as report_group",
      "from public.match_result_submissions as submission",
      "from public.match_replay_upload_attempts as replay_attempt",
      "from public.match_dice_rolls as dice_roll",
      "from public.match_participant_outcome_authority as authority",
      "from public.match_game_result_authority as authority",
      "from public.tournament_championship_path_authority as authority",
      "from public.tournament_championship_path_summary_authority as summary",
      "from public.leaderboard_tournament_season_memberships as membership",
      "from public.leaderboard_point_events as event",
      "from public.leaderboard_recalculation_runs as run",
      "from public.leaderboard_player_season_stats as stats",
      "from public.leaderboard_seasons as season",
      "from public.player_badge_awards as award",
      "from ironclad_private.badge_reconciliation_targets as target",
    ]) {
      expect(voidTournament).toContain(evidence);
      expect(voidTournament.indexOf(evidence)).toBeLessThan(terminalTransition);
    }

    expect(voidTournament).toContain("award.source_id");
    expect(voidTournament).toContain("award.source_metadata");
    expect(voidTournament).toContain(
      "pg_catalog.lower(award.source_metadata::text) like"
    );
    expect(voidTournament).toContain("'tournamentid'");
    expect(voidTournament).toContain("'tournament_id'");
    expect(voidTournament).toContain("'originaltournamentid'");
    expect(voidTournament).toContain("'original_tournament_id'");
    expect(voidTournament).toContain("'thresholdtournamentid'");
    expect(voidTournament).toContain("'threshold_tournament_id'");
    expect(voidTournament).toContain("'matchid'");
    expect(voidTournament).toContain("'match_id'");
    expect(voidTournament).toContain(
      "season.under_review_tournament_id = p_tournament_id"
    );
    expect(voidTournament).toContain(
      "pg_catalog.lower(target.source_id) = p_tournament_id::text"
    );
    expect(voidTournament).toContain(
      "pg_catalog.lower(target.source_id) in ("
    );
    expect(voidTournament).toContain(
      "or registration.tournament_bracket_id in ("
    );
  });

  it("preserves the launched Void lifecycle, locking, and reconciliation path", () => {
    const rootLock = voidTournament.indexOf(
      "hashtextextended('ironclad:leaderboard:all-time', 0)"
    );
    const tournamentLock = voidTournament.indexOf(
      "'ironclad:leaderboard:tournament:'"
    );
    const rowLock = voidTournament.indexOf("for update nowait");
    const terminalTransition = voidTournament.indexOf(
      "update public.tournaments set status = 'voided'"
    );

    expect(voidTournament).toContain(
      "perform public.leaderboard_require_write_access()"
    );
    expect(rootLock).toBeGreaterThan(-1);
    expect(tournamentLock).toBeGreaterThan(rootLock);
    expect(rowLock).toBeGreaterThan(tournamentLock);
    expect(terminalTransition).toBeGreaterThan(rowLock);
    expect(voidTournament).toContain("when lock_not_available");
    expect(voidTournament).toContain("errcode = '55p03'");
    expect(voidTournament).toContain(
      "jsonb_build_object('outcome', 'already_voided')"
    );
    expect(voidTournament).toContain(
      "jsonb_build_object('outcome', 'under_review')"
    );
    expect(voidTournament).toContain(
      "public.award_leaderboard_late_entry_bonuses("
    );
    expect(voidTournament).toContain(
      "public.recalculate_leaderboard_for_season("
    );
    expect(voidTournament).toContain(
      "update public.leaderboard_tournament_season_memberships"
    );
    expect(voidTournament).toContain(
      "delete from public.leaderboard_point_events as event"
    );
  });

  it("preserves registration rows while closing only outstanding waitlist offers", () => {
    const registrationUpdates = [
      ...voidTournament.matchAll(/update public\.registrations\b/g),
    ];
    const updateStart = voidTournament.indexOf("update public.registrations");
    const updateEnd = voidTournament.indexOf(";", updateStart);
    const waitlistResolution = voidTournament.slice(updateStart, updateEnd);
    const registrationSetClause = waitlistResolution.slice(
      waitlistResolution.indexOf(" set ") + 5,
      waitlistResolution.indexOf(" where ")
    );
    const terminalTransition = voidTournament.indexOf(
      "update public.tournaments set status = 'voided'"
    );
    const tournamentRowLock = voidTournament.indexOf("for update nowait");
    const bracketRowLock =
      voidTournament.match(
        /order by bracket\.id for update(?: of bracket)? nowait/
      )?.index ?? -1;
    const offeredRegistrationLock =
      voidTournament.match(
        /order by registration\.id for update(?: of registration)? nowait/
      )?.index ?? -1;

    expect(registrationUpdates).toHaveLength(1);
    expect(bracketRowLock).toBeGreaterThan(tournamentRowLock);
    expect(offeredRegistrationLock).toBeGreaterThan(bracketRowLock);
    expect(updateStart).toBeGreaterThan(-1);
    expect(updateStart).toBeGreaterThan(offeredRegistrationLock);
    expect(updateStart).toBeLessThan(terminalTransition);
    expect(voidTournament).toContain("when lock_not_available");
    expect(voidTournament.match(/for update(?: of [a-z_]+)? nowait/g)).toHaveLength(
      3
    );
    expect(waitlistResolution).toContain("waitlist_offer_status = 'cancelled'");
    expect(waitlistResolution).toContain("waitlist_offer_resolved_at");
    expect(waitlistResolution).toContain("waitlist_offer_status = 'offered'");
    expect(registrationSetClause).not.toContain("registration_status =");
    expect(registrationSetClause).not.toContain("tournament_bracket_id =");
    expect(registrationSetClause).not.toContain("waitlist_offer_expires_at =");
    expect(voidTournament).not.toMatch(
      /(?:insert into|delete from) public\.registrations\b/
    );
  });

  it("suppresses waitlist refresh only inside the trusted terminal transition", () => {
    const terminalReturn = registrationRefresh.indexOf(
      "if v_terminal_transition then return new; end if"
    );
    const previousBodyMarker =
      "if current_setting('ironclad.tournament_deletion', true) = 'on' then";
    const previousBody = previousRegistrationRefresh.slice(
      previousRegistrationRefresh.indexOf(previousBodyMarker)
    );

    expect(registrationRefresh).toContain(
      "'ironclad.tournament_terminal_transition'"
    );
    expect(registrationRefresh).toContain(
      "session_user = 'postgres' or coalesce(auth.role(), '') = 'service_role'"
    );
    expect(terminalReturn).toBeGreaterThan(-1);
    expect(registrationRefresh.indexOf(previousBodyMarker)).toBeGreaterThan(
      terminalReturn
    );
    expect(
      registrationRefresh.slice(registrationRefresh.indexOf(previousBodyMarker))
    ).toBe(previousBody);
    expect(compactMigration).toContain(
      "revoke all on function public.refresh_phase4_registration_state() from public, anon, authenticated"
    );
    expect(compactMigration).toContain(
      "grant execute on function public.refresh_phase4_registration_state() to service_role"
    );
  });

  it("reads Badge evidence but introduces no Badge, notification, or Reveal writer", () => {
    expect(voidTournament).toContain("from public.player_badge_awards as award");
    expect(compactMigration).not.toMatch(
      /(?:insert into|update|delete from) public\.player_badge_(?:awards|reveals)\b/
    );
    expect(compactMigration).not.toMatch(
      /(?:insert into|update|delete from) (?:ironclad_private\.)?badge_reconciliation|badge\.unlocked|create_in_app_notification|(?:insert into|update|delete from) public\.notifications\b/
    );
    expect(compactMigration).not.toMatch(
      /truncate|drop table public\.|delete from public\.tournaments/
    );
  });

  it("keeps the service-role boundary and does not replace Cancel", () => {
    expect(compactMigration).toContain(
      "alter function public.void_tournament(uuid, text, text) owner to postgres"
    );
    expect(compactMigration).toContain(
      "revoke all on function public.void_tournament(uuid, text, text) from public, anon, authenticated"
    );
    expect(compactMigration).toContain(
      "grant execute on function public.void_tournament(uuid, text, text) to service_role"
    );
    expect(compactMigration).not.toMatch(
      /create(?: or replace)? function public\.cancel_tournament\(/
    );
    expect(compactMigration).not.toMatch(
      /alter function public\.cancel_tournament|revoke .*public\.cancel_tournament|grant .*public\.cancel_tournament/
    );
  });
});
