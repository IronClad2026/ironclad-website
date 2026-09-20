# Match Room Phase 3 — staging functional completion

## Scope and baseline

Baseline: `origin/staging` at `7764aa62258599dfaf09d52fb69165e2ad1b5917` (Phase 2, PR #131).
Implementation branch: `codex/match-room-phase-3`, in a fresh isolated worktree.
Only hosted project used: `ironclad-staging`, `zzbnneprhjicmajpjkdg`.
Production and master are outside this release. No environment variables or dependencies changed.

This phase completes the Phase 2 notification, earlier-history and assistance lifecycle gaps. Immutable membership, communication generation, rate limiting, idempotent sends, authenticated RPC authority, private read cursors and visible-room polling remain in place. Scores, winners, holds, deadlines, results, advancement, replay authority and tournament lifecycle rules are unchanged.

## Delivered behavior

- A player message transaction creates one generic `match.message_received` notification for the other active original participant. An admin message targets active original participants, excluding the actual sender even when that admin is also a participant.
- An unread episode is unique per immutable room and recipient registration while unresolved. Further messages and idempotent retries reuse that episode. Catching up through the locked current room sequence resolves the caller's episode, marks its notification read and skips unclaimed pending/retryable push. Bell dismissal/read does not advance the transcript cursor or create another episode. A later message after catch-up can start another episode.
- Message insertion and durable episode/notification creation are transactional. Provider delivery happens later through the existing worker and cannot roll back a stored message. Generic notification projections and push payloads never include message bodies or private actor labels.
- Links retain both match ID and immutable room ID. Missing/malformed pinned context has no current-room fallback. Original participants retain authorized history; a replacement participant cannot inherit the old transcript, assistance or unread episode.
- `Load earlier messages` requests at most 50 rows before an exclusive sequence cursor. Responses stay chronological, merge without duplicates and preserve the visible scroll anchor. Earlier-page retrieval does not advance read state. Polling and communication actions preserve unfinished result/replay forms.
- Assistance is `none`, `requested` or `resolved`. The first request atomically records exact-room state and an existing admin notification. Duplicate open requests are idempotent. Only an authorized admin can explicitly resolve. An original participant or admin can reopen using the current request version, producing fresh notification evidence. Stale versions cannot silently reopen a resolved request. Resolving assistance leaves the room and competitive workflow unchanged.
- The admin operational queue reads canonical requested assistance through a narrowly scoped service-only RPC. Notification dismissal is independent. Counts and rows come from one database snapshot; exact-room links include retained rooms. The room footer provides resolution without invalidating the rest of the workspace.
- English, Spanish, French, Italian, Korean, Brazilian Portuguese, Russian and Simplified Chinese include the new history, notification and assistance text. Existing Discord privacy and administrator-visibility notices remain intact.

## Database migration and hosted evidence

Migration: `supabase/migrations/20260919235836_match_room_phase_three.sql`.
SHA256 (exact SQL bytes): `afafc5b80f7baecff212cb368af4c3dbedb785159888b06744bd21c420638720`.
Applied successfully to positively verified `ironclad-staging`; the hosted ledger version/name and statement checksum match the local file. The local filename follows the canonical hosted application timestamp. No historical migration was edited.

The migration adds `match_room_notification_episodes` and `match_room_assistance`, both with RLS/FORCE RLS and revoked browser/direct service table access. It adds authorized history/assistance commands, a service-only assistance queue, a notification insert trigger and explicit replacements of affected read/push/account-closure helpers. Safe search paths and explicit grants remain enforced. The migration is a one-time forward change: a repeat application fails without partial changes; the ledger prevents duplicate application.

Account closure acquires an exclusive communication advisory lock before the existing actor lock. Communication commands take the shared lock in the same order. This prevents a recipient closure racing an opposing send from creating a notification for the closed account. Existing closure behavior is preserved, episodes resolve, and direct assistance resolver attribution is cleared. Message bodies remain retained free text and are not claimed to be anonymized. Rare account closures briefly serialize communication commands; ordinary sends still share the lock.

Legacy backfill uses only valid exact-room Phase 2 assistance evidence, including dismissed notices. Multiple legacy notices collapse to one request, and resolution closes every notice for that exact room. Unscoped legacy notices remain untouched rather than being assigned to a guessed room. Hosted staging contained two unscoped notices and zero room-scoped legacy requests, so no canonical assistance row was invented.

Hosted rollback security verification passed all **89 assertions**. Every fixture was rolled back; checks confirmed no fixture players, tournaments or notifications remained. Existing data counts and complete-row fingerprints matched before and after migration plus verification:

| Relation | Rows | Before/after fingerprint |
| --- | ---: | --- |
| match_rooms | 1 | c083b954e0ec2c247c5efb314823e3a1 |
| tournament_matches | 112 | 61be10644319dfedc52832713a7d0e6f |
| match_messages | 1 | 0a4619c5a77f0be3d906564e1b51186e |
| tournaments | 21 | e09475190f0054c91e2c78d45b1dbdd1 |
| registrations | 153 | 56caf6a1eb5f815eb13bc12f4219180b |

The rollback suite temporarily isolates claimable push rows inside its transaction before the priority assertion, restoring all existing delivery states on rollback. It never calls a provider or writes Storage.

## Push delivery and limits

No provider, dependency, worker platform or queue was added. The existing combined transactional-email/push cron remains every five minutes and points to the staging branch alias. Only Boolean checks of worker configuration/secret presence were read; no secret values were exposed.

The existing push claim cap is 10 per run, with up to three provider requests concurrently. Existing non-chat critical events are selected ahead of message notifications. Nominal capacity is 120 notification claims/hour at the current schedule, reduced by retries/backlog; delivery is best effort and not instant. An active transcript still polls about every 10 seconds.

The worker rechecks message/assistance actionability immediately before provider delivery, including after recipient and subscription lookups. Already processing claims keep their token so the worker can finish them correctly. A read/resolve occurring after the final check and during an external send can still produce an already in-flight generic alert; provider delivery cannot be recalled. Push failure/retry never changes the authoritative stored message.

## Verification and reproduction

Local validation used synthetic identities and a disposable PostgreSQL 17.11 cluster bound to `127.0.0.1:56591`, never a production URL. Hosted staging runs PostgreSQL 17.6. Tests authenticate real database roles/JWT claims independently of browser fixture mocks.

| Check | Result |
| --- | --- |
| npm ci | Passed; existing lockfile unchanged |
| npm run lint | Passed; existing DeleteAccountSection navigation warning only after new harness warnings were removed |
| npx tsc --noEmit | Passed |
| npm run build | Passed using explicit CI placeholder configuration |
| Final focused application regression batch | 188 tests / 11 files passed |
| Notification projection/policy/copy/worker batch | 104 tests / 7 files passed; later worker race fix covered in the final batch |
| History, room parser/action, UI/locales batch | 118 tests / 4 files passed |
| Migration contracts | 19 tests / 3 files passed, including preserved historical platform boundary |
| Phase 3 local SQL | 89 assertions passed |
| Phase 3 hosted staging SQL | 89 assertions passed, rolled back |
| Existing Phase 1 SQL on Phase 3 schema | 155 assertions passed |
| Actual concurrent nonowner PostgreSQL sessions | 8 cases passed |
| Fresh forward migration legacy backfill | 5 assertions passed |
| Match Room Chromium browser suite | 9 passed at 375/390 px |
| Existing result/replay Chromium browser suite | 6 passed, including 360/390/412/430/1280 px |
| git diff --check | Passed |

Counts above overlap across focused batches and must not be added into a unique total. Full-suite CI and exact-commit Vercel Preview are the final merge gates, recorded on the PR and in the delivery report. Full local test-suite repetition was intentionally skipped in favor of CI, as requested.

Relevant commands:

```text
npm run lint
npx tsc --noEmit
npm run build
npx vitest run <focused unit/integration files>
npx playwright test --config tests/browser/match-room/playwright.config.ts
npx playwright test --config tests/browser/match-result/playwright.config.ts
psql -X -w -v ON_ERROR_STOP=1 -h 127.0.0.1 -p 56591 -U postgres -d ironclad_match_room_phase3_tests -f tests/database/match-room-phase-3.sql
psql -X -w -v ON_ERROR_STOP=1 -h 127.0.0.1 -p 56591 -U postgres -d ironclad_match_room_phase3_tests -f tests/database/match-room-phase-1.sql
node tests/database/match-room-phase-3-concurrency.mjs <local-psql.exe>
node tests/database/match-room-phase-3-backfill.mjs <local-psql.exe>
```

Concurrency cases cover opposing senders, duplicate send keys, read/send in both lock orders, duplicate assistance requests, recipient closure/send in both lock orders and safely rejected migration reapplication. Database tests also cover grants/RLS, admin recipients, caught-up/new episodes, notification dismissal, reset/reassignment privacy, older history and competitive-row invariance. Existing application regressions cover results, dice, deadlines/holds, workspace/bracket behavior, account closure, notification types and Discord privacy.

Browser fixtures use the actual room, assistance and result components with local synthetic action transport. A two-tab fixture verifies A sends, B gets one generic exact-room alert, returns, reads and replies, with replacement access denied. Separate player/admin scenarios verify admin messaging and assistance resolution/reopening. History has 125 messages, two earlier pages, no duplicates and bounded scroll movement. Screenshots were visually inspected. No permanent hosted competitive fixture history was created.

Browser screenshot artifacts are ignored under `test-results/match-room/` and `test-results/match-result/`; see `tests/browser/match-room/README.md`. Native phone keyboard behavior and real device/provider push delivery remain manual UAT. The tests do not claim a real signed-in two-account browser session against hosted Clerk/Supabase.

## Production release gate and intentionally excluded scope

Functional staging completion does not approve production release. Required policy/legal decisions remain:

1. Approved retention duration and purpose for message bodies, room metadata, private cursors, assistance attribution and notification evidence, including retention after account closure.
2. Exceptions for disputes, abuse/security investigation, legal holds and historical competition records; authorized administrator access and audit expectations.
3. The deletion/purge, access/export and erasure procedure, including backups, linked notifications, identity pseudonymization and treatment of personal information users put in message bodies.
4. Final Privacy/Terms wording, version/effective dates and any required acceptance or notice process.
5. Operational ownership and verification of the approved retention process before production release.

No 90-day policy, automatic purge, deletion promise or claim of body anonymization was invented. No legal document was published or changed. Optional Discord remains secondary and uses the current live privacy projection.

Realtime, presence/typing, social messaging, attachments, reactions, editing, ordinary message deletion and other excluded social features remain intentionally absent. There are no deferred core Phase 3 implementation features. Remaining practical limits are polling/worker latency, bounded assistance queue size (fails closed if truncated), native-device/provider UAT and the separate production legal gate.

## Changed file inventory

The following inventory is relative to the implementation worktree. It includes implementation, migration, focused regression coverage, browser fixtures and this report. There were no overlapping uncommitted partner edits in this fresh worktree; root owned assistance integration, the notification agent owned notification/worker/browser files, the history agent owned room/history/locales, and the database agent was the sole migration owner.

- `app/tournaments/room-actions.ts`
- `app/tournaments/support-actions.ts`
- `components/AdminMatchWorkspace.tsx`
- `components/MatchRoom.tsx`
- `components/MatchRoomAssistanceControls.tsx`
- `components/RequestAdminAssistanceButton.tsx`
- `docs/match-room-phase-3.md`
- `lib/admin-operations.ts`
- `lib/i18n/dictionaries/en/notifications.ts`
- `lib/i18n/dictionaries/es/notifications.ts`
- `lib/i18n/dictionaries/fr/notifications.ts`
- `lib/i18n/dictionaries/it/notifications.ts`
- `lib/i18n/dictionaries/ko/notifications.ts`
- `lib/i18n/dictionaries/pt-BR/notifications.ts`
- `lib/i18n/dictionaries/ru/notifications.ts`
- `lib/i18n/dictionaries/zh-CN/notifications.ts`
- `lib/i18n/match-room.ts`
- `lib/i18n/notification-copy.ts`
- `lib/match-room-assistance.ts`
- `lib/match-room.ts`
- `lib/notifications.ts`
- `lib/web-push/policy.ts`
- `lib/web-push/worker.ts`
- `supabase/migrations/20260919235836_match_room_phase_three.sql`
- `tests/browser/match-result/flow.spec.ts`
- `tests/browser/match-result/playwright.config.ts`
- `tests/browser/match-result/runtime.ts`
- `tests/browser/match-room/flow.spec.ts`
- `tests/browser/match-room/main.tsx`
- `tests/browser/match-room/playwright.config.ts`
- `tests/browser/match-room/README.md`
- `tests/browser/match-room/runtime.ts`
- `tests/browser/match-room/vite.config.ts`
- `tests/database/match-room-phase-3-backfill.mjs`
- `tests/database/match-room-phase-3-concurrency.mjs`
- `tests/database/match-room-phase-3.sql`
- `tests/integration/account-legal-mutation-boundary.test.ts`
- `tests/integration/admin-operations-loader-metrics.test.ts`
- `tests/integration/admin-tournament-workspace-contract.test.ts`
- `tests/integration/match-admin-assistance-action.test.ts`
- `tests/integration/match-room-actions.test.ts`
- `tests/integration/match-room-migration.test.ts`
- `tests/integration/match-room-phase-3-migration.test.ts`
- `tests/integration/notification-destination-resolution.test.ts`
- `tests/integration/notification-projection-privacy.test.ts`
- `tests/integration/stage-a-notification-event-keys.test.ts`
- `tests/unit/components/MatchResultStatus.test.tsx`
- `tests/unit/components/MatchRoom.test.tsx`
- `tests/unit/components/MatchRoomAssistanceControls.test.tsx`
- `tests/unit/lib/i18n/match-room.test.ts`
- `tests/unit/lib/i18n/notification-copy.test.ts`
- `tests/unit/lib/match-room.test.ts`
- `tests/unit/lib/web-push-policy-payload.test.ts`
- `tests/unit/lib/web-push-worker.test.ts`
