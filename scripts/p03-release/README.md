# P03 release tools

`node scripts/p03-release/cli.mjs --help` lists the main commands. Run from the
clean candidate checkout. These tools never release anything automatically.
Only the separate `restore` command writes to a database, and it accepts an
empty, loopback database named `p03_restore_*` only. The separately owned
`scripts/p03-db/execute.mjs` is the approved future Production executor.

## Connections and private artifacts

Set `P03_DATABASE_URL` privately in the process environment. Use a direct
Supabase connection or session pooler on 5432, with certificate verification;
`P03_SSL_ROOT_CERT` may identify the downloaded CA certificate. Credentials are
parsed into child process environment variables, never process arguments or
logs. `P03_PG_BIN` identifies the directory containing PostgreSQL 17 `psql`,
`pg_dump`, and `pg_restore`. Do not place secrets in examples, Git, or transcripts.

Use a new private output directory outside every repository. On Windows verify
its inherited ACL is limited to the current operator, SYSTEM, and administrators;
POSIX outputs use directory mode 0700 and file mode 0600. The full dump contains
sensitive information even though fingerprint output omits private profile
fields, messages, and raw proof paths. Retain and dispose under the approved
backup policy. Never upload the dump as a CI/PR artifact.

## Disposable restore runtime prerequisite

Native fixture rehearsal does **not** prove that hosted Supabase extensions can
be restored into ordinary PostgreSQL. The observed hosted extension versions are
in `production-extensions.json`. Prepare a dedicated compatible runtime first.
The supplied Compose file pins `supabase/postgres:17.6.1.127`, binds only loopback,
uses an internal network with no outbound access, and disables cron execution.
The current preparation host has no Docker/Podman engine; this Compose runtime
has **not** been rehearsed. Missing runtime/extension readiness is a release
blocker, not a waived check. Do not omit managed schemas or extension data to
make restoration pass.

On a Docker-enabled machine, set a new **local-only** `P03_RESTORE_PASSWORD`, then:

```powershell
docker compose -f scripts/p03-release/restore-runtime.compose.yml up -d
docker exec p03-restore-release createdb -U postgres --template=template0 p03_restore_release
```

Set `P03_RESTORE_DATABASE_URL` privately to the local database on port 56624 and
`P03_RESTORE_CONTAINER=p03-restore-release`. Run the read-only readiness check:

```powershell
node scripts/p03-release/cli.mjs restore-runtime --config scripts/p03-release/production-extensions.json
```

It verifies exact extension default versions, an empty restore target, cron OFF,
the matching Docker loopback port, and internal-only container networks. This
prevents copied cron jobs or pg_net requests reaching live services. Extension
permissions, preload requirements, Vault encryption-key compatibility, and full
schema creation still must pass the actual restore; startup alone is not PASS.

## Release-day backup and restore

Do not run this against Production during preparation. Immediately before the
future release, with no expected writes during the quiet window, substitute the
final full candidate SHA and a new private directory:

```powershell
node scripts/p03-release/cli.mjs backup --tournaments 1cb06045-0ffc-4745-a8cd-1a16b71baffc --candidate-sha FINAL_40_CHARACTER_SHA --project-ref nsyjtqpvyxlzyujlbzos --out C:/Private/P03/release-day
node scripts/p03-release/cli.mjs verify-backup --backup-dir C:/Private/P03/release-day
node scripts/p03-release/cli.mjs restore-preflight --backup-dir C:/Private/P03/release-day
node scripts/p03-release/cli.mjs restore --backup-dir C:/Private/P03/release-day
```

Backup reads a complete logical custom-format archive, a schema dump, role names
(no passwords), and a bounded critical competition export. SHA-256 binds every
file. Critical facts must stay unchanged across the backup window. Restore uses
one transaction with errors fatal, then compares critical facts, normalized
schema, and extension versions. Local role stubs intentionally do not restore
login passwords or superuser attributes; archive ownership/ACLs are preserved in
the backup but local restore uses `--no-owner --no-privileges`. SQL restore and
schema comparison do not claim to validate hosted role privileges or Vault
decryption. No live Production backup was taken during preparation.

