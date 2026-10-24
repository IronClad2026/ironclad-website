import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getAnnouncementPlainText, parseAnnouncementDocument } from "@/lib/announcement-document";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20261024173736_announcement_rich_documents.sql"),
  "utf8"
).toLowerCase();
const normalized = migration.replace(/\s+/g, " ");
const databaseContractSource = readFileSync(
  join(process.cwd(), "tests/database/announcement-rich-documents.sql"),
  "utf8"
);
const databaseContract = databaseContractSource.toLowerCase();

function functionBody(name: string) {
  const start = migration.indexOf(`create function public.${name}(`);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = migration.indexOf("$$;", start);
  expect(end).toBeGreaterThan(start);
  return migration.slice(start, end + 3);
}

describe("announcement rich-document migration", () => {
  it("adds only a nullable versioned document without backfilling historical content", () => {
    expect(migration.trimStart()).toMatch(/^begin;/);
    expect(migration.trimEnd()).toMatch(/commit;$/);
    expect(normalized).toContain("alter table public.announcements add column body_document jsonb;");
    const prefix = migration.slice(0, migration.indexOf("create function"));
    expect(prefix).not.toMatch(/\bupdate\s+public\./);
    expect(migration).not.toMatch(/\b(drop|truncate)\s+(table|column)|alter\s+column/);
    expect(migration).not.toContain("alter table public.tournaments");
    expect(migration).not.toContain("announcement_read_states");
    expect(migration).not.toContain("notifications");
  });

  it("bounds the envelope and rejects missing or malformed values with null-safe checks", () => {
    expect(normalized).toContain("constraint announcements_body_document_check check ( body_document is null or coalesce(");
    expect(migration).toContain("body_document -> 'version' = '1'::jsonb");
    expect(migration).toContain("body_document - array['version', 'doc']::text[] = '{}'::jsonb");
    expect(migration).toContain("pg_catalog.jsonb_typeof(body_document -> 'doc' -> 'content') = 'array'");
    expect(migration).toContain("pg_catalog.octet_length(body_document::text) <= 131072");
  });

  it("keeps every old RPC definition and old strict feed contract unchanged", () => {
    for (const legacyName of [
      "list_active_announcements",
      "list_active_announcements_with_tournament",
      "publish_official_announcement",
      "publish_official_announcement_with_tournament",
      "withdraw_official_announcement",
      "mark_announcement_seen",
      "get_announcement_navigation_state",
    ]) {
      expect(migration).not.toMatch(
        new RegExp(`create(?:\\s+or\\s+replace)?\\s+function\\s+public\\.${legacyName}\\s*\\(`)
      );
    }
  });

  it("adds a narrow public-safe v2 projection with legacy body fallback", () => {
    const feed = functionBody("list_active_announcements_with_tournament_v2");
    expect(feed).toContain("'body', announcement.body");
    expect(feed).toContain("'body_document', announcement.body_document");
    expect(feed).toContain("'linked_tournament_slug', tournament.slug");
    expect(feed).toContain("announcement.withdrawn_at is null");
    expect(feed).not.toContain("published_by_clerk_user_id");
    expect(feed).not.toContain("withdrawn_by_clerk_user_id");
    expect(feed).not.toContain("'linked_tournament_id'");
  });

  it("publishes body and document atomically through the existing trusted boundaries", () => {
    const publish = functionBody("publish_official_announcement_v2");
    expect(publish).toContain("coalesce(auth.role(), '') <> 'service_role'");
    expect(publish).toContain("if p_body_document is null then");
    expect(publish).toContain("public.publish_official_announcement(");
    expect(publish).toContain("public.publish_official_announcement_with_tournament(");
    expect(publish).toContain("set body_document = p_body_document");
    expect(publish).toContain("and announcement.body_document is null");
    expect(publish).not.toContain("exception when");
    expect(migration).not.toMatch(/grant\s+(all|insert|update|delete).*on\s+(table\s+)?public\.announcements/);
  });

  it("keeps new exact-signature RPCs service-role-only with safe search paths", () => {
    for (const name of ["list_active_announcements_with_tournament_v2", "publish_official_announcement_v2"]) {
      expect(functionBody(name)).toContain("security definer\nset search_path = pg_catalog");
    }
    for (const signature of [
      "list_active_announcements_with_tournament_v2()",
      "publish_official_announcement_v2( text, text, jsonb, text, text, text, text, text, uuid )",
    ]) {
      expect(normalized).toContain(`grant execute on function public.${signature} to service_role;`);
      expect(normalized).toContain(`revoke all on function public.${signature} from public, anon, authenticated, service_role;`);
    }
  });

  it("ships a rollback-only executable lifecycle and privilege contract", () => {
    expect(databaseContract).toContain("begin isolation level repeatable read;");
    expect(databaseContract).toContain("rollback;");
    expect(databaseContract).not.toMatch(/\bcommit\s*;/);
    for (const evidence of [
      "unicode repeated blank lines hard breaks and rich marks persist atomically",
      "old publishers still create untouched plain-text records",
      "all failed rich publications roll back the original insert",
      "existing mark-seen rpc handles rich announcements",
      "withdrawn rich announcement leaves public feed",
      "service role still cannot update announcement records directly",
      "rollback restores every pre-existing announcement and read/notification counts",
    ]) expect(databaseContract).toContain(evidence);
  });

  it("persists a canonical SQL fixture matching the server-derived fallback exactly", () => {
    const documentSource = databaseContractSource.match(/v_document jsonb := '([^']+)'::jsonb;/u)?.[1];
    const bodySource = databaseContractSource.match(/v_body text := E'([^']+)';/u)?.[1];
    expect(documentSource).toBeDefined();
    expect(bodySource).toBeDefined();
    const storedDocument: unknown = JSON.parse(documentSource!);
    const parsedDocument = parseAnnouncementDocument(storedDocument);
    expect(parsedDocument).toEqual(storedDocument);
    expect(parsedDocument).not.toBeNull();
    expect(getAnnouncementPlainText(parsedDocument!)).toBe(bodySource!.replace(/\\n/gu, "\n"));
  });
});
