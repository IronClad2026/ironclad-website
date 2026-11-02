# Patch 2 controlled Staging release record

Historical record for the abandoned separate-Preview workflow. See
[the established Staging release record](patch2-established-staging-release.md)
for the later user authorization, deployed source and actual migration receipts.

Release status: blocked before remote writes. The release instruction authorizes
a feature push, protected Preview and only the two named Staging migrations
after isolation and compatibility pass. Shared configuration and Production
changes are prohibited. No dependent remote action ran.

## Candidate and independent review

Worktree/branch: `ironclad-patch2-phase1` /
`feature/patch2-tournament-registration-separation`. Phase 1 checkpoint `b86cb0d`
remains an ancestor; no amendment/rebase occurred. A read-only GitHub refresh
confirmed Production source still at `ad3eb5b7aee24878252b52bb483d14adf488764c`.
No partner or divergent Staging branch was merged. The final local candidate
commit and full hashes are recorded after commit in
`.release-local/patch2-staging-candidate.json` and the user handoff.

A fresh independent reviewer read the complete Phase 2 production diff, SQL,
callers and authority/policy history. Two concrete findings were fixed:

- Old service-role notification helpers could bypass candidate app guards. The
  migration now rejects their raw admin read/hide/delete writes.
- The first trigger also rejected authenticated modern assistance resolution.
  Its explicit SECURITY INVOKER/current-user check now preserves postgres-owned
  SECURITY DEFINER resolution, privacy, retention and scoped RPC authorities.
  Email/push delivery-state updates are not blanket-blocked.

An obsolete-policy concern was withdrawn after following the complete hardening
chain and live catalog: raw notification access is already closed. No player
SELECT policies or privileges were restored.

The registration capability reduction has not expanded: the unused destructive
cleanup action refuses physical deletion, including old orphan/unassigned
terminal-record cleanup. Existing database history protection predates this
patch. Rejection, player withdrawal, individual rereview, accepted waitlist
review and private-note corrections retain their existing authorities. The old
review RPC signature remains available; old deployments do not acquire the new
candidate registration form guards automatically.

## Migration inputs — not remotely applied

Dependency order:

1. `20261101220837_patch2_scoped_registration_review.sql`
   SHA-256 `c69e8998124f39dccd05b4c07e83aa18b67c1b30e661f38cba70927ddffcf461`.
2. `20261101230355_patch2_admin_inbox_legacy_assistance.sql`
   SHA-256 `673e376db5fc924c022b39eb1da9dd64d74775e2aa63af9ee54ed47fce7b2a51`.

Read-only refresh: `ironclad-staging` / `zzbnneprhjicmajpjkdg`, healthy,
PostgreSQL 17.6, ledger 165. Neither named migration is recorded; new RPCs/table
are absent. Required registration/notification/player/room/assistance columns
exist. Ledger counts alone were not used as compatibility evidence.
The actual review authority SHA-256 is
`d31d4c88bd400e27370be967f1787cdb3617a8ed4591bcb75d91f7dbd88ce7f6`;
prior notification guard SHA-256 is
`a6f92abb03b032febbfda041ffb880205d34c7508726ea2dc7f409c76326a317`.
Review, room-notification finish, confirmation synchronization, account closure
and retention functions were verified postgres-owned SECURITY DEFINER.
Notifications have RLS enabled and no policies, matching the hardening chain.
No domain authority is replaced by these migrations.

## Failed and missing isolation gates

| Gate | Exact evidence |
| --- | --- |
| Shared email | Config getter verifies DISABLED; update predates current Staging build. |
| Shared push | Last 50 successful worker summaries: 50 enabled, zero disabled. Latest enabled `2026-11-01 23:55:00 UTC`. No raw body/header/recipient/credential was returned. **Failed gate.** |
| Candidate environment | No branch-specific records; exact inherited resource binding remains unverified. No candidate deployment exists. |
| DB/private Storage | Existing READY build identifies `zzbnneprhjicmajpjkdg`; private buckets verified. This does not attest a new candidate runtime. |
| Clerk pairing/issuer | Sensitive keys unreadable and auth-management endpoint unavailable through installed tools. Inspected Clerk/Supabase/Vercel Dashboards were signed out. No login or configuration changed. |

Candidate-only suppression cannot constrain a shared worker consuming the same
database. Writing admin fixtures there can reach shared push delivery. The task
prohibits changing shared configuration to make this pass. The existing Preview
block and default-off inbox switch remain intact. No push, Preview, migration,
synthetic account/tournament creation or hosted acceptance ran.

## Tested fallback and later release order

After isolation is independently demonstrated, review/freeze the narrowly scoped
candidate environment/allowlist change and record its new SHA. Push only the
feature ref, deploy protected with inbox off, and withhold acceptance access
until schema is ready. Re-read both exact migration receipts/definitions; verify
already-applied SQL rather than skipping a different version. Apply pending
named files explicitly in dependency order, never broad `db push` or reset.

The new database guard intentionally makes old Staging inbox writes fail safely.
Use the candidate's durable assistance queue as the fallback; the old alias's
visibility-dependent queue is not a substitute. Verify outstanding requests
and closed contextless/global actions with the switch off before enabling only
the candidate. On failure, keep/restore off, preserving new messages/notices,
explicit statuses and schema. Never revert to unsafe old helpers or a snapshot.

Hosted acceptance remains unrun: two dedicated Patch2 synthetic tournaments,
two test admins/opponents, the same player across events, all statuses, several
pages, legacy/unassigned cases, forged batches, shared state, old sessions,
mobile/keyboard, Clerk/RLS and private Storage. Real capacity/ELO/FIFO/offer
expiry/window/roster and match/chat/sequential result/replay/confirmation/dispute/
deadline checks remain required. Do not modify partner fixtures or copy
Production data. A fixture manifest must identify every newly created record.

## Local verification

The unchanged earlier focused 623 checks plus eight route/menu checks, build,
TypeScript and lint are reused. This release pass reran five relevant suites:
110 tests passed, covering auth/legal/scope/flag-off and registration actions.
Player registration/withdrawal contracts added 23 passing checks. New rollback
page tests plus existing off/action/legacy tests passed 55 checks. Full lint
passed with zero errors and two pre-existing rehearsal-script warnings.

Both exact migrations were loaded in dependency order into one fresh local
PostgreSQL cluster: **64/64 passed**, original authority unchanged, cluster
stopped. The prior notification guard, hardened raw-access boundary and actual
private room-notification finisher were loaded from committed source. Real
`SET ROLE service_role` old global mark-read/hide/DELETE statements fail
atomically; new scoped RPCs succeed. Trusted finishing under authenticated
claims succeeds and preserves pending-push cancellation / processing claims.
Old review rejection, note correction, waitlist review and withdrawn/launched
finality still work. No credential or remote connection target is consumed.
Independent review verified code, evidence and migration hashes.

Combined report:
`.release-local/patch2-notifications-1ad2f38d-a287-45e0-867a-5aef08fbc822/report.json`.
The original registration harness also passed 40/40 and stopped:
`.release-local/patch2-registration-1e374df4-110a-44c8-9fbc-e0bd4237d3a0/report.json`.

These are real local SQL/roles with minimal synthetic schema and JWT claim
shims, not hosted Clerk verification or full domain authorities. The trusted
finish function is real; complete assistance actor/access/legal resolution is
not thereby proven. Hosted capacity/ELO/FIFO and all acceptance listed above
remain unrun. No full suite/build repeat was needed for SQL/test/docs-only
release-review corrections.
