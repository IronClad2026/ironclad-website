import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260806120000_private_registration_admin_notes.sql"
  ),
  "utf8"
);
const compactMigration = migration.toLowerCase().replace(/\s+/g, " ").trim();

const authenticatedRegistrationColumns = [
  "id",
  "profile_id",
  "clerk_user_id",
  "player_name",
  "discord_username",
  "steam_name",
  "coh3_player_card_url",
  "country",
  "region",
  "timezone",
  "submitted_elo",
  "tournament_title",
  "bracket_name",
  "registration_status",
  "elo_status",
  "created_at",
  "updated_at",
  "tournament_id",
  "tournament_bracket_id",
  "elo_verified_elo",
  "elo_difference",
  "elo_highest_faction",
  "elo_checked_mode",
  "elo_checked_at",
  "elo_verification_source",
  "elo_verification_error",
  "elo_verification_payload",
  "elo_verified_player_name",
  "elo_identity_status",
  "elo_identity_error",
  "elo_verified_division",
  "elo_calculation_version",
] as const;

function extractAuthenticatedSelectColumns() {
  const match = compactMigration.match(
    /grant select \((.*?)\) on table public\.registrations to authenticated;/
  );

  if (!match) {
    throw new Error("Authenticated registration column grant was not found.");
  }

  return match[1].split(",").map((column) => column.trim());
}

describe("private registration administrator-notes migration", () => {
  it("replaces authenticated table SELECT with an explicit column grant", () => {
    expect(compactMigration).toContain(
      "revoke select on table public.registrations from authenticated;"
    );
    expect(compactMigration).not.toMatch(
      /grant select on table public\.registrations to authenticated;/
    );
  });

  it("grants all 32 non-private registration columns and excludes admin_notes", () => {
    const columns = extractAuthenticatedSelectColumns();

    expect(columns).toHaveLength(32);
    expect(columns).toEqual(authenticatedRegistrationColumns);
    expect(columns).not.toContain("admin_notes");
    expect(new Set(columns).size).toBe(columns.length);
  });

  it("documents admin_notes as private without changing its schema", () => {
    expect(compactMigration).toContain(
      "comment on column public.registrations.admin_notes is 'private administrator-only registration review context. never include this column in player-facing or public projections.';"
    );
    expect(compactMigration).not.toMatch(
      /alter table public\.registrations\s+(?:add|drop|alter)\s+(?:column|constraint)\b/
    );
  });

  it("leaves RLS policies and service-role access unchanged", () => {
    expect(compactMigration).not.toMatch(
      /alter table public\.registrations\s+(?:enable|disable|force|no force)\s+row level security/
    );
    expect(compactMigration).not.toMatch(/\b(?:create|alter|drop) policy\b/);
    expect(compactMigration).not.toContain("service_role");
  });

  it("contains only the narrow permission and documentation change", () => {
    expect(compactMigration.startsWith("begin;")).toBe(true);
    expect(compactMigration.endsWith("commit;")).toBe(true);
    expect(compactMigration).not.toMatch(/\bcreate(?: or replace)? function\b/);
    expect(compactMigration).not.toMatch(/\b(?:create|drop) trigger\b/);
    expect(compactMigration).not.toMatch(/\b(?:insert into|update|delete from|truncate)\b/);
    expect(compactMigration).not.toMatch(/\b(?:create|drop) table\b/);
  });
});
