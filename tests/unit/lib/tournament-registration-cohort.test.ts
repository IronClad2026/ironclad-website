import { describe, expect, it } from "vitest";
import {
  ACTIVE_REVIEW_COHORT_STATUSES,
  PHASE_FOUR_ACTIVE_COHORT_SIZE,
  hasReachedActiveReviewMinimum,
  isActiveReviewCohortStatus,
} from "@/lib/tournament-registration-cohort";
import {
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
  });

  it("keeps prelaunch generated brackets private", () => {
    expect(isTournamentBracketPublic("upcoming")).toBe(false);
    expect(isTournamentBracketPublic("registration_open")).toBe(false);
    expect(isTournamentBracketPublic("in_progress")).toBe(true);
    expect(isTournamentBracketPublic("completed")).toBe(true);
  });
});
