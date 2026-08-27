import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260827100000_announcement_tournament_link.sql"
  ),
  "utf8"
).toLowerCase();
const normalized = migration.replace(/\s+/g, " ");
const additiveSchemaPrefix = migration.slice(
  0,
  migration.indexOf(
    "create function public.list_active_announcements_with_tournament("
  )
);
const databaseContract = readFileSync(
  join(process.cwd(), "tests/database/announcement-tournament-link.sql"),
  "utf8"
).toLowerCase();

describe("announcement Tournament link migration", () => {
  it("is one minimal forward-only additive transaction", () => {
    expect(migration.trimStart()).toMatch(/^begin;/);
    expect(migration.trimEnd()).toMatch(/commit;$/);
    expect(normalized).toContain(
      "alter table public.announcements add column linked_tournament_id uuid;"
    );
    expect(migration).not.toMatch(/drop\s+(table|column)|truncate\s+table/);
    expect(additiveSchemaPrefix).not.toMatch(
      /update\s+public\.announcements\s+set[\s\S]*where/
    );
    expect(migration).not.toContain("alter table public.tournaments");
  });

  it("preserves announcements when a linked Tournament is hard-deleted", () => {
    expect(normalized).toContain(
      "constraint announcements_linked_tournament_fk foreign key (linked_tournament_id) references public.tournaments(id) on delete set null"
    );
    expect(migration).not.toContain("on delete cascade");
    expect(normalized).toContain(
      "create index announcements_linked_tournament_id_idx on public.announcements(linked_tournament_id) where linked_tournament_id is not null;"
    );
  });

  it("adds a public feed projection without changing the PR 4 feed RPC", () => {
    const feed = functionBody("list_active_announcements_with_tournament");
    expect(feed).toContain("announcement.withdrawn_at is null");
    expect(feed).toContain("left join public.tournaments");
    expect(feed).toContain("'linked_tournament_slug', tournament.slug");
    expect(feed).not.toContain("'linked_tournament_id'");
    expect(feed).not.toContain("published_by_clerk_user_id");
    expect(feed).not.toContain("withdrawn_by_clerk_user_id");
    expect(migration).not.toMatch(
      /create(?:\s+or\s+replace)?\s+function\s+public\.list_active_announcements\s*\(\)/
    );
  });

  it("publishes a linked announcement atomically through a distinct RPC", () => {
    const publish = functionBody(
      "publish_official_announcement_with_tournament"
    );
    expect(publish).toContain("coalesce(auth.role(), '') <> 'service_role'");
    expect(publish).toContain("from public.tournaments as tournament");
    expect(publish).toContain("public.publish_official_announcement(");
    expect(publish).toContain(
      "set linked_tournament_id = p_linked_tournament_id"
    );
    expect(migration).not.toMatch(
      /create(?:\s+or\s+replace)?\s+function\s+public\.publish_official_announcement\s*\(/
    );
  });

  it("keeps both new RPCs service-role-only by exact signature", () => {
    for (const signature of [
      "list_active_announcements_with_tournament()",
      "publish_official_announcement_with_tournament( text, text, text, text, text, text, text, uuid )",
    ]) {
      expect(normalized).toContain(
        `grant execute on function public.${signature} to service_role;`
      );
      expect(normalized).not.toMatch(
        new RegExp(
          `grant execute on function public\\.${escapeRegExp(signature)} to (?:public|anon|authenticated)`
        )
      );
    }
  });

  it("ships a rollback-only executable Staging contract", () => {
    expect(databaseContract).toContain("begin isolation level repeatable read;");
    expect(databaseContract).toContain("rollback;");
    expect(databaseContract).not.toMatch(/\bcommit\s*;/);
    expect(databaseContract).toContain("pr6_announcement_link_baseline");
    expect(databaseContract).toContain("confdeltype = 'n'");
    expect(databaseContract).toContain("list_active_announcements()");
    expect(databaseContract).toContain(
      "list_active_announcements_with_tournament()"
    );
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
