import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260819100000_account_legal_acceptance.sql"
  ),
  "utf8"
);
const sql = migration.toLowerCase().replace(/\s+/g, " ").trim();

function between(startNeedle: string, endNeedle: string) {
  const start = sql.indexOf(startNeedle);
  const end = sql.indexOf(endNeedle, start + startNeedle.length);

  if (start < 0 || end < 0) {
    throw new Error(`Migration segment not found: ${startNeedle}`);
  }

  return sql.slice(start, end);
}

describe("account-wide legal acceptance migration", () => {
  it("creates one narrow immutable evidence table without identifiers beyond Clerk identity", () => {
    expect(sql.startsWith("begin;")).toBe(true);
    expect(sql.endsWith("commit;")).toBe(true);

    const table = between(
      "create table public.account_legal_acceptances",
      "comment on table public.account_legal_acceptances"
    );

    for (const field of [
      "clerk_user_id text not null",
      "accepted_at timestamptz not null default clock_timestamp()",
      "terms_document_id uuid not null",
      "terms_version text not null",
      "terms_url text not null",
      "terms_sha256 text not null",
      "privacy_document_id uuid not null",
      "privacy_version text not null",
      "privacy_url text not null",
      "privacy_sha256 text not null",
      "terms_accepted boolean not null",
      "privacy_acknowledged boolean not null",
    ]) {
      expect(table).toContain(field);
    }

    expect(table).toContain(
      "unique (clerk_user_id, terms_document_id, privacy_document_id)"
    );
    expect(table).toContain("terms_accepted is true");
    expect(table).toContain("privacy_acknowledged is true");

    for (const forbidden of [
      "ip_address",
      "user_agent",
      "fingerprint",
      "session_id",
      "steam_id",
      "email",
    ]) {
      expect(table).not.toContain(forbidden);
    }
  });

  it("permits reads to service role while every write remains RPC-only", () => {
    expect(sql).toContain(
      "alter table public.account_legal_acceptances enable row level security"
    );
    expect(sql).toContain(
      "alter table public.account_legal_acceptances force row level security"
    );
    expect(sql).toContain(
      "revoke all on table public.account_legal_acceptances from public, anon, authenticated, service_role"
    );
    expect(sql).toContain(
      "grant select on table public.account_legal_acceptances to service_role"
    );
    expect(sql).not.toContain(
      "grant insert on table public.account_legal_acceptances"
    );
    expect(sql).not.toContain("create policy");

    expect(sql).toContain(
      "revoke all on function public.accept_current_account_legal_documents( text, uuid, uuid, boolean, boolean ) from public, anon, authenticated, service_role"
    );
    expect(sql).toContain(
      "grant execute on function public.accept_current_account_legal_documents( text, uuid, uuid, boolean, boolean ) to service_role"
    );
  });

  it("selects and locks current Effective successors instead of trusting browser facts", () => {
    const rpc = between(
      "create function public.accept_current_account_legal_documents(",
      "alter function public.accept_current_account_legal_documents("
    );

    expect(rpc).toContain("coalesce(auth.role(), '') <> 'service_role'");
    expect(rpc).toContain("document.document_kind = 'terms'");
    expect(rpc).toContain("document.document_kind = 'privacy'");
    expect(rpc.match(/document\.status = 'effective'/g)).toHaveLength(2);
    expect(rpc.match(/document\.effective_at <= v_accepted_at/g)).toHaveLength(
      2
    );
    expect(rpc.match(/for key share/g)).toHaveLength(2);
    expect(rpc).toContain(
      "v_terms.id is distinct from p_expected_terms_document_id"
    );
    expect(rpc).toContain(
      "v_privacy.id is distinct from p_expected_privacy_document_id"
    );
    expect(rpc).toContain("v_terms.version is distinct from '1.1'");
    expect(rpc).toContain("v_privacy.version is distinct from '1.1'");

    const signature = rpc.slice(0, rpc.indexOf(") returns table"));
    expect(signature).not.toMatch(/p_.*(?:version|url|sha256)/);
    expect(rpc).toContain("v_terms.version, v_terms.immutable_url, v_terms.sha256");
    expect(rpc).toContain(
      "v_privacy.version, v_privacy.immutable_url, v_privacy.sha256"
    );
    expect(rpc).toContain("v_accepted_at timestamptz := clock_timestamp()");
  });

  it("is idempotent for the exact document pair and safe under concurrent retries", () => {
    const rpc = between(
      "create function public.accept_current_account_legal_documents(",
      "alter function public.accept_current_account_legal_documents("
    );

    expect(rpc).toContain(
      "on conflict on constraint account_legal_acceptances_document_pair_key do nothing"
    );
    expect(rpc).toContain(
      "where acceptance.clerk_user_id = p_clerk_user_id"
    );
    expect(rpc).toContain("acceptance.terms_accepted is true");
    expect(rpc).toContain("acceptance.privacy_acknowledged is true");
  });

  it("preserves evidence except for the controlled postgres maintenance bypass", () => {
    const protection = between(
      "create function public.protect_account_legal_acceptance_record()",
      "alter function public.protect_account_legal_acceptance_record()"
    );

    expect(protection).toContain("tg_op = 'delete'");
    expect(protection).toContain("session_user = 'postgres'");
    expect(protection).toContain(
      "current_setting('ironclad.legal_evidence_maintenance', true)"
    );
    expect(protection).toContain("return old");
    expect(protection).toContain(
      "account legal acceptance evidence is immutable"
    );
    expect(protection).not.toContain("tg_op = 'update'");
  });
});
