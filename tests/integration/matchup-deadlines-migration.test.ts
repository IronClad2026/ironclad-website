import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260808100000_matchup_deadlines_double_forfeit.sql"
  ),
  "utf8"
);
const compactMigration = migration.toLowerCase().replace(/\s+/g, " ").trim();
const hardeningMigrationName =
  "20260810100000_harden_matchup_core_search_paths.sql";
const hardeningMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations", hardeningMigrationName),
  "utf8"
);
const compactHardeningMigration = hardeningMigration
  .toLowerCase()
  .replace(/\s+/g, " ")
  .trim();

function canonicalizeFunctionIdentities(sql: string) {
  return sql
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .replace(/,\s*/g, ",");
}

const canonicalMigration = canonicalizeFunctionIdentities(compactMigration);
const canonicalHardeningMigration = canonicalizeFunctionIdentities(
  compactHardeningMigration
);

const hardenedCoreFunctions = [
  {
    coreName: "create_match_result_report_group_without_matchup_deadline",
    wrapperName: "create_match_result_report_group",
    signature: "uuid, text, uuid, integer, integer, uuid[], text",
  },
  {
    coreName: "submit_match_no_show_report_without_matchup_deadline",
    wrapperName: "submit_match_no_show_report",
    signature: "uuid, text, uuid, text",
  },
  {
    coreName: "admin_finalize_match_result_report_group_core",
    wrapperName: "admin_finalize_match_result_report_group",
    signature: "uuid, text, text, text, integer, integer, uuid",
  },
  {
    coreName: "review_match_series_result_without_deadline_restore",
    wrapperName: "review_match_series_result",
    signature: "uuid, text, text, text",
  },
  {
    coreName: "admin_reset_tournament_match_without_deadline_outcomes",
    wrapperName: "admin_reset_tournament_match",
    signature: "uuid, text",
  },
  {
    coreName: "recalculate_leaderboard_for_season_without_outcome_filtering",
    wrapperName: "recalculate_leaderboard_for_season",
    signature: "uuid, text",
  },
  {
    coreName: "recalculate_leaderboard_for_tournament_without_matchup_outcomes",
    wrapperName: "recalculate_leaderboard_for_tournament",
    signature: "uuid, text",
  },
] as const;

function extractFunction(functionName: string) {
  const marker = `create or replace function public.${functionName}(`;
  const createIndex = compactMigration.indexOf(marker);
  const endIndex = compactMigration.indexOf("$$;", createIndex);

  if (createIndex < 0 || endIndex < 0) {
    throw new Error(`${functionName} was not found in the deadline migration.`);
  }

  return compactMigration.slice(createIndex, endIndex + 3);
}

