# Match Room staging production hardening

This is a narrow hardening change based on `origin/staging` at `6b70ae17e4137bc530e1ba932961d00ce456604d`. It does not authorize Production release. Work was isolated on `codex/match-room-production-hardening`.

## Changes

- Each mounted Match Room observes a one-pixel transcript-tail sentinel with `IntersectionObserver`. A read acknowledgement also requires current viewport/container bounds, a visible and online document, the latest loaded page, and the transcript at its bottom. Merely mounting or polling an offscreen room cannot acknowledge it. There are no opponent-visible read receipts or exposure timers.
- Canonical assistance continues to use `match_room_assistance` and immutable room routing. Unscoped legacy notifications remain operational until dismissed under their existing legacy semantics; reading a notice alone does not close it. Old-writer inserts are loaded on subsequent snapshots. Valid room-scoped notices are excluded from the legacy path to prevent duplicate or resurrected canonical requests. Legacy routing never invents room membership.
- `match_room_context` retains its Match-before-Tournament order and takes Tournament `FOR SHARE NOWAIT`. Simply reversing the order would conflict with final-result deferred settlement, which already owns Match before taking Tournament. Contention now aborts the whole communication RPC with `55P03`; the existing unavailable/retry UI preserves the draft and idempotency key. Not Held and all competition authorities retain their bodies and rules.
- `platform_settings.match_room` stores a strict Boolean `enabled`, initially false in the forward migration. The scoped setting command is service-role-only; the admin page, action and server helper repeat canonical Clerk-admin authorization. No browser actor or arbitrary settings key is accepted. Admin System & Recovery exposes the control with translated feedback. Failed writes retain the last confirmed setting.

## Disabled behavior

The database rejects player/admin sends, assistance requests/reopens and read acknowledgements. Lazy resolution cannot create a room. Existing transcripts and assistance state remain readable, and administrators can resolve existing assistance requests. The writable projection becomes false without permanently closing a room. Missing or malformed configuration fails closed. A settings-row shared lock serializes admitted writes with disable: once disable commits, new writes cannot be admitted.

Existing queued pushes are not cancelled. The shared push worker, unrelated notifications, VAPID, results, replays, dice, deadlines, holds, bracket advancement, reset/reassignment and account-closure authority are unchanged. Reset/closure can still preserve and close historical communication state while activity is disabled.

## Validation scope

Local application tests use synthetic identities. Browser fixtures mount real components but mock authenticated server boundaries and notification episode state. SQL suites execute the real database functions and permissions. Concurrency tests use separate PostgreSQL sessions and real Not Held, result, reset and closure commands; all concurrency fixtures are confined to disposable loopback databases. Hosted validation is limited to the positively identified `ironclad-staging` project (`zzbnneprhjicmajpjkdg`) and rollback-only synthetic fixtures.

The original checkout and master were not edited. No Production queries, migrations, deployment or history repair were performed. No environment-variable names or dependencies were added or changed.

## Remaining Production limitations

This work addresses the four specified defects/control gaps. It does not settle the existing formal privacy/retention/export/purge decisions, verify Production identity/environment/scheduler configuration, reconcile historical migration divergence, or resolve selective-port dependencies with the newer Production branch. Those remain a separate Production preflight. Whole-Staging promotion is not established as safe by these changes. Historical migration lock characteristics and existing queue cadence were not rewritten.

## Recorded validation

The applied forward migration is `20260920014644_match_room_production_hardening.sql`. Its SHA256 is `a03c4a3492ab54124c35ff9a487d7cd20441c5014b880747187e1e5b6643c725`; the committed LF source matches the Staging migration ledger. Match Room was explicitly enabled in Staging after rollback validation. Prior applied migrations were not edited.

- Focused application regression: 836 tests in 65 files passed, including room/send/idempotency, assistance, Operations, notifications/push, exact routing/privacy, result/replay, dice, deadline/Not Held and account-closure contracts.
- Database: Phase 1's 155 assertions, Phase 3's 89 assertions and 43 new hardening assertions passed locally and in rollback-only Staging execution. Synthetic records were removed by rollback.
- Concurrency: 13 controlled local checks passed, including real Not Held/room conflict, official-result settlement/read, send/idempotency, all nine communication entry points under Tournament contention, disable ordering in both directions, assistance, reset, account closure, unchanged authority hashes and atomic duplicate-migration rejection.
- Browser: 11 Match Room checks (375/390 px), six result/replay flow checks, 21 Admin Operations checks. A separate 390 px agent-browser visual smoke passed. Browser notification episodes are simulated; SQL covers the real episode and push-suppression behavior.
- `npm run lint`: passed with the existing `DeleteAccountSection.tsx` navigation warning; zero errors.
- `npx tsc --noEmit`: passed after the final application changes.
- `npm run build`: passed using only the existing CI dummy/local environment configuration.
- `git diff --check`: passed. Full application suite and final build run again in PR CI; the final delivery report records CI/Preview/merge identities.

Before/after Staging fingerprints matched for 112 Matches, 21 Tournaments, 153 registrations, one existing room and one existing message. The migration contains no competition-row rewrite, backfill, table/index creation, or competitive authority replacement. It sets ten-second lock and sixty-second statement timeouts. Migration reapplication is rejected atomically; it does not silently reset an enabled setting.

Commands used included `git fetch origin`, isolated `git worktree add -b`, `npm ci`, focused `npx vitest run`, the three Playwright fixture commands, the local PostgreSQL SQL suites, `node tests/database/match-room-production-hardening-concurrency.mjs <local-psql.exe>`, lint, TypeScript and build. The approved Supabase connector applied and verified only the named Staging migration and rollback suites.

There were no dependency changes. Installation reported nine existing dependency audit advisories; dependency upgrades were outside this narrow task. Native mobile/background behavior and real-device push delivery were not newly exercised against hosted Clerk accounts.

## Changed files

- `app/admin/system/match-room-actions.ts`
- `app/admin/system/page.tsx`
- `app/tournaments/room-actions.ts`
- `app/tournaments/support-actions.ts`
- `components/AdminMatchRoomControl.tsx`
- `components/MatchRoom.tsx`
- `docs/match-room-production-hardening.md`
- `lib/admin-operations.ts`
- `lib/i18n/match-room-control.ts`
- `lib/i18n/match-room.ts`
- `lib/match-room-settings.ts`
- `lib/match-room.ts`
- `supabase/migrations/20260920014644_match_room_production_hardening.sql`
- `tests/browser/match-room/flow.spec.ts`
- `tests/browser/match-room/main.tsx`
- `tests/browser/match-room/README.md`
- `tests/browser/match-room/runtime.ts`
- `tests/browser/match-room/visibility-runtime.ts`
- `tests/database/match-room-production-hardening-concurrency.mjs`
- `tests/database/match-room-production-hardening.sql`
- `tests/integration/admin-operations-authorization.test.ts`
- `tests/integration/admin-operations-loader-metrics.test.ts`
- `tests/integration/admin-system-page-authorization.test.tsx`
- `tests/integration/admin-tournament-workspace-contract.test.ts`
- `tests/integration/match-admin-assistance-action.test.ts`
- `tests/integration/match-room-actions.test.ts`
- `tests/integration/match-room-phase-3-migration.test.ts`
- `tests/integration/match-room-production-hardening-migration.test.ts`
- `tests/integration/match-room-settings.test.ts`
- `tests/unit/components/AdminMatchRoomControl.test.tsx`
- `tests/unit/components/MatchRoom.test.tsx`
- `tests/unit/lib/i18n/match-room.test.ts`
