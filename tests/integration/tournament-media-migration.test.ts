import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260831123000_tournament_media_links.sql"
  ),
  "utf8"
).toLowerCase();

describe("Tournament media migration", () => {
  it("creates one constrained Tournament child collection hidden by default", () => {
    expect(migration).toContain("create table public.tournament_media");
    expect(migration).toContain(
      "references public.tournaments(id) on delete cascade"
    );
    expect(migration).toContain(
      "references public.tournament_matches(id) on delete set null"
    );
    expect(migration).toContain("published boolean not null default false");
    expect(migration).toContain(
      "media_type in ('full_tournament', 'match_cast', 'video', 'other')"
    );
    expect(migration).toContain("char_length(title) between 1 and 160");
    expect(migration).toContain("char_length(description) between 1 and 500");
    expect(migration).toContain(
      "pg_catalog.replace(description, pg_catalog.chr(10), '')"
    );
    expect(migration).toContain("pg_catalog.chr(13)");
    expect(migration).toContain(") !~ '[[:cntrl:]]'");
    expect(migration).toContain("char_length(url) between 1 and 2048");
    expect(migration).toContain("url ~* '^https://");
  });

  it("uses the existing updated-at convention and a stable newest-first index", () => {
    expect(migration).toContain(
      "execute function public.ironclad_set_updated_at()"
    );
    expect(migration).toMatch(
      /tournament_media_tournament_newest_idx\s+on public\.tournament_media\(\s*tournament_id,\s*published,\s*created_at desc,\s*id desc/
    );
  });

  it("keeps browser roles mutation-free behind the trusted server boundary", () => {
    expect(migration).toContain(
      "alter table public.tournament_media enable row level security"
    );
    expect(migration).toContain(
      "alter table public.tournament_media force row level security"
    );
    expect(migration).toContain(
      "from public, anon, authenticated, service_role"
    );
    expect(migration).toContain(
      "grant select, insert, update, delete on table public.tournament_media"
    );
    expect(migration).toContain("to service_role");
    expect(migration).not.toMatch(
      /create policy[\s\S]*?to\s+(?:anon|authenticated)/
    );
  });

  it("does not add the Owner-rejected cross-Tournament database trigger", () => {
    expect(migration).not.toContain("validate_tournament_media_match");
    expect(migration).not.toContain("tournament media match does not belong");
  });
});
