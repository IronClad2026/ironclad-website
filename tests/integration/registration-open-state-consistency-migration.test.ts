import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = compact(
  readFileSync(
    resolve(
      process.cwd(),
      "supabase/migrations/20260903210000_registration_open_state_consistency.sql"
    ),
    "utf8"
  )
);
const registrationAction = compact(
  readFileSync(
    resolve(process.cwd(), "app/tournaments/actions.ts"),
    "utf8"
  )
);
const adminEditor = compact(
  readFileSync(
    resolve(
      process.cwd(),
      "components/admin/tournaments/TournamentEditor.tsx"
    ),
    "utf8"
  )
);
const adminList = compact(
  readFileSync(
    resolve(process.cwd(), "app/admin/tournaments/page.tsx"),
    "utf8"
  )
);
const adminHeader = compact(
  readFileSync(
    resolve(
      process.cwd(),
      "components/admin/tournaments/TournamentWorkspaceHeader.tsx"
    ),
    "utf8"
  )
);

describe("registration-open state consistency repair", () => {
  it("reuses save_tournament and the existing lifecycle derivation", () => {
    expect(migration.startsWith("begin;")).toBe(true);
    expect(migration.endsWith("commit;")).toBe(true);
    expect(
      migration.match(
        /create or replace function public\.save_tournament\s*\(/g
      )
    ).toHaveLength(1);
    expect(migration).not.toMatch(/create table|alter table|create type/);
    expect(migration).not.toMatch(
      /create (?:or replace )?function public\.(?!save_tournament)/
    );

    const bracketWrite = migration.indexOf(
      "insert into public.tournament_brackets"
    );
    const lifecycleResync = migration.indexOf(
      "set status = tournament.status where tournament.id = v_tournament_id"
    );

    expect(bracketWrite).toBeGreaterThan(-1);
    expect(lifecycleResync).toBeGreaterThan(bracketWrite);
    expect(migration).toContain("security definer set search_path = pg_catalog");
    expect(migration).toContain(
      "revoke all on function public.save_tournament"
    );
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain(
      "grant execute on function public.save_tournament"
    );
    expect(migration).toContain("to service_role");
  });

  it("limits data reconciliation to wholly unlaunched open Events", () => {
    const reconciliation = migration.slice(
      migration.lastIndexOf("update public.tournaments as tournament")
    );

    expect(reconciliation).toContain(
      "tournament.status = 'registration_open'"
    );
    expect(reconciliation).toContain(
      "tournament.registration_enabled is distinct from true"
    );
    expect(reconciliation).toContain("bracket.launched_at is null");
    expect(reconciliation).toContain(
      "public.tournament_division_not_held_closures"
    );
    expect(reconciliation).toContain("bracket.launched_at is not null");
    expect(reconciliation).not.toMatch(/delete from|truncate|insert into/);
  });

  it("adds no Badge, points, season, notification, or registration writer", () => {
    expect(migration).not.toMatch(
      /player_badge|badge\.unlocked|leaderboard_point|season_membership|player_badge_reveal|insert into public\.registrations/
    );
    expect(migration).not.toContain(
      "create or replace function public.submit_verified_player_registration"
    );
  });

  it("uses one shared read interpretation in public and Admin surfaces", () => {
    expect(registrationAction).toContain(
      "istournamentregistrationopen as istournamenteventregistrationopen"
    );
    expect(registrationAction).toContain(
      "istournamenteventregistrationopen({ statusvalue: tournament.status"
    );
    expect(adminEditor).toContain("gettournamentregistrationstatuslabel");
    expect(adminList).toContain("gettournamentregistrationstatuslabel");
    expect(adminHeader).toContain("gettournamentregistrationstatuslabel");
    expect(adminList).toContain(
      "registration_enabled, registration_open_at, registration_close_at"
    );
  });
});

function compact(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}
