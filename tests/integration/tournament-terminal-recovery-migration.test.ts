import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationName = "20260813100000_tournament_terminal_recovery.sql";
const previousMigrationName =
  "20260812121000_late_entry_bonus_non_played_progression.sql";
const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations", migrationName),
  "utf8"
);
const compactMigration = migration.toLowerCase().replace(/\s+/g, " ").trim();

function extractFunction(functionName: string) {
  const markers = [
    `create or replace function public.${functionName}(`,
    `create function public.${functionName}(`,
  ];
  const start = markers.reduce((first, marker) => {
    const index = compactMigration.indexOf(marker);
    return first < 0 || (index >= 0 && index < first) ? index : first;
  }, -1);
  const end = compactMigration.indexOf("$$;", start);

  if (start < 0 || end < 0) {
    throw new Error(`${functionName} was not found in the PR 4 migration.`);
  }

  return compactMigration.slice(start, end + 3);
}

const assignSeason = extractFunction("assign_leaderboard_tournament_season");
const finalizeSeason = extractFunction(
  "finalize_leaderboard_main_season_if_ready"
);
const awardLateEntry = extractFunction("award_leaderboard_late_entry_bonuses");
const assertNotTerminal = extractFunction("assert_tournament_not_terminal");
const assertNotTerminalNowait = extractFunction(
  "assert_tournament_not_terminal_nowait"
);
const terminalTransitionGuard = extractFunction(
  "guard_tournament_terminal_transition"
);
const terminalMutationGuard = extractFunction(
  "guard_terminal_competition_mutation"
);
const lifecycleBoundary = extractFunction(
  "protect_tournament_lifecycle_boundary"
);
const officialCompetition = extractFunction(
  "tournament_has_official_competition"
);
const linkedAdminAdjustment = extractFunction(
  "tournament_has_linked_admin_adjustment"
);
const cancelTournament = extractFunction("cancel_tournament");
const voidTournament = extractFunction("void_tournament");
const processExpiredWaitlist = extractFunction(
  "process_expired_waitlist_offers"
);
const recomputeLifecycle = extractFunction(
  "recompute_tournament_lifecycle_status"
);
const autoApproveResults = extractFunction(
  "auto_approve_expired_match_result_groups"
);
const processDeadlines = extractFunction("process_matchup_deadlines");
const createMatchupNotifications = extractFunction(
  "create_matchup_notifications"
);
const tournamentRecalculation = extractFunction(
  "recalculate_leaderboard_for_tournament"
);
const adminAdjustment = extractFunction("add_leaderboard_admin_adjustment");

