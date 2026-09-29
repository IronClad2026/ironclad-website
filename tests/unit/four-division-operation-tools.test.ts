import { describe, expect, it } from "vitest";
import { APPROVED_FIXTURES } from "../../scripts/lib/staging-synthetic-uat.mjs";
import { renderPrivateFixtureCredentials } from "../../scripts/four-division/fixture-credentials.mjs";
import { compareProtectedBaseline, buildProtectedCaptureSql } from "../../scripts/four-division/compare-protected-baseline.mjs";

const project = "zzbnneprhjicmajpjkdg";
const digest = "a".repeat(32);
const changed = "b".repeat(32);
const stable = "c".repeat(32);
function capture(rows: Array<{ id: string | null; digest: string; transitionStableDigest?: string; transitionPreAdvancementDigest?: string }>) {
  return { stagingProject: project, tables: [{ relation: "public.tournament_matches", count: rows.length, rows }] };
}

describe("protected Staging history comparison", () => {
  it("requires equality at migration and allows only stable-column transitions later", () => {
    const baseline = capture([{ id: "match", digest }]);
    const supplemental = capture([{ id: "match", digest, transitionStableDigest: stable }]);
    const current = capture([{ id: "match", digest: changed, transitionStableDigest: stable }]);
    expect(compareProtectedBaseline({ baseline, current, transitionBaseline: supplemental, phase: "migration" }).passed).toBe(false);
    const transition = compareProtectedBaseline({ baseline, current, transitionBaseline: supplemental, phase: "transition" });
    expect(transition.passed).toBe(true);
    expect(transition.tables[0].allowedTransitionChanges).toBe(1);
    expect(compareProtectedBaseline({ baseline, current: capture([{ id: "match", digest: changed, transitionStableDigest: digest }]), transitionBaseline: supplemental, phase: "transition" }).passed).toBe(false);
  });

  it("never permits missing immutable rows or loses duplicate null-ID identities", () => {
    const baseline = capture([{ id: null, digest }, { id: null, digest }]);
    expect(compareProtectedBaseline({ baseline, current: capture([{ id: null, digest }]), phase: "transition" }).passed).toBe(false);
    expect(compareProtectedBaseline({ baseline, current: capture([{ id: null, digest }, { id: null, digest }, { id: null, digest: changed }]), phase: "transition" })).toMatchObject({
      passed: true, tables: [{ unchanged: 2, additions: 1 }],
    });
    expect(compareProtectedBaseline({ baseline: capture([{ id: "match", digest }]), current: capture([{ id: "match", digest: changed }]), phase: "transition" }).passed).toBe(false);
  });

  it("proves exact communication-generation advancement only on the two known waiting matches", () => {
    for (const id of ["404461c6-58f2-4222-ae7c-42ac4d9a0cd2", "29f7e1ce-1079-4381-b55f-4f189be1e86e", "unrelated-match"]) {
      const baseline = capture([{ id, digest }]);
      const supplemental = capture([{ id, digest, transitionStableDigest: stable }]);
      const current = capture([{ id, digest: changed, transitionStableDigest: changed, transitionPreAdvancementDigest: stable }]);
      expect(compareProtectedBaseline({ baseline, current, transitionBaseline: supplemental, phase: "transition" }).passed).toBe(id !== "unrelated-match");
      expect(compareProtectedBaseline({ baseline, current, transitionBaseline: supplemental, phase: "migration" }).passed).toBe(false);
    }
  });

  it("rejects wrong projects and malformed captures", () => {
    const baseline = capture([{ id: "match", digest }]);
    expect(() => compareProtectedBaseline({ baseline, current: { ...baseline, stagingProject: "wrong" } })).toThrow();
    expect(() => compareProtectedBaseline({ baseline, current: capture([{ id: "match", digest: "invalid" }]) })).toThrow();
    const sql = buildProtectedCaptureSql();
    expect(sql).toContain("public.registration_acceptances");
    expect(sql).toContain("public.match_game_result_authority");
    expect(sql).toContain("r.bracket_type='main'");
    expect(sql).not.toMatch(/\b(insert|update|delete|alter|drop)\b/i);
  });
});

describe("private fixture credential artifact", () => {
  const configs = Object.values(APPROVED_FIXTURES).map((fixture) => ({
    fixture, email: `${fixture.alias}+clerk_test@example.test`, password: `Mock-only-${fixture.alias}-password`,
  }));
  it("exports exactly38 user-requested fixture credentials with original and browser ELO distinguished", () => {
    const text = renderPrivateFixtureCredentials(configs);
    expect(text.match(/^Alias:/gm)).toHaveLength(38);
    expect(text.match(/^Email:/gm)).toHaveLength(38);
    expect(text.match(/^Password:/gm)).toHaveLength(38);
    expect(text).toContain("Original synthetic ELO: 700");
    expect(text).toContain("Normal browser registration ELO: 1000");
    expect(text).toContain("Future Pro pool: TestMain6, TestMain7, TestMain8, TestMain9, TestMain10, TestPro1, TestPro2, TestPro3, TestPro4");
    expect(text).not.toContain("undefined");
    expect(text).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY|CLERK_SECRET_KEY|FIXTURE_SECRET/);
  });
  it("refuses incomplete, reordered, or newline-containing identity fields", () => {
    expect(() => renderPrivateFixtureCredentials(configs.slice(1))).toThrow();
    expect(() => renderPrivateFixtureCredentials([...configs].reverse())).toThrow();
    expect(() => renderPrivateFixtureCredentials(configs.map((config, index) => index ? config : { ...config, password: "bad\nvalue" }))).toThrow();
  });
});
