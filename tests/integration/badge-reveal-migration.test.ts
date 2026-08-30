import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260830090000_player_badge_reveals.sql"
  ),
  "utf8"
).toLowerCase();

describe("badge reveal migration", () => {
  it("keeps reveal acknowledgement separate from immutable award rows", () => {
    expect(migration).toContain("create table public.player_badge_reveals");
    expect(migration).toContain("unique (player_badge_award_id)");
    expect(migration).toContain(
      "foreign key (player_badge_award_id, player_id)"
    );
    expect(migration).toContain(
      "references public.player_badge_awards(id, player_id)"
    );
    expect(migration).not.toMatch(/update\s+public\.player_badge_awards/);
    expect(migration).not.toMatch(/insert\s+into\s+public\.player_badge_awards/);
  });

  it("enables forced RLS and grants authenticated users no update or delete", () => {
    expect(migration).toContain(
      "alter table public.player_badge_reveals enable row level security"
    );
    expect(migration).toContain(
      "alter table public.player_badge_reveals force row level security"
    );
    expect(migration).toContain(
      "grant insert (player_badge_award_id, player_id)"
    );
    expect(migration).toContain(
      "grant select on table public.player_badge_reveals"
    );
    expect(migration).toContain("player.clerk_user_id = (auth.jwt() ->> 'sub')");
    expect(migration).not.toMatch(
      /grant\s+(?:update|delete)[^;]*player_badge_reveals/
    );
  });
});
