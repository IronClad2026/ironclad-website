import "server-only";

export function isStagingProfilePolicyReview() {
  return process.env.VERCEL_ENV === "preview" && process.env.VERCEL_GIT_COMMIT_REF === "staging";
}
