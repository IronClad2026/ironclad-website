# P03 Match Room release runbook

Preparation only. This document authorizes no Production mutation. The release
gate is read-only and always stops. Only a later explicit user instruction,
`PROCEED WITH P03 PRODUCTION RELEASE`, permits the release below.

## Reviewed source and scope

- Production baseline: `0f23d7d906c8588de3051fd9a7cdcf218a576ab3`.
- Staging source: `4900d00c81a2c3f1ea0c126444f44499f3726aa4`.
- Candidate: branch `codex/p03-production-ready`, draft PR
  <https://github.com/IronClad2026/ironclad-website/pull/136>. The release seal pins
  its full final SHA, preventing self-referential committed manifests.
- Production Supabase: `ironclad-v2`, `nsyjtqpvyxlzyujlbzos`.
- Preview database: `ironclad-staging`, `zzbnneprhjicmajpjkdg`; test Clerk only.
- P01 Showcase/thought/featured badge, P02 Combat Highlights and P04 News are
  excluded. `p03-scope-audit.md` lists every selectively imported source path.
- Existing master migrations, poll recovery, current-account acceptance,
  bracket alignment, result/replay/deadline and competition authority remain.

Do not merge Staging. Do not promote the Staging-configured Preview to Production:
public environment variables are build inputs. Release the tested source through
the master Git integration with Production-scoped configuration.

## Exact database package

Execute only `scripts/p03-db/execute.mjs`, in this explicit order:

1. `20260923040206_match_room_production_bootstrap.sql` (new, first).
2. `20260919011425_match_room_phase_one.sql` (unchanged original).
3. `20260919235836_match_room_phase_three.sql` (unchanged original).
4. `20260920014644_match_room_production_hardening.sql` (unchanged original).
5. `20260922054205_match_room_unread_summary.sql` (unchanged original).
6. `20260923040754_match_room_disabled_assistance_gate.sql` (new).

`scripts/p03-db/manifest.json` pins canonical LF checksums. The bootstrap uses its
real creation timestamp; explicit execution order does not rewrite old history.
Do not use generic `supabase db push` or run individual files. The executor folds
the verified outer transaction envelopes into ONE transaction, uses 2-second
lock and 60-second statement limits, and records all six ledger entries atomically.
External sessions cannot see an early RPC before the final OFF gates exist.
The package must finish with `platform_settings.match_room = {"enabled":false}`
and no new room, message, cursor, assistance or unread episode.

The executor compares bounded competition facts before and after migration inside
that same transaction under SHARE locks. Failure, contention or changed facts
aborts the whole package. It never repairs competition data. See
`scripts/p03-db/README.md` for lock inventory, race tests and unknown-commit handling.

## Preparation requirements that must be complete before release day

1. All three exact-SHA CI jobs (`validate`, `p03-database`, `p03-hosted-backup`) green.
2. Exact-SHA Preview READY, build isolation guard passed, and the hosted browser
   report contains every required successful scenario with no skipped/flaky tests.
3. Approved message-body retention, purge, access/export and account-closure
   decision recorded. Existing historical P03 documents defer this decision;
   do not invent approval or publish new legal terms as a routine code change.
4. A disposable Supabase-compatible PostgreSQL 17 restore runtime is available,
   with the Production extension inventory supported, cron disabled and outbound
   networking isolated. Native PostgreSQL fixture restore alone does not prove
   restoration of hosted `pg_net`, `pg_cron` or `supabase_vault`.
5. Private connection configuration and read-only GitHub/Vercel metadata access
   are available. Required operator keys: `P03_DATABASE_URL`, `P03_PG_BIN`,
   `P03_RESTORE_DATABASE_URL`, `VERCEL_TOKEN`, and `P03_SSL_ROOT_CERT` if required.
   The isolated Linux Docker restore also requires `P03_RESTORE_CONTAINER` and a
   new local-only `P03_RESTORE_PASSWORD`; follow the release tooling README.
   Keep values out of arguments, source, transcripts and PRs. The hosted connection
   must be direct PostgreSQL or session pooler on 5432 with verified TLS.
