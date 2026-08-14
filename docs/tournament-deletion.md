# Tournament recovery and deletion

The administrator tournament page exposes three deliberately separate recovery
paths. They are not interchangeable.

## Hard delete

Hard delete is only for a genuinely disposable tournament that has never
launched and has no generated bracket or competitive history. The administrator
must type `DELETE` before the control is enabled.

`delete_tournament_data(uuid, text)` locks the tournament and its child rows,
then refuses deletion when it finds a launched division, generated bracket,
played or decided match, result submission/report group, or leaderboard point
event. The protected refusal remains:

> Tournament has launched or contains competitive history and cannot be
> permanently deleted.

This guard protects factual tournament, bracket, result, replay, and leaderboard
history. A protected tournament must use Cancel or Void instead of hard delete.

For an eligible disposable tournament, the function runs the database cleanup
in one PostgreSQL transaction. A database failure rolls back the deletion. The
cleanup removes the tournament's result rows, generated bracket hierarchy,
registrations, divisions, and tournament row according to their current foreign
key relationships. The bracket-refresh trigger is suppressed only inside this
trusted deletion transaction.

## Cancel and Void

- **Cancel** is for launched competition without official competitive history.
  The database verifies eligibility and retains the factual tournament record.
- **Void** is for competition whose derived scoring effects must no longer
  count while factual history remains. It preserves tournament, registration,
  bracket, match, result, and replay history and reconciles eligible derived
  scoring. A finalized Main / Pro season is placed under review rather than
  silently rewriting frozen standings.

Cancelled and voided tournaments are terminal and read-only. Normal player and
administrator competition mutations are rejected by the database.

## Storage cleanup after hard delete

Before an eligible database deletion commits, the function records referenced
replay paths, legacy screenshot paths, and managed tournament-banner paths in
`tournament_deletion_jobs`. The server action then removes those objects and
verifies their absence.

Supabase Database and Storage cannot participate in one shared transaction. If
Storage cleanup fails after the database commit, the cleanup manifest remains
with `storage_failed` status and the administrator page exposes the existing
retry action. The manifest is removed only after cleanup is verified.

The displayed Storage Files count is the number of distinct referenced proof
paths, not a live bucket inventory. Normal played-match proof is replay-only;
legacy screenshot paths are tracked here solely for historical compatibility.

## Authority

The deletion and cleanup RPCs are executable only by `service_role`. Their
server actions independently require an authenticated Clerk administrator. No
browser client receives service-role credentials, and Cancel/Void/hard-delete
do not weaken the terminal database guards.
