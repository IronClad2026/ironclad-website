# Match result and replay UX

## Scope and baseline

Owner-authorized product refactor for Staging, 4 September 2026. Implementation
branch: `codex/match-result-replay-ux`, isolated worktree. Baseline Staging commit
`32c9ddaf8b4b85b4209bf26460cc60d0a0a808ab`, tree
`e8bd7ab47c8b89d935836af9440fef7dcd341744`. Production/master remains
`c6109d85de98f73545209a016c3114d953b8ebba` and is unauthorized.

The original checkout was kept clean. TEST 2 received read-only verification;
no submission, confirmation, dispute, reset, advancement, or other mutation was
performed against it. Its active Tournament had four in-progress matches,
three scheduled matches, no report groups, and a 30-minute confirmation setting
at the initial inspection. An older voided TEST 2 is a separate record.

The live Staging migration ledger matched all 145 repository migration versions.
Open PRs #82 (Badge foundation, targeting `preview/full-website`) and #89
(historical Badge cutover tooling, targeting
`release/achievement-badges-exact-tree`) were inspected. Neither targets Staging.
The former has broad logical overlap with tournament presentation; do not merge
that historical branch over this implementation without reconciling it. No
parallel agents or migration owners were needed.

## Player experience

The former form collected both absolute scores, the overall winner, a multi-file
selection, and a separate Game-winner list. That duplicated decisions and left
players to associate replay order with Game order. History and support actions
also competed with the main submission state.

The new flow is Won/Lost → one legal score → one replay per chronological Game
→ only ambiguous Game winners → named result review → Submit Result. The header
keeps the players, Round, series format, and existing match deadline together.
Notes and no-show reporting use disclosures. Each Game supports .rec selection,
filename/error feedback, Replace and Remove, retaining the existing 10 MiB limit.
All eight competition dictionaries have the new copy.

`lib/match-result-entry.ts` maps viewer-relative choices to the existing absolute
`playerOneScore`, `playerTwoScore`, and `winnerRegistrationId` payload. BO1/BO3/BO5
use the same required-wins derivation. Changing outcome clears the draft; changing
score preserves retained chronological files, removes surplus rows, and clears
explicit Game winners. Exhaustive legal-sequence enumeration derives sweeps, the
final Game winner, and every remaining mathematically forced winner. It never
guesses an ambiguous sequence or permits a series to end before its last Game.

Preparing, uploading each Game, and finalizing disable conflicting controls.
Successful submission removes the form immediately. A lost finalization response
locks the draft behind a refresh/reconciliation message; it never triggers client
cleanup after finalization has been dispatched.

The primary card shows waiting, confirmation required, expiry processing, Admin
review, manual confirmation, or automatic confirmation. Details and historical
replay/notes records remain available in a secondary disclosure. The public data
projection has no Admin audit reference: official report presentation uses the
surviving finalized group matching the official scores/winner. Canonical resets
mark historical groups `reset`, so they cannot relabel a later result. No data
projection or schema expansion was needed.

## Existing authorities reused

| Operation | Existing authority |
| --- | --- |
| Replay preparation | `prepareMatchReplayUploads` → `prepareMatchReplayUploadsForPlayer` → `prepare_match_replay_upload_attempt` |
| Private uploads | Existing signed upload tokens and the private `match-proofs` bucket; one ordered file per prepared Game |
| Finalization | `finalizeMatchResult` → `finalizeMatchReplayResultForPlayer` → `claim_match_replay_attempt_finalization` → server byte/hash checks → `commit_match_replay_attempt_result` → `submit_match_series_result_report` |
| Opponent confirmation | `confirmMatchResultReportGroup` → `confirm_match_result_report_group_api` |
| Dispute | `disputeMatchResultReportGroup` → `dispute_match_result_report_group_api` |
| Admin review | `reviewMatchResultReportGroup` → `admin_finalize_match_result_report_group_api` |
| Duration setting | `tournaments.result_confirmation_window_minutes`, read when the report is created |
| Report-specific clock | Persisted `match_result_report_groups.created_at` and `confirmation_deadline_at`; existing camelCase read projection |
| Automatic confirmation | `auto_approve_expired_match_result_groups(50)` → `finalize_match_result_report_group` → `apply_official_match_result` → canonical downstream reconciliation |
| Scheduler | Existing active pg_cron job `ironclad-auto-approve-match-result-groups`, schedule `* * * * *`, command `select public.auto_approve_expired_match_result_groups(50);` |

The latest confirmation/finalization lock and notification implementation is in
`20260823100000_match_result_transactional_trust.sql`; per-Game validation is in
`20260831132000_match_game_winner_authority.sql`. These migrations were read,
not edited. Read-only live inspection showed the cron job active and its five
most recent executions successful. The global expiry function was never invoked
manually on Staging.

The countdown derives the original duration from the persisted report timestamps.
It ticks locally, renders hydration-safely, uses local date/time and localized
numbers, handles unavailable dates, refreshes on visibility, and refreshes at a
bounded rate after expiry. Zero displays processing; only database state may
display an official result. A later Admin setting change cannot move this clock.

Manual confirmation retains `evaluateReportGroupBadgesAfterCommit`. The database
participant/Game authority recorders and Badge reconciliation-target trigger also
remain intact for automatic results. The existing transactional-email worker
drains the Badge reconciliation backstop. No Badge definitions, thresholds,
points, seasons, settlement, or leaderboard logic changed. Existing authority
revision history is preserved; retries add neither revisions nor progression.

## Discord and privacy

