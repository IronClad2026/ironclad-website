# P03 release tools

`node scripts/p03-release/cli.mjs --help` lists the main commands. Run from the
clean candidate checkout. `cli.mjs` never releases anything automatically.
Its separate `restore` command writes to a database, and it accepts an
empty database named `p03_restore_*` on loopback or a positively attested isolated
container on the local Linux Docker daemon only. The separately owned
`scripts/p03-db/execute.mjs` is the approved future Production executor.
The separate [privacy operator command](privacy-operations.md) verifies a live
Clerk administrator and uses service-only bounded RPCs; body export and every
mutation require explicit scope. It is never invoked by the release gate.

## Connections and private artifacts

Set `P03_DATABASE_URL` privately in the process environment. Use a direct
Supabase connection or session pooler on 5432, with certificate verification;
`P03_SSL_ROOT_CERT` may identify the downloaded CA certificate. Credentials are
parsed into child process environment variables, never process arguments or
logs. `P03_PG_BIN` identifies the directory containing PostgreSQL 17 `psql`,
`pg_dump`, and `pg_restore`. Do not place secrets in examples, Git, or transcripts.
The synthetic Docker source additionally sets `P03_LOCAL_CONTAINER`; restore
sets `P03_RESTORE_CONTAINER`. These enable positive local-container attestation,
never an arbitrary private-host exception or a Production endpoint override.

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
The supplied Compose file pins `supabase/postgres:17.6.1.127`, publishes no ports,
uses an internal network with no outbound access, and disables cron execution.
The current preparation host has no Docker/Podman engine. The earlier equivalent
synthetic runtime passed on GitHub CI as recorded below. The updated CI job now
uses this exact tracked Compose file as its restore target, authenticates with a
generated private password and checks wrong-password rejection. That updated
path still awaits exact-candidate CI evidence. Release day requires a fresh runtime
preflight and actual Production archive restore. Missing runtime/extension readiness is a release blocker,
not a waived check. Do not omit managed schemas or extension data to make
restoration pass.

On a Linux Docker host, set a new **local-only** `P03_RESTORE_PASSWORD`, then:

```powershell
docker compose -f scripts/p03-release/restore-runtime.compose.yml up -d
docker exec p03-restore-release pg_isready -h /tmp -U postgres -d postgres
docker exec p03-restore-release createdb -h /tmp -U postgres --template=template0 p03_restore_release
```

Wait for `pg_isready` to report accepting connections before the single
`createdb` invocation. The container deliberately bypasses hosted project-init
scripts, creates a fresh cluster under `/tmp`, preloads pg_cron, pg_net and
pg_stat_statements, and binds cron metadata to `p03_restore_release`, matching
the CI restore initialization path. Host access uses SCRAM with the new local
password, including the actual Compose target in CI. Only CI's separate synthetic
source fixture uses trust. The pg_net worker is
deliberately bound to the empty `postgres` database, so it cannot process queues
copied into `p03_restore_release`; runtime preflight verifies this setting.
There is no persistent
host volume or automatic restart. Startup refuses an existing data directory;
use a fresh reviewed disposable container for each attempt, preserving failed
restore evidence before any separately authorized cleanup. Never run
`docker compose config` into a transcript: it expands the private password.

Read the exact container IP with `docker inspect`, then set
`P03_RESTORE_DATABASE_URL` privately to that IP on port 5432 and
`P03_RESTORE_CONTAINER=p03-restore-release`. This requires a local Unix Docker
daemon. The connection helper verifies the exact running container name/IP and
every attached network is internal; arbitrary private-network addresses are
rejected. Native local PostgreSQL without network extensions may still use
loopback. Run the read-only readiness check:

```powershell
node scripts/p03-release/cli.mjs restore-runtime --config scripts/p03-release/production-extensions.json
```

It verifies exact extension default versions, an empty restore target, cron OFF,
the attested Docker IP and port, and internal-only container networks. This
prevents copied cron jobs or pg_net requests reaching live services. Extension
permissions, preload requirements, Vault encryption-key compatibility, and full
schema creation still must pass the actual restore; startup alone is not PASS.

The owner explicitly deferred the actual release host and private configuration
until before Production release. This Windows preparation host has PostgreSQL 17
client binaries but no Docker engine, configured native Production DB/TLS
connection, Vercel API token or dedicated Linux restore host. No host is guessed
or provisioned. Supply the nominated Linux Docker host, its PostgreSQL 17 clients,
`P03_DATABASE_URL`, verified TLS trust (`P03_SSL_ROOT_CERT` when needed),
`P03_PG_BIN`, `P03_RESTORE_DATABASE_URL`, `P03_RESTORE_CONTAINER` and
`VERCEL_TOKEN` securely before the live gate. The existing app service key and
read-only SQL connector do not replace native `pg_dump` credentials. Required
privacy operator names are in the linked procedure. This acknowledged operator
setup is separate from completed preparation engineering; the live gate still
fails closed if any required configuration or fresh evidence is absent.

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

