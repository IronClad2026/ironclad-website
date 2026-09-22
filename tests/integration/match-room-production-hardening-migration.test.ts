import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const directory = resolve(process.cwd(), "supabase/migrations");
const name = "20260920014644_match_room_production_hardening.sql";
const sql = readFileSync(resolve(directory, name), "utf8").replace(/--[^\n]*/g, "").replace(/\s+/g, " ").trim();
const fixture = readFileSync(resolve(process.cwd(), "tests/database/match-room-production-hardening.sql"), "utf8");
const races = readFileSync(resolve(process.cwd(), "tests/database/match-room-production-hardening-concurrency.mjs"), "utf8");

describe("Match Room production hardening migration boundary", () => {
  it("is a forward transaction without competitive or storage changes", () => {
    expect(readdirSync(directory).sort().filter((entry) => entry <= name).at(-1)).toBe(name);
    expect(sql).toMatch(/^begin;.*commit;$/i);
    expect(sql).not.toMatch(/pg_get_functiondef|create extension|create trigger|create publication|cron\.|storage\./i);
    expect(sql).not.toMatch(/(?:update|delete from|insert into) public\.(?:tournament_matches|tournaments|registrations|match_result|leaderboard)/i);
    expect(sql).not.toMatch(/create (?:or replace )?function public\.(?:admin_reset|close_|apply_|settle_|recalculate_)/i);
  });
  it("uses one service-managed fail-closed setting and no raw API grants", () => {
    expect(sql).toContain("values ('match_room', '{\"enabled\": false}'::jsonb) on conflict (key) do nothing;");
    expect(sql).toContain("grant execute on function public.get_match_room_enabled() to authenticated, service_role;");
    expect(sql).toContain("grant execute on function public.set_match_room_enabled(boolean, text) to service_role;");
    expect(sql).not.toMatch(/grant (?:all|select|insert|update|delete|truncate)\b/i);
    expect(sql).toContain("from public, anon, authenticated, service_role;");
    expect(sql).toContain("from public.platform_settings where key = 'match_room' for share;");
    expect(sql).toContain("raise exception 'MATCH_ROOM_DISABLED' using errcode = 'P0001';");
  });
  it("never waits on upstream Tournament while owning Match", () => {
    expect(sql).toContain("from public.tournament_matches where id = p_match_id for update;");
    expect(sql).toContain("from public.tournaments where id = v_tournament_id for share nowait;");
    expect(sql).not.toContain("pg_advisory");
    expect(races).toContain("close_tournament_division_without_launch");
    expect(races).toContain("apply_admin_official_match_result_api");
    expect(races).toContain("admin_reset_tournament_match");
    expect(races).toContain("close_ironclad_player_account");
    expect(races).toContain("55P03");
  });
  it("keeps historical evidence and prevents disabled creation at the database boundary", () => {
    expect(sql).toContain("'writable', p_room.closed_at is null and public.get_match_room_enabled()");
    expect(sql).toContain("if not v_enabled or not (v_context ->> 'eligible')::boolean");
    expect(sql.match(/perform ironclad_private.require_match_room_enabled\(\);/g)).toHaveLength(3);
    expect(fixture).toMatch(/^rollback;/m);
    expect(fixture).not.toMatch(/^commit;/m);
    for (const text of ["disabled history is read-only", "assistance reopening blocked", "closed identity denied", "preserve competitive facts"]) expect(fixture).toContain(text);
    expect(races).toContain("disable-first rejects");
    expect(races).toContain("disable waits for admitted send");
  });
});
