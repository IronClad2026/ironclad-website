import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260806130000_phase4_withdrawal_waitlist_division_launch.sql"
  ),
  "utf8"
);
const compactMigration = migration.toLowerCase().replace(/\s+/g, " ").trim();
const cohortMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260805150000_eight_player_registration_cohort.sql"
  ),
  "utf8"
);
const compactCohortMigration = cohortMigration
  .toLowerCase()
  .replace(/\s+/g, " ")
  .trim();

function extractQualifiedFunction(functionName: string) {
  const createIndex = Math.max(
    compactMigration.indexOf(
      `create or replace function ${functionName}`
    ),
    compactMigration.indexOf(`create function ${functionName}`)
  );
  const endIndex = compactMigration.indexOf("$$;", createIndex);

  if (createIndex < 0 || endIndex < 0) {
    throw new Error(`${functionName} was not found in the Phase 4 migration.`);
  }

  return compactMigration.slice(createIndex, endIndex + 3);
}

function extractFunction(functionName: string) {
  return extractQualifiedFunction(`public.${functionName}`);
}

describe("Phase 4 withdrawal, waitlist, and division launch migration", () => {
  it("keeps the data model minimal and uses one launch boundary", () => {
    expect(compactMigration.startsWith("begin;")).toBe(true);
    expect(compactMigration.endsWith("commit;")).toBe(true);
    expect(compactMigration).toContain(
      "alter table public.tournament_brackets add column if not exists launched_at timestamptz"
    );
    expect(compactMigration).toContain(
      "add column if not exists withdrawn_at timestamptz"
    );
    expect(compactMigration).toContain(
      "add column if not exists waitlist_offer_status text"
    );
    expect(compactMigration).not.toContain("create table public.waitlist");
    expect(compactMigration).not.toContain("create table public.participation");
    expect(compactMigration).not.toContain("event_key");
    expect(compactMigration).not.toContain("start_date, now()");
  });

  it("removes the acknowledgement-bypass overload and returns a no-insert race result", () => {
    const submit = extractFunction("submit_verified_player_registration(");

    expect(compactMigration).toContain(
      "drop function if exists public.submit_verified_player_registration( uuid, text, text, uuid, uuid, bigint, text, text, text );"
    );
    expect(submit).toContain("p_waitlist_confirmed boolean");
    expect(submit).toContain("waitlist_confirmation_required boolean");
    expect(submit).toContain("id := null");
    expect(submit).toContain("registration_status := null");
    expect(submit.indexOf("waitlist_confirmation_required := true")).toBeLessThan(
      submit.indexOf("insert into public.registrations")
    );
    expect(submit).toContain(
      "v_tournament_status not in ('registration_open', 'in_progress')"
    );
    expect(submit).toContain("v_bracket_launched_at is not null");
  });

  it("serializes FIFO offers and reserves configured capacity for 24 hours", () => {
    const reconcile = extractFunction("reconcile_tournament_waitlist(");
    const guard = extractFunction(
      "enforce_tournament_registration_availability()"
    );

    expect(reconcile).toContain("for update of bracket");
    expect(reconcile).toContain(
      "v_required_count := least(v_max_players, 8)"
    );
    expect(reconcile).toContain(
      "v_required_count - v_active_count - v_offered_count"
    );
    expect(reconcile).toContain(
      "order by registration.created_at, registration.id"
    );
    expect(reconcile).toContain(
      "v_offer_expires_at := v_offer_created_at + interval '24 hours'"
    );
    expect(reconcile).toContain("and waitlist_offer_status is null");
    expect(reconcile).toContain("'registration.waitlist_offer'");
    expect(guard).toContain(
      "v_active_count + v_offered_count >= v_required_count"
    );
    expect(guard).toContain("older eligible waitlisted registrations");
    expect(guard).toContain("old.waitlist_offer_status is not null");
    expect(guard).toContain(
      "old.waitlist_offer_created_at is distinct from new.waitlist_offer_created_at"
    );
    expect(guard).toContain(
      "old.waitlist_offer_expires_at is distinct from new.waitlist_offer_expires_at"
    );
    expect(guard).toContain(
      "waitlist offer deadlines are immutable once created"
    );
    expect(compactMigration).toContain(
      "create trigger registrations_enforce_tournament_availability before insert or update of registration_status, tournament_id, tournament_bracket_id, withdrawn_at, waitlist_offer_status, waitlist_offer_created_at, waitlist_offer_expires_at, waitlist_offer_resolved_at on public.registrations"
    );
  });

  it("uses authenticated owner-only withdrawal and offer responses", () => {
    const withdraw = extractFunction("withdraw_tournament_registration(");
    const respond = extractFunction("respond_to_waitlist_offer(");

    for (const ownerFunction of [withdraw, respond]) {
      expect(ownerFunction).toContain(
        "coalesce(auth.role(), '') <> 'authenticated'"
      );
      expect(ownerFunction).toContain("auth.jwt() ->> 'sub'");
      expect(ownerFunction).toContain("for update");
      expect(ownerFunction).toContain("launched_at");
    }

    expect(withdraw).toContain("registration_status = 'withdrawn'");
    expect(withdraw).toContain("waitlist_offer_status = 'offered'");
    expect(respond).toContain("p_response not in ('accept', 'decline')");
    expect(respond).toContain("v_resolved_at := clock_timestamp()");
    expect(respond).toContain(
      "v_resolved_at >= v_registration.waitlist_offer_expires_at"
    );
    expect(respond.indexOf("v_resolved_at := clock_timestamp()")).toBeLessThan(
      respond.indexOf(
        "v_resolved_at >= v_registration.waitlist_offer_expires_at"
      )
    );
    expect(respond).toContain("registration_status = 'pending'");
    expect(respond).not.toContain("registration_status = 'approved'");
  });

  it("keeps trusted notification insertion narrow", () => {
    const notificationGuard = extractFunction(
      "protect_notification_client_mutation()"
    );

    expect(notificationGuard).toContain("security invoker");
    expect(notificationGuard).toContain("current_user = 'postgres'");
    expect(notificationGuard).toContain("auth.role() = 'authenticated'");
    expect(notificationGuard).toContain(
      "notifications can only be created by protected server workflows"
    );
    expect(compactMigration).toContain(
      "revoke all on function public.reconcile_tournament_waitlist(uuid) from public, anon, authenticated, service_role"
    );
  });

  it("separates private draft preparation from explicit launch", () => {
    const generate = extractFunction("generate_tournament_bracket(");
    const readiness = extractFunction("get_tournament_bracket_readiness(");
    const save = extractFunction("save_bracket_assignments(");
    const launch = extractFunction("launch_tournament_division(");

    expect(generate).toContain(
      "v_required_count := least(v_max_players, 8)"
    );
    expect(generate).toContain("v_approved_count <> v_required_count");
    expect(generate).toContain("v_launched_at is not null");
    expect(save).toContain("v_approved_count <> v_required_count");
    expect(save).not.toContain("status = 'in_progress'");
    expect(save).not.toContain("registration_enabled = false");
    expect(save).toContain("v_launched_at is not null");
    expect(save).toContain("public.repair_generated_bracket_matches");
    expect(save.indexOf("v_launched_at is not null")).toBeLessThan(
      save.indexOf("public.repair_generated_bracket_matches")
    );
    expect(compactMigration).toContain(
      "revoke all on function public.repair_generated_bracket_matches(uuid, text) from public, anon, authenticated, service_role"
    );
    expect(compactMigration).toContain(
      "revoke all on function public.admin_update_match_participants( uuid, uuid, uuid, text ) from public, anon, authenticated, service_role"
    );
    expect(launch).toContain("for update");
    expect(launch).toContain("public.is_generated_bracket_populated");
    expect(launch).toContain("bracket assignments must exactly match");
    expect(launch).toContain("set launched_at = v_launch_at");
    expect(launch).toContain("and bracket.launched_at is null");
    expect(launch).toContain("already_launched := true");
    expect(compactMigration).toContain(
      "count(registration.id) filter ( where registration.registration_status = 'approved' ) = least(bracket.max_players, 8)"
    );
    expect(readiness).toContain(
      ")::integer, least(bracket.max_players, 8), count(registration.id) filter ("
    );
    expect(launch).toContain("'registration.waitlist_closed'");
    const closureNotification = launch.slice(
      launch.indexOf("insert into public.notifications"),
      launch.indexOf("if v_waitlisted.waitlist_offer_status")
    );
    expect(closureNotification).not.toContain("actor_clerk_user_id");
    expect(closureNotification).not.toContain("p_actor_clerk_user_id");
  });

  it("qualifies columns that share names with RPC output parameters", () => {
    const review = extractFunction("review_tournament_registration(");
    const launch = extractFunction("launch_tournament_division(");

    expect(review).toContain("update public.registrations as registration");
    expect(review).toContain(
      "when registration.registration_status = 'waitlisted'"
    );
    expect(review).toContain(
      "registration.waitlist_offer_status = 'offered'"
    );
    expect(launch).toContain(
      "update public.tournament_brackets as bracket set launched_at = v_launch_at"
    );
    expect(launch).toContain("and bracket.launched_at is null");
  });

  it("resets stale unlaunched drafts and blocks every result write boundary", () => {
    const registrationRefresh = extractFunction(
      "refresh_phase4_registration_state()"
    );
    const resultGuard = extractFunction("require_launched_match_activity()");

    expect(registrationRefresh).toContain(
      "public.reset_unlaunched_tournament_bracket_draft"
    );
    expect(compactMigration).toContain(
      "before insert or update of status, player_one_score"
    );
    expect(compactMigration).toContain(
      "before insert or update or delete on public.match_result_submissions"
    );
    expect(compactMigration).toContain(
      "before insert or update or delete on public.match_result_report_groups"
    );
    expect(resultGuard).toContain(
      "match activity is blocked until this division launches"
    );
  });

  it("tightens direct draft reads and preserves cross-division completion", () => {
    const lifecycle = extractFunction(
      "recompute_tournament_lifecycle_status("
    );
    const proofHelper = extractQualifiedFunction(
      "ironclad_private.match_division_is_launched("
    );
    const proofPolicyStart = compactMigration.indexOf(
      'create policy "authorized viewers can resolve match proof scope"'
    );
    const proofPolicyEnd = compactMigration.indexOf(
      "drop function if exists public.get_tournament_bracket_capacity",
      proofPolicyStart
    );
    const proofPolicy = compactMigration.slice(
      proofPolicyStart,
      proofPolicyEnd
    );

    expect(compactMigration).toContain(
      "revoke all privileges on table public.bracket_rounds, public.tournament_standings from public, anon, authenticated"
    );
    expect(compactMigration).toContain("bracket.launched_at is not null");
    expect(compactMigration).toContain("public.is_admin_jwt()");
    expect(proofHelper).toContain("security definer");
    expect(proofHelper).toContain("from public.tournament_matches as match");
    expect(proofHelper).toContain("join public.generated_brackets as generated");
    expect(proofPolicy).toContain(
      "ironclad_private.match_division_is_launched(tournament_matches.id)"
    );
    expect(proofPolicy).not.toContain("from public.generated_brackets");
    expect(compactMigration).toContain(
      "grant execute on function ironclad_private.match_division_is_launched(uuid) to authenticated, service_role"
    );
    expect(lifecycle).toContain("bracket.launched_at is null");
    expect(lifecycle.indexOf("bracket.launched_at is null")).toBeLessThan(
      lifecycle.indexOf("status = 'completed'")
    );
    expect(compactMigration).toContain(
      "global registration availability must remain unchanged while sibling divisions are unlaunched"
    );
  });

  it("preserves global registration during staggered launch and declares capacity counters", () => {
    const registrationSync = extractFunction(
      "sync_tournament_registration_enabled()"
    );
    const lifecycleGuard = extractFunction(
      "protect_tournament_lifecycle_boundary()"
    );
    const rosterGuard = extractFunction(
      "preserve_tournament_bracket_roster_invariants()"
    );
    const divisionBoundary = extractFunction(
      "protect_division_launch_boundary()"
    );
    const launch = extractFunction("launch_tournament_division(");
    const availabilityGuard = extractFunction(
      "enforce_tournament_registration_availability()"
    );

    expect(
      compactMigration.match(
        /v_required_count := least\(v_max_players, 8\)/g
      )
    ).toHaveLength(6);
    expect(compactMigration).not.toContain(
      "v_required_count := v_max_players"
    );

    expect(registrationSync).toContain("new.status = 'in_progress'");
    expect(registrationSync).toContain("bracket.launched_at is null");
    expect(registrationSync).toContain(
      "new.registration_enabled := old.registration_enabled"
    );
    expect(registrationSync).toContain("new.registration_enabled := false");
    expect(lifecycleGuard).toContain("not v_explicit_transition");
    expect(lifecycleGuard).toContain(
      "new.registration_enabled is distinct from old.registration_enabled"
    );
    expect(rosterGuard).toContain("v_reserved_count integer");
    expect(rosterGuard).toContain(
      "into v_approved_count, v_reserved_count"
    );
    expect(compactCohortMigration).toContain(
      "insert into public.tournament_brackets ( tournament_id, name, elo_rules, max_players )"
    );
    expect(compactCohortMigration).toContain(
      "on conflict (tournament_id, name) do update set"
    );
    expect(divisionBoundary).toContain(
      "and not exists ( select 1 from public.tournament_brackets as existing_bracket where existing_bracket.tournament_id = new.tournament_id and existing_bracket.name = new.name )"
    );
    expect(divisionBoundary).toContain(
      "if new.launched_at is not null then raise exception 'a tournament division can only launch through launch division'"
    );
    expect(launch).toContain(
      "from public.tournaments as tournament where tournament.id = v_tournament_id for no key update"
    );
    expect(launch).not.toContain(
      "from public.tournaments as tournament where tournament.id = v_tournament_id for update"
    );
    expect(availabilityGuard).toContain(
      "clock_timestamp() >= old.waitlist_offer_expires_at"
    );
  });

  it("reuses the bounded existing scheduler pattern with a safe fallback", () => {
    const expiry = extractFunction("process_expired_waitlist_offers(");

    expect(expiry).toContain(
      "greatest(1, least(coalesce(p_batch_size, 100), 500))"
    );
    expect(expiry).toContain("for update of bracket skip locked");
    expect(expiry).toContain("waitlist_offer_status = 'expired'");
    expect(compactMigration).toContain(
      "ironclad-process-expired-waitlist-offers"
    );
    expect(compactMigration).toContain("create extension if not exists pg_cron");
    expect(compactMigration).not.toContain("administrator fallback");
  });
});
