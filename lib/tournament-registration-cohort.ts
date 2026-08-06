export const PHASE_FOUR_ACTIVE_COHORT_SIZE = 8;

export const ACTIVE_REVIEW_COHORT_STATUSES = [
  "pending",
  "manual_review",
  "approved",
] as const;

export type ActiveReviewCohortStatus =
  (typeof ACTIVE_REVIEW_COHORT_STATUSES)[number];

const activeReviewCohortStatuses = new Set<string>(
  ACTIVE_REVIEW_COHORT_STATUSES
);

export function isActiveReviewCohortStatus(
  status: string
): status is ActiveReviewCohortStatus {
  return activeReviewCohortStatuses.has(status);
}

export function hasReachedActiveReviewMinimum(activeCohortCount: number) {
  return activeCohortCount >= PHASE_FOUR_ACTIVE_COHORT_SIZE;
}
