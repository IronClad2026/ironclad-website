# Tournament deletion

Tournament deletion is available only from the administrator tournament page.
The UI requires the administrator to type `DELETE` before the destructive
action is enabled.

## Database cleanup

`delete_tournament_data` runs as one PostgreSQL transaction. Any database
failure rolls back the entire database deletion.

The function removes:

- `match_result_submissions` for the tournament's matches
- `generated_brackets`
- `bracket_rounds` through the generated-bracket cascade
- `tournament_matches` through the generated-bracket cascade
- `tournament_standings` through the generated-bracket cascade
- `registrations` linked by tournament or tournament bracket
- `tournament_brackets`
- the selected `tournaments` row

Review history and proof references are columns on
`match_result_submissions`, so they are removed with those submissions.
Player notifications are derived from result submissions, and champion state
is derived from completed match records; there are no separate notification or
champion tables to clean up.

The registration bracket-refresh trigger is suppressed only inside the
deletion transaction. This prevents bracket regeneration while registrations
and generated records are being removed.

## Storage cleanup

Before deleting database rows, the function records every replay and screenshot
path in `tournament_deletion_jobs`. After the database transaction commits, the
server action removes those paths from the private `match-proofs` bucket and
verifies that each object is absent.

Supabase Database and Storage cannot participate in one shared transaction. If
Storage cleanup fails, the database deletion remains complete and the cleanup
manifest is retained with `storage_failed` status. Administrators receive a
visible retry action on the tournament management page. The manifest is deleted
only after Storage cleanup is verified.

The count shown as Storage Files is the number of distinct proof paths
referenced by the tournament's result submissions. It is not a live bucket
inventory count.

## Security

Both deletion RPCs are executable only by the Supabase service role. The server
actions also require an authenticated Clerk user with the `admin` role. No
browser client receives service-role credentials.
