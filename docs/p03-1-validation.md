# P03.1 automated validation

Implementation starts from Staging `4900d00c81a2c3f1ea0c126444f44499f3726aa4`.
All browser checks below use synthetic loopback fixtures. They do not replace
the user's final authenticated, two-player Staging UX testing.

## Executed checks

| Check | Result |
| --- | --- |
| `npm run test -- --maxWorkers=4` | 347 test files and 3,824 tests passed. This initial run preceded completion of the Realtime client and its focused tests. |
| `npm run test -- --maxWorkers=4` after implementation | 3,850 passed; one historical migration-list assertion needed to classify the two additive P03.1 migrations. The original 119-migration baseline and its hash remain unchanged. |
| `npx vitest run tests/integration/admin-tournament-workspace-contract.test.ts tests/integration/match-room-realtime-migration.test.ts` after that correction and final ledger naming | 15 passed, resolving the only full-suite failure. |
| `npx playwright test --config tests/browser/match-result/playwright.config.ts` | 6 passed; result entry, replay draft preservation, opponent actions, deadline expiry, review and automatic confirmation. |
| `npx playwright test --config tests/browser/bracket-layout/playwright.config.ts` | 60 passed; bracket geometry, private recipient attention, no public/admin/unrelated attention, localization, keyboard controls and reduced motion. |
| `npx playwright test --config tests/browser/admin-match/playwright.config.ts` | 7 passed; all result-management states, disclosures and keyboard/focus behavior at 360, 390, 412, 430, 1280, 1440 and 2560 px. |
| `npx playwright test --config tests/browser/match-room/playwright.config.ts` | 17 passed, including two new Realtime cases. Immediate refresh, duplicate send prevention, fallback, reconnect, older-history position/read preservation, hidden-tab cleanup, admin send/assistance, private unread episodes and replay drafts passed. |
| `npx eslint tests/browser/admin-match/runtime.ts tests/browser/admin-match/vite.config.ts` | Passed. |
| `npx eslint tests/integration/admin-tournament-workspace-contract.test.ts` | Passed. |

The first Playwright launch hit a Windows temporary-cache permission error
before tests ran. Using the ignored worktree-local `.playwright/tmp` directory
for `TEMP` and `TMP` resolved it. These completed suites then needed their exact
fixture Vite server processes stopped after all assertions passed because
Windows process-tree teardown waited indefinitely; all commands exited zero.

The existing Admin Match browser fixture initially attempted to import real
Match Room Server Actions into its Vite browser bundle. Its room and assistance
action aliases now use synthetic no-room/error responses, preserving the
fixture's no-network authority boundary. This is a test harness repair; it does
not change application behavior.

## Database and concurrency checks

The database owner ran these against a new local PostgreSQL 17.11 cluster pinned
to `127.0.0.1:56623`. The Realtime outbox shim verifies transaction and policy
behavior; it does not claim to emulate the hosted WebSocket service. Each runner
receives the local `psql` executable as its only positional argument and strips
inherited connection variables.

| Command under `scripts/p03-1/` | Result |
| --- | --- |
| `node database.mjs <local-psql>` | All 156 Staging migrations replayed with canonical hosted filenames; phase-one, phase-three, production-hardening, unread-summary, retention and Realtime SQL suites passed. Phase three: 89; hardening: 45; unread: 34; retention: 83; Realtime: 36, including closed-account join rejection with a stale JWT. |
| `node concurrency.mjs <local-psql>` | 37 controlled-session assertions passed: phase one 11, phase three 8, hardening 13, unread 5. |
| `node attention-concurrency.mjs <local-psql>` | 5 passed: committed unread state, send/read race, reassignment, resolution/disable ordering. |
| `node retention-concurrency.mjs <local-psql>` | 7 passed: lock ordering, rollback, concurrent holds/cases, bounded purge and idempotency. |
| `node realtime-concurrency.mjs <local-psql>` | 4 passed: commit visibility, rollback absence, concurrent idempotency, atomic reassignment/topic separation. |
| `node repeatability.mjs <local-psql>` | Both new migrations reject accidental replay atomically, preserving the switch, policies and definitions. |
| `node result-regressions.mjs <local-psql>` | Two existing result SQL suites passed against the final P03.1 schema. |

Counts and check descriptions are recorded in the adjacent `*-evidence.json`
files. Existing account closure/send concurrency and result settlement continue
to use their real database authority in these disposable fixtures.

## Environment and authority boundaries

Root final checks: `npm run lint`, `npx tsc --noEmit`, and `npm run build`
passed on the completed application. The final build used dummy credentials and
loopback Supabase settings; no build-time hosted data mutation occurred.

Hosted Staging migrations `20260928030127` and `20260928030150` applied
successfully. Before/after counts were unchanged: 3 rooms, 21 messages, 7 read
cursors and 1 assistance record. The enabled switch remained true. Three Realtime
policies and five triggers are present; authenticated direct message SELECT is
still denied. Source filenames match the actual ledger versions; SQL was unchanged
when the two new local files were renamed to those assigned timestamps.

Minimal hosted transport smoke passed using one existing provenance-verified
synthetic pair and a temporary revoked Clerk test session: authorized private
subscription, denied unrelated/unauthenticated subscriptions, REST broadcast,
database `realtime.send` broadcast, authoritative RPC refresh and unchanged read
cursor after disconnected reads. No users, tournaments, conversations, assistance
or read acknowledgments were created. The first subscription attempt did not
complete within the short smoke timeout; the next attempt and database-broadcast
run passed. The real hook retains fallback polling and reconnect retry handling.

Security-advisor preflight returned existing findings for intentionally gated
RPCs/deny-by-default tables and six existing public projection views. These are
not introduced by Realtime. No grants were broadened to silence the advisor.

Vitest rejects inherited remote Supabase URLs and live Clerk keys, uses mocked
service boundaries, and rejects unhandled network requests. Browser fixtures
reject non-loopback requests. No test described above reads or modifies hosted
messages, players, tournament data, or Production configuration.

No dependencies or environment variables were added by these validation
changes. The local test-only `TEMP`/`TMP` override is not an application setting.

## Independent security review

The transport carries only the immutable room UUID and communication generation,
plus Supabase's optional random transport ID. It cannot supply message bodies or
advance read cursors. The authoritative existing RPCs still authorize and return
all room content. Database policies authorize the exact current participant or
an active administrator, require the current lifecycle and enabled switch, and
deny client broadcasts. No message-table publication or direct table permission
was added.

An old topic receives only its own identity during closure. Replacement pairings
use a different room/generation topic, so cached old subscriptions cannot receive
new-room signals. The client ignores stale callbacks and removes the dedicated
channel and socket on lifecycle cleanup. Review caught and corrected two transport
issues before deployment: Supabase's additional payload ID and the SDK's delayed
last-channel socket disconnect.

Supabase caches channel permissions until a new token or token expiry. An account
closure immediately prevents authoritative room reads and new subscriptions;
an already-authorized socket can temporarily receive content-free timing signals
for its previously known room until permissions refresh. This does not expose
message content or grant access to replacement rooms. See the official
[Realtime authorization documentation](https://supabase.com/docs/guides/realtime/authorization).

Assistance status and private Match-card summaries retain their existing polling.
Realtime accelerates the open room's authoritative message refresh. Admin messages
use the same private channel and trusted read path.