6. Final clean candidate sealed with browser report, privacy decision, runbook,
   migration checksums, project IDs and Git SHAs. A changed artifact requires a new
   seal and validation; an unsealed candidate is not release-ready.

The existing staging legal origins may be configured only in the candidate's
Preview branch scope. Production origin/Clerk/database settings are untouched.

## Quiet window

Coordinate with admins and participating players so no result/replay submission,
confirmation/dispute, match edit/reset, registration operation, account closure,
manual settlement or bracket operation is intentionally running. Open tabs and
cached Server Actions remain capable of making requests; a maintenance page is
not a write barrier. The executor's database locks and fingerprint checks are.

Read-only Production inspection on 2026-09-23 found these active jobs:

| Job | Cadence | Release relevance |
| --- | --- | --- |
| ironclad-auto-approve-match-result-groups | Every minute | Can finalize results and advance brackets |
| ironclad-process-expired-waitlist-offers | Every minute | Can change registration facts |
| ironclad-process-matchup-deadlines | Every minute | Can adjudicate results and advance brackets |
| ironclad-transactional-email-worker | Every five minutes | Notification/audit traffic; avoid overlapping DDL |

The gate rejects due/soon-due competition jobs and active transaction/lock
blockers. Re-read live jobs; this inventory is not permanent authority. Do not
silently pause cron, kill sessions or suppress legitimate deadlines to obtain PASS.
Choose a different quiet window when necessary. Public brackets, login, reads,
unrelated notifications and normal tournament functionality remain online.
Any request racing the migration can make the bounded attempt abort; do not
retry around the guard. Re-establish a quiet window, backup and gate.

## Release-day read-only preparation

