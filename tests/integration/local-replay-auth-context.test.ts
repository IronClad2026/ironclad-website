import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const prelude = readFileSync("tests/database/local-supabase-replay-prelude.sql", "utf8");
const accounting = readFileSync("tests/database/division-accounting-cutover-concurrency.ps1", "utf8");

describe("isolated database authority fidelity", () => {
  it("preserves Supabase individual-role precedence over aggregate claims", () => {
    const role = prelude.slice(prelude.indexOf("function auth.role()"), prelude.indexOf("create table if not exists storage.buckets"));
    expect(role).toContain("nullif(current_setting('request.jwt.claim.role', true), '')");
    expect(role).toContain("auth.jwt() ->> 'role'");
    expect(role.indexOf("request.jwt.claim.role")).toBeLessThan(role.indexOf("auth.jwt()"));
  });

  it("uses the canonical service boundary instead of a fabricated participant definer", () => {
    expect(accounting).not.toContain("pr7_finalize_authenticated_fixture_match");
    expect(accounting).toContain("set session authorization service_role;");
    expect(accounting).toContain("public.prepare_match_replay_upload_attempt(");
    expect(accounting).toContain("public.claim_match_replay_attempt_finalization(");
    expect(accounting).toContain("public.commit_match_replay_attempt_result(");
    expect(accounting).toContain("public.confirm_match_result_report_group_api(");
    expect(accounting).toContain("invitationTriggerEnabled");
  });
});

