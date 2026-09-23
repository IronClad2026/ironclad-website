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
`scripts/p03-preview`, `tests/p03-db`, `tests/p03-preview`, `tests/preview/p03`,
`tests/unit/p03-release`, `tests/unit/p03-preview`, and these `docs/p03-*`
documents. The candidate also adds a tested Preview build guard and database CI.
[The candidate file inventory](p03-candidate-file-inventory.md) lists every preparation and imported path. `git diff --name-status origin/master...HEAD` verifies the final inventory.

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
The package and gate pin those definitions and refuse drift. A separate
read-only information-schema check confirmed all 257 fingerprint columns across
22 tables exist in Production; no competition fact rows or data digests were
exported by that check.

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
`supabase_vault`; its hosted-extension preflight correctly returned STOP. The
separate Supabase-compatible rehearsal then **passed** on source
`a03b2f5b6fcd60cc7810d780455ba98646eac956` in
[CI run 35821984251](https://github.com/IronClad2026/ironclad-website/actions/runs/35821984251/job/107055600738):
PostgreSQL 17.6, seven exact real extension versions, all 146 raw baseline
migrations, full logical archive restore, normalized schema and 22-table facts.
The safe evidence SHA-256 is
`e0fba09deadb9cdbed515985b1bc9236e78e9537f1f0d9857e4189230dc26633`.
No Production data entered that rehearsal. CI repeats it on the final candidate.

Logical backup is not PITR and excludes Storage object bytes, Clerk state and
external encryption roots. Actual Production archive restoration and the
release-day disposable runtime still must pass immediately before release.

Twenty-one focused release-tool unit tests passed, including fail-closed gate
receipts. The final gate binds clean Git state, live master, ledger/dependencies,
exact package, all three CI jobs, immutable READY Preview, hosted browser coverage,
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
3. Private operator connection/TLS and Vercel metadata credentials, final seal,
   and the fresh live gate immediately before the separately approved release.
   The release-day Production backup must pass its actual isolated restore;
   synthetic rehearsal evidence cannot replace that fresh check.

Real provider web-push delivery is not claimed by this Preview: the isolation
guard excludes provider credentials. Database episodes, routing and push policy
are exercised independently. Do not send real external notifications merely to
obtain a test pass.

The [release runbook](p03-release-runbook.md) specifies quiet-window coordination,
manual backup, gate, atomic application, dark smoke test, activation, and emergency
OFF containment. Application rollback cannot undo database schema or messages;
forward repair follows containment. No destructive down migration is prescribed.

## Commands, configuration and preparation holds

Executed locally: `npm ci`, `npm run lint`, `npx tsc --noEmit --incremental false`,
`npm run test`, `npm run build`, and the Playwright configurations under
`tests/browser/bracket-layout`, `tests/browser/match-room`, and
`tests/browser/match-result`. Their completed baseline counts were 3,526 unit
and integration tests, 60 bracket browser cases, 15 Match Room cases, and seven
result/replay cases. New preparation coverage adds 29 receipt parser tests, nine dedicated-admin
identity tests, and two Docker attestation tests, plus 28 standalone fixture
guard tests. The PR
records the final exact-SHA CI results, including any subsequently added tests.

Database commands executed: `replay-baseline.mjs`, `seed-rehearsal.mjs`,
`rehearse.mjs`, `concurrency.mjs`, `attention-concurrency.mjs`, and
`rehearse-executor.mjs` under `scripts/p03-db`, plus
`node --test tests/p03-db/package-checks.mjs`. Backup, restore, fingerprint
comparison, and a deliberately missing-seal STOP check exercised the operational
tools. A successful final live Production gate has not been run during preparation.

No dependencies changed. The only remote environment change was the explicitly
approved Preview-branch value of existing `PREVIEW_LEGAL_DOCUMENT_ORIGINS`.
Harness/operator-only variable names are documented in
[p03-preview-validation.md](p03-preview-validation.md),
[fixture preparation](../scripts/p03-preview/README.md), and
[release tools](../scripts/p03-release/README.md); their values stay private.

Automatic approval review rejected three narrowly scoped actions: creating a
privileged Development test administrator, inspecting the Staging Vault-derived
worker hostname, and exporting Production-derived competition digests to a local
artifact. Separate explicit approval questions remain pending. These rejected
actions did not execute. The new fixture generator is prepared and guarded but
has not created its event. No live administrator workflow, new-fixture lifecycle,
or Production fingerprint export is claimed as passed.

No active P03 partner branch was found changing this candidate. Historical P03
source worktrees remain untouched. Remote master and Staging baselines are
rechecked before the final handoff; any later drift invalidates the release seal.
