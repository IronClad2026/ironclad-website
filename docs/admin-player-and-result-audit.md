# Administrator player role and result audit

Administrative access is additive. An account with the Clerk `admin` role can
still maintain a normal player profile, register, receive approval, occupy a
bracket slot, submit a participant result, receive dashboard notifications, and
appear in standings and rankings.

When an administrator is also assigned to a match, the bracket displays both:

- the normal participant result form; and
- the separate administrative official-result and review controls.

## Current participant proof contract

A normal played-match result requires one replay `.rec` file for every game
actually played. No screenshot is required for a normal result. No-show
reporting is a separate workflow and does not require replay proof.

Replay bytes upload directly from the player's browser to the private
`match-proofs` bucket through attempt-scoped, path-specific signed uploads. The
Server Action prepares and finalizes the bounded replay attempt using metadata
and its opaque attempt ID; replay `File` bodies do not pass through that action.
The server verifies stored byte size, SHA-256, path ownership, score-derived
count, and duplicate content before committing the result.

Legacy screenshot columns and authorized retrieval remain for historical
records. That compatibility does not make screenshots current proof and cannot
bypass the replay requirement.

## Accountability

Self-review remains intentionally permitted during the early tournament phase.
Accountability is retained through the current report-group, per-game
submission, confirmation/dispute, and official-result fields, including:

- submitting registration and Clerk attribution on participant submissions;
- report-group status, confirmation, dispute, review, and finalization facts;
- per-game replay paths and trusted replay hashes in private storage-backed
  records;
- `tournament_matches.official_result_submission_id`; and
- `official_result_decided_by` and `official_result_decided_at`.

The application reads private proof through the authorized retrieval route.
Browser clients never receive arbitrary private object paths or service-role
credentials. Current source and ordered migrations are authoritative; this
document does not instruct operators to replay an individual historical
migration outside the normal migration ledger.
