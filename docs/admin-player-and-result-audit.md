# Administrator Player Role And Result Audit

Administrative access is additive. An account with the Clerk `admin` role can
still create and maintain a normal player profile, register for tournaments,
receive approval, occupy a bracket registration slot, submit proof-backed
results, receive dashboard notifications, and appear in standings and
rankings.

When an admin is also assigned to a match, the bracket displays both:

- the normal participant result form with replay/screenshot uploads;
- administrative official-result and review controls.

Self-review is intentionally permitted during the early tournament phase.
Accountability is retained through:

- `match_result_submissions.submitted_by_clerk_user_id`;
- `reviewed_by`, `reviewed_at`, `review_notes`, and submission status;
- proof object paths retained in the private `match-proofs` bucket;
- `tournament_matches.official_result_submission_id`;
- `official_result_decided_by` and `official_result_decided_at`.

Apply
`supabase/migrations/20260612090000_match_proof_audit_and_official_results.sql`
before deploying the matching application changes.
