# P03 Production preparation evidence

This package is a draft candidate, not release authorization. Production was
inspected read-only; no Production migration, setting, room, message or deployment
was changed. The original integration checkout is unchanged.

## Source and review

- Master: `0f23d7d906c8588de3051fd9a7cdcf218a576ab3`.
- Staging source: `4900d00c81a2c3f1ea0c126444f44499f3726aa4`.
- Candidate: `codex/p03-production-ready`.
- Draft PR: <https://github.com/IronClad2026/ironclad-website/pull/136>.
- The PR and final release seal record the final full candidate SHA and its CI
  and immutable Preview deployment; committed evidence cannot contain its own SHA.
- [Scope audit](p03-scope-audit.md) inventories the 109 imported source paths,
  preserved master fixes, and explicit P01/P02/P04 exclusions.
- No npm dependencies or application environment-variable names were added.
  The existing `PREVIEW_LEGAL_DOCUMENT_ORIGINS` setting was saved with explicit
  user approval only for this branch's Preview environment. It names three
  existing Staging document origins; Production settings were excluded.

The additional preparation files are in `scripts/p03-db`, `scripts/p03-release`,
`tests/p03-db`, `tests/preview/p03`, `tests/unit/p03-release`, and these `docs/p03-*`
documents. The candidate also adds a tested Preview build guard and database CI.
`git diff --name-status origin/master...HEAD` is the complete final file inventory.

## Database evidence

The exact six-file sequence and canonical checksums are in
[`scripts/p03-db/manifest.json`](../scripts/p03-db/manifest.json). Bootstrap runs
first; all six migrations and their ledger entries commit in one transaction.
No intermediate RPC can become visible externally before the final OFF gates.
New admin assistance resolution and its projection also honor OFF. Original
Staging migration files are unchanged.

The 146-entry live Production ledger and three wrapped security dependencies
were inspected read-only. Account-closure definition hash differences were
solely CRLF line endings (44 CR characters); LF-normalized definitions match.
The package and gate pin those definitions and refuse drift.

Native PostgreSQL 17.11 replayed the reviewed baseline and exercised the exact
package. Production was observed on PostgreSQL 17.6. Recorded evidence:

| Check | Result and evidence |
| --- | --- |
| Partial tournament and historical results | PASS: scores, winners, assignments, advancement, deadlines and result/replay facts unchanged |
| Completed rounds/semifinal | PASS: no invented writable room; existing completed-room behavior covered |
| One-player/TBD, empty final, BYE | PASS: no room |
| Active two-player pairing | PASS: eligible only after activation of Match Room |
| Pending/disputed/review | PASS: authoritative communication behavior retained |
| First-write barrier | PASS: six paused boundaries invisible to separate member/service sessions; final state OFF |
| Atomic failure and contention | PASS: injected failure fully rolled back; contended DDL aborted at bounded timeout |
| SQL regression | PASS: 323 assertions across Phase 1, Phase 3, hardening and unread summary |
| Concurrency | PASS: 32 original controlled races plus five summary/assistance races |
| Executor | PASS: injected score corruption rolls back schema, ledger and facts; normal execution stays OFF |
| Receipt/package rejection | PASS: nine safety tests, including dependency drift |

See [`tests/p03-db`](../tests/p03-db) and the
[database package procedure](../scripts/p03-db/README.md). These are local database
tests, not claims of hosted authentication or provider delivery.

## Backup, fingerprint and gate

The logical backup/restore rehearsal used a safe synthetic database. Full archive
restore, checksums, normalized schema, extensions present in that fixture, and
22-table competition fingerprint all passed. Pre/post competition digest:
`6da124f1bb18e009066344577d511875f609bcf4f5e63747f52ce06ae0001483`.
The [backup evidence](../scripts/p03-release/rehearsal-evidence.json) records the
archive and manifest digests. No Production backup was taken during preparation.

Native PostgreSQL does not supply Production's `pg_cron`, `pg_net`, or
`supabase_vault`; its hosted-extension preflight correctly returns STOP. The
isolated compatible runtime must be rehearsed successfully before readiness can
be claimed. Do not confuse the native fixture restore with that requirement.
Logical backup is not PITR and excludes Storage object bytes and Clerk state.

Nineteen focused release-tool unit tests passed, including fail-closed gate
receipts. The final gate binds clean Git state, live master, ledger/dependencies,
exact package, both CI jobs, immutable READY Preview, hosted browser coverage,
privacy decision, fresh backup/restore evidence and stable competition facts.
It is read-only and stops even after PASS. The separate executor requires the
exact later instruction `PROCEED WITH P03 PRODUCTION RELEASE`.

## Verification and remaining inputs

Run final lint, TypeScript, full unit/integration tests, all three browser suites,
build, exact-SHA CI and hosted Preview checks. Report their latest results in the
PR rather than treating an earlier candidate run as current proof. Local bracket
and Match Room browser checks cover 375/390 widths and all eight locales; hosted
verification uses a separate [14-case harness](p03-preview-validation.md).

These are release blockers until evidenced:

1. Approved message-body retention, purge/export and account-closure policy.
   Historical P03 design explicitly deferred this product/privacy decision.
2. All 14 hosted cases passing, including an approved admin test identity and a
   genuine one-player/TBD fixture. Empty matches cannot satisfy the TBD case.
3. Supabase-compatible isolated restore runtime exercised with required
   extensions; release-day Production backup must then pass its actual restore.
4. Private operator connection/TLS and Vercel metadata credentials, final seal,
   and the fresh live gate immediately before the separately approved release.

Real provider web-push delivery is not claimed by this Preview: the isolation
guard excludes provider credentials. Database episodes, routing and push policy
are exercised independently. Do not send real external notifications merely to
obtain a test pass.

The [release runbook](p03-release-runbook.md) specifies quiet-window coordination,
manual backup, gate, atomic application, dark smoke test, activation, and emergency
OFF containment. Application rollback cannot undo database schema or messages;
forward repair follows containment. No destructive down migration is prescribed.
