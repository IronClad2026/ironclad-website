import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");
const realtime = read("supabase/migrations/20260928030150_match_room_private_realtime.sql");
const foundation = read("supabase/migrations/20260928030127_match_room_staging_foundation.sql");
const sql = realtime.replace(/--[^\n]*/g, "").replace(/\s+/g, " ").trim();

describe("Match Room private Realtime database boundary", () => {
  it("adds only supported Realtime policies and private minimal invalidation", () => {
    expect(sql).toMatch(/^begin;.*commit;$/);
    expect(sql).toContain("perform realtime.send( jsonb_build_object('roomId', p_room.id, 'communicationGeneration', p_room.communication_generation)");
    expect(sql).toContain("'invalidate', 'match-room:' || p_room.id::text || ':' || p_room.communication_generation::text, true)");
    expect(sql).not.toMatch(/broadcast_changes|publication|grant (?:all|select|insert|update|delete)\b|alter (?:table|function|schema) realtime\./i);
    expect(sql).toContain("create policy match_room_no_client_broadcast on realtime.messages as restrictive for insert");
    expect(sql).toContain("create policy match_room_receive_guard on realtime.messages as restrictive for select");
  });

  it("requires current identity, generation and writable lifecycle with no user metadata authority", () => {
    for (const fragment of [
      "auth.jwt() ->> 'role' = 'authenticated'",
      "p.account_closed_at is null",
      "and public.get_match_room_enabled()",
      "room.communication_generation = m.communication_generation",
      "room.player_one_registration_id = m.player_one_registration_id",
      "room.player_two_registration_id = m.player_two_registration_id",
      "room.closed_at is null and room.content_purged_at is null",
      "auth.jwt() -> 'metadata' ->> 'role'",
      "r.clerk_user_id = auth.jwt() ->> 'sub'",
      "m.outcome_type is null",
      "topic = (select realtime.topic())",
    ]) expect(sql).toContain(fragment);
    expect(sql).not.toContain("user_metadata");
    expect(sql).toContain("from public, anon, authenticated, service_role");
  });

  it("retains a final old-room wake-up and independent polling when transport fails", () => {
    expect(sql).toContain("perform ironclad_private.broadcast_match_room_invalidation(old)");
    expect(sql).toContain("after update of value on public.platform_settings");
    expect(sql).toContain("after insert on public.match_messages");
    expect(sql).toContain("exception when others then raise warning");
    expect(sql).not.toMatch(/set last_read_sequence|mark_match_room_read|message\.body|new\.body/);
  });

  it("reconciles missing privacy and OFF-resolution foundation without bootstrap or gate changes", () => {
    expect(foundation).toContain("create or replace function public.resolve_match_room_assistance");
    expect(foundation).toContain("perform ironclad_private.require_match_room_enabled();");
    expect(foundation).toContain("create function public.purge_match_room_retention");
    expect(foundation).toContain("add column author_player_id uuid");
    expect(foundation).toContain("add column content_purged_at timestamptz");
    expect(foundation).not.toMatch(/insert into public\.platform_settings|set_match_room_enabled\(|pre-P03 baseline/);
  });
});
