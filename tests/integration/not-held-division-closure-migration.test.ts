import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationName = "20260903130000_not_held_division_closure.sql";
const previousMigrationName =
  "20260903100000_division_settlement_shadow_foundation.sql";
const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations", migrationName),
  "utf8"
);
const compactMigration = migration.toLowerCase().replace(/\s+/g, " ").trim();
const publicPage = readFileSync(
  resolve(process.cwd(), "app/tournaments/page.tsx"),
  "utf8"
)
  .toLowerCase()
  .replace(/\s+/g, " ")
  .trim();

function extractFunction(functionName: string) {
  const markers = [
    `create function public.${functionName}(`,
    `create or replace function public.${functionName}(`,
  ];
  const start = markers.reduce((found, marker) => {
    const index = compactMigration.indexOf(marker);
    return found < 0 || (index >= 0 && index < found) ? index : found;
  }, -1);
  const end = compactMigration.indexOf("$$;", start);

  if (start < 0 || end < 0) {
    throw new Error(`${functionName} was not found in ${migrationName}.`);
  }

  return compactMigration.slice(start, end + 3);
}

const closeDivision = extractFunction(
  "close_tournament_division_without_launch"
);
const publicProjection = extractFunction(
  "get_tournament_division_not_held_states"
);
const registrationGuard = extractFunction(
  "guard_not_held_registration_mutation"
);
const registrationRefresh = extractFunction(
  "refresh_tournament_registration_after_division_resolution"
);
const saveTournament = extractFunction("save_tournament");

