import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260826100000_official_announcements.sql"
  ),
  "utf8"
).replace(/\r\n?/g, "\n").toLowerCase();
const normalizedMigration = migration.replace(/\s+/g, " ");
const databaseContract = readFileSync(
  join(process.cwd(), "tests/database/official-announcements.sql"),
  "utf8"
).toLowerCase();

describe("official announcements migration", () => {
  it("is one forward-only additive transaction with two isolated tables", () => {
    expect(migration.trimStart()).toMatch(/^begin;/);
    expect(migration.trimEnd()).toMatch(/commit;$/);
    expect(migration).toContain("create table public.announcements");
    expect(migration).toContain("create table public.announcement_read_states");
    expect(migration).not.toMatch(/drop table|truncate table/);
    expect(migration).not.toContain("create table public.notifications");
  });

  it("locks media coherence, one-item state, and active ordering", () => {
    expect(migration).toContain("announcements_media_check");
    for (const pair of [
      ["image/jpeg", "\\.jpg$"],
      ["image/png", "\\.png$"],
      ["image/webp", "\\.webp$"],
      ["video/mp4", "\\.mp4$"],
      ["video/webm", "\\.webm$"],
    ]) {
      expect(migration).toContain(pair[0]);
      expect(migration).toContain(pair[1]);
    }
    expect(migration).toContain("announcements_latest_active_idx");
    expect(migration).toContain("published_at desc, id desc");
    expect(migration).toContain("where withdrawn_at is null");
    expect(migration).toContain(
      "date_trunc('milliseconds', pg_catalog.clock_timestamp())"
    );
  });

  it("forces RLS and grants only safe projections or service RPCs", () => {
    expect(migration).toContain("alter table public.announcements force row level security");
    expect(migration).toContain("alter table public.announcement_read_states force row level security");
    expect(migration).toContain(
      "revoke all on table public.announcements\n  from public, anon, authenticated, service_role"
    );
    expect(migration).toContain("grant select on table public.announcements to service_role");
    expect(migration).not.toMatch(/grant (insert|update|delete).*table public\.announcements/);
    expect(migration).toContain(
      "grant execute on function public.list_active_announcements()\n  to service_role"
    );
    expect(migration).toContain(
      "grant execute on function public.get_latest_active_announcement()\n  to service_role"
    );
    expect(migration).not.toMatch(
      /grant execute on function public\.(list_active_announcements|get_latest_active_announcement)\([^;]*\)\s+to (anon|authenticated)/
    );
    expect(migration).toContain(
      "grant execute on function public.publish_official_announcement"
    );
    expect(migration).toContain("to service_role;");
  });

  it("grants each trusted RPC by exact signature to service role only", () => {
    for (const signature of [
      "list_active_announcements()",
      "get_latest_active_announcement()",
      "get_announcement_navigation_state(text)",
      "mark_announcement_seen(text, uuid)",
      "publish_official_announcement( text, text, text, text, text, text, text )",
      "withdraw_official_announcement(uuid, text)",
    ]) {
      expect(normalizedMigration).toContain(
        `grant execute on function public.${signature} to service_role;`
      );
      expect(normalizedMigration).not.toMatch(
        new RegExp(
          `grant execute on function public\\.${escapeRegExp(signature)} to (?:anon|authenticated|public)`
        )
      );
    }
  });

  it("projects active public fields only and keeps internal actors private", () => {
    const publicFeed = functionBody("list_active_announcements");
    const latest = functionBody("get_latest_active_announcement");
    expect(publicFeed).toContain("announcement.withdrawn_at is null");
    expect(publicFeed).toContain("announcement.published_at");
    expect(publicFeed).not.toContain("published_by_clerk_user_id");
    expect(publicFeed).not.toContain("withdrawn_by_clerk_user_id");
    expect(latest).toContain("announcement.withdrawn_at is null");
    expect(latest).not.toContain("title");
    expect(latest).not.toContain("body");
  });

  it("uses a self-consistent monotonic per-account read cursor", () => {
    expect(migration).toContain("announcements_id_published_at_unique");
    expect(migration).toContain("announcement_read_states_cursor_fk");
    const mark = functionBody("mark_announcement_seen");
    expect(mark).toContain("p_announcement_id");
    expect(mark).toContain("announcement.withdrawn_at is null");
    expect(mark).toContain("on conflict (clerk_user_id) do update");
    expect(mark).toContain("read_state.last_seen_published_at");
    expect(mark).toContain("excluded.last_seen_published_at");
    expect(mark).toContain("pg_advisory_xact_lock");
  });

  it("creates one exact public-safe bucket without browser mutation policies", () => {
    expect(migration).toContain("'announcement-media'");
    expect(migration).toContain("52428800");
    for (const mimeType of [
      "image/jpeg",
      "image/png",
      "image/webp",
      "video/mp4",
      "video/webm",
    ]) {
      expect(migration).toContain(`'${mimeType}'`);
    }
    expect(migration).toContain("on conflict (id) do nothing");
    expect(migration).toContain("bucket configuration is invalid");
    expect(migration).not.toMatch(/create policy[\s\S]*storage\.objects/);
  });

  it("withdraws without hard delete and extends account closure transactionally", () => {
    const withdraw = functionBody("withdraw_official_announcement");
    expect(withdraw).toContain("withdrawn_at = v_withdrawn_at");
    expect(withdraw).not.toContain("delete from public.announcements");
    expect(migration).toContain(
      "rename to close_ironclad_player_account_without_announcement_cleanup"
    );
    const close = functionBody("close_ironclad_player_account");
    expect(close).toContain("delete from public.announcement_read_states");
    expect(close).toContain("published_by_clerk_user_id = case");
    expect(close).toContain("withdrawn_by_clerk_user_id = case");
    expect(close).toContain(
      "close_ironclad_player_account_without_announcement_cleanup"
    );
  });

  it("does not extend notification, push, or realtime infrastructure", () => {
    expect(migration).not.toContain("push_subscriptions");
    expect(migration).not.toContain("insert into public.notifications");
    expect(migration).not.toContain("realtime");
    expect(migration).not.toContain("websocket");
  });

  it("ships an explicitly rollback-only executable Staging contract", () => {
    expect(databaseContract).toContain("begin isolation level repeatable read;");
    expect(databaseContract).toContain("rollback;");
    expect(databaseContract).not.toMatch(/\bcommit\s*;/);
    expect(databaseContract).toContain("pr4_announcement_contract_baseline");
    expect(databaseContract).toContain("has_table_privilege");
    expect(databaseContract).toContain("has_function_privilege");
    expect(databaseContract).toContain("close_ironclad_player_account");
    expect(databaseContract).not.toContain("insert into storage.objects");
    expect(databaseContract).not.toContain("production");
  });
});

function functionBody(name: string) {
  const start = migration.indexOf(`create function public.${name}(`);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = migration.indexOf("$$;", start);
  expect(end).toBeGreaterThan(start);
  return migration.slice(start, end + 3);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
