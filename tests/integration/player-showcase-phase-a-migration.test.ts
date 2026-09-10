import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { BADGE_DEFINITIONS } from "@/lib/badges/catalog";

const migrationName = "20260909234122_player_showcase_phase_a.sql";
const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations", migrationName),
  "utf8"
).replace(/\r\n?/g, "\n");
const normalized = migration.toLowerCase().replace(/\s+/g, " ").trim();

function functionBody(name: string) {
  const start = migration.indexOf(`create function ${name}(`);
  expect(start, `Missing function ${name}`).toBeGreaterThanOrEqual(0);
  const bodyStart = migration.indexOf("as $$", start) + "as $$".length;
  return migration.slice(bodyStart, migration.indexOf("\n$$;", bodyStart));
}

describe("Player Showcase Phase A migration contract", () => {
  it("is additive and leaves award, competition and existing profile authorities intact", () => {
    const migrations = readdirSync(resolve(process.cwd(), "supabase/migrations")).sort();
    expect(migrations.indexOf(migrationName)).toBeGreaterThan(
      migrations.indexOf("20260904120000_canonical_division_launch_ordering.sql")
    );
    expect(normalized.startsWith("begin;")).toBe(true);
    expect(normalized.endsWith("commit;")).toBe(true);
    expect(normalized).not.toMatch(
      /alter table public\.(?:players|player_badge_awards|registrations|tournament_matches)\b/
    );
    expect(normalized).not.toMatch(
      /(?:create or replace|drop) view public\.public_player_profiles\b/
    );
    expect(normalized).not.toMatch(/(?:storage\.(?:buckets|objects)|pg_get_functiondef)/);
    expect(normalized).toContain("values ('player_showcase', '{\"enabled\": false}'::jsonb)");
    expect(normalized).toContain("server_version_num");
    expect(normalized).toContain("on delete set null (featured_badge_award_id)");
    expect(normalized).toContain(
      "foreign key (featured_badge_award_id, player_id) references public.player_badge_awards(id, player_id)"
    );
  });

  it("keeps the public badge presentation allowlist equal to the canonical catalog", () => {
    const body = functionBody("ironclad_private.player_showcase_badge_slug_allowed");
    const sqlSlugs = [...body.matchAll(/'([a-z]+(?:-[a-z]+)*)'/g)].map((match) => match[1]);
    expect(sqlSlugs).toHaveLength(BADGE_DEFINITIONS.length);
    const canonicalSlugs = BADGE_DEFINITIONS.map((badge) => badge.slug).sort();
    expect([...sqlSlugs].sort()).toEqual(canonicalSlugs);
    const viewAllowlist = migration.match(/award\.badge_slug = any \(array\[([\s\S]*?)\]::text\[\]\)/)?.[1];
    expect(viewAllowlist).toBeDefined();
    expect(
      [...viewAllowlist!.matchAll(/'([a-z]+(?:-[a-z]+)*)'/g)]
        .map((match) => match[1]).sort()
    ).toEqual(canonicalSlugs);
  });

  it("exposes a separate privacy-gated allowlist without weakening existing grants", () => {
    const start = normalized.indexOf("create view public.public_player_showcases");
    const end = normalized.indexOf("alter view public.public_player_showcases", start);
    const view = normalized.slice(start, end);
    expect(view).toContain("security_barrier = true, security_invoker = false");
    expect(view).toContain("where public.player_showcase_enabled()");
    expect(view).toContain("player.public_profile_enabled is true");
    expect(view).toContain("player.account_closed_at is null");
    expect(view).toContain(
      "case when showcase.thought_hidden_at is null then showcase.current_thought else null end"
    );
    expect(view).toContain("award.player_id = showcase.player_id");
    expect(view).toContain("award.badge_slug = any (array[");
    expect(view).not.toContain("ironclad_private.");
    expect(view).not.toMatch(/source_metadata|source_id|clerk_user_id|original_unlocked_at/);
    expect(normalized).not.toMatch(
      /grant\s+(?:all|insert|update|delete)[^;]*on (?:table )?public\.(?:player_showcases|player_badge_awards)[^;]*to (?:anon|authenticated)/
    );
    expect(normalized).toContain(
      "alter table public.player_showcases force row level security"
    );
  });

  it("keeps self mutation identity out of public parameters and moderation service-only", () => {
    const thought = functionBody("public.save_my_player_showcase_thought");
    const badge = functionBody("public.save_my_player_showcase_badge");
    expect(thought).toContain("'thought', p_current_thought, null, p_expected_revision");
    expect(badge).toContain("'badge', null, p_award_id, p_expected_revision");
    const shared = functionBody("ironclad_private.save_my_player_showcase_field");
    expect(shared).toContain("auth.jwt() ->> 'sub'");
    expect(shared).toContain("player.clerk_user_id = v_clerk_user_id");
    expect(shared).toContain("player.account_closed_at is null");
    expect(normalized).toContain(
      "grant execute on function public.moderate_player_showcase_thought(uuid, boolean, text, bigint) to service_role"
    );
    expect(normalized).not.toMatch(
      /grant execute on function public\.moderate_player_showcase_thought[^;]*to (?:anon|authenticated)/
    );
    expect(normalized).not.toMatch(
      /grant execute on function ironclad_private\.[^;]*to (?:public|anon|authenticated|service_role)/
    );
  });

  it("serializes absent-row writes, preserves moderation holds and returns conflict state", () => {
    const shared = functionBody("ironclad_private.save_my_player_showcase_field");
    const playerLock = shared.indexOf("for update;");
    const badgeLock = shared.indexOf("for key share;");
    const showcaseLock = shared.indexOf("for update;", playerLock + 1);
    expect(playerLock).toBeGreaterThan(0);
    expect(badgeLock).toBeGreaterThan(playerLock);
    expect(showcaseLock).toBeGreaterThan(badgeLock);
    expect(shared).toContain("coalesce(v_showcase.revision, 0) <> p_expected_revision");
    expect(shared).toContain("'code', 'conflict', 'showcase', v_state");
    expect(shared).not.toMatch(/set\s+thought_hidden_at\s*=/);
    expect(shared).toContain("player_showcase_has_current_legal_acceptance");
    expect(shared).toContain("p_field = 'thought' and v_thought is not null");
    const revision = functionBody("ironclad_private.track_player_showcase_revision");
    expect(revision).toContain(
      "new.featured_badge_award_id is distinct from old.featured_badge_award_id"
    );
    expect(revision).toContain("new.revision := old.revision + 1");
  });

  it("preserves the latest closure chain and removes content for retained historical players", () => {
    const closure = functionBody("public.close_ironclad_player_account");
    expect(normalized).toContain(
      "rename to close_ironclad_player_account_without_showcase_cleanup"
    );
    expect(normalized).toContain(
      "revoke all on function public.close_ironclad_player_account_without_showcase_cleanup(text) from public, anon, authenticated, service_role"
    );
    const announcementLock = closure.indexOf("ironclad:announcement-account:");
    const playerLock = closure.indexOf("for update;");
    const contentDelete = closure.indexOf("delete from public.player_showcases");
    const delegate = closure.indexOf(
      "return public.close_ironclad_player_account_without_showcase_cleanup"
    );
    expect(playerLock).toBeGreaterThan(announcementLock);
    expect(contentDelete).toBeGreaterThan(playerLock);
    expect(delegate).toBeGreaterThan(contentDelete);
    expect(closure).toContain("set thought_moderated_by_clerk_user_id = null");
    expect(closure).not.toMatch(/delete from public\.(?:players|registrations|player_badge_awards)\b/);
  });
});
