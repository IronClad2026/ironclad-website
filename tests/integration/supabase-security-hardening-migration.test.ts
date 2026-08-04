import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260724090000_supabase_security_hardening.sql"
);
const migration = readFileSync(migrationPath, "utf8");
const compactMigration = migration.toLowerCase().replace(/\s+/g, " ").trim();
const registrationMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260628090000_add_missing_elo_identity_columns.sql"
  ),
  "utf8"
);

function extractRegistrationWithCheck(sql: string) {
  const policyStart = sql.indexOf('"Players can submit registrations"');
  const checkStart = sql.indexOf("with check (", policyStart);
  const checkEnd = sql.indexOf("\n);", checkStart);

  if (policyStart < 0 || checkStart < 0 || checkEnd < 0) {
    throw new Error("Registration policy WITH CHECK expression not found.");
  }

  return sql
    .slice(checkStart, checkEnd + 3)
    .replace(/\s+/g, " ")
    .trim();
}

describe("Supabase security hardening migration contract", () => {
  it("retains the sanitized player view and converts only the leaderboard views to invoker rights", () => {
    expect(compactMigration).toContain(
      "alter view public.public_player_profiles set ( security_barrier = true, security_invoker = false );"
    );

    for (const view of [
      "leaderboard_current_season",
      "leaderboard_public_season_standings",
      "leaderboard_public_all_time_standings",
    ]) {
      expect(compactMigration).toContain(
        `alter view public.${view} set ( security_barrier = true, security_invoker = true );`
      );
    }

    expect(compactMigration).not.toContain("create view");
    expect(compactMigration).not.toContain("create or replace view");
    expect(compactMigration).not.toContain("drop view");
  });

  it("normalizes all public-view roles to SELECT-only access", () => {
    expect(compactMigration).toContain(
      "revoke all privileges on table public.public_player_profiles, public.leaderboard_current_season, public.leaderboard_public_season_standings, public.leaderboard_public_all_time_standings from public, anon, authenticated, service_role;"
    );
    expect(compactMigration).toContain(
      "grant select on table public.public_player_profiles, public.leaderboard_current_season, public.leaderboard_public_season_standings, public.leaderboard_public_all_time_standings to anon, authenticated, service_role;"
    );
  });

  it("removes direct API access and public policies from the three server-only tables", () => {
    expect(compactMigration).toContain(
      "revoke all privileges on table public.generated_brackets, public.tournament_matches, public.platform_settings from public, anon, authenticated;"
    );
    expect(compactMigration).toContain(
      "grant all privileges on table public.generated_brackets, public.tournament_matches, public.platform_settings to service_role;"
    );

    for (const [policy, table] of [
      ["Public can read generated brackets", "generated_brackets"],
      ["Public can read tournament matches", "tournament_matches"],
      ["Public can read platform settings", "platform_settings"],
    ]) {
      expect(compactMigration).toContain(
        `drop policy if exists "${policy.toLowerCase()}" on public.${table};`
      );
    }
  });

  it("makes every audited helper service-role-only", () => {
    const functions = [
      "canonicalize_registration_identity()",
      "enforce_registration_elo_eligibility()",
      "enforce_tournament_registration_availability()",
      "link_approved_submission_to_match()",
      "protect_notification_client_mutation()",
      "protect_player_coh3_profile_id()",
      "refresh_generated_bracket_on_approval()",
      "refresh_round_robin_standings_on_match()",
      "get_tournament_bracket_capacity()",
      "is_elo_verification_enabled()",
      "leaderboard_require_write_access()",
      "get_or_create_leaderboard_season(date)",
      "recalculate_leaderboard_for_tournament(uuid, text)",
      "recalculate_leaderboard_for_season(uuid, text)",
      "recalculate_leaderboard_all_time(text)",
      "add_leaderboard_admin_adjustment( uuid, uuid, text, integer, text, uuid, uuid, uuid, text )",
    ];

    for (const signature of functions) {
      expect(compactMigration).toContain(
        `revoke execute on function public.${signature} from public, anon, authenticated;`
      );
      expect(compactMigration).toContain(
        `grant execute on function public.${signature} to service_role;`
      );
    }
  });

  it("fixes only the three audited mutable search paths without replacing function bodies", () => {
    for (const signature of [
      "ironclad_set_updated_at()",
      "is_admin_jwt()",
      "sync_tournament_registration_enabled()",
    ]) {
      expect(compactMigration).toContain(
        `alter function public.${signature} set search_path = pg_catalog;`
      );
    }

    expect(compactMigration).not.toContain(
      "create or replace function public."
    );
    expect(compactMigration).not.toMatch(
      /\b(insert into|update public\.|delete from|truncate table)\b/
    );
  });

  it("does not alter the intentionally policy-free service tables", () => {
    expect(compactMigration).not.toContain(
      "player_notification_dismissals"
    );
    expect(compactMigration).not.toContain(
      "player_report_group_notification_dismissals"
    );
    expect(compactMigration).not.toContain("tournament_deletion_jobs");
  });

  it("records the historical non-verified registration RLS boundary", () => {
    expect(compactMigration).toContain(
      "create schema ironclad_private authorization postgres;"
    );
    expect(compactMigration).toContain(
      "create function ironclad_private.registration_elo_verification_enabled() returns boolean language sql stable security definer set search_path = pg_catalog"
    );
    expect(compactMigration).toContain(
      "alter function ironclad_private.registration_elo_verification_enabled() owner to postgres;"
    );
    expect(compactMigration).toContain(
      "revoke execute on function ironclad_private.registration_elo_verification_enabled() from public, anon, authenticated, service_role;"
    );
    expect(compactMigration).toContain(
      "grant execute on function ironclad_private.registration_elo_verification_enabled() to authenticated, service_role;"
    );
    expect(compactMigration).toContain(
      'create policy "players can submit registrations" on public.registrations for insert to authenticated with check ( clerk_user_id = (auth.jwt() ->> \'sub\') and not ironclad_private.registration_elo_verification_enabled()'
    );

    const priorCheck = extractRegistrationWithCheck(
      registrationMigration
    ).replace(
      "public.is_elo_verification_enabled()",
      "ironclad_private.registration_elo_verification_enabled()"
    );
    const hardenedCheck = extractRegistrationWithCheck(migration);

    expect(hardenedCheck).toBe(priorCheck);
  });
});