## GitHub CI rehearsal with real Supabase extensions

`rehearse-hosted-runtime.mjs` runs only on a GitHub Actions Linux runner using
that runner's local Docker daemon. It creates two fresh clusters from the
observed Supabase PostgreSQL image, installs all seven actual extension versions,
replays the 146 original baseline migrations without suppressing extension SQL,
and seeds the representative tournament. Only Auth/Storage metadata is synthetic;
cron, pg_net, Vault, pgcrypto and other extension objects are genuine. The exact
backup/restore functions then compare the full schema, extension inventory and
22 competition tables. The runner reaches their attested private container IPs;
no ports are published. Neither container can access external networks, cron
execution is disabled, and pg_net workers target the empty `postgres` database
rather than either synthetic source/restore database. It cleans up only its
uniquely named containers/network.

The updated rehearsal invokes the actual tracked Compose file for the restore
target, with only unique container/network names and a generated local password
overridden. It verifies that SCRAM accepts the correct password and rejects a
wrong one, then performs the complete archive restore. No synthetic password is
logged, committed, passed in arguments or saved in the evidence artifact. The
next exact-candidate hosted job must pass this updated Compose path before that
additional coverage is claimed.

This runtime rehearsal **passed** in
[CI run 35821984251](https://github.com/IronClad2026/ironclad-website/actions/runs/35821984251/job/107055600738)
at candidate `a03b2f5b6fcd60cc7810d780455ba98646eac956` on 2026-09-23.
All seven exact extension versions, 146 raw migrations, complete archive restore,
normalized schema and 22-table competition comparison passed. The small evidence
JSON SHA-256 is
`e0fba09deadb9cdbed515985b1bc9236e78e9537f1f0d9857e4189230dc26633`.
The final candidate must independently pass this job again. This evidence does
not substitute for the actual release-day Production dump/restore or external
encryption-key recovery.
Only the small evidence JSON may be uploaded; never upload the logical archive.
The authoritative job is `p03-hosted-backup` in
[the CI workflow](../../.github/workflows/ci.yml). It checks out the exact PR head
and installs PostgreSQL 17 from the official PGDG repository on Ubuntu 24.04.
Use that maintained job rather than a separately copied workflow example.

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

For explicitly authorized preparation validation, `digest` accepts the same
scope/project/SHA/output options as `fingerprint`, but PostgreSQL returns only
per-relation counts and SHA-256 digests. All row projection stays in PostgreSQL.
It validates the exact 22-relation inventory and row bounds and marks its output
`preparationOnly`. PostgreSQL JSONB text digests have their own declared format;
they are not substituted for full release-day comparison evidence. The authorized
2026-09-23 Production validation covered 222 rows across the agreed 22 relations
and saved only those counts/digests to ignored current-user-only local artifacts.
No Production rows or settings changed.

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
  "privacyDecision": "docs/p03-retention-decision.json",
  "runbook": "docs/p03-release-runbook.md"
}
```

The privacy artifact records the owner's approved retention/purge/account
closure decision. Seal additionally verifies `docs/p03-privacy-readiness.json`:
the actual additive migration/package, bounded privacy operations, retention
tests, archived predecessor legal sources and reviewed Privacy 1.3 draft/PDF
must all match their explicit hashes. Text artifacts use canonical UTF-8 LF;
PDFs use binary hashes. Runtime legal files must be either the exact archived
predecessor or the exact deterministically finalized Privacy 1.3 corpus,
transition manifest and PDF, with every other document unchanged. The live gate
requires the finalized successor; a review draft can pass only preparation and
seal validation. A finalized candidate requires a new SHA, CI, Preview and seal;
at the live gate its effective
date must equal that day's Australia/Sydney date. Mixed or independently edited
legal runtime states are rejected. This is preparation readiness, not database
legal activation.
Controlled publication and current-account acceptance must complete while Match
Room remains OFF, before feature activation; no draft becomes effective here.
Native Playwright JSON must carry `config.metadata.candidateSha`,
`config.metadata.previewUrl`, `config.metadata.supabaseProjectRef`, and all
`[p03:...]` scenario markers from
`BROWSER_CASES` in `gate.mjs`, with no skipped, flaky or failed checks.
Playwright's additional `config.metadata.actualWorkers` is allowed. Alternate
top-level `metadata` is rejected rather than used as a fallback.

```powershell
node scripts/p03-release/cli.mjs seal --config C:/Private/P03/config.json --out C:/Private/P03/seal.json
node scripts/p03-release/cli.mjs gate --seal C:/Private/P03/seal.json --backup-dir C:/Private/P03/release-day --out C:/Private/P03/gate.json
```

Gate requires authenticated `gh` and `VERCEL_TOKEN` for GET requests. It checks
live origin/master, clean exact candidate, migration order/checksums/ledger,
all three latest CI jobs (`validate`, `p03-database`, `p03-hosted-backup`), exact READY Preview/source/branch, build-isolation guard,
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
