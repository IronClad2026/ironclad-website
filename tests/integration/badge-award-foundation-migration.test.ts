import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationName = "20260820100000_badge_award_foundation.sql";
const previousMigrationName = "20260818100000_phase15a_versioned_consent_discord.sql";
const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations", migrationName),
  "utf8"
);
const compactMigration = migration.toLowerCase().replace(/\s+/g, " ").trim();

function extractFunction(functionName: string) {
  const marker = `create function public.${functionName}(`;
  const start = compactMigration.indexOf(marker);
  const end = compactMigration.indexOf("$$;", start);

  if (start < 0 || end < 0) {
    throw new Error(`${functionName} was not found.`);
  }

  return compactMigration.slice(start, end + 3);
}

describe("badge award foundation migration", () => {
  it("is additive and ordered after the approved badge dashboard checkpoint", () => {
    const migrationNames = readdirSync(
      resolve(process.cwd(), "supabase/migrations")
    ).sort();

    expect(migrationNames.indexOf(previousMigrationName)).toBeGreaterThan(-1);
    expect(migrationNames.indexOf(migrationName)).toBeGreaterThan(
      migrationNames.indexOf(previousMigrationName)
    );
    expect(compactMigration.startsWith("begin;")).toBe(true);
    expect(compactMigration.endsWith("commit;")).toBe(true);
    expect(compactMigration).toContain(
      "create table public.player_badge_awards"
    );
    expect(compactMigration).not.toContain("create table public.badges");
    expect(compactMigration).not.toContain("create table public.badge_definitions");
    expect(compactMigration).not.toContain("alter table public.tournament_matches");
    expect(compactMigration).not.toContain("alter table public.registrations");
    expect(compactMigration).not.toContain("alter table public.players add");
  });

  it("stores one immutable award fact per player and badge", () => {
    for (const column of [
      "id uuid primary key default gen_random_uuid()",
      "player_id uuid not null references public.players(id) on delete cascade",
      "badge_slug text not null",
      "source_type text not null",
      "source_id uuid",
      "source_metadata jsonb not null default '{}'::jsonb",
      "unlocked_at timestamptz not null default clock_timestamp()",
      "original_unlocked_at timestamptz",
      "standard_reveal_seen_at timestamptz",
      "premium_reveal_seen_at timestamptz",
      "created_at timestamptz not null default clock_timestamp()",
    ]) {
      expect(compactMigration).toContain(column);
    }

    expect(compactMigration).toContain(
      "create unique index player_badge_awards_player_badge_key on public.player_badge_awards(player_id, badge_slug)"
    );
    expect(compactMigration).toContain(
      "create index player_badge_awards_player_unlocked_idx on public.player_badge_awards(player_id, unlocked_at desc, id desc)"
    );
  });

  it("allows authenticated players to read only their own awards and no client writes", () => {
    expect(compactMigration).toContain(
      "alter table public.player_badge_awards enable row level security"
    );
    expect(compactMigration).toContain(
      "alter table public.player_badge_awards force row level security"
    );
    expect(compactMigration).toContain(
      "revoke all on table public.player_badge_awards from public, anon, authenticated, service_role"
    );
    expect(compactMigration).toContain(
      "grant select on table public.player_badge_awards to authenticated"
    );
    expect(compactMigration).not.toContain(
      "grant insert on table public.player_badge_awards to authenticated"
    );
    expect(compactMigration).not.toContain(
      "grant update on table public.player_badge_awards to authenticated"
    );
    expect(compactMigration).not.toContain(
      "grant delete on table public.player_badge_awards to authenticated"
    );
    expect(compactMigration).toContain(
      'create policy "players can read their own badge awards"'
    );
    expect(compactMigration).toContain(
      "player.clerk_user_id = (auth.jwt() ->> 'sub')"
    );
    expect(compactMigration).not.toContain("for insert to authenticated");
    expect(compactMigration).not.toContain("for update to authenticated");
    expect(compactMigration).not.toContain("for delete to authenticated");
  });

  it("keeps badge authority helpers service-role-only", () => {
    for (const signature of [
      "public.get_player_badge_match_participants(uuid)",
      "public.get_player_badge_match_summary(uuid)",
    ]) {
      expect(compactMigration).toContain(
        `revoke all on function ${signature} from public, anon, authenticated, service_role`
      );
      expect(compactMigration).toContain(
        `grant execute on function ${signature} to service_role`
      );
    }
  });

  it("uses the existing played-match predicate for match badge facts", () => {
    const participants = extractFunction("get_player_badge_match_participants");
    const summary = extractFunction("get_player_badge_match_summary");

    expect(participants).toContain(
      "public.is_tournament_match_played_for_leaderboard( tournament_match.id )"
    );
    expect(summary).toContain(
      "public.is_tournament_match_played_for_leaderboard( tournament_match.id )"
    );
    expect(summary).toContain("first_played_match_id");
    expect(summary).toContain("tenth_played_match_id");
    expect(summary).toContain("first_win_match_id");
    expect(summary).toContain("fifth_win_match_id");
  });

  it("excludes cancelled and voided tournaments from match badge facts", () => {
    const participants = extractFunction("get_player_badge_match_participants");
    const summary = extractFunction("get_player_badge_match_summary");

    for (const helper of [participants, summary]) {
      expect(helper).toContain(
        "join public.generated_brackets as generated on generated.id = tournament_match.generated_bracket_id"
      );
      expect(helper).toContain(
        "join public.tournament_brackets as bracket on bracket.id = generated.tournament_bracket_id"
      );
      expect(helper).toContain(
        "join public.tournaments as tournament on tournament.id = bracket.tournament_id"
      );
      expect(helper).toContain(
        "tournament.status not in ('cancelled', 'voided')"
      );
    }

    expect(participants).toContain(
      "registration.id = selected_match.winner_registration_id as is_winner"
    );
    expect(summary).toContain("played_match_count");
    expect(summary).toContain("win_count");
  });
});
