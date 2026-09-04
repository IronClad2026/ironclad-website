import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (name: string) =>
  readFileSync(resolve(process.cwd(), "supabase/migrations", name), "utf8")
    .replace(/\r\n/g, "\n");
const source = read("20260904120000_canonical_division_launch_ordering.sql");
const previous = read("20260806130000_phase4_withdrawal_waitlist_division_launch.sql");
const originalStart = previous.indexOf("create or replace function public.launch_tournament_division(");
const original = previous.slice(originalStart, previous.indexOf("\n$$;", originalStart) + 4);
const originalParent = original.slice(
  original.indexOf("  update public.tournaments\n"),
  original.indexOf("\n\n  tournament_id :=")
);
const replacementStart = source.indexOf("create or replace function");
const replacement = source.slice(replacementStart, source.indexOf("\n$$;", replacementStart) + 4);

describe("canonical Division launch ordering release repair", () => {
  it("changes only the order of the original parent update in the existing private authority", () => {
    const expected = original
      .replace("public.launch_tournament_division(", "public.launch_tournament_division_without_matchup_activation(")
      .replace(originalParent + "\n\n", "")
      .replace("  update public.tournament_brackets as bracket\n", originalParent + "\n\n  update public.tournament_brackets as bracket\n");
    expect(replacement).toBe(expected);
  });

  it("publishes Event state before the existing launched-at summary trigger can run", () => {
    expect(replacement.indexOf("status = 'in_progress'")).toBeLessThan(
      replacement.indexOf("set launched_at = v_launch_at")
    );
    expect(replacement.match(/update public\.tournaments\n/g)).toHaveLength(1);
    expect(replacement.match(/set launched_at = v_launch_at/g)).toHaveLength(1);
  });

  it("preserves the service-only launch guard, early idempotency return and roster lock", () => {
    expect(replacement).toContain("if coalesce(auth.role(), '') <> 'service_role' then");
    expect(replacement.indexOf("already_launched := true")).toBeLessThan(
      replacement.indexOf("update public.tournaments")
    );
    expect(replacement).toContain("Bracket assignments must exactly match the approved division roster");
    expect(replacement).toContain("competition_locked_at = coalesce(");
    expect(replacement).toContain("Pre-launch result activity blocks division launch");
  });

  it("keeps the inner function owner-only with a fixed search path", () => {
    expect(source).toContain("set search_path = pg_catalog");
    expect(source).toContain("owner to postgres;");
    expect(source).toContain("from public, anon, authenticated, service_role;");
    expect(source).not.toMatch(/grant execute/i);
  });

  it("does not replace guards, summaries, invitations, result authorities or persistent structures", () => {
    expect(source.match(/create or replace function/gi)).toHaveLength(1);
    expect(source).not.toMatch(/(?:create|alter|drop) (?:table|trigger|policy)|session_replication_role|disable trigger/i);
    expect(source).not.toMatch(/TESTACADEMY|20260903230000|synthetic_academy|permanent_staging_academy/i);
  });

  it("is an explicit transactional forward migration, not dynamic definition rewriting", () => {
    expect(source.trim().startsWith("begin;")).toBe(true);
    expect(source.trim().endsWith("commit;")).toBe(true);
    expect(source).not.toMatch(/pg_get_functiondef|execute format|execute replace/i);
  });
});

