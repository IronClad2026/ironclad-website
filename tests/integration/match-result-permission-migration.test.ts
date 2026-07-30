import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260725090000_match_result_privacy_hardening.sql"
);
const migration = readFileSync(migrationPath, "utf8");
const compactMigration = migration.toLowerCase().replace(/\s+/g, " ").trim();

const serverOnlyTables = [
  "match_result_submissions",
  "match_result_report_groups",
  "notifications",
] as const;

describe("match-result privacy permission migration", () => {
  it("keeps RLS enabled while removing direct browser-role table access", () => {
    for (const table of serverOnlyTables) {
      expect(compactMigration).toContain(
        `alter table public.${table} enable row level security;`
      );
    }

    expect(compactMigration).toContain(
      "revoke all privileges on table public.match_result_submissions, public.match_result_report_groups, public.notifications from public, anon, authenticated;"
    );
    expect(compactMigration).toContain(
      "grant all privileges on table public.match_result_submissions, public.match_result_report_groups, public.notifications to service_role;"
    );
    expect(compactMigration).toContain(
      "revoke update (read_at) on table public.notifications from public, anon, authenticated;"
    );
    expect(compactMigration).not.toMatch(
      /grant\s+(?:all|select|insert|update|delete)[^;]*on table public\.(?:match_result_submissions|match_result_report_groups|notifications)[^;]*to\s+(?:public|anon|authenticated)/
    );
  });

  it("drops every browser result and notification policy made obsolete by the server boundary", () => {
    for (const [policy, table] of [
      [
        "players can read their own match submissions",
        "match_result_submissions",
      ],
      [
        "participants can read match result report groups",
        "match_result_report_groups",
      ],
      ["players can read own notifications", "notifications"],
      ["players can mark own notifications read", "notifications"],
      ["admins can read admin notifications", "notifications"],
      ["admins can mark admin notifications read", "notifications"],
    ]) {
      expect(compactMigration).toContain(
        `drop policy if exists "${policy}" on public.${table};`
      );
    }
  });

  it("authorizes proof scope through only three safe match columns and participant/admin RLS", () => {
    expect(compactMigration).toContain(
      "alter table public.tournament_matches enable row level security;"
    );
    expect(compactMigration).toContain(
      "revoke all privileges on table public.tournament_matches from public, anon, authenticated;"
    );
    expect(compactMigration).toMatch(
      /grant select\s*\(\s*id,\s*player_one_registration_id,\s*player_two_registration_id\s*\)\s*on table public\.tournament_matches\s*to authenticated;/
    );
    expect(compactMigration).not.toMatch(
      /grant select[^;]*on\s+(?:table\s+)?public\.tournament_matches[^;]*to (?:public|anon)/
    );
    expect(compactMigration).not.toMatch(
      /grant select\s+on\s+(?:table\s+)?public\.tournament_matches\s+to authenticated/
    );
    expect(compactMigration).toContain(
      'drop policy if exists "public can read tournament matches" on public.tournament_matches;'
    );
    expect(compactMigration).toContain(
      'create policy "authorized viewers can resolve match proof scope" on public.tournament_matches for select to authenticated using ('
    );
    expect(compactMigration).toContain("public.is_admin_jwt()");
    expect(compactMigration).toContain(
      "registration.clerk_user_id = (auth.jwt() ->> 'sub')"
    );
    expect(compactMigration).toContain(
      "tournament_matches.player_one_registration_id, tournament_matches.player_two_registration_id"
    );
    expect(compactMigration).not.toContain("official_result_decided_by");
    expect(compactMigration).not.toContain("official_result_submission_id");
  });

  it("creates no proof-authorization function or other RPC", () => {
    const createdPublicFunctions = [
      ...compactMigration.matchAll(
        /create(?: or replace)? function public\.([a-z0-9_]+)\s*\(/g
      ),
    ].map((match) => match[1]);

    expect(createdPublicFunctions).toEqual([]);
    expect(compactMigration).not.toContain("authorize_match_proof_access");
    expect(compactMigration).not.toMatch(/\bgrant execute on function\b/);
  });

  it("limits the migration to permissions and policies", () => {
    expect(compactMigration).not.toMatch(
      /\b(?:create|drop)\s+table\b/
    );
    expect(compactMigration).not.toMatch(
      /\b(?:create|drop)\s+(?:unique\s+)?index\b/
    );
    expect(compactMigration).not.toMatch(
      /alter table public\.[a-z0-9_]+\s+(?:add|drop|alter)\s+(?:column|constraint)\b/
    );
    expect(compactMigration).not.toMatch(
      /\b(?:insert\s+into|update\s+(?:public|storage)\.|delete\s+from|truncate\s+(?:table\s+)?)\b/
    );
    expect(compactMigration).not.toMatch(
      /\bcreate(?: or replace)? function\b/
    );
    expect(compactMigration).not.toContain("storage.buckets");
    expect(compactMigration).not.toContain("replay_content_hash");
  });
});
