import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260821110000_account_legal_privacy_v1_2_compatibility.sql"
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
    throw new Error("Compatibility RPC definition was not found.");
  }

  return sql.slice(start, end);
}

describe("Privacy v1.2 account-acceptance compatibility migration", () => {
  it("is one forward-only transactional replacement with no schema redesign", () => {
    expect(sql.startsWith("begin;")).toBe(true);
    expect(sql.endsWith("commit;")).toBe(true);
    expect(sql).toContain(
      "create or replace function public.accept_current_account_legal_documents("
    );
    expect(sql).not.toContain("create table");
    expect(sql).not.toContain("alter table");
    expect(sql).not.toContain("drop ");
  });

  it("accepts exactly Terms v1.1 with Privacy v1.1 or v1.2", () => {
    const rpc = rpcBody();

    expect(rpc).toContain("v_terms.version is distinct from '1.1'");
    expect(rpc).toContain("v_privacy.version is distinct from '1.1'");
    expect(rpc).toContain("v_privacy.version is distinct from '1.2'");
    expect(rpc).not.toMatch(/v_terms\.version[^;]*'1\.2'/);
    expect(rpc).not.toMatch(/v_privacy\.version[^;]*'1\.3'/);
  });

  it("retains authoritative Effective-document locking and immutable insertion", () => {
    const rpc = rpcBody();

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
    expect(rpc).toContain(
      "v_terms.version, v_terms.immutable_url, v_terms.sha256"
    );
    expect(rpc).toContain(
      "v_privacy.version, v_privacy.immutable_url, v_privacy.sha256"
    );
    expect(rpc).toContain(
      "on conflict on constraint account_legal_acceptances_document_pair_key do nothing"
    );
  });

  it("remains service-role-only with the existing security-definer boundary", () => {
    const rpc = rpcBody();

    expect(rpc).toContain("security definer set search_path = pg_catalog");
    expect(rpc).toContain("coalesce(auth.role(), '') <> 'service_role'");
    expect(sql).toContain(
      "revoke all on function public.accept_current_account_legal_documents( text, uuid, uuid, boolean, boolean ) from public, anon, authenticated, service_role"
    );
    expect(sql).toContain(
      "grant execute on function public.accept_current_account_legal_documents( text, uuid, uuid, boolean, boolean ) to service_role"
    );
  });
});