`components/RequestAdminAssistanceButton.tsx` now renders a link labelled
“Open Discord Support Ticket”, importing only the existing
`OFFICIAL_DISCORD_SUPPORT_CHANNEL_URL` from `lib/support.ts`. The Owner personally
verified this exact channel contains the player-accessible ticket creation panel.
The URL is defined once in product code, and the link uses `_blank` with
`noopener noreferrer`. General Discord/contact surfaces continue using their
existing configuration.

There is no player component calling `requestMatchAdminAssistance`. The historic
Server Action, internal support records, and types are preserved. Opening Discord
does not create an internal request. Replay evidence remains served by the
existing authorized routes; storage paths, signed URLs, and Clerk identifiers
were not added to browser projections or logs.

## Validation

On the final application tree:

- Full Vitest: **301 files, 3,020 tests passed**. This includes existing replay
  integrity, duplicate detection, uncertain-finalization cleanup, unauthorized
  evidence access, notification, Badge, and support action boundaries.
- Focused development coverage: 125 result mapping, replay, countdown, state,
  and read-projection cases passed across the relevant test runs; all are also
  included in the complete run.
- Strict TypeScript: `npx tsc --noEmit` passed.
- ESLint: `npm run lint` passed, zero errors. One pre-existing warning remains at
  `components/DeleteAccountSection.tsx:37` about relative `window.location.assign`.
- Production build: `npm run build` passed using the existing CI fixture
  environment values. No real environment files were copied.
- Browser: `npx playwright test --config tests/browser/match-result/playwright.config.ts`:
  **6 passed**, including 360, 390, 412, 430, and 1280 px. The tests mount actual
  product components with isolated service fixtures, reject external network
  requests, and exercise Game files/inference/review/submission/waiting,
  opponent actions, expiry, review, automatic confirmation, and the Discord link.
  Screenshot inspection verified wrapping and visible countdown; width assertions
  found no horizontal overflow. This is local fixture validation, not a claim of
  authenticated deployed visual testing.
- `git diff --check` passed. Dependency and environment contracts unchanged.

Database validation used a newly initialized PostgreSQL 17.10 instance on
**127.0.0.1:55462**. All 145 migrations replayed. Stock PostgreSQL lacks managed
`pg_net`/`pg_cron`; the existing `local-supabase-replay-prelude.sql` compatibility
stubs were used, with only top-level CREATE EXTENSION statements omitted from
temporary replay copies. Repository migrations were unchanged. Live scheduler
operation was verified separately by read-only Staging inspection.

- Existing `tests/database/match-result-transactional-notifications.sql` passed,
  including rollback when durable notification creation fails.
- New `tests/database/match-result-ux-confirmation.sql` passed: fixed 14:00
  submission, authoritative 14:30 deadline, setting snapshot/future 60-minute
  report, no premature authority or Badge queue, no early confirmation,
  automatic expiry, next-round slot, Game authority, legitimate Badge queue,
  dispute/manual protection, and exactly-once retry effects. The test replaces
  only local PostgreSQL clock functions inside a rollback transaction; canonical
  result function bodies are unchanged. A strict host/port guard prevents remote
  execution. Rollback restores the clock functions and all fixture mutations.
- New `tests/database/match-result-ux-concurrency.mjs` passed **three real
  multi-session races** against a new database cloned from that local schema:
  confirm first, dispute first, and expiry first. Lock waits were observed before
  releasing the blocker. Losing actions cannot override the winner; no deadlocks,
  timeouts, or repeat finalizations occurred. The disposable database is retained
  locally for inspection and is not connected to Staging.

Commands also included Git status/branch/worktree and open-PR inspections,
`git fetch origin`, read-only Staging ledger/cron/TEST 2 queries,
`npm ci --ignore-scripts --no-audit --no-fund`, scoped Prettier formatting,
focused Vitest runs, local `initdb`/`pg_ctl`/`psql`, and screenshot inspection.
The formatter was fetched as a temporary CLI; package manifests/lockfiles did
not change. Development runs initially exposed a test locator mismatch and a
public-projection assumption; both were fixed and covered before release.

## Changed files and release handoff

- Product: `PlayerMatchResultForm`, `PlayerMatchResultStatus`,
  `MatchConfirmationCountdown`, `MatchResultControls`,
  `RequestAdminAssistanceButton`, and the small match-workspace integration in
  `TournamentsExperience`.
- Helpers: `lib/match-result-entry.ts` and extracted unchanged action-message
  mapping in `lib/i18n/match-action-message.ts`.
- Translations: all eight `lib/i18n/dictionaries/*/competition.ts` files.
- Tests: form/deadline tests, new mapping/status/fixture/browser tests, and the
  two local database contracts above; this report.
- **Migrations: none. Environment variable additions/changes: none. Dependency
  additions/removals/updates: none.** No backend authority or routing/configuration
  changes were made. Bundled Next.js 16 router refresh documentation was consulted.
- No unresolved P0/P1/P2 defect introduced by this scope was identified in the
  completed checks. Authenticated Staging player UAT remains the Owner's final
  product check; no live player match was mutated for visual verification.

Release uses one Draft PR targeting `staging`. Before merge, verify CI/Vercel
green, unchanged PR head, unchanged baseline or reconciled changes, no overlapping
Staging PR, and scoped diff. The final task handoff records the PR, merge SHA/tree,
stable Staging alias, exact deployment SHA, and release checks. Production/master
is excluded. Owner UAT covers Won/Lost, scores, each Game's replay, winner
inference, review, submission, countdown, confirm/dispute, automatic confirmation,
and the Discord ticket destination.
