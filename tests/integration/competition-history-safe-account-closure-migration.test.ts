import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationName =
  "20260813101000_competition_history_safe_account_closure.sql";
const previousMigrationName = "20260813100000_tournament_terminal_recovery.sql";
const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations", migrationName),
  "utf8"
);
const compactMigration = migration.toLowerCase().replace(/\s+/g, " ").trim();
const publicLeaderboardSource = readFileSync(
  resolve(process.cwd(), "lib/leaderboard/public.ts"),
  "utf8"
);
const leaderboardComponentSource = readFileSync(
  resolve(process.cwd(), "components/LeaderboardExperience.tsx"),
  "utf8"
);
const tournamentsPageSource = readFileSync(
  resolve(process.cwd(), "app/tournaments/page.tsx"),
  "utf8"
);

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
    throw new Error(`${functionName} was not found in the account migration.`);
  }

  return compactMigration.slice(start, end + 3);
}

function extractView(viewName: string) {
  const markers = [
    `create or replace view public.${viewName}`,
    `create view public.${viewName}`,
  ];
  const start = markers.reduce((first, marker) => {
    const index = compactMigration.indexOf(marker);
    return first < 0 || (index >= 0 && index < first) ? index : first;
  }, -1);
  const end = compactMigration.indexOf(";", start);

  if (start < 0 || end < 0) {
    throw new Error(`${viewName} was not found in the account migration.`);
  }

  return compactMigration.slice(start, end + 1);
}

const hasHistory = extractFunction(
  "player_has_authoritative_competition_history"
);
const deleteGuard = extractFunction(
  "guard_player_authoritative_history_delete"
);
const closureStateGuard = extractFunction("guard_player_account_closure_state");
const protectCoh3Identity = extractFunction("protect_player_coh3_profile_id");
const protectSteamIdentity = extractFunction("protect_player_steam_id64");
const protectRelicIdentity = extractFunction(
  "protect_player_relic_verification"
);
const enforceRegistrationElo = extractFunction(
  "enforce_registration_elo_eligibility"
);
const protectRegistrationSnapshot = extractFunction(
  "protect_relic_registration_snapshot"
);
const closeAccount = extractFunction("close_ironclad_player_account");
const publicProfiles = extractView("public_player_profiles");
const publicSeason = extractView("leaderboard_public_season_standings");
const publicAllTime = extractView("leaderboard_public_all_time_standings");
const publicChampions = extractView("leaderboard_public_season_champions");
const finalizedAdjustmentGuard = extractFunction(
  "guard_finalized_main_admin_adjustment"
);

