import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationName = "20260817120000_polls_decisions.sql";
const previousMigrationName =
  "20260817100000_authenticated_match_dice_rolloff.sql";
const migrationsDirectory = resolve(process.cwd(), "supabase/migrations");
const migrationPath = resolve(migrationsDirectory, migrationName);
const migrationExists = existsSync(migrationPath);
const migration = migrationExists
  ? readFileSync(migrationPath, "utf8").replace(/\r\n/g, "\n")
  : "";
const sql = migration.toLowerCase().replace(/\s+/g, " ").trim();
const databaseContractPath = resolve(
  process.cwd(),
  "tests/database/feature-c-polls-decisions.sql"
);
const databaseContractExists = existsSync(databaseContractPath);
const databaseContract = databaseContractExists
  ? readFileSync(databaseContractPath, "utf8")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim()
  : "";
const concurrencySetupPath = resolve(
  process.cwd(),
  "tests/database/feature-c-polls-concurrency-setup.sql"
);
const concurrencyCleanupPath = resolve(
  process.cwd(),
  "tests/database/feature-c-polls-concurrency-cleanup.sql"
);
const concurrencyHarnessPath = resolve(
  process.cwd(),
  "tests/database/feature-c-polls-concurrency.ps1"
);

function functionBody(name: string) {
  const pattern = new RegExp(
    `create (?:or replace )?function public\\.${name}\\(`
  );
  const start = sql.search(pattern);
  const end = sql.indexOf("$$;", start);

  if (start < 0 || end < 0) {
    throw new Error(`${name} is missing from the Feature C migration.`);
  }

  return sql.slice(start, end + 3);
}