Work from the isolated candidate checkout. Store private artifacts outside Git
in a new access-restricted directory. The examples use `$releaseDir`, which the
operator sets to that directory; it must contain no pre-existing output files.
Load connection credentials securely before running commands. Before release day,
create the final seal using the exact config and `seal` command in
[release tools](../scripts/p03-release/README.md#seal-and-final-read-only-gate),
and place that approved seal at `$releaseDir/release-seal.json`.

```powershell
git fetch origin
git status --short
git rev-parse origin/master HEAD
$candidateSha = git rev-parse HEAD
$tournamentIds = "1cb06045-0ffc-4745-a8cd-1a16b71baffc"
node scripts/p03-release/cli.mjs backup --tournaments $tournamentIds --candidate-sha $candidateSha --project-ref nsyjtqpvyxlzyujlbzos --out "$releaseDir/backup"
node scripts/p03-release/cli.mjs verify-backup --backup-dir "$releaseDir/backup"
node scripts/p03-release/cli.mjs restore-preflight --backup-dir "$releaseDir/backup"
node scripts/p03-release/cli.mjs restore --backup-dir "$releaseDir/backup"
node scripts/p03-release/cli.mjs fingerprint --tournaments $tournamentIds --candidate-sha $candidateSha --project-ref nsyjtqpvyxlzyujlbzos --out "$releaseDir/pre.json"
$gateFile = Join-Path $releaseDir ("gate-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".json")
node scripts/p03-release/cli.mjs gate --seal "$releaseDir/release-seal.json" --backup-dir "$releaseDir/backup" --out $gateFile
```

The tournament UUID above was verified during preparation. A different current
tournament requires explicit reviewed scope in a new seal. The backup command
performs read-only logical/custom and schema dumps, file checksums, an extension
inventory and bounded competition exports. Restore is an explicitly separate
operation accepting an empty database named `p03_restore_*` on loopback or the
exact IP/port of a positively attested `p03-restore-*` container on the local
Linux Docker daemon. Hosted network extensions require that container, every
attached network must be internal, and cron must be disabled before restore.
It validates the archive, schema/extensions and restored facts. It never restores
to Production and never drops an existing target.

This is NOT PITR. A database dump does not include Storage object bytes, Clerk
identities, platform secrets or changes made after the snapshot. Protect the
archive as sensitive data and follow the current published backup retention
policy. A restore failure is STOP, not permission to exclude troublesome data.

The final command prints exactly one verdict, `RELEASE GATE: PASS` or
`RELEASE GATE: STOP`, followed by reasons. STOP requires fixing the reason and
capturing fresh evidence. PASS creates a short-lived receipt and its read-only
fingerprint, then stops. No migration, deployment, setting change or message is
performed by the gate. Do not run the next section until the user explicitly says
`PROCEED WITH P03 PRODUCTION RELEASE`.

## After that explicit approval only

If the gate expires while waiting, choose a new `$gateFile` and run the gate
again; refresh the backup in a new directory if required. Gate and fingerprint
outputs are exclusive-create and cannot overwrite earlier evidence. Pass the
exact newest PASS filename below. Never edit a receipt or bypass a failed check.

```powershell
node scripts/p03-db/execute.mjs apply --gate $gateFile --seal "$releaseDir/release-seal.json" --output "$releaseDir/apply.json" --approval "PROCEED WITH P03 PRODUCTION RELEASE"
node scripts/p03-release/cli.mjs fingerprint --tournaments $tournamentIds --candidate-sha $candidateSha --project-ref nsyjtqpvyxlzyujlbzos --out "$releaseDir/post.json"
node scripts/p03-release/cli.mjs compare --before "$releaseDir/pre.json" --after "$releaseDir/post.json" --out "$releaseDir/comparison.json"
```

Require PASS and Match Room OFF. Any mismatch stops deployment and activation.
The executor also checked the same facts inside the committed transaction, so a
later mismatch must be investigated rather than automatically repaired.

Reconfirm origin/master is still the sealed baseline and PR head is the exact
candidate. Mark PR #136 ready, then merge that exact head with the existing master
Git integration only after verifying all required checks remain green:

```powershell
gh pr ready 136
gh pr checks 136 --required
gh pr merge 136 --merge --match-head-commit $candidateSha
git fetch origin
git diff --exit-code $candidateSha origin/master --
```

Require Vercel's Production deployment to be READY for the resulting master
commit with exactly the candidate tree and Production environment identity.
Do not promote the safe Preview. Confirm login, bracket, completed scores/winners,
current pairing, TBD slots, result/replay controls, dice, admin workspace and
deadlines while Match Room remains OFF. Read-only queries must confirm OFF and no
manufactured historical room. Stop if auth or any tournament flow is broken.

Only after all checks and the approved privacy decision, an authenticated admin
opens `/admin/system`, finds **Match Room activity**, and selects **Enable Match
Room activity**. Confirm the saved Enabled state. Test two consenting actual
participants in their current eligible pairing: send/read, exact-room notification,
orange unread Match card, assistance and admin access. Completed historical
matches must not gain a new writable room; one-player/TBD/BYE remains roomless.
Observe runtime errors and database/notification health throughout the window.
Record timestamps, release/deployment IDs, results and any errors in private
release evidence. Preserve transcripts and competition facts.

## Emergency containment and rollback limits

1. At `/admin/system`, select **Disable Match Room activity** and verify Disabled.
   If the application is unavailable, use the pre-reviewed service-only
   `set_match_room_enabled(false, <verified admin Clerk actor>)` RPC through a
   trusted operator session. Never use a client-supplied identity.
2. Confirm room creation, sends, assistance request/reopen/resolve and read
   acknowledgements are rejected. Existing transcripts remain readable. Reset,
   reassignment and account-closure safety cleanup still invalidates old authority
   and removes direct identity attribution; do not disable that cleanup.
3. Keep brackets, results/replays, dice, advancement and admin tournament work
   online. Preserve transcript/evidence; inspect logs without copying message
   bodies, tokens or private proof paths into public artifacts.
4. If useful, roll the application back to the previously verified Production
   deployment. A Vercel rollback DOES NOT remove tables, triggers, functions,
   `communication_generation`, stored messages or platform settings.
5. Contain with Match Room OFF plus a compatible application rollback, then a
   reviewed forward fix. Destructive down migrations or competition-row repairs
   are never the normal response.

Unexpected SHA, project, ledger, checksum, backup/restore failure, quiet-window
failure, migration error, fingerprint difference, auth mismatch, broken tournament
smoke or inability to remain OFF means STOP. A connection loss during commit is
an uncertain outcome: inspect ledger/settings read-only, preserve the intent
receipt, and do not blindly rerun the package.