describe("matchup deadlines and no-winner progression migration", () => {
  it("adds only the narrow activation, deadline, ruling, extension, and hold state", () => {
    expect(compactMigration.startsWith("begin;")).toBe(true);
    expect(compactMigration.endsWith("commit;")).toBe(true);

    for (const column of [
      "activation_version",
      "activated_at",
      "deadline_at",
      "outcome_type",
      "deadline_ruled_at",
      "extension_minutes",
      "extension_reason",
      "extended_at",
      "extended_by_clerk_user_id",
      "hold_started_at",
      "hold_released_at",
      "hold_reason",
      "held_by_clerk_user_id",
    ]) {
      expect(compactMigration).toContain(`add column if not exists ${column}`);
    }

    for (const outcome of [
      "deadline_double_forfeit",
      "automatic_bye",
      "empty_feeder",
    ]) {
      expect(compactMigration).toContain(`'${outcome}'`);
    }

    expect(compactMigration).toContain(
      "add column if not exists activation_version integer not null default 0"
    );
    expect(compactMigration).not.toContain("deadline_version");
    expect(compactMigration).not.toContain("reminder_one_sent_at");
    expect(compactMigration).not.toContain("reminder_two_sent_at");
    expect(compactMigration).not.toContain("confirmation_deadline_at = deadline_at");
    expect(compactMigration).not.toContain("email_status");
    expect(compactMigration).not.toContain("email_delivery");
    expect(compactMigration).toContain(
      "outcome_type = 'automatic_bye' and activation_version = 0"
    );
    expect(compactMigration).toContain(
      "num_nonnulls( player_one_registration_id, player_two_registration_id ) = 1"
    );
    expect(compactMigration).toContain(
      "winner_registration_id = coalesce( player_one_registration_id, player_two_registration_id )"
    );
    expect(compactMigration).toContain(
      "extension_minutes is not null and extension_minutes between 1 and 2880"
    );
  });

  it("makes canonical in-app identities unique without rewriting legacy notifications", () => {
    const clientMutationGuard = extractFunction(
      "protect_notification_client_mutation"
    );
    const canonicalCreation = extractFunction("create_matchup_notifications");

    expect(compactMigration).toContain(
      "alter table public.notifications add column if not exists event_key text"
    );
    expect(compactMigration).toContain(
      "add column if not exists in_app_hidden_at timestamptz"
    );
    expect(compactMigration).toContain(
      "on public.notifications(recipient_clerk_user_id, event_key) where event_key is not null"
    );

    for (const eventType of [
      "match.ready",
      "match.deadline_reminder",
      "match.deadline_updated",
      "match.deadline_ruling",
      "match.automatic_advance",
    ]) {
      expect(compactMigration).toContain(`'${eventType}'`);
    }

    expect(compactMigration).toContain("on conflict");
    expect(compactMigration).toContain("event_key");
    expect(compactMigration).not.toContain("recipient_clerk_user_id ||");
    expect(compactMigration).not.toContain("clerk_user_id || event_key");
    expect(clientMutationGuard).toContain("security invoker");
    expect(clientMutationGuard).toContain("current_user = 'postgres'");
    expect(clientMutationGuard).toContain(
      "old.event_key is distinct from new.event_key"
    );
    expect(clientMutationGuard).toContain(
      "old.in_app_hidden_at is not null and new.in_app_hidden_at is null"
    );
    expect(canonicalCreation).toContain(
      "select match.* into v_match from public.tournament_matches as match"
    );
    expect(canonicalCreation).not.toContain("into v_match,");
  });

  it("activates matches once with database time and a full seven-day window", () => {
    const activation = extractFunction("activate_tournament_match_if_ready");
    const launch = extractFunction("launch_tournament_division");
    const officialResult = extractFunction("apply_official_match_result");

    expect(activation).toContain("clock_timestamp()");
    expect(activation).toContain("interval '7 days'");
    expect(activation).toContain("status = 'in_progress'");
    expect(activation).toContain("activation_version = v_activation_version");
    expect(activation).toContain("activated_at = v_activated_at");
    expect(activation).toContain(
      "deadline_at = v_activated_at + interval '7 days'"
    );
    expect(activation).toContain("v_launched_at is null");
    expect(activation).toContain("v_match.player_one_registration_id is null");
    expect(activation).toContain("v_match.player_two_registration_id is null");
    expect(activation).toContain("match.ready");
    expect(launch).toContain("activate_tournament_match_if_ready");
    expect(officialResult).toContain("status = 'completed'");
    expect(officialResult).toContain("winner_registration_id");
    expect(officialResult).toContain("reconcile");
  });

  it("uses the strict database deadline boundary for normal and no-show reports", () => {
    const normalReport = extractFunction("create_match_result_report_group");
    const noShowReport = extractFunction("submit_match_no_show_report");

    for (const submission of [normalReport, noShowReport]) {
      expect(submission).toContain("for update");
      expect(submission).toContain("clock_timestamp()");
      expect(submission).toContain("deadline_at");
      expect(submission).toContain(">=");
      expect(submission).toContain("status <> 'in_progress'");
    }

    expect(compactMigration).not.toContain("new date(");
    expect(compactMigration).not.toContain("now() < deadline_at");
  });

  it("protects every unresolved result, dispute, no-show, and review state", () => {
    const processor = extractFunction("process_matchup_deadlines");

    expect(processor).toContain("match_result_report_groups");
    expect(processor).toContain("match_result_submissions");
    for (const protectedStatus of [
      "pending_confirmation",
      "disputed",
      "under_review",
      "pending",
    ]) {
      expect(processor).toContain(`'${protectedStatus}'`);
    }
    expect(processor).toContain("status = 'in_progress'");
    expect(processor).toContain("official_result_submission_id is not null");
    expect(processor).toContain("hold_started_at is not null");
    expect(processor).toContain("hold_released_at is null");
  });

  it("restores review time without consuming another activation or reminder", () => {
    const adminReview = extractFunction(
      "admin_finalize_match_result_report_group"
    );

    expect(adminReview).toContain("deadline_at");
    expect(adminReview).toContain("clock_timestamp()");
    expect(adminReview).toContain("created_at");
    expect(adminReview).toContain("status = 'in_progress'");
    expect(adminReview).not.toContain("activation_version = activation_version + 1");
    expect(adminReview).not.toContain("match.ready");
  });

  it("enforces one bounded pre-deadline extension with an idempotent player event", () => {
    const extension = extractFunction("extend_tournament_match_deadline");

    expect(extension).toContain("for update");
    expect(extension).toContain("clock_timestamp()");
    expect(extension).toContain(">= v_match.deadline_at");
    expect(extension).toContain("p_extension_minutes < 1");
    expect(extension).toContain("p_extension_minutes > 2880");
    expect(extension).toContain("btrim(p_reason)");
    expect(extension).toContain("v_match.extension_minutes is not null");
    expect(extension).toContain(
      "v_deadline_at := v_match.deadline_at + make_interval(mins => p_extension_minutes)"
    );
    expect(extension).toContain("deadline_at = v_deadline_at");
    expect(extension).toContain("match.deadline_updated");
    expect(extension).toContain("extension");
  });

  it("enforces one bounded hold and restores the exact remaining time on release", () => {
    const hold = extractFunction("hold_tournament_match_deadline");
    const release = extractFunction("release_tournament_match_deadline");

    expect(hold).toContain("for update");
    expect(hold).toContain("clock_timestamp()");
    expect(hold).toContain(">= v_match.deadline_at");
    expect(hold).toContain("btrim(p_reason)");
    expect(hold).toContain("v_match.hold_started_at is not null");
    expect(hold).toContain("match.deadline_updated");

    expect(release).toContain("for update");
    expect(release).toContain("v_match.hold_started_at is null");
    expect(release).toContain("v_match.hold_released_at is not null");
    expect(release).toContain(
      "v_deadline_at := v_match.deadline_at + (v_released_at - v_match.hold_started_at)"
    );
    expect(release).toContain("deadline_at = v_deadline_at");
    expect(release).toContain("match.deadline_updated");
    expect(release).toContain("resume");
  });

  it("uses exclusive 72-hour and 24-hour reminder windows with terminal priority", () => {
    const processor = extractFunction("process_matchup_deadlines");

    expect(processor).toContain("interval '72 hours'");
    expect(processor).toContain("interval '24 hours'");
    expect(processor).toContain("match.deadline_reminder");
    expect(processor).toContain("reminderordinal");
    expect(processor).toContain("deadline_at >");
    expect(processor).toContain("for update of match skip locked");
    expect(processor).toContain(
      "greatest(1, least(coalesce(p_limit, 100), 500))"
    );

    const rulingIndex = processor.indexOf("deadline_double_forfeit");
    const reminderTwoIndex = processor.indexOf("reminderordinal", rulingIndex);
    expect(rulingIndex).toBeGreaterThan(-1);
    expect(reminderTwoIndex).toBeGreaterThan(rulingIndex);
  });

  it("records an atomic idempotent double forfeit without a fabricated result", () => {
    const processor = extractFunction("process_matchup_deadlines");

    expect(processor).toContain("clock_timestamp() >=");
    expect(processor).toContain("deadline_double_forfeit");
    expect(processor).toContain("status = 'completed'");
    expect(processor).toContain("winner_registration_id = null");
    expect(processor).toContain("player_one_score = null");
    expect(processor).toContain("player_two_score = null");
    expect(processor).toContain("deadline_ruled_at");
    expect(processor).toContain("match.deadline_ruling");
  });

  it("resolves one-player byes and zero-player feeders through existing topology", () => {
    expect(compactMigration).toContain("automatic_bye");
    expect(compactMigration).toContain("empty_feeder");
    expect(compactMigration).toContain("ceil(");
    expect(compactMigration).toContain("round_number + 1");
    expect(compactMigration).toContain("match.automatic_advance");

    const reconciliation = extractFunction("reconcile_downstream_match");
    expect(reconciliation).toContain(
      "automatic-advance:left:%s:%s:%s:right:%s:%s:%s"
    );
    expect(reconciliation).toContain("v_left.activation_version");
    expect(reconciliation).toContain("v_left.updated_at");
    expect(reconciliation).toContain("v_right.activation_version");
    expect(reconciliation).toContain("v_right.updated_at");

    const completion = extractFunction("is_generated_bracket_complete");
    expect(completion).toContain("status = 'completed'");
    expect(completion).toContain("winner_registration_id is not null");
    expect(completion).toContain(
      "outcome_type in ( 'deadline_double_forfeit', 'empty_feeder' )"
    );
    expect(completion).not.toContain(
      "outcome_type in ( 'deadline_double_forfeit', 'automatic_bye', 'empty_feeder' )"
    );
  });

  it("keeps byes out of played-match statistics while preserving progression and champions", () => {
    const leaderboard = extractFunction("recalculate_leaderboard_for_tournament");
    const season = extractFunction("recalculate_leaderboard_for_season");

    expect(leaderboard).toContain("outcome_type");
    expect(leaderboard).toContain("automatic_bye");
    expect(leaderboard).toContain("round_passed");
    expect(leaderboard).toContain("tournament_win");
    expect(leaderboard).toContain("deadline_double_forfeit");
    expect(compactMigration).toContain(
      "is_registration_confirmed_no_show_for_leaderboard"
    );
    expect(season).toContain("match.status = 'completed'");
    expect(season).toContain("match.outcome_type is null");
    expect(season).toContain("matches_played =");
    expect(season).toContain("matches_won =");
    expect(season).toContain("matches_lost =");
    expect(season).toContain("win_rate =");
    expect(season).toContain("recalculate_leaderboard_all_time");
  });

  it("reopens only safe completed matches with a fresh activation identity", () => {
    const reset = extractFunction("admin_reset_tournament_match");

    expect(reset).toContain("activation_version");
    expect(reset).toContain("interval '7 days'");
    expect(reset).toContain("automatic_bye");
    expect(reset).toContain("empty_feeder");
    expect(reset).toContain("match.ready");
    expect(reset).toContain("extension");
    expect(reset).toContain("hold");
    expect(reset).not.toContain("extended_at = null");
    expect(reset).not.toContain("hold_started_at = null");
  });

  it("schedules one bounded internal processor and exposes no privileged browser RPC", () => {
    expect(compactMigration).toContain(
      "create extension if not exists pg_cron"
    );
    expect(compactMigration).toContain(
      "ironclad-process-matchup-deadlines"
    );
    expect(compactMigration).toContain(
      "public.process_matchup_deadlines(100)"
    );

    for (const functionName of [
      "extend_tournament_match_deadline",
      "hold_tournament_match_deadline",
      "release_tournament_match_deadline",
      "process_matchup_deadlines",
    ]) {
      expect(compactMigration).toContain(
        `revoke all on function public.${functionName}(`
      );
    }

    expect(compactMigration).not.toContain(
      "grant execute on function public.process_matchup_deadlines(integer) to authenticated"
    );
    expect(compactMigration).not.toContain("vercel");
    expect(compactMigration).not.toContain("pg_net");
  });

  it("preserves only the existing authenticated replay-proof match scope", () => {
    expect(compactMigration).toContain(
      "revoke all privileges on table public.tournament_matches from public, anon, authenticated"
    );
    expect(compactMigration).toContain(
      "grant select ( id, player_one_registration_id, player_two_registration_id ) on table public.tournament_matches to authenticated"
    );
    expect(compactMigration).not.toContain(
      "grant select ( id, player_one_registration_id, player_two_registration_id, activation_version"
    );
  });
});

