import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationName = "20260908052210_member_rpc_current_account_acceptance.sql";
const readMigration = (name: string) =>
  readFileSync(resolve(process.cwd(), "supabase/migrations", name), "utf8")
    .replace(/\r\n/g, "\n");
const migration = readMigration(migrationName);
const compact = (value: string) => value.toLowerCase().replace(/\s+/g, " ").trim();
const guard = "perform ironclad_private.require_current_account_legal_acceptance();";

function functionBody(source: string, qualifiedName: string) {
  const name = qualifiedName.replace(/\./g, "\\.");
  const match = source.match(new RegExp(
    `create(?: or replace)? function ${name}\\([\\s\\S]*?\\bas\\s+(\\$[a-z_]*\\$)([\\s\\S]*?)\\1;`,
    "i"
  ));
  if (!match) throw new Error(`Missing explicit definition: ${qualifiedName}`);
  return match[2];
}

describe("member RPC current account acceptance migration", () => {
  it("executes definitions only and changes exactly the three named member RPCs", () => {
    const topLevel = migration
      .replace(/\$([a-z_]*)\$[\s\S]*?\$\1\$/gi, "__body__")
      .replace(/'(?:''|[^'])*'/g, "__literal__")
      .replace(/--[^\n]*/g, "");
    const statements = topLevel.split(";").map(compact).filter(Boolean);
    expect(statements[0]).toBe("begin");
    expect(statements.at(-1)).toBe("commit");
    for (const statement of statements) {
      expect(statement).toMatch(/^(begin$|commit$|create (?:or replace )?function |alter function |revoke all on function |grant execute on function |comment on function )/);
    }
    expect([...topLevel.matchAll(/create(?: or replace)? function ([\w.]+)/gi)]
      .map((match) => match[1].toLowerCase()).sort()).toEqual([
        "ironclad_private.require_current_account_legal_acceptance",
        "public.cast_poll_ballot",
        "public.respond_to_waitlist_offer",
        "public.roll_match_dice",
      ]);
    expect(topLevel).not.toMatch(/\b(?:update|delete|truncate|insert|drop|alter table)\b/i);
    expect(migration).not.toMatch(/pg_get_functiondef|replace\s*\(\s*pg_/i);
  });

  it("uses the canonical writer's current-document predicates and lock order", () => {
    const canonical = functionBody(readMigration(
      "20260822160000_account_legal_future_gate_stability.sql"
    ), "public.accept_current_account_legal_documents");
    const helper = functionBody(migration,
      "ironclad_private.require_current_account_legal_acceptance");
    const documentQuery = (source: string) => compact(
      source.slice(source.indexOf("select document.*"), source.indexOf("\n  loop"))
        .replace(/v_(?:accepted|checked)_at/g, "v_now")
    );
    expect(documentQuery(helper)).toBe(documentQuery(canonical));
    expect(compact(helper)).toContain("v_document_count <> 2");
    expect(compact(helper)).toContain("or v_terms.id is null or v_privacy.id is null");
    expect(helper).not.toMatch(/https?:\/\/|allowed_versions|supported_pairs/);
  });

  it("derives the caller and requires exact account evidence without granting helper access", () => {
    const helper = compact(functionBody(migration,
      "ironclad_private.require_current_account_legal_acceptance"));
    expect(helper).toContain("nullif(auth.jwt() ->> 'sub', '')");
    expect(helper).toContain("coalesce(auth.role(), '') <> 'authenticated'");
    expect(helper).toContain("acceptance.clerk_user_id = v_clerk_user_id");
    expect(helper).toContain("acceptance.terms_document_id = v_terms.id");
    expect(helper).toContain("acceptance.privacy_document_id = v_privacy.id");
    expect(helper).toContain("acceptance.terms_accepted is true");
    expect(helper).toContain("acceptance.privacy_acknowledged is true");
    expect(helper).toContain("account_legal_acceptance_required");
    expect(helper).toContain("account_legal_acceptance_unavailable");
    expect(helper).not.toMatch(/\b(?:insert|update|delete)\b/);
    const sql = compact(migration);
    expect(sql).toContain("create or replace function ironclad_private.require_current_account_legal_acceptance() returns void language plpgsql security definer set search_path = pg_catalog");
    expect(sql).toContain("revoke all on function ironclad_private.require_current_account_legal_acceptance() from public, anon, authenticated, service_role");
    expect(sql).not.toMatch(/grant .*ironclad_private\.require_current_account_legal_acceptance/);
  });

  it("preserves poll authorization, locking, deadlines and idempotence outside the new guard", () => {
    const current = functionBody(migration, "public.cast_poll_ballot");
    const original = functionBody(readMigration(
      "20260817120000_polls_decisions.sql"
    ), "public.cast_poll_ballot");
    expect(current.replace(`  ${guard}\n\n`, "")).toBe(original);
    expect(current.indexOf("for update;")).toBeLessThan(current.indexOf(guard));
    expect(current.indexOf(guard)).toBeLessThan(current.indexOf("v_now :="));
    expect(current.indexOf(guard)).toBeLessThan(current.indexOf("if v_current_options ="));
  });

  it("preserves dice participant-only authority and validates time after legal-lock waiting", () => {
    const current = functionBody(migration, "public.roll_match_dice");
    const original = functionBody(readMigration(
      "20260817100000_authenticated_match_dice_rolloff.sql"
    ), "public.roll_match_dice");
    expect(current.replace(`  ${guard}\n\n`, "")).toBe(original);
    expect(current.indexOf("if v_registration_id is null")).toBeLessThan(current.indexOf(guard));
    expect(current.indexOf(guard)).toBeLessThan(current.indexOf("clock_timestamp() >= v_match.deadline_at"));
    expect(current.indexOf(guard)).toBeLessThan(current.indexOf("into v_existing_roll"));
  });

  it("rejects NULL before mutation and gates only acceptance without changing offer lifecycle", () => {
    const current = functionBody(migration, "public.respond_to_waitlist_offer");
    const original = functionBody(readMigration(
      "20260806130000_phase4_withdrawal_waitlist_division_launch.sql"
    ), "public.respond_to_waitlist_offer");
    const withoutGuard = current
      .replace("if p_response is null or p_response not in", "if p_response not in")
      .replace(`  if p_response = 'accept' then\n    ${guard}\n  end if;\n\n`, "");
    expect(withoutGuard).toBe(original);
    expect(current.indexOf("if p_response is null")).toBeLessThan(current.indexOf("for update;"));
    expect(current.indexOf(guard)).toBeLessThan(current.indexOf("v_resolved_at :="));
    expect(current.match(new RegExp(guard.replace(/[().]/g, "\\$&"), "g"))).toHaveLength(1);
    expect(migration).not.toContain("create or replace function public.withdraw_tournament_registration");
  });

  it("retains each existing member signature and exact API execution roles", () => {
    const sql = compact(migration);
    for (const signature of [
      "cast_poll_ballot(uuid, integer, uuid[])",
      "roll_match_dice(uuid, integer, smallint, integer)",
      "respond_to_waitlist_offer(uuid, text)",
    ]) {
      expect(sql).toContain(`alter function public.${signature} owner to postgres`);
      expect(sql).toContain(`revoke all on function public.${signature} from public, anon, authenticated, service_role`);
      expect(sql).toContain(`grant execute on function public.${signature} to authenticated`);
    }
    expect(sql.match(/grant execute on function/g)).toHaveLength(3);
  });
});