describe("tournament terminal recovery migration", () => {
  it("is ordered, transactional, and adds only narrow audit state", () => {
    const migrationNames = readdirSync(
      resolve(process.cwd(), "supabase/migrations")
    ).sort();

    expect(migrationNames.indexOf(previousMigrationName)).toBeGreaterThan(-1);
    expect(migrationNames.indexOf(migrationName)).toBeGreaterThan(
      migrationNames.indexOf(previousMigrationName)
    );
    expect(compactMigration.startsWith("begin;")).toBe(true);
    expect(compactMigration.endsWith("commit;")).toBe(true);
    expect(compactMigration).not.toMatch(
      /create table public\.|create extension|cron\.|schedule\(|create.*job/
    );
    expect(compactMigration).toContain("'cancelled', 'voided'");
    expect(compactMigration).toContain("add column if not exists terminal_at");
    expect(compactMigration).toContain("add column if not exists voided_at");
    expect(compactMigration).toContain(
      "drop constraint if exists leaderboard_tournament_season_memberships_season_event_unique"
    );
    expect(compactMigration).toContain(
      "create unique index leaderboard_tournament_season_memberships_valid_event_unique"
    );
    expect(compactMigration).toContain(
      "where voided_at is null and qualifying_event_number is not null"
    );
    expect(compactMigration).toContain(
      "add column if not exists under_review_tournament_id"
    );
    expect(compactMigration).toContain(
      "revoke select on table public.leaderboard_seasons from anon, authenticated"
    );
    const publicSeasonGrant = compactMigration.slice(
      compactMigration.indexOf("grant select ( id, name, year, season_number"),
      compactMigration.indexOf(
        ") on public.leaderboard_seasons to anon, authenticated"
      )
    );
    expect(publicSeasonGrant).toContain("under_review_at");
    expect(publicSeasonGrant).toContain("under_review_tournament_id");
    expect(publicSeasonGrant).not.toContain("under_review_reason");
    expect(publicSeasonGrant).not.toContain("under_review_by_clerk_user_id");
    expect(compactMigration).toContain(
      "revoke select on table public.tournaments from anon, authenticated"
    );
    const publicTournamentGrant = compactMigration.slice(
      compactMigration.indexOf("grant select ( id, title, slug, format, status"),
      compactMigration.indexOf(") on public.tournaments to anon, authenticated")
    );
    expect(publicTournamentGrant).toContain("terminal_at");
    expect(publicTournamentGrant).not.toContain("terminal_reason");
    expect(publicTournamentGrant).not.toContain(
      "terminated_by_clerk_user_id"
    );
  });

  it("serializes Cancel with late results and refuses factual blockers", () => {
    const tournamentLock = cancelTournament.indexOf(
      "from public.tournaments as tournament where tournament.id = p_tournament_id for update"
    );
    const pointGuard = cancelTournament.indexOf(
      "from public.leaderboard_point_events as event"
    );
    const historyGuard = cancelTournament.indexOf(
      "public.tournament_has_official_competition(p_tournament_id)"
    );
    const transition = cancelTournament.indexOf(
      "update public.tournaments set status = 'cancelled'"
    );

    expect(cancelTournament).toContain(
      "perform public.leaderboard_require_write_access()"
    );
    expect(tournamentLock).toBeGreaterThan(-1);
    expect(pointGuard).toBeGreaterThan(tournamentLock);
    expect(historyGuard).toBeGreaterThan(pointGuard);
    expect(transition).toBeGreaterThan(historyGuard);
    expect(cancelTournament).toContain("bracket.launched_at is not null");
    expect(cancelTournament).toContain("event.tournament_id = p_tournament_id");
    expect(cancelTournament).toContain("event.tournament_bracket_id in");
    expect(cancelTournament).toContain("event.registration_id in");
    expect(cancelTournament).not.toMatch(/delete from|truncate /);

    for (const marker of [
      "tournament.first_completed_at is not null",
      "match.status = 'completed'",
      "match.winner_registration_id is not null",
      "match.official_result_submission_id is not null",
      "submission.status = 'approved'",
      "report_group.finalized_at is not null",
    ]) {
      expect(officialCompetition).toContain(marker);
    }

    expect(assertNotTerminal).toContain("for key share");
    expect(terminalMutationGuard).toContain(
      "perform public.assert_tournament_not_terminal(v_tournament_id)"
    );
    const adjustmentRootLock = adminAdjustment.indexOf(
      "hashtextextended('ironclad:leaderboard:all-time', 0)"
    );
    const adjustmentTerminalCheck = adminAdjustment.indexOf(
      "perform public.assert_tournament_not_terminal_nowait(v_tournament_id)"
    );
    expect(adjustmentRootLock).toBeGreaterThan(-1);
    expect(adjustmentTerminalCheck).toBeGreaterThan(adjustmentRootLock);
    expect(adminAdjustment).toContain("select p_tournament_id as tournament_id");
    expect(adminAdjustment).toContain("bracket.id = p_tournament_bracket_id");
    expect(adminAdjustment).toContain("registration.id = p_registration_id");
    expect(assertNotTerminalNowait).toContain("for key share nowait");
    expect(assertNotTerminalNowait).toContain("when lock_not_available");
    expect(assertNotTerminalNowait).toContain("errcode = '55p03'");
  });

  it("keeps finalized Main frozen and reconciles an eligible Void", () => {
    const rootLock = voidTournament.indexOf(
      "hashtextextended('ironclad:leaderboard:all-time', 0)"
    );
    const tournamentLock = voidTournament.indexOf(
      "'ironclad:leaderboard:tournament:'"
    );
    const finalizedReview = voidTournament.indexOf(
      "v_membership.qualifying_event_number is not null and v_season.finalized_at is not null"
    );
    const underReviewReturn = voidTournament.indexOf(
      "jsonb_build_object('outcome', 'under_review')"
    );
    const adminGuard = voidTournament.indexOf(
      "public.tournament_has_linked_admin_adjustment(p_tournament_id)"
    );
    const terminalTransition = voidTournament.indexOf(
      "update public.tournaments set status = 'voided'"
    );
    const membershipInvalidation = voidTournament.indexOf(
      "update public.leaderboard_tournament_season_memberships"
    );
    const derivedDelete = voidTournament.indexOf(
      "delete from public.leaderboard_point_events as event"
    );
    const bonusRebuild = voidTournament.indexOf(
      "public.award_leaderboard_late_entry_bonuses("
    );
    const seasonRecalculation = voidTournament.indexOf(
      "public.recalculate_leaderboard_for_season("
    );

    expect(rootLock).toBeGreaterThan(-1);
    expect(tournamentLock).toBeGreaterThan(rootLock);
    expect(voidTournament).toContain("for update nowait");
    expect(voidTournament).toContain("when lock_not_available");
    expect(voidTournament).toContain("errcode = '55p03'");
    expect(finalizedReview).toBeGreaterThan(tournamentLock);
    expect(underReviewReturn).toBeGreaterThan(finalizedReview);
    expect(adminGuard).toBeGreaterThan(underReviewReturn);
    expect(terminalTransition).toBeGreaterThan(adminGuard);
    expect(membershipInvalidation).toBeGreaterThan(terminalTransition);
    expect(derivedDelete).toBeGreaterThan(membershipInvalidation);
    expect(bonusRebuild).toBeGreaterThan(derivedDelete);
    expect(seasonRecalculation).toBeGreaterThan(bonusRebuild);
    expect(voidTournament).toContain("under_review_at = clock_timestamp()");
    expect(voidTournament).toContain("voided_at = clock_timestamp()");

    const deletion = voidTournament.slice(derivedDelete, bonusRebuild);
    expect(deletion).toContain("event.source in ('system', 'recalculation')");
    expect(deletion).toContain("event.tournament_id = p_tournament_id");
    expect(deletion).toContain("event.tournament_bracket_id in");
    expect(deletion).toContain("event.registration_id in");
    expect(deletion).not.toContain("source = 'admin'");
    expect(linkedAdminAdjustment).toContain("event.source = 'admin'");
    expect(linkedAdminAdjustment).toContain("event.tournament_id = p_tournament_id");
    expect(linkedAdminAdjustment).toContain("event.tournament_bracket_id in");
    expect(linkedAdminAdjustment).toContain("event.registration_id in");
  });

  it("retains invalid memberships and fills the smallest free Main slot", () => {
    expect(assignSeason).toContain("if v_existing.voided_at is not null");
    expect(assignSeason).toContain("generate_series(1, 6)");
    expect(assignSeason).toContain(
      "membership.qualifying_event_number = slot.event_number"
    );
    expect(assignSeason).toContain("membership.voided_at is null");
    expect(assignSeason).not.toContain("(count(*) + 1)::smallint");
    expect(finalizeSeason).toContain("membership.voided_at is null");
    expect(
      awardLateEntry.match(/membership\.voided_at is null/g)?.length ?? 0
    ).toBeGreaterThanOrEqual(4);
    expect(awardLateEntry).toContain("tournament.status = 'completed'");
  });

  it("makes competitive tables terminal and keeps workers inert", () => {
    for (const table of [
      "registrations",
      "tournament_brackets",
      "generated_brackets",
      "bracket_rounds",
      "tournament_matches",
      "tournament_standings",
      "match_result_submissions",
      "match_result_report_groups",
    ]) {
      expect(compactMigration).toContain(
        `before insert or update or delete on public.${table}`
      );
    }

    expect(processExpiredWaitlist).toContain(
      "tournament.status not in ('cancelled', 'voided')"
    );
    expect(recomputeLifecycle).toContain(
      "v_current_status in ('cancelled', 'voided')"
    );
    expect(autoApproveResults).toContain(
      "tournament.status not in ('cancelled', 'voided')"
    );
    expect(processDeadlines).toContain("'ironclad.terminal_worker_skip'");
    expect(createMatchupNotifications).toContain(
      "for key share of tournament"
    );
    expect(createMatchupNotifications).toContain(
      "v_tournament_status in ('cancelled', 'voided')"
    );
    expect(tournamentRecalculation).toContain("if v_status <> 'completed'");
    expect(lifecycleBoundary).toMatch(
      /'ironclad\.tournament_terminal_transition'.*?= 'on' and \( session_user = 'postgres' or coalesce\(auth\.role\(\), ''\) = 'service_role' \)/
    );
    expect(lifecycleBoundary).toContain("and not v_terminal_transition");
  });

  it("exposes only administrator RPCs and keeps helpers private", () => {
    expect(terminalTransitionGuard).toContain(
      "session_user = 'postgres' or coalesce(auth.role(), '') = 'service_role'"
    );
    expect(terminalTransitionGuard).toMatch(
      /'ironclad\.tournament_terminal_transition'.*?= 'on' and \( session_user = 'postgres' or coalesce\(auth\.role\(\), ''\) = 'service_role' \)/
    );
    expect(terminalTransitionGuard).toMatch(
      /'ironclad\.account_closure'.*?= 'on' and \( session_user = 'postgres' or coalesce\(auth\.role\(\), ''\) = 'service_role' \)/
    );
    expect(terminalMutationGuard).toContain(
      "v_trusted_caller boolean := session_user = 'postgres' or coalesce(auth.role(), '') = 'service_role'"
    );
    expect(terminalMutationGuard).toContain("if v_trusted_caller and (");

    for (const signature of [
      "public.cancel_tournament(uuid, text, text)",
      "public.void_tournament(uuid, text, text)",
    ]) {
      expect(compactMigration).toContain(
        `revoke all on function ${signature} from public, anon, authenticated`
      );
      expect(compactMigration).toContain(
        `grant execute on function ${signature} to service_role`
      );
    }

    for (const signature of [
      "public.assert_tournament_not_terminal(uuid)",
      "public.tournament_has_official_competition(uuid)",
      "public.tournament_has_linked_admin_adjustment(uuid)",
      "public.guard_terminal_competition_mutation()",
    ]) {
      expect(compactMigration).toContain(
        `revoke all on function ${signature} from public, anon, authenticated, service_role`
      );
    }

    expect(cancelTournament).toContain("set search_path = pg_catalog");
    expect(voidTournament).toContain("set search_path = pg_catalog");
  });
});
