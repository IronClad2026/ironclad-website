import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20261027181708_public_competitive_profile_read_projections.sql", "utf8");
const body = sql.replace(/--[^\n]*/g, "");
const expected = ["leaderboard_public_all_time_standings", "leaderboard_public_season_champions", "leaderboard_public_season_standings", "public_player_profiles", "public_player_showcases"];

describe("permanent public competitive read projection migration", () => {
  it("replaces only the audited views and two read helpers and keeps the legacy column", () => {
    expect([...new Set([...body.matchAll(/create or replace view public\.([a-z_]+)/g)].map((match) => match[1]))].sort()).toEqual(expected);
    expect(body).not.toMatch(/\b(?:insert\s+into|update\s+public\.|delete\s+from|truncate|drop\s+|alter\s+table|recalculate|settle_)\b/i);
    expect([...body.matchAll(/create or replace function ([a-z_.]+)\(/gi)].map((match) => match[1])).toEqual([
      "ironclad_private.combat_highlight_state", "public.can_read_public_player_combat_highlight",
    ]);
    expect(body).toContain("    public_profile_enabled,");
  });

  it("retains owner-rights security barriers without granting raw-table access", () => {
    expect(body.match(/with \(security_barrier = true, security_invoker = false\)/g)).toHaveLength(7);
    expect(body).toContain("pg_get_userbyid(actual.relowner) <> 'postgres'");
    expect(body).not.toMatch(/\b(?:grant|revoke|alter\s+view.*owner)\b/i);
    expect(body).toContain("set local lock_timeout = '5s'");
    expect(body).toContain("Public profile projection precondition failed");
  });

  it("preserves both reviewed environment sources rather than introducing a competition bridge", () => {
    expect(body).toContain("Incomplete leaderboard bridge");
    expect(body).toContain("FROM ironclad_private.leaderboard_official_season_standings official");
    expect(body).toContain("UNION ALL");
    expect(body).toContain("AS last_tournament_bracket_type");
    expect(body).toContain("FROM leaderboard_player_season_stats season_stats");
    expect(body).not.toMatch(/create.*(?:table|schema)\s+ironclad_private/i);
  });

  it("removes the legacy flag from visibility predicates and preserves closure masking", () => {
    expect(body).not.toMatch(/(?:when|where|and)\s+(?:player\.)?public_profile_enabled/i);
    expect(body).toContain("WHERE account_closed_at IS NULL");
    expect(body.match(/THEN 'Former Competitor'::text/g)?.length).toBeGreaterThanOrEqual(6);
    expect(body).toContain("ELSE 'private-champion:'::text || md5(champion.id::text)");
    expect(body).toContain("WHEN player.account_closed_at IS NULL THEN player.current_elo");
  });

  it("retains independent Discord consent and suppresses raw avatar paths", () => {
    expect(body).toContain("WHEN discord_public_enabled THEN discord_username");
    expect(body).toContain("NULL::text AS avatar_url");
    expect(body).not.toMatch(/(?:clerk_user_id|email|admin_notes|ip_address|steam_id64|replay_path|signed_url)/i);
    expect(body).toContain("WHEN showcase.thought_hidden_at IS NULL THEN showcase.current_thought");
  });

  it("retains all clip eligibility conditions and removes the obsolete state field", () => {
    const helper = body.slice(body.indexOf("CREATE OR REPLACE FUNCTION public.can_read_public_player_combat_highlight"));
    for (const condition of ["public.player_combat_highlights_enabled()", "s.current_upload_id=u.id", "u.state='ready'", "u.verified is not null", "s.hidden_at is null", "p.account_closed_at is null"]) {
      expect(helper).toContain(condition);
    }
    expect(body).not.toContain("publicProfileEnabled");
    expect(helper).not.toContain("public_profile_enabled");
    expect(body).toContain("Combat Highlights read-helper precondition failed");
    expect(body).toContain("array['search_path=pg_catalog']::text[]");
    expect(body.match(/STABLE SECURITY DEFINER/g)).toHaveLength(2);
  });
});