describe("matchup internal core search-path hardening migration", () => {
  it.each(hardenedCoreFunctions)(
    "hardens $coreName without changing its callable contract",
    ({ coreName, wrapperName, signature }) => {
      const canonicalSignature = signature.replaceAll(" ", "");
      const internalIdentity = `public.${coreName}(${canonicalSignature})`;
      const wrapperIdentity = `public.${wrapperName}(${canonicalSignature})`;
      const baseRename =
        `alter function ${wrapperIdentity} rename to ${coreName};`;
      const wrapperCreate =
        `create or replace function public.${wrapperName}(`;

      expect(canonicalMigration).toContain(baseRename);
      expect(canonicalMigration.indexOf(baseRename)).toBeLessThan(
        canonicalMigration.indexOf(wrapperCreate)
      );
      expect(canonicalMigration).toContain(
        `alter function ${wrapperIdentity} owner to postgres;`
      );

      expect(canonicalHardeningMigration).toContain(
        `alter function ${internalIdentity} set search_path = pg_catalog;`
      );
      expect(canonicalHardeningMigration).toContain(
        `alter function ${internalIdentity} owner to postgres;`
      );
      expect(canonicalHardeningMigration).toContain(
        `revoke all on function ${internalIdentity} from public,anon,authenticated,service_role;`
      );
      expect(canonicalHardeningMigration).not.toContain(
        `create or replace function public.${coreName}(`
      );
      expect(canonicalHardeningMigration).not.toContain(
        `create function public.${coreName}(`
      );
      expect(canonicalHardeningMigration).not.toContain(
        `rename to ${coreName}`
      );
    }
  );

  it("is ordered after the base migration and cannot create another overload", () => {
    const migrationNames = readdirSync(
      resolve(process.cwd(), "supabase/migrations")
    )
      .filter((name) => name.endsWith(".sql"))
      .sort();
    const baseMigrationName =
      "20260808100000_matchup_deadlines_double_forfeit.sql";

    expect(hardeningMigrationName > baseMigrationName).toBe(true);
    expect(migrationNames.indexOf(baseMigrationName)).toBeGreaterThan(-1);
    expect(migrationNames.indexOf(hardeningMigrationName)).toBeGreaterThan(
      migrationNames.indexOf(baseMigrationName)
    );
    expect(compactHardeningMigration.startsWith("begin;")).toBe(true);
    expect(compactHardeningMigration.endsWith("commit;")).toBe(true);
    expect(compactHardeningMigration).not.toMatch(
      /\bcreate(?: or replace)? function\b/
    );
    expect(compactHardeningMigration).not.toContain(" rename to ");
    expect(compactHardeningMigration).not.toContain("drop function");

    const alteredIdentities = [
      ...canonicalHardeningMigration.matchAll(
        /alter function public\.([a-z0-9_]+)\(\s*([^)]*?)\s*\)/g
      ),
    ].map((match) => `${match[1]}(${match[2].trim()})`);

    for (const { coreName, signature } of hardenedCoreFunctions) {
      const expectedIdentity = `${coreName}(${signature.replaceAll(" ", "")})`;
      const identitiesForCore = new Set(
        alteredIdentities.filter((identity) =>
          identity.startsWith(`${coreName}(`)
        )
      );

      expect(identitiesForCore).toEqual(new Set([expectedIdentity]));
    }
  });
});
