import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260822160000_account_legal_future_gate_stability.sql"
  ),
  "utf8"
);
const sql = migration.toLowerCase().replace(/\s+/g, " ").trim();

function rpcBody() {
  const start = sql.indexOf(
    "create or replace function public.accept_current_account_legal_documents("
  );
  const end = sql.indexOf(
    "alter function public.accept_current_account_legal_documents(",
    start
  );

  if (start < 0 || end < 0) {
    throw new Error("Future-stable account legal RPC definition was not found.");
  }

  return sql.slice(start, end);
}

describe("future-stable account legal acceptance migration", () => {
  it("is one forward-only function replacement with no schema redesign", () => {
    expect(sql.startsWith("begin;")).toBe(true);
    expect(sql.endsWith("commit;")).toBe(true);
    expect(sql.match(/\bbegin;/g)).toHaveLength(1);
    expect(sql.match(/\bcommit;/g)).toHaveLength(1);
    expect(sql).not.toContain("rollback;");
    expect(
      sql.match(
        /create or replace function public\.accept_current_account_legal_documents\(/g
      )
    ).toHaveLength(1);

    for (const forbidden of [
      "create table",
      "alter table",
      "create index",
      "create policy",
      "drop ",
    ]) {
      expect(sql).not.toContain(forbidden);
    }
  });

  it("preserves the established signature and return shape", () => {
    const rpc = rpcBody();

    expect(rpc).toContain(
      "p_clerk_user_id text, p_expected_terms_document_id uuid, p_expected_privacy_document_id uuid, p_terms_accepted boolean, p_privacy_acknowledged boolean ) returns table ( acceptance_id uuid, accepted_at timestamptz, terms_document_id uuid, privacy_document_id uuid )"
    );

    const signature = rpc.slice(0, rpc.indexOf(") returns table"));
    expect(signature).not.toMatch(/p_.*(?:version|url|sha256|accepted_at)/);
  });

  it("loads and locks the exact current published Effective pair at one database time", () => {
    const rpc = rpcBody();

    expect(rpc).toContain("v_accepted_at timestamptz := clock_timestamp()");
    expect(rpc.match(/clock_timestamp\(\)/g)).toHaveLength(1);
    expect(rpc).toContain("document.document_kind in ('privacy', 'terms')");
    expect(rpc.match(/document\.status = 'effective'/g)).toHaveLength(1);
    expect(rpc.match(/document\.published_at is not null/g)).toHaveLength(1);
    expect(rpc.match(/document\.published_at <= v_accepted_at/g)).toHaveLength(
      1
    );
    expect(rpc.match(/document\.effective_at is not null/g)).toHaveLength(1);
    expect(rpc.match(/document\.effective_at <= v_accepted_at/g)).toHaveLength(
      1
    );
    expect(rpc.match(/document\.sha256 is not null/g)).toHaveLength(1);
    expect(rpc).toContain("order by document.document_kind for share");
    expect(rpc.match(/for share/g)).toHaveLength(1);
    expect(rpc).not.toContain("for key share");
    expect(rpc).toContain("v_document_count <> 2");
    expect(rpc).toContain("v_document.document_kind = 'terms'");
    expect(rpc).toContain("v_document.document_kind = 'privacy'");
    expect(rpc).toContain(
      "v_terms.id is distinct from p_expected_terms_document_id"
    );
    expect(rpc).toContain(
      "v_privacy.id is distinct from p_expected_privacy_document_id"
    );
  });

  it("has no version literals or pair allowlist in the acceptance boundary", () => {
    const rpc = rpcBody();

    expect(rpc).not.toMatch(/'\d+(?:\.\d+)+'/);
    expect(rpc).not.toMatch(
      /(?:v_terms|v_privacy)\.version\s+(?:=|in\s*\(|is\s+(?:not\s+)?distinct\s+from)/
    );
    expect(rpc).not.toContain("supported_pairs");
    expect(rpc).not.toContain("allowed_versions");
  });

  it("stores only database-authoritative evidence and retries by exact pair", () => {
    const rpc = rpcBody();

    expect(rpc).toContain(
      "v_accepted_at, v_terms.id, v_terms.version, v_terms.immutable_url, v_terms.sha256, v_privacy.id, v_privacy.version, v_privacy.immutable_url, v_privacy.sha256, true, true"
    );
    expect(rpc).toContain(
      "on conflict on constraint account_legal_acceptances_document_pair_key do nothing"
    );
    expect(rpc).toContain(
      "where acceptance.clerk_user_id = p_clerk_user_id"
    );
    expect(rpc).toContain("acceptance.terms_document_id = v_terms.id");
    expect(rpc).toContain("acceptance.privacy_document_id = v_privacy.id");
    expect(rpc).toContain("acceptance.terms_accepted is true");
    expect(rpc).toContain("acceptance.privacy_acknowledged is true");
  });

  it("remains a postgres-owned service-role-only security definer", () => {
    const rpc = rpcBody();

    expect(rpc).toContain("security definer set search_path = pg_catalog");
    expect(rpc).toContain("coalesce(auth.role(), '') <> 'service_role'");
    expect(rpc).toContain("nullif(btrim(p_clerk_user_id), '') is null");
    expect(rpc).toContain("p_terms_accepted is distinct from true");
    expect(rpc).toContain("p_privacy_acknowledged is distinct from true");
    expect(sql).toContain(
      "alter function public.accept_current_account_legal_documents( text, uuid, uuid, boolean, boolean ) owner to postgres"
    );
    expect(sql).toContain(
      "revoke all on function public.accept_current_account_legal_documents( text, uuid, uuid, boolean, boolean ) from public, anon, authenticated, service_role"
    );
    expect(sql).toContain(
      "grant execute on function public.accept_current_account_legal_documents( text, uuid, uuid, boolean, boolean ) to service_role"
    );
    expect(sql).not.toMatch(
      /grant execute on function public\.accept_current_account_legal_documents\([^)]+\) to (?:public|anon|authenticated)/
    );
  });
});