This is not PITR. It does not copy Storage object bytes, Clerk state, external
secrets/encryption roots, or transactions occurring after the dump snapshot.
Application rollback does not revert the database. Normal containment is Match
Room OFF and a forward repair; destructive restoration is an independently
approved recovery operation.

## Fingerprints

```powershell
node scripts/p03-release/cli.mjs fingerprint --tournaments 1cb06045-0ffc-4745-a8cd-1a16b71baffc --candidate-sha FINAL_40_CHARACTER_SHA --project-ref nsyjtqpvyxlzyujlbzos --out C:/Private/P03/pre.json
node scripts/p03-release/cli.mjs fingerprint --tournaments 1cb06045-0ffc-4745-a8cd-1a16b71baffc --candidate-sha FINAL_40_CHARACTER_SHA --project-ref nsyjtqpvyxlzyujlbzos --out C:/Private/P03/post.json
node scripts/p03-release/cli.mjs compare --before C:/Private/P03/pre.json --after C:/Private/P03/post.json
```

Each read uses repeatable-read/read-only transactions, 2s lock timeout and 15s
statement timeout. Maximum scope is five explicit tournaments, 10,000 rows per
table and 50,000 rows total. Twenty-two tables cover pairings/slots, results,
deadlines/holds, replay authority, standings, settlement and championship facts.
Actual column references fail closed on schema drift. Differences identify the
table, row UUID and changed field, never the private value. No automatic repair.

## Seal and final read-only gate

After the **final commit**, actual hosted browser tests, CI and Preview are
green, write an external JSON config with:

```json
{
  "masterSha": "0f23d7d906c8588de3051fd9a7cdcf218a576ab3",
  "productionProjectRef": "nsyjtqpvyxlzyujlbzos",
  "githubRepository": "OWNER/REPOSITORY",
  "vercelTeamId": "team_0OLta9dgvbWgjf1Jvn7X22n0",
  "previewProjectId": "prj_5os8tdLLkgGUSWnrxpiYj6OI6YEB",
  "previewDeploymentId": "dpl_EXACT_FINAL_DEPLOYMENT",
  "previewUrl": "https://exact-final-deployment.vercel.app",
  "tournamentIds": ["1cb06045-0ffc-4745-a8cd-1a16b71baffc"],
  "browserReport": "C:/Private/P03/hosted-playwright-report.json",
  "privacyDecision": "C:/Private/P03/approved-transcript-retention-decision.md",
  "runbook": "docs/p03-release-runbook.md"
}
```

The privacy artifact must contain the actual reviewed retention/purge/account
closure decision, not a placeholder or self-authored claim of approval.
Playwright JSON must carry `metadata.candidateSha`, `metadata.previewUrl`,
`metadata.supabaseProjectRef`, and all `[p03:...]` scenario markers from
`BROWSER_CASES` in `gate.mjs`, with no skipped, flaky or failed checks.

```powershell
node scripts/p03-release/cli.mjs seal --config C:/Private/P03/config.json --out C:/Private/P03/seal.json
node scripts/p03-release/cli.mjs gate --seal C:/Private/P03/seal.json --backup-dir C:/Private/P03/release-day --out C:/Private/P03/gate.json
```

Gate requires authenticated `gh` and `VERCEL_TOKEN` for GET requests. It checks
live origin/master, clean exact candidate, migration order/checksums/ledger,
both latest CI jobs, exact READY Preview/source/branch, build-isolation guard,
runbook/privacy/browser evidence hashes, fresh backup and successful actual
restore, Production identity/OFF state, competition facts, locks, and upcoming
cron deadlines/activations. Missing data is STOP. Gate itself only reads remote
services and writes new local evidence. A missing setting counts as OFF only
when no Match Room tables or functions exist.

Output is one `RELEASE GATE: PASS` or `RELEASE GATE: STOP` plus reasons. PASS
expires after ten minutes or any state change. Even PASS **stops** and requires
the user's exact instruction `PROCEED WITH P03 PRODUCTION RELEASE` before the
separate release executor. Humans must also coordinate no submissions/admin
operations; a maintenance page cannot quiet already open sessions, cron or
Server Actions. The executor repeats checks and atomically locks/checks facts
before and after migrations, aborting on contention or any competition change.
