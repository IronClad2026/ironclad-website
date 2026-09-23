# P03 atomic database release package

This directory prepares the future release. Nothing here authorizes a Production
mutation. Use the final release runbook and a fresh PASS gate; then stop until the
user explicitly says `PROCEED WITH P03 PRODUCTION RELEASE`.

## Exact package

`manifest.json` pins canonical LF SHA-256 values and this execution order:

1. `20260923040206_match_room_production_bootstrap.sql` (new, executed first)
2. `20260919011425_match_room_phase_one.sql` (original unchanged)
3. `20260919235836_match_room_phase_three.sql` (original unchanged)
4. `20260920014644_match_room_production_hardening.sql` (original unchanged)
5. `20260922054205_match_room_unread_summary.sql` (original unchanged)
6. `20260923040754_match_room_disabled_assistance_gate.sql` (new)

The new bootstrap has its real creation timestamp. It is deliberately run before
the old files by the exact package executor; no historical migration is renamed,
backdated, or rewritten. Generic `supabase db push`, individual SQL file execution,
and independent per-file transactions are **not** the release procedure.

`package.mjs` verifies checksums, removes only the verified outer BEGIN/COMMIT
envelopes, and tightens the original exact ten-second lock-timeout directives to
two seconds. Statement timeout is sixty seconds. Original canonical SQL is stored
in the migration ledger, and all six entries commit with all schema changes.

The package is one transaction. No external session can see the newly installed
RPCs or tables between the old migrations. At the first externally visible moment,
all mutation gates are installed and the setting is OFF. Bootstrap refuses a prior
room capability/table/setting. The final assertions refuse any manufactured room,
message, read cursor, notification episode or canonical assistance row. The legacy
phase-three backfill joins existing rooms: on the verified pre-P03 baseline it has
no room to join and produces no rows, including with legacy assistance notices.

Bootstrap also checks the normalized function definitions of the current account
legal-acceptance, admin reset and account-closure dependencies. Only carriage
returns are removed before hashing; a changed definition stops the package. The
live gate independently checks the same pinned `dependencies.json` contracts.

The final new migration gates admin assistance resolution while OFF. Result,
reset/reassignment, and account-closure authorities still invalidate obsolete
room identity and remove direct identity attribution where required. These safety
operations create no user conversation, read acknowledgement or new assistance.

## Lock behavior

Phase one takes ACCESS EXCLUSIVE on `tournament_matches` for its additive column
and installs triggers/functions. The default avoids a competitive-row rewrite,
but its CHECK validation can scan existing rows under that lock. Its room/read/message indexes are on empty new
tables. Phase three creates empty assistance/episode tables and a regular partial
index on existing `notifications`, taking SHARE there. Function replacement and
renaming take catalog/object locks. Hardening/unread/disabled-resolution add or
replace functions. There is no competitive data backfill.

Lock review follows PostgreSQL 17's [ALTER TABLE](https://www.postgresql.org/docs/17/sql-altertable.html)
and [CREATE INDEX](https://www.postgresql.org/docs/17/sql-createindex.html) contracts.

The approved executor first takes bounded SHARE locks on the explicitly listed
competition fingerprint tables, covering their authoritative writes while the
pre/post fingerprint is compared inside the migration transaction. The Match
table lock then upgrades for DDL. Quiet result submissions, match administration,
deadline/settlement jobs and notifications for this brief attempt. Open sessions
can stay connected; cached pages do not bypass the database barrier. Any lock
failure rolls the package back. Do not kill live transactions or retry blindly.

## Future mechanical execution

Set `P03_DATABASE_URL` privately to the approved Production direct/session-pooler
endpoint, `P03_PG_BIN` to PostgreSQL 17 binaries and `P03_SSL_ROOT_CERT` when needed.
No credential belongs in command arguments, terminal output, source or receipts.

```text
node scripts/p03-db/execute.mjs build --output <new-private-package.sql>
node scripts/p03-db/execute.mjs apply --gate <fresh-gate.json> --seal <release-seal.json> --output <new-private-apply-receipt.json> --approval "PROCEED WITH P03 PRODUCTION RELEASE"
```

`build` writes SQL only. `apply` requires the exact explicit approval, a PASS gate
younger than ten minutes, sealed candidate/project/checksums, unchanged clean HEAD
and live master, unchanged gate fingerprint and migration ledger, and no obvious
activity blocker. The actual write connection exists only after these checks.
It locks and rechecks all bounded competition facts inside the same transaction,
compares them after the migrations, and commits only if unchanged and OFF.

An intent receipt is written before execution. A lost connection can leave an
uncertain commit outcome: STOP and inspect the ledger read-only. Never blindly
retry, repair the ledger, run a down migration or enable the feature to recover.

## Portable isolated rehearsal

Start a fresh native PostgreSQL 17 cluster on **127.0.0.1:56623**, UTF8, with local
trust, and create `p03_rehearsal`. It must never be a hosted Supabase endpoint.
Supply each command the native psql path, or set `P03_PG_BIN` instead:

```text
node --test tests/p03-db/package-checks.mjs
node scripts/p03-db/replay-baseline.mjs <psql>
node scripts/p03-db/seed-rehearsal.mjs <psql>
node scripts/p03-db/rehearse.mjs <psql>
node scripts/p03-db/concurrency.mjs <psql>
node scripts/p03-db/attention-concurrency.mjs <psql>
node scripts/p03-db/rehearse-executor.mjs <psql>
```

The runner ignores inherited PostgreSQL connection settings and pins loopback.
It replays all 146 reviewed Production migrations, using the checked-in local
Supabase-signature prelude for auth/storage and non-networking HTTP/cron stubs.
The P03 package itself is unchanged. This verifies PostgreSQL authority and
concurrency, not hosted Clerk, Storage, provider delivery or browser integration.

The synthetic seed preserves CHECK/FK rules while disabling only user triggers
during fixture creation. It covers completed early rounds and a semifinal, an
active semifinal, one-player/TBD semifinal, TBD final, unactivated future pair,
BYE, pending/disputed result reports, replay authority, holds and legacy notices.
All triggers are restored before any tested operation. Existing SQL tests add
real result/reset/account-closure/dice/deadline and privacy behavior.

The six-boundary visibility test uses separate authenticated and service-role
connections. An injected final failure proves complete schema/settings/ledger
rollback. A held live-style Match transaction proves bounded DDL abort. The
controlled original concurrency suites execute against the final package in
new local databases and clean up only those databases and their synthetic roles.

The final local run passed 323 SQL assertions (155 Phase 1, 89 Phase 3, 45 OFF
hardening, 34 unread summary), 32 original controlled concurrency checks, and five
additional unread-summary/reassignment/admin-resolution races. Nine receipt and
package safety tests passed. The guarded executor also proved a deliberately
injected score change aborts and rolls back the entire package before commit.

Generated evidence records PostgreSQL version, checks, hashes and assertions;
it contains no messages, credentials or private proof paths. Production currently
runs PostgreSQL 17.6; the local preparation used PostgreSQL 17.11. Both use the
same major engine; the exact target must still pass the final live gate.
