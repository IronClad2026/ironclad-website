import { describe, expect, it } from "vitest";
import { parseFixtureReceipt } from "../../preview/p03/fixture";

const uuid = (n: number) => "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
function readyReceipt() {
  const aliases = Array.from({ length: 8 }, (_, index) => `TestMain${index + 1}`);
  return {
    schemaVersion: 1, projectRef: "zzbnneprhjicmajpjkdg",
    source: "p03_preview_validation", provenance: "staging_synthetic_uat",
    fixtureContractVersion: "staging-synthetic-v1", status: "ready",
    slug: "p03-preview-validation-20260923-rehearsal",
    title: "P03 Preview Validation 20260923-rehearsal",
    createdAt: "2026-09-23T12:00:00.000Z", checkedAt: "2026-09-23T12:01:00.000Z",
    tournamentId: uuid(1), completedTournamentId: uuid(1),
    bracketId: uuid(2), generatedBracketId: uuid(3), currentMatchId: uuid(4),
    onePlayerMatchId: uuid(5), completedMatchId: uuid(6), emptyFinalMatchId: uuid(7),
    firstAlias: "TestMain1", secondAlias: "TestMain3", aliases,
    registrations: aliases.map((alias, index) => ({
      registrationId: uuid(10 + index), playerId: uuid(20 + index),
      alias, provenance: "staging_synthetic_uat",
    })),
    outboundProofVerified: true, notificationRecipientsVerified: true,
    mutations: [
      "save_tournament",
      ...aliases.flatMap(() => ["enrol_staging_synthetic_uat_player", "review_tournament_registration"]),
      "publish_tournament_bracket_map_pools", "generate_tournament_bracket",
      "save_bracket_assignments", "launch_tournament_division",
      ...Array<string>(3).fill("apply_admin_official_match_result_api"),
    ],
    plan: ["Reviewed new-only plan"], cleanup: "Void only the new event after validation.",
  };
}

describe("P03 fixture receipt local scope boundary", () => {
  it("accepts the completed creator contract and exposes frozen bounded fields", () => {
    const result = parseFixtureReceipt(readyReceipt());
    expect(result.registrations).toHaveLength(8);
    expect(result.firstAlias).toBe("TestMain1");
    expect(result.onePlayerMatchId).toBe(uuid(5));
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.registrations[0])).toBe(true);
    expect(result).not.toHaveProperty("plan");
  });

  it.each([
    ["Production target", { projectRef: "nsyjtqpvyxlzyujlbzos" }],
    ["unfinished creation", { status: "planned" }],
    ["unverified provenance", { provenance: "manual" }],
    ["unknown contract", { fixtureContractVersion: "staging-synthetic-v2" }],
    ["unverified source", { source: "external" }],
    ["ordinary tournament slug", { slug: "existing-tournament" }],
    ["mismatched event title", { title: "Existing Main" }],
    ["arbitrary first actor", { firstAlias: "TestChallenge1" }],
    ["arbitrary second actor", { secondAlias: "TestMain2" }],
    ["missing delivery evidence", { outboundProofVerified: false }],
    ["unverified notification recipients", { notificationRecipientsVerified: false }],
    ["completed match in another event", { completedTournamentId: uuid(100) }],
    ["same match reused for TBD", { onePlayerMatchId: uuid(4) }],
    ["invalid match identity", { currentMatchId: "not-a-uuid" }],
    ["reversed evidence timestamps", { checkedAt: "2026-09-22T12:01:00.000Z" }],
    ["ambiguous timestamp", { checkedAt: "2026-09-23 12:01:00" }],
    ["omitted result preparation", { mutations: ["save_tournament"] }],
    ["unexpected credential field", { serviceRoleKey: "must-never-be-accepted" }],
  ])("rejects %s", (_label, patch) => {
    expect(() => parseFixtureReceipt({ ...readyReceipt(), ...patch })).toThrow("Invalid P03 Staging fixture receipt");
  });

  it("rejects missing or shuffled fixed aliases", () => {
    const receipt = readyReceipt();
    receipt.aliases.reverse();
    expect(() => parseFixtureReceipt(receipt)).toThrow();
    receipt.aliases.pop();
    expect(() => parseFixtureReceipt(receipt)).toThrow();
  });
  it("rejects duplicate player identities across the roster", () => {
    const receipt = readyReceipt();
    receipt.registrations[1].playerId = receipt.registrations[0].playerId;
    expect(() => parseFixtureReceipt(receipt)).toThrow();
  });
  it("rejects duplicate registration identities across the roster", () => {
    const receipt = readyReceipt();
    receipt.registrations[1].registrationId = receipt.registrations[0].registrationId;
    expect(() => parseFixtureReceipt(receipt)).toThrow();
  });
  it("rejects a non-synthetic roster row", () => {
    const receipt = readyReceipt();
    receipt.registrations[4].provenance = "manual";
    expect(() => parseFixtureReceipt(receipt)).toThrow();
  });
  it("rejects an unrelated player label on a roster row", () => {
    const receipt = readyReceipt();
    receipt.registrations[4].alias = "TestChallenge5";
    expect(() => parseFixtureReceipt(receipt)).toThrow();
  });
  it("rejects hidden contact data on a roster row", () => {
    const receipt = readyReceipt();
    Object.assign(receipt.registrations[0], { email: "do-not-load@example.test" });
    expect(() => parseFixtureReceipt(receipt)).toThrow();
  });
  it.each([null, [], "", 1])("rejects a non-object receipt: %s", (value) => {
    expect(() => parseFixtureReceipt(value)).toThrow("Invalid P03 Staging fixture receipt");
  });
});
