import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const directory = resolve(process.cwd(), "supabase/migrations");
const name = "20260919235836_match_room_phase_three.sql";
const source = readFileSync(resolve(directory, name), "utf8");
const sql = source.replace(/--[^\n]*/g, "").replace(/\s+/g, " ").trim();
const fixture = readFileSync(resolve(process.cwd(), "tests/database/match-room-phase-3.sql"), "utf8");
const races = readFileSync(resolve(process.cwd(), "tests/database/match-room-phase-3-concurrency.mjs"), "utf8");

describe("Match Room Phase 3 migration boundary", () => {
  it("adds only operational state in one forward transaction", () => {
    expect(readdirSync(directory).sort().at(-1)).toBe(name);
    expect(sql).toMatch(/^begin;.*commit;$/i);
    expect(sql).not.toMatch(/pg_get_functiondef|create extension|create publication|cron\.|storage\./i);
    expect(sql).not.toMatch(/(?:update|delete from|insert into) public\.(?:tournament_matches|tournaments|registrations|match_result|leaderboard)/i);
    for (const table of ["match_room_notification_episodes", "match_room_assistance"]) {
      expect(sql).toContain("alter table public." + table + " enable row level security;");
      expect(sql).toContain("alter table public." + table + " force row level security;");
    }
    expect(sql).not.toMatch(/grant (?:all|select|insert|update|delete|truncate)\b/i);
  });
  it("keeps privileged helpers private and exposes separate authenticated and service contracts", () => {
    expect(sql).toContain("from public, anon, authenticated, service_role;");
    expect(sql).toContain("public.get_match_room_assistance(uuid)");
    expect(sql).toContain("public.request_match_room_assistance(uuid, bigint)");
    expect(sql).toContain("public.resolve_match_room_assistance(uuid, bigint)");
    expect(sql).toContain("grant execute on function public.list_match_room_assistance_requests(integer), public.close_ironclad_player_account(text) to service_role;");
    for (const signature of [...sql.matchAll(/create (?:or replace )?function [\w.]+\([^]*?\bas \$\$/gi)]) {
      expect(signature[0]).toMatch(/security definer set search_path = pg_catalog/i);
    }
  });
  it("coordinates one generic notification per private episode with the authoritative cursor", () => {
    expect(sql).toContain("create trigger match_messages_notify_episode after insert on public.match_messages");
    expect(sql).toContain("recipient_registration_id) where resolved_at is null;");
    expect(sql).toContain("r.clerk_user_id is distinct from new.actor_clerk_user_id");
    expect(sql).toContain("if v_last >= v_room.last_sequence then");
    expect(sql).toContain("'episodeId', v_episode_id");
    const trigger = sql.slice(sql.indexOf("create function ironclad_private.notify_match_room_message"), sql.indexOf("create function ironclad_private.finish_match_room_notification"));
    expect(trigger).not.toContain("new.body");
    expect(trigger).not.toContain("in_app_hidden_at");
    expect(trigger).not.toContain("read_at");
    expect(sql).toContain("case when notification.type = 'match.message_received' then 1 else 0 end");
  });
  it("keeps assistance resolution explicit, versioned and distinct from notification dismissal", () => {
    expect(sql).toContain("p_expected_request_version <> coalesce(v_state.request_version, 0)");
    expect(sql).toContain("status = 'resolved', resolved_at = clock_timestamp()");
    expect(sql).toContain("with requested as materialized");
    expect(sql).toContain("n.registration_id in (r.player_one_registration_id, r.player_two_registration_id)");
    expect(sql).toContain("metadata ->> 'roomId' = p_room_id::text");
  });
  it("maintains backward cursor and closure lock ordering with executable adversarial coverage", () => {
    expect(sql).toContain("sequence < p_before_sequence order by sequence desc limit p_limit");
    expect(sql).toContain("order by m.sequence");
    expect(sql).toContain("pg_advisory_xact_lock_shared(hashtextextended('ironclad:match-room-account-closure', 0))");
    expect(sql).toContain("pg_advisory_xact_lock(hashtextextended('ironclad:match-room-account-closure', 0))");
    expect(fixture).toMatch(/^rollback;/m);
    expect(fixture).not.toMatch(/^commit;/m);
    for (const caseName of ["bell dismissal cannot start", "replacement C cannot read AB assistance", "critical notification outranks", "notification insertion failure"]) {
      expect(fixture).toContain(caseName);
    }
    expect(races).toContain("recipient closure before send");
    expect(races).toContain("recipient closure after send");
    expect(races).toContain("without actor-lock deadlock");
  });
});
