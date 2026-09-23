# P03 Production preparation evidence

This is preparation for draft PR [#136](https://github.com/IronClad2026/ironclad-website/pull/136), not Production release authorization. Production received no migration, setting, room, message, legal publication or deployment change. The original integration checkout remains clean and unchanged.

## Candidate and scope

- Master baseline: `0f23d7d906c8588de3051fd9a7cdcf218a576ab3`.
- Staging source: `4900d00c81a2c3f1ea0c126444f44499f3726aa4`.
- Candidate: `codex/p03-production-ready`, continuing the existing candidate `97bee422ef5d37c5c02fab68829e224ea5c2273e`.
- The draft PR records the final full SHA, exact-SHA CI and immutable Preview after commit. A committed document cannot embed its own resulting SHA.
- [Scope audit](p03-scope-audit.md) retains exactly 109 imported P03 source paths. [Final inventory](p03-candidate-file-inventory.md) adds every preparation path. P01/P02/P04 remain excluded; Production poll recovery, account acceptance, registration, bracket and result/replay/deadline authority remain.
- No dependencies or application environment-variable names changed. The existing `PREVIEW_LEGAL_DOCUMENT_ORIGINS` was previously saved only for this branch's Preview with explicit approval. Production configuration was excluded.

## Approved retention and privacy implementation

[The owner decision](p03-retention-decision.json) approves routine message content for **40 days after authoritative current tournament closure**, never individual Match completion. Cancellation and void use the existing terminal timestamp. Completion uses a private lifecycle observer because `first_completed_at` is stale after reopen/recomplete. Legitimate reopening invalidates the observation. Missing historical/current closure authority fails closed, with no guessed timestamp or competition-row backfill.

Formal assistance/support cases use the existing 24 months after case closure. Result dispute, no-show and integrity material uses the existing 24 months after authoritative final result. Explicit case references survive report reset/deletion; a replacement pairing cannot supply an old room's result clock. Open cases and missing/reset/mismatched result authority block deletion. No message text is classified. External cases require an authorized, verified case link.

Finite holds target only the affected room or explicit message IDs, use controlled legal/security/safety/integrity purposes, and require a reviewed expiry at most 366 days away. Ordinary eligibility resumes after release/expiry. The existing longer policy and rolling 90-day backup caveat are preserved.

The [privacy maintenance command](../scripts/p03-release/privacy-operations.md) is the simplest existing-infrastructure route: an authorized administrator reviews bounded preview pages daily and explicitly purges eligible rooms. It adds no paid service or cron. Each call takes at most 100 rooms and 1,000 messages per room, with current authority rechecked under locks. Bounded repeated calls finish larger rooms; held material is excluded. Counts-only per-room audit and a private intent/receipt support review without logging bodies. A lost response requires inspection before retry; no automatic mutation retry occurs.

Purge removes expired bodies, private cursors, eligible resolved episodes/notices and obsolete assistance attribution. Minimal room/pair/generation/sequence tombstones prevent history recreation and preserve idempotency. It never deletes tournament results, brackets, registrations, standings or other competitive history. NOWAIT match/room/tournament locking prevents lifecycle lock inversion and rolls the complete batch back on contention.

Account closure still immediately revokes future access/messages and scrubs direct Clerk/read/notification attribution. Retained free text is **not anonymized** merely by identity pseudonymization. An internal author-player UUID supports authorized retained-data lookup without ordinary API exposure. Locate/export requires verified current Clerk admin authority plus an active database actor, limits each room/page and excludes unrelated rooms. Nonparticipant admin authors receive only their own messages. Scoped redaction respects formal retention and holds. Record the verified player UUID in the existing private case before closure; erased identity is not promised to be reversible. Unknown legacy author attribution cannot be reconstructed from message text.

## Legal successor

Only **Privacy Policy v1.3** needs a successor. Terms v1.1 already supplies the operational User Content licence and versioned privacy-rights process; Rulebook/PPA remain unchanged. [Review artifacts](legal-drafts/p03-privacy-v1.3/) contain the separate derived corpus, 17-page PDF, immutable predecessor snapshots and checksum manifest. All PDF pages were rendered and inspected. No effective date was assigned to the review draft; current runtime/public policy stays Privacy v1.2.

[The legal runbook](p03-privacy-successor-runbook.md) prepares date finalization, mechanical local staging and a forward activation transaction. The publication command generates SQL only and defaults to rollback. It requires the exact finalized candidate package. SQL holds the Match Room OFF row lock, enforces the actual Sydney date, exact predecessors, 2-second locks and 60-second statements, and preserves other documents and historical acceptance rows.

The actual generated dated successor passed 242 legal assertions across 22 suites under a temporary local runtime substitution. Original files were restored byte-for-byte and the temporary public PDF removed. Seven native transaction checks include default rollback, stale-date/changed-predecessor rejection, competing ON lock contention and Privacy-only application. [Privacy readiness](p03-privacy-readiness.json) hashes the approved policy, SQL/tests, operator tools and review/publication artifacts. Preparation permits the exact predecessor; the live gate requires the exact dated successor.

## Database and competition evidence

The exact **seven-file** sequence and canonical checksums are in [the migration manifest](../scripts/p03-db/manifest.json). Four historical Staging migrations and both prior safety migrations retain their previous bytes/checksums. All seven schema/ledger steps run in one bounded transaction with Match Room OFF before commit. No intermediate writable room RPC becomes visible. No historical room is manufactured.

Native PostgreSQL 17.11 replays all 146 reviewed baseline migrations and the exact package. [Database evidence](../tests/p03-db/) records:

- 323 original SQL assertions covering Phase 1, Phase 3, OFF hardening and unread summary.
- Retention SQL and two-session races covering current tournament closure, reopen, case clocks/holds, partial/idempotent purge, export/redaction/closure privacy, tombstone behavior and concurrency.
- 32 original controlled races plus five attention/assistance races, augmented by retention races.
- Seven paused first-write boundaries invisible to separate sessions; injected failure rolls back the complete schema/ledger/facts; contention aborts within the bounded timeout.
- Nine package/receipt checks and guarded executor tests, including injected competition corruption rolling back before commit.

The ledger and normalized dependency definitions remain pinned. Production runs PostgreSQL 17.6, so the separate CI hosted-runtime rehearsal supplies actual Supabase extension compatibility evidence rather than treating native stubs as hosted proof.

## Authorized hosted checks and synthetic lifecycle

[The protected 14-case harness](p03-preview-validation.md) passed all preliminary cases on the previous immutable `97bee422` Preview with the new authorized synthetic Staging fixture. This closes the previously missing real admin, one-player/TBD, valid-deadline and assistance scenarios. The final committed candidate must rerun all 14 with no skip/flaky/unexpected result; the exact report and deployment are recorded in the PR and final seal.

Exactly one Clerk **Development** admin was created with external ID `ironclad:p03-preview-admin:v1`. Actual UI login/session role, genuine current Terms/Privacy acceptance and normal synthetic profile onboarding passed. Generated credentials stay ignored under a protected current-user-only ACL. A new clearly named synthetic tournament used 24 existing authorized RPCs and TestMain1–8, preserving older fixtures. Hosted runs send only three synthetic messages each, finish assistance resolved and recheck unchanged competition facts after every case.

The authorized Staging Vault check returned only the worker hostname and successful path equality. Fresh actual-worker Vercel evidence showed transactional email disabled before fixture creation. No shared worker setting changed. Preview excludes outbound provider credentials, so real push/email delivery is not claimed.

The admin and minimum fixture remain for the final run and date-bound release candidate rerun. Cleanup has not occurred. Reassess/retire the admin by **2026-10-07**; preserve current-user-only credentials until that decision. Future cleanup refreshes worker proof and uses normal void/closure authority only for the receipt event and sole dedicated admin. Older fixtures and other actors are preserved.

## Production fingerprint and backup rehearsal

The explicitly authorized Production query used one bounded repeatable-read READ ONLY transaction: 22 agreed relations, 222 scoped rows, counts and SHA-256 digests only. It returned no raw player records, bodies, proof paths or credentials. The private ignored artifact is `p03-artifacts/production-digest-validation-20260923/digest.json`; aggregate table digest is `3ecab5549104cc001834248b10c3944b4cf908bb2cccca7c60c8acb1369b34b4`. This validates tooling only; release day still needs a fresh fingerprint.

The existing native synthetic archive/schema/fingerprint restore passed. Supabase-compatible GitHub Actions also rehearses all seven actual extension versions and the full 146-migration baseline on the pinned PostgreSQL 17.6 image. The updated hosted job uses the **tracked isolated Compose runtime with SCRAM authentication**, a private ephemeral password, a wrong-password rejection probe, internal-only network, cron OFF and pg_net bound to an empty database. Final exact-SHA CI must prove that updated path; its non-sensitive artifact contains only synthetic evidence.

No Production backup has been taken. Logical backup is not PITR and excludes Storage object bytes, Clerk state and external encryption roots. Actual release-day archive restore must pass before approval; synthetic preparation cannot substitute for it.

## Validation record and remaining release-day work

Final local commands are `npm run lint`, `npx tsc --noEmit --incremental false`, `npm run test`, `npm run build`, all three Playwright browser configurations (60 bracket, 15 Match Room, seven result/replay cases), the complete P03 SQL/package/concurrency/executor runners, retention runners, fixture guards and legal publication rehearsal. Final CI repeats lint, TypeScript, all unit/integration tests, 82 browser cases, build, database and hosted backup jobs. The PR records fresh results and any failures after commit rather than borrowing old CI evidence.

The only deferred operational steps are:

1. Supply/configure the actual Linux/Docker operator host and private DB/TLS/read-only Vercel access, explicitly deferred by the owner. No host/path is guessed and no paid infrastructure is provisioned.
2. On the actual legal publication date, mechanically regenerate/stage the approved dated artifacts, obtain their new candidate SHA/green CI/exact Preview report, and reseal. No Production document becomes effective from this step.
3. Capture fresh Production backup, actual isolated restore proof, current fingerprint and quiet-window evidence, then run the final live gate. It checks clean identity, projects, ledger/dependencies/checksums, OFF, CI/Preview, legal readiness and fresh evidence.
4. Even on `RELEASE GATE: PASS`, STOP for `PROCEED WITH P03 PRODUCTION RELEASE`. Only that later instruction authorizes the release runbook. Keep OFF through migration/deployment and legal activation verification.

The successful final preparation is classified **A — READY FOR FINAL LIVE GATE**, subject to the exact committed CI/Preview results recorded in the draft PR. This does not claim a live gate PASS or authorize Production release.

## Configuration, boundaries and known limits

No dependencies changed. Application keys are unchanged; the existing branch-only Preview legal-origin value was the sole approved application configuration change. New privacy operator keys are `P03_PRIVACY_SUPABASE_URL`, `P03_PRIVACY_SERVICE_ROLE_KEY`, `P03_PRIVACY_CLERK_SECRET_KEY` and `P03_PRIVACY_ADMIN_CLERK_USER_ID`. Other harness/release-only keys are documented in their procedures; no values are committed.

No Production migrations/writes/activation/deployment, master merge, live provider notification, actual Production backup/restore or successful final live gate were performed. These are deliberately unrun, not preparation passes. The current Windows host has no Docker engine; hosted restore proof runs in isolated CI. Missing closure/result authority intentionally retains affected data pending review. Daily privacy maintenance and restore reapplication of erasure remain operator responsibilities.

No active partner branch was identified changing P03 contracts. Historical source worktrees remain untouched. The final handoff rechecks remote master/Staging; later drift invalidates the seal. Original integration checkout and unrelated user changes are preserved.
