import { describe, expect, it } from "vitest";
import {
  ACTIVE_REVIEW_COHORT_STATUSES,
  PHASE_FOUR_ACTIVE_COHORT_SIZE,
  hasReachedActiveReviewMinimum,
  isActiveReviewCohortStatus,
} from "@/lib/tournament-registration-cohort";
import {
  getTournamentRegistrationAvailability,
  isTournamentBracketPublic,
  isTournamentRegistrationOpen,
} from "@/lib/tournaments";

describe("Phase 4 registration cohort presentation contract", () => {
  it("counts only pending, manual review, and approved registrations", () => {
    expect(ACTIVE_REVIEW_COHORT_STATUSES).toEqual([
      "pending",
      "manual_review",
      "approved",
    ]);

    for (const status of ACTIVE_REVIEW_COHORT_STATUSES) {
      expect(isActiveReviewCohortStatus(status)).toBe(true);
    }

    expect(isActiveReviewCohortStatus("rejected")).toBe(false);
    expect(isActiveReviewCohortStatus("waitlisted")).toBe(false);
  });

  it("derives the minimum-reached condition at eight active places", () => {
    expect(PHASE_FOUR_ACTIVE_COHORT_SIZE).toBe(8);

    for (let count = 0; count < PHASE_FOUR_ACTIVE_COHORT_SIZE; count += 1) {
      expect(hasReachedActiveReviewMinimum(count)).toBe(false);
    }

    expect(hasReachedActiveReviewMinimum(8)).toBe(true);
  });

  it("uses one inclusive opening and closing window contract", () => {
    const tournament = {
      statusValue: "registration_open" as const,
      registrationEnabled: true,
      registrationOpenAt: "2026-08-05T01:00:00.000Z",
      registrationCloseAt: "2026-08-05T02:00:00.000Z",
    };

    expect(
      isTournamentRegistrationOpen(
        tournament,
        Date.parse("2026-08-05T00:59:59.999Z")
      )
    ).toBe(false);
    expect(
      isTournamentRegistrationOpen(
        tournament,
        Date.parse("2026-08-05T01:00:00.000Z")
      )
    ).toBe(true);
    expect(
      isTournamentRegistrationOpen(
        tournament,
        Date.parse("2026-08-05T02:00:00.000Z")
      )
    ).toBe(true);
    expect(
      isTournamentRegistrationOpen(
        tournament,
        Date.parse("2026-08-05T02:00:00.001Z")
      )
    ).toBe(false);
    expect(
      isTournamentRegistrationOpen(
        { ...tournament, registrationEnabled: false },
        Date.parse("2026-08-05T01:30:00.000Z")
      )
    ).toBe(false);
    expect(
      isTournamentRegistrationOpen(
        { ...tournament, statusValue: "in_progress" },
        Date.parse("2026-08-05T01:30:00.000Z")
      )
    ).toBe(true);
  });

  it.each([
    {
      name: "opens when both optional timestamps are absent",
      overrides: { registrationOpenAt: null, registrationCloseAt: null },
      expected: "open",
    },
    {
      name: "waits for an explicit future opening",
      overrides: {
        registrationOpenAt: "2026-08-05T01:31:00.000Z",
        registrationCloseAt: null,
      },
      expected: "scheduled",
    },
    {
      name: "closes after an explicit closing time",
      overrides: {
        registrationOpenAt: null,
        registrationCloseAt: "2026-08-05T01:29:00.000Z",
      },
      expected: "window_closed",
    },
    {
      name: "opens inside an explicit active window",
      overrides: {
        registrationOpenAt: "2026-08-05T01:00:00.000Z",
        registrationCloseAt: "2026-08-05T02:00:00.000Z",
      },
      expected: "open",
    },
    {
      name: "closes for an upcoming Event",
      overrides: {
        statusValue: "upcoming",
        registrationOpenAt: null,
        registrationCloseAt: null,
      },
      expected: "status_closed",
    },
    {
      name: "closes for a terminal Event",
      overrides: {
        statusValue: "voided",
        registrationOpenAt: null,
        registrationCloseAt: null,
      },
      expected: "status_closed",
    },
    {
      name: "closes when the lifecycle authority disables registration",
      overrides: {
        registrationEnabled: false,
        registrationOpenAt: null,
        registrationCloseAt: null,
      },
      expected: "disabled",
    },
  ])("$name", ({ overrides, expected }) => {
    const availability = getTournamentRegistrationAvailability(
      {
        statusValue: "registration_open",
        registrationEnabled: true,
        ...overrides,
      },
      Date.parse("2026-08-05T01:30:00.000Z")
    );

    expect(availability).toBe(expected);
  });

  it("keeps prelaunch generated brackets private", () => {
    expect(isTournamentBracketPublic(null)).toBe(false);
    expect(
      isTournamentBracketPublic("2026-08-06T02:00:00.000Z")
    ).toBe(true);
  });
});