describe("competition-history-safe account closure migration", () => {
  it("is the second ordered PR 4 migration and remains narrowly transactional", () => {
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
      "alter table public.players add column if not exists account_closed_at timestamptz"
    );
    expect(compactMigration).not.toMatch(
      /create table public\.|create extension|cron\.|schedule\(|create\s+(?:cron\.)?job\b|pseudonym_registry/
    );
  });

  it("recognizes every current authoritative history path without retaining empty rows", () => {
    for (const directPlayerHistory of [
      "public.leaderboard_point_events",
      "public.leaderboard_player_season_stats",
      "public.leaderboard_player_all_time_stats",
      "public.leaderboard_season_champions",
    ]) {
      expect(hasHistory).toContain(directPlayerHistory);
      expect(hasHistory).toContain("player_id = p_player_id");
    }

    expect(hasHistory).toContain(
      "bracket.id = registration.tournament_bracket_id and bracket.tournament_id = registration.tournament_id"
    );
    expect(hasHistory).toContain("registration.registration_status = 'approved'");
    expect(hasHistory).toContain("bracket.launched_at is not null");

    for (const reference of [
      "match.player_one_registration_id",
      "match.player_two_registration_id",
      "match.winner_registration_id",
      "standing.registration_id = registration.id",
      "submission.submitted_by_registration_id",
      "submission.claimed_winner_registration_id",
      "report.submitted_by_registration_id",
      "report.opponent_registration_id",
      "report.winner_registration_id",
      "report.confirmed_by_registration_id",
      "report.disputed_by_registration_id",
      "report.no_show_reported_by_registration_id",
      "report.no_show_registration_id",
    ]) {
      expect(hasHistory).toContain(reference);
    }

    expect(deleteGuard).toContain(
      "if public.player_has_authoritative_competition_history(old.id)"
    );
    expect(compactMigration).toContain(
      "create trigger players_guard_authoritative_history_delete before delete on public.players"
    );
  });

  it("uses one locked service-role RPC for delete-or-pseudonymize outcomes", () => {
    const playerLock = closeAccount.indexOf(
      "where player.clerk_user_id = v_clerk_user_id for update"
    );
    const historyDecision = closeAccount.indexOf(
      "public.player_has_authoritative_competition_history(v_player.id)"
    );
    const closureBoundary = closeAccount.indexOf(
      "'ironclad.account_closure', 'on'"
    );
    const noHistoryBranch = closeAccount.indexOf("if not v_has_history then");
    const retainedUpdate = closeAccount.lastIndexOf("update public.players");

    expect(closeAccount).toContain("security definer");
    expect(closeAccount).toContain("set search_path = pg_catalog");
    expect(closeAccount).toContain(
      "session_user <> 'postgres' and coalesce(auth.role(), '') <> 'service_role'"
    );
    expect(playerLock).toBeGreaterThan(-1);
    expect(historyDecision).toBeGreaterThan(playerLock);
    expect(closureBoundary).toBeGreaterThan(historyDecision);
    expect(noHistoryBranch).toBeGreaterThan(closureBoundary);
    expect(retainedUpdate).toBeGreaterThan(noHistoryBranch);
    expect(closeAccount).toContain("jsonb_build_object('outcome', 'not_found')");
    expect(closeAccount).toContain("jsonb_build_object('outcome', 'deleted')");
    expect(closeAccount).toContain(
      "jsonb_build_object('outcome', 'pseudonymized')"
    );
    expect(closeAccount).toContain("delete from public.players");
    expect(closeAccount).not.toContain("insert into public.players");
    expect(closureStateGuard).toContain("'ironclad.account_closure'");
    expect(closureStateGuard).toContain(
      "closed historical player identity is immutable"
    );
  });

  it("binds every caller-settable closure bypass to a trusted database role", () => {
    const trustedClosurePattern =
      /current_setting\('ironclad\.account_closure', true\).*?= 'on' and \( session_user = 'postgres' or coalesce\(auth\.role\(\), ''\) = 'service_role' \)/;

    for (const guardedFunction of [
      closureStateGuard,
      protectCoh3Identity,
      protectRelicIdentity,
      enforceRegistrationElo,
      protectRegistrationSnapshot,
      finalizedAdjustmentGuard,
    ]) {
      expect(guardedFunction).toMatch(trustedClosurePattern);
    }

    expect(protectSteamIdentity).toContain(
      "coalesce(auth.role(), '') <> 'service_role' and not ( coalesce(current_setting('ironclad.account_closure', true), '') = 'on' and session_user = 'postgres' )"
    );
    expect(closeAccount).toContain(
      "session_user <> 'postgres' and coalesce(auth.role(), '') <> 'service_role'"
    );
    expect(finalizedAdjustmentGuard).toContain("tg_op = 'update'");
    expect(finalizedAdjustmentGuard).toContain(
      "new.created_by_clerk_user_id is distinct from old.created_by_clerk_user_id"
    );
    for (const protectedField of [
      "id",
      "season_id",
      "tournament_id",
      "tournament_bracket_id",
      "registration_id",
      "player_id",
      "bracket_type",
      "points",
      "event_type",
      "description",
      "source",
      "created_at",
    ]) {
      expect(finalizedAdjustmentGuard).toContain(
        `new.${protectedField} is not distinct from old.${protectedField}`
      );
    }
    expect(finalizedAdjustmentGuard).toContain(
      "finalized main/pro standings cannot be adjusted"
    );
  });

  it("neutralizes active identity while retaining factual competition values", () => {
    expect(closeAccount).toContain(
      "v_closed_identity := 'deleted:' || pg_catalog.gen_random_uuid()::text"
    );

    for (const field of [
      "clerk_user_id = v_closed_identity",
      "display_name = 'former competitor'",
      "in_game_name = 'former competitor'",
      "discord_username = null",
      "steam_username = null",
      "coh3_player_card_url = null",
      "country = null",
      "region = null",
      "timezone = null",
      "current_elo = null",
      "avatar_url = null",
      "bio = null",
      "profile_completed = false",
      "public_profile_enabled = false",
      "discord_public_enabled = false",
      "coh3_profile_id = null",
      "steam_id64 = null",
      "relic_verified_elo = null",
      "relic_verified_faction = null",
      "relic_verified_division = null",
      "relic_elo_calculation_version = null",
      "relic_elo_verified_at = null",
      "relic_elo_last_attempt_at = null",
      "account_closed_at = clock_timestamp()",
    ]) {
      expect(closeAccount).toContain(field);
    }

    const registrationUpdate = closeAccount.indexOf(
      "update public.registrations"
    );
    const registrationWhere = closeAccount.indexOf(
      "where profile_id = v_player.id",
      registrationUpdate
    );
    const registrationSet = closeAccount.slice(
      registrationUpdate,
      registrationWhere
    );

    expect(registrationSet).toContain("player_name = 'former competitor'");
    expect(registrationSet).toContain("elo_verification_payload = null");
    expect(registrationSet).not.toMatch(
      /profile_id\s*=|registration_status\s*=|submitted_elo\s*=|elo_verified_elo\s*=|tournament_id\s*=|tournament_bracket_id\s*=/
    );

    for (const auditTable of [
      "public.match_result_submissions",
      "public.match_result_report_groups",
      "public.tournament_matches",
      "public.generated_brackets",
      "public.leaderboard_point_events",
      "public.leaderboard_recalculation_runs",
      "public.platform_settings",
      "public.tournament_deletion_jobs",
      "public.tournaments",
      "public.leaderboard_tournament_season_memberships",
      "public.leaderboard_seasons",
    ]) {
      expect(closeAccount).toContain(`update ${auditTable}`);
    }
  });

  it("preserves referenced replay and official history rows byte-for-byte", () => {
    expect(closeAccount).not.toMatch(
      /replay_storage_path|screenshot_storage_path|delete from public\.match_result_submissions|delete from public\.match_result_report_groups|delete from public\.tournament_matches|delete from public\.tournament_standings|delete from public\.leaderboard_point_events|delete from public\.leaderboard_player_season_stats|delete from public\.leaderboard_player_all_time_stats|delete from public\.leaderboard_season_champions/
    );
    expect(closeAccount).toContain("delete from public.notifications");
    expect(closeAccount).toContain(
      "position(v_clerk_user_id in notification.metadata::text) > 0"
    );
    expect(closeAccount).not.toContain(
      "notification.metadata::text like '%' || v_clerk_user_id || '%'"
    );
    expect(closeAccount).toContain("delete from public.profiles");
  });

  it("keeps closed competitors out of profiles and masks them in public history", () => {
    expect(publicProfiles).toContain("player.public_profile_enabled = true");
    expect(publicProfiles).toContain("player.account_closed_at is null");

    for (const view of [publicSeason, publicAllTime]) {
      expect(view).toContain(
        "when player.account_closed_at is null then"
      );
      expect(view).toContain("else null::uuid end as player_id");
      expect(view).toContain("else 'former competitor' end as display_name");
      expect(view).toContain("else 'former competitor' end as in_game_name");
      expect(view).toContain("else null end as country");
      expect(view).toContain("else null end as region");
      expect(view).toContain("else null end as current_elo");
      expect(view).toContain("null::text as avatar_url");
      expect(view).toContain("row_number() over (");
      expect(view).toContain("as display_order");
      expect(view).toContain(
        "where player.public_profile_enabled or player.account_closed_at is not null"
      );
      expect(view).not.toMatch(/clerk_user_id|steam_id64|discord_username/);
    }

    expect(publicChampions).toContain(
      "else 'former-champion:' || md5(champion.id::text) end as id"
    );
    expect(publicChampions).toContain("else null::uuid end as player_id");
    expect(publicChampions).toContain(
      "else 'former competitor' end as player_name"
    );
    expect(publicChampions).toContain("else null end as country");
    expect(publicSeason).toContain(
      "partition by season_stats.season_id, season_stats.bracket_type order by season_stats.player_id ) as display_order"
    );
    expect(publicAllTime).toContain(
      "partition by all_time.bracket_type order by all_time.player_id ) as display_order"
    );
    expect(compactMigration).toContain(
      "revoke select on table public.leaderboard_seasons, public.leaderboard_player_season_stats, public.leaderboard_player_all_time_stats, public.leaderboard_season_champions from anon, authenticated"
    );
    expect(compactMigration).toContain(
      "revoke select ( id, name, year, season_number, start_date, end_date, is_active, created_at, updated_at, finalized_at, under_review_at, under_review_tournament_id ) on public.leaderboard_seasons from anon, authenticated"
    );
  });

  it("uses sanitized public sources and never creates closed-player links", () => {
    expect(publicLeaderboardSource).toContain(
      '.from("leaderboard_public_season_champions")'
    );
    expect(publicLeaderboardSource).not.toContain(
      '.from("leaderboard_season_champions")'
    );
    expect(publicLeaderboardSource).not.toContain('.from("leaderboard_seasons")');
    expect(
      publicLeaderboardSource.match(/playerId: string \| null;/g)
    ).toHaveLength(2);
    expect(publicLeaderboardSource).toContain(
      '(left.playerId ?? "").localeCompare(right.playerId ?? "")'
    );
    expect(publicLeaderboardSource).toContain(
      '(left.playerId ?? "").localeCompare(right.playerId ?? "") ||\n    left.displayOrder - right.displayOrder'
    );
    expect(publicLeaderboardSource).toContain(
      "return playerId && hasAvatar ? `/players/${playerId}/avatar` : null;"
    );

    expect(leaderboardComponentSource).toContain("if (!playerId)");
    expect(leaderboardComponentSource).toContain(
      "return <div className={className}>{children}</div>;"
    );
    expect(leaderboardComponentSource).toContain(
      "<Link href={`/players/${playerId}`} className={className}>"
    );
    expect(leaderboardComponentSource).toContain(
      'key={row.playerId ?? `former-${row.displayOrder}`}'
    );
    expect(leaderboardComponentSource).toContain(
      'row.playerId ?? `former-${row.displayOrder}`'
    );
    expect(leaderboardComponentSource).toContain(
      "left.playerName.localeCompare(right.playerName) ||\n    left.displayOrder - right.displayOrder"
    );
    expect(leaderboardComponentSource).toContain("key={champion.id}");
  });

  it("masks retained registration ELO snapshots for closed competitors", () => {
    expect(tournamentsPageSource).toContain(
      'registration.clerk_user_id.startsWith("deleted:")'
    );
    expect(tournamentsPageSource).toMatch(
      /elo:\s*isClosedCompetitor\s*\?\s*0\s*:\s*registration\.elo_verification_source/
    );
  });

  it("keeps helpers private and grants only the trusted closure RPC", () => {
    for (const signature of [
      "public.player_has_authoritative_competition_history(uuid)",
      "public.guard_player_authoritative_history_delete()",
      "public.guard_player_account_closure_state()",
    ]) {
      expect(compactMigration).toContain(
        `revoke all on function ${signature} from public, anon, authenticated, service_role`
      );
    }

    expect(compactMigration).toContain(
      "revoke all on function public.close_ironclad_player_account(text) from public, anon, authenticated"
    );
    expect(compactMigration).toContain(
      "grant execute on function public.close_ironclad_player_account(text) to service_role"
    );
  });
});