describe("polls and decisions migration", () => {
  it("is the one ordered transactional Feature C migration", () => {
    const names = readdirSync(migrationsDirectory).sort();

    expect(migrationExists).toBe(true);
    expect(names.indexOf(previousMigrationName)).toBeGreaterThan(-1);
    expect(names.indexOf(migrationName)).toBeGreaterThan(
      names.indexOf(previousMigrationName)
    );
    expect(sql.startsWith("begin;")).toBe(true);
    expect(sql.endsWith("commit;")).toBe(true);
    expect(sql.match(/create table public\./g)).toHaveLength(4);
    expect(sql).not.toMatch(
      /create extension|storage\.|cron\.|realtime|websocket|redis|queue/
    );
  });

  it("creates exactly the four normalized private tables", () => {
    for (const table of [
      "polls",
      "poll_options",
      "poll_eligible_voters",
      "poll_ballot_choices",
    ]) {
      expect(sql).toContain(`create table public.${table}`);
      expect(sql).toContain(
        `alter table public.${table} enable row level security`
      );
      expect(sql).toContain(
        `alter table public.${table} force row level security`
      );
      expect(sql).toContain(
        `revoke all on table public.${table} from public, anon, authenticated, service_role`
      );
      expect(sql).not.toMatch(
        new RegExp(`create policy[^;]+public\\.${table}`)
      );
    }

    expect(sql).toContain(
      "unique (id, poll_id)"
    );
    expect(sql).toContain(
      "foreign key (eligible_voter_id, poll_id) references public.poll_eligible_voters(id, poll_id)"
    );
    expect(sql).toContain(
      "foreign key (option_id, poll_id) references public.poll_options(id, poll_id)"
    );
    expect(sql).not.toMatch(
      /create table public\.(?:poll_ballots|poll_results|poll_final_decisions)/
    );
    const pollsTable = sql.slice(
      sql.indexOf("create table public.polls"),
      sql.indexOf("create table public.poll_options")
    );
    const eligibilityTable = sql.slice(
      sql.indexOf("create table public.poll_eligible_voters"),
      sql.indexOf("create table public.poll_ballot_choices")
    );
    expect(pollsTable + eligibilityTable).not.toMatch(
      /selected_option_ids\s+uuid\[\]|choices\s+jsonb/
    );
  });

  it("locks the two purposes, five audiences, limits, and purpose matrix", () => {
    for (const value of [
      "tournament_decision",
      "community_feedback",
      "tournament_approved",
      "tournament_division_approved",
      "selected_tournament_players",
      "active_players",
      "selected_active_players",
      "advisory",
      "binding",
      "live",
      "after_close",
      "text",
      "coh3_map",
    ]) {
      expect(sql).toContain(`'${value}'`);
    }

    expect(sql).toContain("char_length(question) <= 160");
    expect(sql).toContain("char_length(context) <= 1000");
    expect(sql).toContain("char_length(label_snapshot) <= 120");
    expect(sql).toContain("max_selections between 1 and 5");
    expect(sql).toContain("winner_count between 1 and 5");
    expect(sql).toContain("winner_count <= max_selections");
    expect(sql).toContain("interval '15 minutes'");
    expect(sql).toContain("interval '30 days'");
    expect(sql).toContain("community feedback polls must be advisory");
    expect(sql).toContain("published_at < closes_at");
    expect(sql).toContain(
      "binding_tie_rule_used = (final_decision_basis = 'binding_cutoff_tiebreak')"
    );
  });

  it("freezes configuration, options, snapshots, and eligibility at publication", () => {
    const save = functionBody("save_poll_draft");
    const publish = functionBody("publish_poll");

    expect(save).toMatch(
      /where player\.id = any\([\s\S]*?order by player\.id for share;[\s\S]*?selected audience contains an ineligible player/
    );
    expect(publish).toContain("for update");
    expect(functionBody("poll_eligible_candidates")).toContain(
      "registration.registration_status = 'approved'"
    );
    expect(functionBody("poll_eligible_candidates")).toContain(
      "player.account_closed_at is null"
    );
    expect(publish).toContain("selected audience contains an ineligible player");
    expect(publish).toContain("v_poll.draft_audience_invalidated");
    expect(publish).toContain("review and save the draft again");
    expect(publish).toContain("insert into public.poll_eligible_voters");
    expect(publish).toContain("update public.polls");
    expect(publish.indexOf("insert into public.poll_eligible_voters")).toBeLessThan(
      publish.indexOf("published_at = v_published_at")
    );
    expect(publish).toContain("'eligible_count'");
    expect(publish).toContain("get diagnostics v_eligible_count = row_count");
    expect(publish).toMatch(
      /from public\.players as player[\s\S]*?for share;/
    );
    expect(sql).toContain("polls_published_configuration_guard");
    expect(sql).toContain("poll_options_published_configuration_guard");
    expect(sql).toContain("poll_eligibility_published_identity_guard");
    expect(sql.match(/coalesce\(auth\.role\(\), ''\) = 'service_role'/g))
      .not.toHaveLength(0);
    expect(sql).not.toContain(
      "current_setting('ironclad.poll_finalization', true), '') = 'on' and session_user = 'postgres'"
    );
  });

  it("validates text and map options without duplicating the map system", () => {
    const save = functionBody("save_poll_draft");
    const publish = functionBody("publish_poll");

    expect(save).toContain("jsonb_array_elements(p_options)");
    expect(save).toContain("between 2 and 24");
    expect(save).toContain("duplicate poll options are not allowed");
    expect(save).toContain("map.status = 'active'");
    expect(save).toContain("map.game_mode = '1v1'");
    expect(publish).toContain("from public.coh3_maps as map");
    expect(publish).toContain("map.status <> 'active'");
    expect(publish).toContain("map.game_mode <> '1v1'");
    expect(publish).toContain("for share of map");
    expect(publish).toContain("map_display_name_snapshot = map.display_name");
    expect(publish).toContain("map_slug_snapshot = map.slug");
    expect(sql).toContain(
      "references public.coh3_maps(id) on delete restrict"
    );
    expect(sql).not.toMatch(/create table public\.[a-z0-9_]*maps/);
  });

  it("implements authenticated current-ballot revision and exact retry semantics", () => {
    const vote = functionBody("cast_poll_ballot");

    expect(vote).toContain("auth.jwt() ->> 'sub'");
    expect(vote).toContain("player.account_closed_at is null");
    expect(vote).toMatch(
      /player\.account_closed_at is null\s+for share;/
    );
    expect(vote).toContain("for share");
    expect(vote).toContain("for update");
    expect(vote).toContain("v_now < v_poll.opens_at");
    expect(vote).toContain("v_now >= v_poll.closes_at");
    expect(vote.indexOf("for update")).toBeLessThan(
      vote.indexOf("v_now := pg_catalog.clock_timestamp()")
    );
    expect(vote).toContain("array_position(p_option_ids, null) is not null");
    expect(vote).toContain("count(distinct option_id)");
    expect(vote).toContain("ballot revision conflict");
    expect(vote).toContain("'idempotent', true");
    expect(vote).toContain("delete from public.poll_ballot_choices");
    expect(vote).toContain("insert into public.poll_ballot_choices");
    expect(vote).toContain("ballot_revision = ballot_revision + 1");
    expect(vote).not.toMatch(/p_(?:player|clerk|eligible|result|total)/);
  });

  it("omits hidden aggregates at the database projection boundary", () => {
    const read = functionBody("build_poll_payload");

    expect(read).toContain("p_viewer_mode = 'admin'");
    expect(read).toContain("v_now := pg_catalog.clock_timestamp()");
    expect(read.indexOf("v_now := pg_catalog.clock_timestamp()")).toBeLessThan(
      read.indexOf("v_status := case")
    );
    expect(read).toContain("when v_now < v_poll.opens_at then 'scheduled'");
    expect(read).toContain("when v_now < v_poll.closes_at then 'open'");
    expect(read).toContain("else 'closed'");
    expect(read).toContain("v_include_option_totals");
    expect(read).toContain("v_include_turnout");
    expect(read).toContain("when p_viewer_mode = 'admin' or v_include_turnout");
    expect(read).toContain("else '{}'::jsonb");
    expect(read).toContain("'vote_count'");
    expect(read).toContain("'submitted_ballot_count'");
    expect(read).toContain("v_poll.published_at is null");
    expect(read).toContain("'selected_tournament_players'");
    expect(read).not.toMatch(/clerk_user_id|recipient_clerk_user_id/);
  });

  it("projects the Advisory deterministic top-k and Binding-only cutoff metadata", () => {
    const read = functionBody("build_poll_payload");
    const advisoryStart = read.indexOf(
      "if v_poll.authority = 'advisory' then"
    );
    const bindingStart = read.indexOf("else with option_counts", advisoryStart);
    const advisoryBranch = read.slice(advisoryStart, bindingStart);
    const bindingBranch = read.slice(bindingStart);

    expect(advisoryStart).toBeGreaterThan(-1);
    expect(bindingStart).toBeGreaterThan(advisoryStart);
    expect(advisoryBranch).toContain(
      "ranked.result_rank <= v_poll.winner_count"
    );
    expect(advisoryBranch).toContain("into v_computed_winner_option_ids");
    expect(advisoryBranch).not.toContain("v_cutoff_tie_option_ids");
    expect(bindingBranch).toContain("v_cutoff_tie_count > v_cutoff_slots");
    expect(bindingBranch).toContain("into v_cutoff_tie_option_ids");
  });

  it("timestamps cancellation only after serialized state validation", () => {
    const cancel = functionBody("cancel_poll");

    expect(cancel).toContain("v_cancelled_at timestamptz;");
    expect(cancel).not.toContain(
      "v_cancelled_at timestamptz := pg_catalog.clock_timestamp()"
    );
    expect(cancel.indexOf("for update")).toBeLessThan(
      cancel.indexOf("v_cancelled_at := pg_catalog.clock_timestamp()")
    );
    expect(cancel.indexOf("final-published decision cannot be cancelled"))
      .toBeLessThan(
        cancel.indexOf("v_cancelled_at := pg_catalog.clock_timestamp()")
      );
  });

  it("computes advisory and binding top-k outcomes with a cutoff-only tie break", () => {
    const finalize = functionBody("finalize_poll_decision");

    expect(finalize).toContain("v_submitted_ballot_count = 0");
    expect(finalize).toContain("zero-ballot binding polls must be cancelled");
    expect(finalize).toContain("dense_rank() over (");
    expect(finalize).toContain("v_cutoff_count");
    expect(finalize).toContain("v_safe_winner_count");
    expect(finalize).toContain("v_cutoff_slots");
    expect(finalize).toContain("cutoff tie selections must come only from the tied cutoff group");
    expect(finalize).toContain("binding_computed");
    expect(finalize).toContain("binding_cutoff_tiebreak");
    expect(finalize).toContain(
      "binding outcome is computed unless a cutoff tie requires admin input"
    );
    expect(finalize).toContain("advisory_poll_result");
    expect(finalize).toContain("advisory_admin_override");
    expect(finalize).toContain("an advisory override requires a rationale");
    expect(finalize).toContain("v_selected_ids @> v_computed_ids");
    expect(finalize).toContain("v_computed_ids @> v_selected_ids");
    expect(finalize).toContain("final_decision_rank");
    expect(finalize).toContain("final_decision_published_at");
    expect(finalize.indexOf("for update")).toBeLessThan(
      finalize.indexOf("v_now := pg_catalog.clock_timestamp()")
    );
  });

  it("keeps individual ballots private and exposes only final public decisions", () => {
    const publicRead = functionBody("get_public_tournament_decisions");

    expect(publicRead).toContain("purpose = 'tournament_decision'");
    expect(publicRead).toContain("final_decision_published_at is not null");
    expect(publicRead).toContain("public_final_totals");
    expect(publicRead).toContain("case when v_decision.public_final_totals");
    expect(publicRead).toContain("else '{}'::jsonb");
    expect(publicRead).not.toMatch(
      /player_id|clerk_user_id|eligible_voter_id|registration_id|created_by|updated_by|published_by|cancelled_by|final_decision_published_by/
    );
  });

  it("uses deterministic idempotent notification fanout for the two events", () => {
    const publish = functionBody("publish_poll");
    const finalize = functionBody("finalize_poll_decision");

    for (const body of [publish, finalize]) {
      expect(body).toContain("insert into public.notifications");
      expect(body).toContain("on conflict (recipient_clerk_user_id, event_key)");
      expect(body).toContain("do nothing");
    }
    expect(publish).toContain("poll.published");
    expect(finalize).toContain("poll.decision_published");
    expect(finalize).toContain("purpose = 'tournament_decision'");
    expect(sql).not.toContain("poll.vote");
    expect(sql).not.toContain("poll.closed");
  });

  it("cumulatively preserves account closure and hard-delete contracts", () => {
    const closure = functionBody("close_ironclad_player_account");
    const hardDelete = functionBody("delete_tournament_data");

    expect(closure).toContain("delete from public.poll_eligible_voters");
    expect(closure).toContain("poll.published_at is null");
    expect(closure).toContain("set player_id = null");
    expect(closure).toContain("poll.published_at is not null");
    expect(closure).toContain("created_by_clerk_user_id");
    expect(closure).toContain("final_decision_published_by_clerk_user_id");
    expect(closure).toContain("v_has_history := public.player_has_authoritative_competition_history(v_player.id)");
    expect(
      closure.match(/v_has_history := public\.player_has_authoritative_competition_history/g)
    ).toHaveLength(1);
    expect(closure).toContain("delete from public.notifications");

    expect(hardDelete).toContain("from public.polls as poll");
    expect(hardDelete).toContain("poll.published_at is not null");
    expect(hardDelete).toContain("published tournament decision history");
    expect(hardDelete).toContain("match.status <> 'scheduled'");
    expect(hardDelete).toContain("from public.leaderboard_point_events as event");
    expect(hardDelete).toContain("delete from public.tournaments");
    expect(hardDelete).toContain("'proof_paths'");
    expect(hardDelete).toContain("'banner_paths'");
  });

  it("grants only the minimum execution boundaries", () => {
    for (const table of [
      "polls",
      "poll_options",
      "poll_eligible_voters",
      "poll_ballot_choices",
    ]) {
      expect(sql).not.toMatch(
        new RegExp(`grant (?:select|insert|update|delete|all)[^;]+public\\.${table}`)
      );
    }

    for (const signature of [
      "public.get_my_tournament_polls(uuid)",
      "public.get_my_community_polls()",
      "public.get_my_poll(uuid)",
      "public.cast_poll_ballot(uuid, integer, uuid[])",
    ]) {
      expect(sql).toContain(`grant execute on function ${signature} to authenticated`);
    }

    expect(sql).toContain(
      "grant execute on function public.get_public_tournament_decisions(uuid) to anon, authenticated, service_role"
    );
    expect(sql).not.toMatch(/grant execute[^;]+(?:save_poll_draft|publish_poll|cancel_poll|finalize_poll_decision)[^;]+authenticated/);
  });

  it("ships one rollback-only executable database contract", () => {
    expect(databaseContractExists).toBe(true);
    expect(databaseContract).toContain("\\set on_error_stop on");
    expect(databaseContract).toContain("begin isolation level repeatable read;");
    expect(databaseContract).toContain("rollback;");
    expect(databaseContract).not.toContain("commit;");
    expect(databaseContract).toContain("feature-c-outsider");
    expect(databaseContract).toContain("feature-c-closed");
    for (const audience of [
      "tournament_approved",
      "tournament_division_approved",
      "selected_tournament_players",
      "active_players",
      "selected_active_players",
    ]) {
      expect(databaseContract).toContain(`'${audience}'`);
    }
    expect(databaseContract).toContain("public.cast_poll_ballot");
    expect(databaseContract).toContain("identical retry");
    expect(databaseContract).toContain("stale revision");
    expect(databaseContract).toContain("hidden/open player payload");
    expect(databaseContract).toContain("live/open eligible payload");
    expect(databaseContract).toContain("database clock must derive a scheduled");
    expect(databaseContract).toContain("database clock must derive an open");
    expect(databaseContract).toContain("database clock must derive closed");
    expect(databaseContract).toContain("map retirement between draft save and publication");
    expect(databaseContract).toContain("clear single-winner binding result");
    expect(databaseContract).toContain("advisory override must require rationale");
    expect(databaseContract).toContain("cutoff tie");
    expect(databaseContract).toContain("account closure");
    expect(databaseContract).toContain("published tournament decision history must block hard delete");
    expect(databaseContract).toContain("notification fanout");
    expect(databaseContract).toContain("fixture residue remains");
  });

  it("ships deterministic two-session canary setup and exact cleanup", () => {
    expect(existsSync(concurrencySetupPath)).toBe(true);
    expect(existsSync(concurrencyCleanupPath)).toBe(true);
    expect(existsSync(concurrencyHarnessPath)).toBe(true);

    const setup = readFileSync(concurrencySetupPath, "utf8").toLowerCase();
    const cleanup = readFileSync(concurrencyCleanupPath, "utf8").toLowerCase();
    const harness = readFileSync(concurrencyHarnessPath, "utf8").toLowerCase();

    expect(setup).toContain("feature_c_concurrency_ready");
    expect(setup).toContain("c7000000-0000-4000-8000-000000000001");
    expect(setup).toContain("c7100000-0000-4000-8000-000000000003");
    expect(setup).toContain("c7200000-0000-4000-8000-000000000001");
    expect(setup).toContain("feature-c-concurrency-player");
    expect(setup).not.toContain("session_replication_role");

    expect(cleanup).toContain("feature_c_concurrency_clean");
    expect(cleanup).toContain("delete from public.poll_ballot_choices");
    expect(cleanup).toContain("delete from public.poll_eligible_voters");
    expect(cleanup).toContain("delete from public.poll_options");
    expect(cleanup).toContain("delete from public.polls");
    expect(cleanup).toContain("delete from public.players");
    expect(cleanup).toContain("concurrency canary residue remains");
    expect(harness).toContain("40001");
    expect(harness).toContain("42501");
    expect(harness).toContain("before_close");
    expect(harness).toContain("cleanup_passed");
    expect(harness).not.toContain("session_replication_role");
  });
});
