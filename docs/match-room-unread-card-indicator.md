# P03 — Private unread Match-card attention

## Scope and environment

Baseline: `origin/staging` at `76428f28d96fe609a13089b05eaa6315433fe629`.
Branch: `codex/match-room-unread-card-indicator`, isolated worktree.
Hosted database: positively verified `ironclad-staging` (`zzbnneprhjicmajpjkdg`).
Production, master, competitive data rewrites and Production deployment are
outside this change. No open Staging PRs overlapped at the initial inspection.

## Authority and presentation

The bounded authenticated batch projection uses existing immutable membership,
current communication generation/pairing and the existing private read cursor.
Messages beyond that cursor from another actor produce `opponent`, `admin`, or
`generic` (mixed) attention. The response includes only match ID, room ID and
source classification. It has no transcript, private actor IDs, notification
contents or historical rooms, and does not create or mutate rooms.

Bell read/dismissal is independent of the room cursor. Genuine existing
viewport-gated read acknowledgement triggers an immediate private-summary
refresh; no optimistic removal can hide a newer message. Older requests are
superseded. Polling runs about every ten seconds only while the relevant page
is visible and the viewer is signed in. It never refreshes the tournament tree.

The lifecycle rule is an open room for the current participants of a launched,
in-progress tournament, with a scheduled, in-progress or pending-review Match
that is eligible for communication under the existing format rules. Completed,
replaced, closed, Not Held, unlaunched and outcome-only matches do not glow.
Admins get no participant bypass; an admin who is also an actual participant
uses that participant's own state. The database kill switch returns no attention.

The existing Match action carries a mail icon and visible localized text plus
an accessible unread description. A static outer amber ring and restrained
glow preserve the core dimensions and connectors. Match status stays visible.
No animation is required, including for reduced-motion users. English, Spanish,
French, Italian, Korean, Brazilian Portuguese, Russian and Simplified Chinese
are supported. Single elimination and round robin use the same private state.

## Verification boundaries

Browser fixtures mount actual components with synthetic authenticated transport;
they cannot establish hosted authorization. SQL suites exercise real database
functions, roles and JWT claims. Hosted SQL test fixtures must roll back, and
concurrency tests must remain in disposable loopback databases. Hosted Preview
validation is recorded separately. No native mobile-device or provider-delivered
push claim is inferred from Chromium emulation or mocked transport.

## Migration and hosted database evidence

`20260922054205_match_room_unread_summary.sql` adds one bounded read-only RPC.
It adds no tables, policies, broad grants, backfill, dependencies or environment
variables. SHA-256 of the exact LF SQL bytes and hosted ledger statement:
`42efbf9b372b57e1007ba74fc282fad3bf96535be2b60f6c8578504f8e0618ef`.
The Supabase CLI generated the new file; its timestamp was reconciled to the
canonical hosted application version. Existing migrations are unchanged.
Authenticated execution is granted; anon and service-role execution are denied.
The function authenticates JWT `sub`, checks the active player, and authorizes
immutable/current participation independently of Clerk administrator metadata.

Staging fingerprints matched before/after the additive migration:

| Relation | Rows | MD5 of ordered complete rows |
| --- | ---: | --- |
| tournament_matches | 112 | e0bf92ea87dbc61f6b7e1e1ab1705c76 |
| tournaments | 21 | 2030c7c130a2f9abeb61714afb0df1f7 |
| registrations | 153 | bba36417f6314ea1575c2bfcd601b0a0 |
| match_rooms | 1 | 1832c97691325b2529dee2f0460d70ff |
| match_messages | 2 | 52434ae12ce75c78bf4a032cae5661d0 |

Hosted read-only execution with an existing Staging synthetic participant
confirmed the expected opponent-unread projection. No private body or actor
identifier was returned. The new test fixture namespace remains empty.

**Hosted mutation-test limitation:** automatic approval review rejected the
rollback SQL suite because it temporarily disables triggers, toggles the shared
kill switch and closes a synthetic account. It was not executed or retried by
another route. Those scenarios were verified in disposable local PostgreSQL;
hosted coverage uses read-only checks and the actual protected Preview.

## Checks and commands

- `git fetch origin`, isolated `git worktree add -b`, `npm ci --no-audit --no-fund`.
- `npm run lint`: passed; one preexisting DeleteAccountSection navigation warning.
- `npx tsc --noEmit`: passed.
- `npm run build`: passed with existing CI dummy/local configuration.
- Focused new boundary/parser suite: 33 passed; UI/hook/room batch: 54 passed;
  localization: 181 passed across 19 files. Counts overlap broader batches.
- Focused regression batch: 801 tests across 55 files have passing evidence.
  Its initial two failures were migration-inventory expectations. Both were
  updated without weakening historical hash/permission contracts, and their
  15-test rerun passed. Coverage includes room/history/read, notifications/push,
  result/replay/confirmation/dispute, dice, deadlines/holds, admin workspaces,
  account closure/history and Discord privacy.
- Local PostgreSQL at fixed `127.0.0.1:56591`, new disposable unread clone:
  34 new rollback assertions, existing Phase 1 suite, Phase 3's 89 assertions,
  hardening's 43 assertions and five actual concurrent scenarios passed.
- `node tests/database/match-room-unread-concurrency.mjs <local-psql.exe>`:
  summary does not lock competition rows; both read/send lock orders; newer
  unread survives a stale read; participant-admin self-send exclusion; real
  same-pair reset isolation. Repeat migration application is rejected atomically
  with SQLSTATE 42723, leaving one projection and zero test players.
- `git diff --check`: passed.
- Playwright: 60 bracket cases have passing evidence (initial run plus focused
  reruns), Match Room 15/15, result/replay 6/6, Admin Operations 21/21. The bracket
  cases compare core bounds, card positioning, connectors and Final centering
  with attention off/on for 8/16 players at desktop and 375/390 px, all eight
  locales, round robin, focused/pending/completed, keyboard and reduced motion.
  Initial harness-only failures were corrected by using the agreed outer-card
  marker and document coordinates when keyboard focus scrolls the viewport.
  The final 60-case suite runs cleanly again in CI as a release gate.
- Local agent-browser visual review: desktop long usernames and French 375 px
  show a restrained outer ring distinct from normal active orange, with intact
  names, scores and status. Browser evidence is under ignored `.playwright`.

Complete CI, actual Preview visual checks and merged Staging identities are
recorded on the PR after deployment. No full local suite repetition is claimed;
CI is the complete-suite release gate. No native-device or new live provider
push delivery test is claimed.

## Documentation consulted

- Installed Next.js 16.3.3 `use-server.md` and `server-actions.md`: a Server
  Function without cookie mutation or revalidation returns data without a route
  tree refresh; every action remains an authenticated external boundary.
- [Supabase function security](https://supabase.com/docs/guides/database/functions)
  and the current Supabase changelog: explicit grants and a safe search path;
  no new browser table access is introduced.
