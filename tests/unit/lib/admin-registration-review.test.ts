import { describe, expect, it } from "vitest";
import {
  buildAdminRegistrationEvidence,
  buildRegistrationOrderMap,
  buildWaitlistPositionMap,
  type AdminRegistrationEvidenceInput,
  type AdminRegistrationOrderInput,
} from "@/lib/admin-registration-review";

const registeredAt = "2026-08-05T10:00:00.000Z";

function evidenceInput(
  overrides: Partial<AdminRegistrationEvidenceInput> = {}
): AdminRegistrationEvidenceInput {
  return {
    playerDisplayName: "Safe Player",
    tournamentName: "IronClad Open",
    selectedBracket: "Challenge",
    submittedElo: 1_390,
    verifiedElo: 1_420,
    verifiedDivision: "Challenge",
    verifiedFaction: "British Forces",
    verificationSource: "relic",
    verificationCheckedAt: "2026-08-05T09:59:00.000Z",
    eligibilityRulesVersion: "relic-highest-1v1-v1",
    status: "waitlisted",
    registeredAt,
    registrationOrder: 3,
    waitlistPosition: 1,
    waitlistOfferStatus: null,
    ...overrides,
  };
}

function orderInput(
  registrationId: string,
  overrides: Partial<AdminRegistrationOrderInput> = {}
): AdminRegistrationOrderInput {
  return {
    registrationId,
    tournamentId: "tournament-a",
    tournamentBracketId: "challenge-a",
    createdAt: registeredAt,
    status: "pending",
    waitlistOfferStatus: null,
    ...overrides,
  };
}

describe("administrator registration-review evidence", () => {
  it("returns the exact safe immutable evidence shape", () => {
    const evidence = buildAdminRegistrationEvidence(evidenceInput());

    expect(evidence).toEqual({
      playerDisplayName: "Safe Player",
      tournamentName: "IronClad Open",
      selectedBracket: "Challenge",
      frozenRegistrationElo: 1_420,
      verifiedDivision: "Challenge",
      verifiedFaction: "British Forces",
      verificationSource: "relic",
      verificationCheckedAt: "2026-08-05T09:59:00.000Z",
      eligibilityRulesVersion: "relic-highest-1v1-v1",
      status: "waitlisted",
      registeredAt,
      registrationOrder: 3,
      waitlistPosition: 1,
      waitlistOfferStatus: null,
    });
    expect(Object.keys(evidence).sort()).toEqual(
      [
        "eligibilityRulesVersion",
        "frozenRegistrationElo",
        "playerDisplayName",
        "registeredAt",
        "registrationOrder",
        "selectedBracket",
        "status",
        "tournamentName",
        "verificationCheckedAt",
        "verificationSource",
        "verifiedDivision",
        "verifiedFaction",
        "waitlistPosition",
        "waitlistOfferStatus",
      ].sort()
    );
    expect(evidence).not.toHaveProperty("registrationId");
    expect(evidence).not.toHaveProperty("playerId");
    expect(evidence).not.toHaveProperty("clerkUserId");
    expect(evidence).not.toHaveProperty("steamId64");
    expect(evidence).not.toHaveProperty("providerPayload");
    expect(evidence).not.toHaveProperty("privateAdminNote");
  });

  it("keeps frozen registration ELO distinct from later current profile ELO", () => {
    const currentProfileElo = 1_975;
    const evidence = buildAdminRegistrationEvidence(
      evidenceInput({ verifiedElo: 1_420, submittedElo: 1_390 })
    );

    expect(evidence.frozenRegistrationElo).toBe(1_420);
    expect(evidence.frozenRegistrationElo).not.toBe(currentProfileElo);
    expect(evidence).not.toHaveProperty("currentProfileElo");

    const historicalEvidence = buildAdminRegistrationEvidence(
      evidenceInput({ verifiedElo: null, submittedElo: 1_275 })
    );
    expect(historicalEvidence.frozenRegistrationElo).toBe(1_275);
  });

  it("hides waitlist position from registrations outside the waitlist", () => {
    const evidence = buildAdminRegistrationEvidence(
      evidenceInput({ status: "approved", waitlistPosition: 4 })
    );

    expect(evidence.waitlistPosition).toBeNull();
  });
});

