# Match Result Storage And Review

## Supabase Storage

- Bucket: `match-proofs`
- Visibility: private
- Per-file limit: 10 MB
- Object layout: `{match_id}/{clerk_user_id}/{submission_uuid}/replay.{ext}`
  and `{match_id}/{clerk_user_id}/{submission_uuid}/screenshot.{ext}`

The server uploads proof files with the Supabase service-role client. A
submission is written to the database only after each selected upload succeeds.
The server also lists the returned object path immediately after upload and
refuses to create the submission if the object cannot be found. If verification
or the database RPC fails, the uploaded objects are removed.

Admins can locate an object in Supabase Dashboard under Storage,
`match-proofs`, then follow the match ID, Clerk user ID, and submission UUID
folders. The tournament review UI also displays the exact stored object path.

## Database Fields

`public.match_result_submissions` stores:

- `replay_storage_path`
- `screenshot_storage_path`
- `status`
- `review_notes`
- `reviewed_by`
- `reviewed_at`

The submission-to-match foreign key uses `ON DELETE RESTRICT` so a match with
proof-backed audit history cannot be deleted accidentally.

`public.tournament_matches` stores the final audit link:

- `official_result_submission_id`
- `official_result_decided_by`
- `official_result_decided_at`

The database stores object paths, not permanent public URLs. The bucket remains
private, and the server generates 30-minute signed URLs when an authorized
player or administrator loads the tournament page. Before signing, the server
checks that the object physically exists. Admin review displays the bucket,
exact object path, and object verification status.

## Review Workflow

`review_match_result_submission` accepts `approved`, `rejected`, or
`resubmission_requested`. Rejection and resubmission require an administrator
message. Approval calls `apply_official_match_result`, which completes the
match, advances a single-elimination winner, and recalculates round-robin
standings. An approval trigger links the approved submission to the official
match row. Direct admin-entered results use an audit RPC that records the admin
ID and decision timestamp without a submission link.

Apply `supabase/migrations/20260611103000_result_review_workflow.sql` to raise
the storage limit and install the review-function update.