describe("Not Held Division closure migration", () => {
  it("is ordered, transactional, and adds only one immutable Division fact", () => {
    const migrationNames = readdirSync(
      resolve(process.cwd(), "supabase/migrations")
    ).sort();

    expect(migrationNames.indexOf(previousMigrationName)).toBeGreaterThan(-1);
    expect(migrationNames.indexOf(migrationName)).toBeGreaterThan(
      migrationNames.indexOf(previousMigrationName)
    );
    expect(compactMigration.startsWith("begin;")).toBe(true);
    expect(compactMigration.endsWith("commit;")).toBe(true);
    expect(compactMigration).toContain(
      "create table public.tournament_division_not_held_closures"
    );
    expect(compactMigration).toContain(
      "tournament_bracket_id uuid primary key references public.tournament_brackets(id) on delete restrict"
    );
    expect(compactMigration).toContain(
      "check (reason_code = 'minimum_roster_not_reached')"
    );
    expect(compactMigration).toContain(
      "create trigger tournament_division_not_held_closures_immutable"
    );
    expect(compactMigration).not.toMatch(
      /alter type|create type|add column|create extension|create.*queue|create.*worker/
    );
  });

  it("keeps closure behind one service-role authority", () => {
    expect(closeDivision).toContain(
      "if session_user <> 'postgres' and coalesce(auth.role(), '') <> 'service_role'"
    );
    expect(closeDivision).toContain(
      "p_reason_code text, p_detail text, p_actor_clerk_user_id text"
    );
    expect(compactMigration).toContain(
      "revoke all on function public.close_tournament_division_without_launch( uuid, text, text, text ) from public, anon, authenticated, service_role"
    );
    expect(compactMigration).toContain(
      "grant execute on function public.close_tournament_division_without_launch( uuid, text, text, text ) to service_role"
    );
    expect(compactMigration).not.toMatch(
      /create(?: or replace)? function public\.(?:cancel|void)_tournament\(/
    );
  });

  it("locks lifecycle rows and allows only unlaunched below-readiness closure", () => {
    const tournamentLock = closeDivision.indexOf(
      "where tournament.id = v_tournament_id for update"
    );
    const bracketLock = closeDivision.indexOf(
      "where bracket.id = p_tournament_bracket_id and bracket.tournament_id = v_tournament_id for update"
    );
    const registrationLock = closeDivision.indexOf(
      "order by registration.id for update"
    );
    const closureInsert = closeDivision.indexOf(
      "insert into public.tournament_division_not_held_closures"
    );

    expect(tournamentLock).toBeGreaterThan(-1);
    expect(bracketLock).toBeGreaterThan(tournamentLock);
    expect(registrationLock).toBeGreaterThan(bracketLock);
    expect(closureInsert).toBeGreaterThan(registrationLock);
    expect(closeDivision).toContain("if v_launched_at is not null then");
    expect(closeDivision).toContain(
      "if v_is_ready or v_active_count >= v_required_count then"
    );
    expect(closeDivision).toContain(
      "count(*) filter ( where registration.registration_status = 'approved' )"
    );
    expect(closeDivision).toContain(
      "registration.registration_status = 'waitlisted' and registration.waitlist_offer_status = 'offered'"
    );
  });

  it("rejects every current competitive, accounting, season, and Badge dependency", () => {
    for (const evidence of [
      "public.is_tournament_bracket_regeneration_safe(",
      "from public.match_replay_upload_attempts as replay_attempt",
      "from public.match_dice_rolls as dice_roll",
      "from public.match_participant_outcome_authority as authority",
      "from public.match_game_result_authority as authority",
      "from public.tournament_championship_path_authority as authority",
      "from public.tournament_championship_path_summary_authority as summary",
      "from public.leaderboard_division_settlements as settlement",
      "from public.leaderboard_point_events as event",
      "from public.leaderboard_tournament_season_memberships as membership",
      "from public.player_badge_awards as award",
    ]) {
      expect(closeDivision).toContain(evidence);
    }
    expect(closeDivision).toContain(
      "competitive evidence prevents this division from being marked not held"
    );
    expect(closeDivision).toContain(
      "perform public.reset_unlaunched_tournament_bracket_draft( p_tournament_bracket_id )"
    );
  });

  it("preserves registrations and only terminalizes actionable offers", () => {
    const registrationUpdates = [
      ...closeDivision.matchAll(/update public\.registrations\b/g),
    ];
    const updateStart = closeDivision.indexOf("update public.registrations");
    const updateEnd = closeDivision.indexOf(";", updateStart);
    const update = closeDivision.slice(updateStart, updateEnd);
    const setClause = update.slice(
      update.indexOf(" set ") + 5,
      update.indexOf(" where ")
    );

    expect(registrationUpdates).toHaveLength(1);
    expect(update).toContain("waitlist_offer_status = 'cancelled'");
    expect(update).toContain("waitlist_offer_status = 'offered'");
    expect(setClause).not.toContain("registration_status =");
    expect(setClause).not.toContain("tournament_bracket_id =");
    expect(closeDivision).not.toMatch(
      /(?:insert into|delete from) public\.registrations\b/
    );
    expect(registrationGuard).toContain("'ironclad.account_closure'");
    expect(registrationGuard).toContain(
      "registrations are immutable after a division is not held"
    );
  });

  it("creates one deduplicated lifecycle notification and no Badge or Reveal mutation", () => {
    expect(closeDivision).toContain(
      "'tournament.division_not_held'"
    );
    expect(closeDivision).toContain(
      "on conflict (recipient_clerk_user_id, event_key) where event_key is not null do nothing"
    );
    expect(closeDivision).toContain(
      "'division:%s:registration:%s:not-held'"
    );
    expect(compactMigration).not.toMatch(
      /(?:insert into|update|delete from) public\.player_badge_(?:awards|reveals)\b/
    );
    expect(compactMigration).not.toMatch(
      /(?:insert into|update|delete from) ironclad_private\.badge_reconciliation_targets\b|badge\.unlocked/
    );
    expect(compactMigration).not.toMatch(
      /insert into public\.leaderboard_point_events|insert into public\.leaderboard_tournament_season_memberships/
    );
  });

  it("exposes only public-safe state while protecting the audit row", () => {
    expect(publicProjection).toContain(
      "returns table ( tournament_bracket_id uuid, tournament_id uuid, not_held_at timestamptz, reason_code text )"
    );
    expect(publicProjection).not.toContain("closed_by_clerk_user_id");
    expect(publicProjection).not.toContain("detail");
    expect(publicProjection).not.toContain("registration_count");
    expect(compactMigration).toContain(
      "alter table public.tournament_division_not_held_closures force row level security"
    );
    expect(compactMigration).toContain(
      "revoke all on table public.tournament_division_not_held_closures from public, anon, authenticated, service_role"
    );
    expect(compactMigration).toContain(
      "grant select on table public.tournament_division_not_held_closures to service_role"
    );
    expect(publicPage).toContain(
      'supabase.rpc("get_tournament_division_not_held_states")'
    );
    expect(publicPage).toContain(
      "tournament.participants = ( participantsbytournament.get(row.id) ?? [] ).filter((participant) => !notheldbracketids.has(participant.bracketid))"
    );
    expect(publicPage).toContain(
      "tournament.bracketparticipants = (bracketparticipantsbytournament.get(row.id) ?? []).filter( (participant) => !notheldbracketids.has(participant.bracketid) )"
    );
    expect(publicPage).not.toContain("closed_by_clerk_user_id");
  });

  it("blocks normal lifecycle writers and resolves duplicate-cycle eligibility", () => {
    expect(compactMigration).toContain(
      "create trigger registrations_guard_not_held before insert or update or delete on public.registrations"
    );
    expect(compactMigration).toContain(
      "create trigger tournament_brackets_guard_not_held before update or delete on public.tournament_brackets"
    );
    expect(compactMigration).toContain(
      "create trigger generated_brackets_guard_not_held before insert or update or delete on public.generated_brackets"
    );
    expect(registrationRefresh).toContain(
      "where bracket.tournament_id = v_tournament_id and bracket.launched_at is null and not exists"
    );
    expect(saveTournament).toContain(
      "not exists ( select 1 from public.tournament_division_not_held_closures as closure where closure.tournament_bracket_id = bracket.id )"
    );
    expect(compactMigration).toContain(
      "create trigger tournament_brackets_refresh_registration_after_launch"
    );
    expect(compactMigration).toContain(
      "create trigger tournament_division_not_held_refresh_registration"
    );
  });
});