describe("administrator registration-review ordering", () => {
  it("scopes registration order independently by tournament and bracket", () => {
    const positions = buildRegistrationOrderMap([
      orderInput("a-challenge-second", {
        createdAt: "2026-08-05T10:00:02.000Z",
      }),
      orderInput("a-challenge-first", {
        createdAt: "2026-08-05T10:00:01.000Z",
      }),
      orderInput("a-academy-first", {
        tournamentBracketId: "academy-a",
        createdAt: "2026-08-05T10:00:03.000Z",
      }),
      orderInput("b-challenge-first", {
        tournamentId: "tournament-b",
        tournamentBracketId: "challenge-b",
        createdAt: "2026-08-05T10:00:04.000Z",
      }),
    ]);

    expect(positions.get("a-challenge-first")).toBe(1);
    expect(positions.get("a-challenge-second")).toBe(2);
    expect(positions.get("a-academy-first")).toBe(1);
    expect(positions.get("b-challenge-first")).toBe(1);
  });

  it("uses created_at and then the stable registration identifier", () => {
    const positions = buildRegistrationOrderMap([
      orderInput("registration-c", {
        createdAt: "2026-08-05T10:00:01.000Z",
      }),
      orderInput("registration-b", { createdAt: registeredAt }),
      orderInput("registration-a", { createdAt: registeredAt }),
    ]);

    expect(positions.get("registration-a")).toBe(1);
    expect(positions.get("registration-b")).toBe(2);
    expect(positions.get("registration-c")).toBe(3);
  });

  it("does not change cohort order when registration statuses differ", () => {
    const positions = buildRegistrationOrderMap([
      orderInput("approved", {
        createdAt: "2026-08-05T10:00:03.000Z",
        status: "approved",
      }),
      orderInput("waitlisted", {
        createdAt: "2026-08-05T10:00:04.000Z",
        status: "waitlisted",
      }),
      orderInput("manual-review", {
        createdAt: "2026-08-05T10:00:02.000Z",
        status: "manual_review",
      }),
      orderInput("rejected", {
        createdAt: "2026-08-05T10:00:01.000Z",
        status: "rejected",
      }),
    ]);

    expect(positions.get("rejected")).toBe(1);
    expect(positions.get("manual-review")).toBe(2);
    expect(positions.get("approved")).toBe(3);
    expect(positions.get("waitlisted")).toBe(4);
  });

  it("derives waitlist FIFO from waitlisted rows only within each scope", () => {
    const positions = buildWaitlistPositionMap([
      orderInput("active-earlier", {
        createdAt: "2026-08-05T09:00:00.000Z",
        status: "approved",
      }),
      orderInput("waitlist-b", { status: "waitlisted" }),
      orderInput("waitlist-a", { status: "waitlisted" }),
      orderInput("offered", {
        status: "waitlisted",
        waitlistOfferStatus: "offered",
      }),
      orderInput("other-bracket", {
        tournamentBracketId: "academy-a",
        createdAt: "2026-08-05T11:00:00.000Z",
        status: "waitlisted",
      }),
      orderInput("other-tournament", {
        tournamentId: "tournament-b",
        tournamentBracketId: "challenge-b",
        createdAt: "2026-08-05T12:00:00.000Z",
        status: "waitlisted",
      }),
      orderInput("unscoped", {
        tournamentBracketId: null,
        status: "waitlisted",
      }),
    ]);

    expect(positions.has("active-earlier")).toBe(false);
    expect(positions.get("waitlist-a")).toBe(1);
    expect(positions.get("waitlist-b")).toBe(2);
    expect(positions.has("offered")).toBe(false);
    expect(positions.get("other-bracket")).toBe(1);
    expect(positions.get("other-tournament")).toBe(1);
    expect(positions.has("unscoped")).toBe(false);
  });
});
