import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CANONICAL_MIGRATION, HISTORICAL_RECORDS, STAGING_PROJECT_REF,
  compareStagingMigrationBaseline,
} from "@/scripts/migrations/staging-migration-baseline";

const file = "20260914004801_player_combat_highlights.sql";
const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");
const migration = read("supabase/migrations/" + file);
const normalized = migration.toLowerCase().replace(/\s+/g, " ");
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
function body(name: string) {
  const start = migration.indexOf("create function " + name + "(");
  expect(start, name).toBeGreaterThanOrEqual(0);
  const from = migration.indexOf("as $$", start) + 5;
  return migration.slice(from, migration.indexOf("\n$$;", from));
}

describe("Combat Highlights database contract", () => {
  it("is additive and preserves the exact deployed Phase A migrations", () => {
    expect(migration.startsWith("begin;")).toBe(true);
    expect(migration.trim().endsWith("commit;")).toBe(true);
    expect(hash(read("supabase/migrations/20260909234122_player_showcase_phase_a.sql")))
      .toBe("1475d6bb94a7dee20e17d7c0cb4cc5f2b80b1163fe3f9e1520cd2b1e71885b6e");
    expect(hash(read("supabase/migrations/20260910020800_player_showcase_owner_read_rls.sql")))
      .toBe("78387a72713365898ce977159d2a0574bdfb68fe06bcea0e81fc9f814ff64319");
    expect(normalized).not.toMatch(/alter table public\.(players|player_showcases|player_badge_awards|registrations|tournaments)\b/);
    expect(normalized).not.toMatch(/(?:insert into|update|delete from) (?:storage\.|public\.(?:legal_documents|account_legal_acceptances|player_badge_awards|tournament_matches|registrations)\b)/);
    expect(normalized).toContain("values ('player_combat_highlights', '{\"enabled\": false}'::jsonb)");
    expect(body("public.player_combat_highlights_enabled")).toContain("public.player_showcase_enabled()");
  });

  it("enforces three stable slots, same-owner references and atomic reorder", () => {
    expect(normalized).toContain("slot_number between 1 and 3");
    expect(normalized).toContain("primary key (player_id, slot_number)");
    expect(normalized).toContain("unique (player_id, display_order) deferrable initially immediate");
    expect(normalized).toContain("foreign key (current_upload_id, player_id, slot_number)");
    expect(normalized).toContain("foreign key (pending_upload_id, player_id, slot_number)");
    expect(body("public.reorder_my_player_combat_highlights")).toContain("p_expected_revisions[v_index]");
    expect(body("public.reorder_my_player_combat_highlights")).toContain("set constraints public.combat_highlight_display_order_unique deferred");
    expect(body("ironclad_private.track_combat_highlight_slot")).toContain("new.revision := old.revision + 1");
  });

  it("derives owners and serializes every owner mutation before quota/revision checks", () => {
    const owner = body("ironclad_private.combat_highlight_owner");
    expect(owner).toContain("auth.jwt() ->> 'sub'");
    expect(owner).toContain("account_closed_at is null for update");
    for (const name of [
      "reserve_my_player_combat_highlight", "clear_my_player_combat_highlight",
      "cancel_my_player_combat_highlight_upload", "reorder_my_player_combat_highlights",
    ]) expect(body("public." + name)).toContain("combat_highlight_owner(true)");
    const reserve = body("public.reserve_my_player_combat_highlight");
    expect(reserve).toContain("'conflict',v_owner");
    expect(reserve).toContain("'upload-pending',v_owner");
    expect(reserve).toContain("'upload-limit',v_owner");
    expect(reserve).toContain("interval '1 hour')>=12");
    expect(reserve).toContain("state<>'deleted')>=9");
    expect(reserve).toContain("player_id=v_owner and request_id=p_request_id");
    expect(reserve).toContain("p_declaration_accepted is distinct from true");
  });

  it("keeps all new tables under forced RLS and private helper execution revoked", () => {
    const tables = [...migration.matchAll(/create table ([a-z_.]+) \(/g)].map((match) => match[1]);
    expect(tables).toEqual([
      "public.player_combat_highlight_slots",
      "ironclad_private.player_combat_highlight_uploads",
      "ironclad_private.player_combat_highlight_reports",
    ]);
    for (const table of tables) expect(normalized).toContain("alter table " + table + " force row level security");
    expect(normalized).not.toMatch(/grant (?:all|insert|update|delete)[^;]*on[^;]*to (?:anon|authenticated|service_role)/);
    expect(normalized).not.toMatch(/grant execute on function ironclad_private\./);
    expect(normalized).not.toMatch(/grant select[^;]*(?:verified|moderated_by_clerk_user_id|file_name)[^;]*to authenticated/);
    for (const match of migration.matchAll(/create function ([a-z_.]+)\(([^)]*)\)/g)) {
      const signature = match[1] + "(" + match[2].split(",").filter((part) => part.trim())
        .map((part) => part.trim().split(/\s+/)[1]).join(",") + ")";
      expect(normalized).toContain("revoke all on function " + signature + " from public,anon,authenticated,service_role");
    }
  });

  it("restricts verified metadata and privileged RPCs to the trusted server boundary", () => {
    for (const signature of [
      "complete_player_combat_highlight_upload(uuid,jsonb)",
      "moderate_player_combat_highlight(uuid,smallint,boolean,text,bigint)",
      "get_player_combat_highlights_for_moderation(uuid)",
      "claim_player_combat_highlight_cleanup(integer)",
      "finish_player_combat_highlight_cleanup(uuid,uuid,boolean,text)",
    ]) expect(normalized).toContain("grant execute on function public." + signature + " to service_role");
    const validation = body("ironclad_private.valid_combat_highlight_verified");
    for (const fragment of [
      "between 1 and 15000", "between 1 and 1920", "between 1 and 1080", "::numeric<=60",
      "'avc'", "'aac'", "'vp8','vp9'", "'opus','vorbis'", "^[0-9a-f]{64}$",
      "jsonb_object_keys(p_verified)", "::bigint=p_byte_length",
    ]) expect(validation).toContain(fragment);
    expect(normalized).toContain("byte_length between 1 and 15000000");
    expect(normalized).toContain("poster_byte_length between 0 and 200000");
    expect(normalized).toContain("combat_highlight_verified_metadata_check");
    expect(body("public.complete_player_combat_highlight_upload")).toContain("valid_combat_highlight_verified");
  });

  it("keeps current media until a matching ready replacement and never clears holds", () => {
    const reserve = body("public.reserve_my_player_combat_highlight");
    expect(reserve).not.toMatch(/set current_upload_id/);
    const complete = body("public.complete_player_combat_highlight_upload");
    expect(complete).toContain("v_slot.pending_upload_id is distinct from p_upload_id");
    expect(complete).toContain("v_upload.verified=p_verified");
    expect(complete).toContain("state='ready',verified=p_verified");
    expect(complete).toContain("current_upload_id=p_upload_id,pending_upload_id=null");
    expect(complete).toContain("player_showcase_has_current_legal_acceptance(v_sub)");
    expect(complete).not.toMatch(/set hidden_at|hidden_at=null/);
    for (const name of ["clear_my_player_combat_highlight", "cancel_my_player_combat_highlight_upload"]) {
      const removal = body("public." + name);
      expect(removal).not.toContain("player_showcase_has_current_legal_acceptance");
      expect(removal).not.toContain("player_combat_highlights_enabled()");
      expect(removal).not.toMatch(/set hidden_at|hidden_at=null/);
    }
  });

  it("exposes only safe descriptors and denies stale/public/private-account media paths", () => {
    const eligibility = body("public.can_read_public_player_combat_highlight");
    for (const fragment of ["current_upload_id=u.id", "u.state='ready'", "s.hidden_at is null",
      "p.account_closed_at is null", "p.public_profile_enabled is true", "player_combat_highlights_enabled()"])
      expect(eligibility).toContain(fragment);
    const projection = body("public.get_public_player_combat_highlights");
    expect(projection).toContain("can_read_public_player_combat_highlight(u.id)");
    expect(projection).not.toMatch(/fileName|file_name|sha256|etag|declaration|clerk|reporter|request_id/);
    const owner = body("public.can_access_my_player_combat_highlight");
    expect(owner).toContain("combat_highlight_owner(false)");
    expect(owner).toContain("p_purpose not in ('read','upload')");
    expect(owner).toContain("v_upload.expires_at>clock_timestamp()");
    expect(owner).toContain("player_showcase_has_current_legal_acceptance");
  });

  it("expires reservations and preserves cleanup work and leases through closure", () => {
    const claim = body("public.claim_player_combat_highlight_cleanup");
    expect(claim).toContain("for update of p skip locked");
    expect(claim).toContain("pending_upload_id=null");
    expect(claim).toContain("expires_at<=clock_timestamp()");
    expect(claim).toContain("for update skip locked");
    const finish = body("public.finish_player_combat_highlight_cleanup");
    expect(finish).toContain("cleanup_claim_token is distinct from p_claim_token");
    expect(finish).toContain("cleanup_claim_expires_at<=clock_timestamp()");
    expect(finish).toContain("cleanup_after=clock_timestamp()+make_interval");
    expect(finish).not.toContain("player_id=null");
    const guard = body("ironclad_private.protect_combat_highlight_upload");
    expect(guard).toContain("old.state <> 'delete_pending'");
    expect(guard).toContain("new.title := null");
    expect(guard).toContain("new.file_name := null");
    const closure = body("public.close_ironclad_player_account");
    expect(closure.indexOf("for update")).toBeLessThan(closure.indexOf("delete from public.player_combat_highlight_slots"));
    expect(closure).toContain("return public.close_ironclad_player_account_without_combat_highlights(v_sub)");
    expect(closure).not.toMatch(/delete from public\.(?:players|player_badge_awards|registrations)\b/);
  });

  it("keeps reports idempotent and the admin datasource bounded and private", () => {
    expect(body("public.report_player_combat_highlight")).toContain("on conflict (upload_id,reporter_player_id) do nothing");
    const admin = body("public.get_player_combat_highlights_for_moderation");
    expect(admin).toContain("p_player_id is null and r.id is not null");
    expect(admin).toContain("limit 50");
    expect(admin).not.toMatch(/fileName|sha256|etag|clerk_user_id/);
  });

  it("treats this new migration as unapproved pending until separately pinned", () => {
    const localMigrations = readdirSync(resolve(process.cwd(), "supabase/migrations"))
      .filter((name) => /^\d{14}_.*\.sql$/.test(name)).sort()
      .map((name) => ({ version: name.slice(0, 14), name: name.slice(15, -4), sql: read("supabase/migrations/" + name) }));
    const version = file.slice(0, 14);
    const input = {
      projectRef: STAGING_PROJECT_REF, localMigrations,
      remoteMigrations: [
        ...localMigrations.filter((row) => row.version !== version && row.version !== CANONICAL_MIGRATION.version)
          .map(({ version: v, name }) => ({ version: v, name })),
        ...HISTORICAL_RECORDS.map((row) => JSON.parse(read("docs/staging-migration-history/" + row.version + ".json"))),
      ],
    };
    expect(compareStagingMigrationBaseline(input)).toMatchObject({ ok: false,
      issues: expect.arrayContaining([{ code: "unapproved-local-only-version", version }]) });
    expect(compareStagingMigrationBaseline({ ...input,
      approvedPendingMigrations: [{ version, name: "player_combat_highlights", sha256: hash(migration) }],
    })).toMatchObject({ ok: true, issues: [], pendingVersions: [version] });
  });

  it("binds immutable upload IDs to signed requests and rejects cross-owner collisions", () => {
    const reserve = body("public.reserve_my_player_combat_highlight");
    expect(reserve).toContain("where id=p_request_id");
    expect(reserve).toContain("values (p_request_id,v_owner,p_slot_number,p_request_id");
    expect(reserve).toContain("on conflict (id) do nothing returning id into v_id");
    expect(reserve).toContain("if v_id is null then");
    expect(normalized).toContain("combat_highlight_owner_created_idx");
    expect(normalized).toContain("combat_highlight_owner_active_idx");
    const closure = body("public.close_ironclad_player_account");
    expect(closure.indexOf("set current_upload_id=null,pending_upload_id=null"))
      .toBeLessThan(closure.indexOf("delete from public.player_combat_highlight_slots"));
  });

  it("prepares an exact guarded rollback contract without live account or authority mutations", () => {
    const runtime = read("tests/database/player-combat-highlights-staging-contract.sql");
    expect(runtime).toContain("zzbnneprhjicmajpjkdg");
    expect(runtime).toContain("(select count(*) from supabase_migrations.schema_migrations)<>151");
    expect(runtime).toContain(hash(migration));
    expect(runtime).toContain("exists(select 1 from ironclad_private.player_combat_highlight_uploads)");
    expect(runtime).toContain("exists(select 1 from ironclad_private.player_combat_highlight_reports)");
    expect(runtime).toContain("create temporary table combat_contract_checks(label text primary key)");
    expect(runtime).toContain("set local role authenticated");
    expect(runtime).toContain("set local role anon");
    expect(runtime).toContain("set local role service_role");
    expect(runtime).not.toMatch(/(?:select|perform) public\.close_ironclad_player_account\(/i);
    expect(runtime).not.toMatch(/(?:insert into|delete from) public\.players\b/i);
    expect(runtime).not.toMatch(/(?:insert into|update|delete from) (?:storage\.|public\.(?:legal_documents|account_legal_acceptances|player_badge_awards|tournament_matches|registrations)\b)/i);
    expect(runtime).not.toMatch(/^commit;/im);
    expect(runtime).toContain("\nrollback;\nselect 'PASS:");
    const local = read("tests/database/player-combat-highlights-local.mjs");
    expect(local).toContain("PGlite.create()");
    expect(local).toContain('version, "0.5.8"');
    expect(local).toContain("intact Staging guard refuses local fixture history");
    expect(local).toContain("closure executes with current and pending composite FKs");
    expect(local).toContain("twelve attempts per hour survives successful cleanup");
    expect(local).not.toMatch(/process\.env|connectionString|DATABASE_URL|SUPABASE_URL/);
  });

});
