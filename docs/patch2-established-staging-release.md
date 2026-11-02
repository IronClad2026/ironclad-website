# Patch 2 established Staging release — 2 November 2026

This record supersedes the separate feature-Preview and credential-bootstrap
instructions in the earlier Patch 2 planning documents for Staging only.
Production is not authorized and has not changed.

## Source and ownership

Production candidate `688759c9b4766327a86ece665dbb9bcd320fbee9` and its Phase 1
checkpoint `b86cb0db400fa32ae6e07559817428082214f1bc` remain unchanged in the
separate `ironclad-patch2-phase1` worktree. Do not merge the entire Staging branch
into Production.

The latest remote Staging baseline was independently checked as
`c21a23855df61e953b89ee798a6962a3b823bd74`. An isolated worktree,
`ironclad-patch2-staging`, on `feature/patch2-staging-integration-20261102`
contains only these integration commits:

- `fce2f31`: Phase 1 cherry-pick, with original commit attribution.
- `237a5e7`: Phase 2 cherry-pick, with original commit attribution.
- `c7bf6a3f897d8bd0dc4532d667de49b58402d114`: Staging contract adaptation for
  exactly the two approved additional migrations and additive inbox setting.

Independent review verified the four auto-merged Staging overlaps. The partner's
public-profile metric/fixtures and workspace contracts remain intact. Player
registration, match/chat/replay implementations, partner APIs, translations,
dependencies, normal Staging guard and existing environment bindings were not
changed. Root is the sole migration/configuration writer for this release.

The integration was pushed as a fast-forward to `staging`; no reset, force-push,
master update or Production operation occurred.

The old destructive registration-cleanup action is deliberately unavailable,
including orphan/unassigned terminal-record cleanup. This is a reduction of an
existing admin capability, not a new deletion workflow. Supported rejection,
player withdrawal, individual rereview, accepted waitlist review and private-note
corrections remain available through their existing authorities. Historical
registrations are neither deleted nor reassigned.

## Deployment and configuration

Stable Staging URL:
https://ironclad-website-git-staging-ironclad-tournaments.vercel.app

The first matching build is READY:
`dpl_reKs58ZQbRQCvA7TXfxjiAzxXJV2`, immutable URL
https://ironclad-website-hrzzihzi0-ironclad-tournaments.vercel.app,
source `c7bf6a3f897d8bd0dc4532d667de49b58402d114`, Git ref `staging`,
nonproduction Preview target. The existing Staging resource guard ran in its
normal build. No alternate feature Preview or credential copy was created.

The only new environment setting is `PATCH2_ADMIN_INBOX_ENABLED`, scoped to
Preview / `staging`, initially false and then true for acceptance after the
hosted core assertions passed. The enabled build is READY:
`dpl_EP8w7tAfuiepdqrX7XYjBu8XjPJo`, immutable URL
https://ironclad-website-jbdee803a-ironclad-tournaments.vercel.app,
same reviewed `c7bf6a3` source and `staging` ref. Existing Sensitive credential bindings,
including all three VAPID records, remain unchanged. The Staging-scoped
`TRANSACTIONAL_EMAIL_MODE` was freshly read and verified disabled. No secret
values are included in this record.

The running app loaded its Clerk Development sign-in component at
`guided-goshawk-34.clerk.accounts.dev`. A dedicated synthetic player signed up
through the documented test-email/OTP flow, without sending real email or
changing any existing user's role. Its authenticated application reached the
normal Terms v1.1 / Privacy v1.2 gate. After the human explicitly approved this
synthetic account's legal acceptance, the browser submitted the form normally.
The player then saved a fictional basic profile through the application's
authenticated Supabase upsert. A full reload retained its identity and displayed
"Manage Player Profile". This supplies positive deployed Clerk-session/RLS
ownership evidence, beyond an empty read or service-role legal lookup. No role,
Steam, ELO, registration or avatar was added; the profile remains incomplete.
An independent read found that exact synthetic profile in
`zzbnneprhjicmajpjkdg` (`0224fef0-88ae-4761-a1dd-ee415f3d3d84`), confirming
the running application's database destination. It has no registrations or
notifications, so no new fixture delivery can be sent later.

## Exactly two applied migrations

Both files were applied explicitly in the reviewed order to Supabase Staging
`zzbnneprhjicmajpjkdg`. No unrelated migration was applied or reconciled.
The management tool assigned execution-time ledger versions; the receipt names
retain the exact reviewed source identity:

| Source file | SHA-256 | Staging receipt version |
| --- | --- | --- |
| `20261101220837_patch2_scoped_registration_review.sql` | `c69e8998124f39dccd05b4c07e83aa18b67c1b30e661f38cba70927ddffcf461` | `20261102015821` |
| `20261101230355_patch2_admin_inbox_legacy_assistance.sql` | `673e376db5fc924c022b39eb1da9dd64d74775e2aa63af9ee54ed47fce7b2a51` | `20261102015841` |

Check receipt names as well as versions before any later explicit application.
Do not use a broad migration push to reconcile these receipt timestamps.

The Phase 1 wrappers enforce tournament scope while preserving the existing
review authority. Phase 2 adds the scoped shared inbox, soft dismissal, durable
legacy assistance status and a guard against old global admin notification
mutations. Backfill retained two existing legacy requests; one prior outcome
remains explicitly unknown. Their tournament associations were not guessed.

Dependency inspection compared actual columns, primary keys and the current
registration, notification, room-resolution, privacy and retention functions.
No dependency or object-name collision was found.

## Push restriction and background work

Before and after EACH migration, the claim function remained postgres-owned
with ACL `{postgres=X/postgres}`. PUBLIC/anon/authenticated/service-role claim
execution remained denied; completion remained allowed. The claim body hash
remained `5d2f52d80bc91a3ffdd632d702a10eff55aa20d57f602ab2ad3958b34196e115`.
The canonical registration review body remained unchanged, and `match-proofs`
remained private. All four cron definitions/schedules remained unchanged.

The temporary permission revocation is deliberately retained. Neither named
migration grants push claiming. Do not replay the historical push migration,
restore the permission automatically, move VAPID variables, clear queues or
delete subscriptions.

The shared worker returns WORKER_FAILED because push claiming is denied.
Email and badge workers run independently and may still commit their work.
Disabled email is claimed and marked skipped/MODE_DISABLED, not sent.
Result auto-approval, waitlist expiry and matchup deadline jobs continue every
minute; the shared dispatcher continues every five minutes. Worker HTTP failure
does not roll back those independent tasks. Actual push delivery is untested.

Later restoration needs separate authorization. While still blocked, close any
fixture workflows/timers and suppress only manifest-owned synthetic delivery
IDs so they cannot be sent after restoration. Preserve source notifications,
assistance history and unrelated queued events.

## Validation and pending acceptance

Local checks used inert credentials, a loopback-only target and the Patch 2
remote-network blocker. No Production environment file was copied.

- Focused integration: 26 files, 298 unique tests; the one Staging-boundary
  failure was fixed and its complete 11-test file passed on rerun.
- Domain regression: 10 files, 285 tests passed, covering registration/ELO,
  withdrawal/waitlist contracts, deadlines, room actions/unread state, results
  and replay validation. Provider calls here are mocked; this is not hosted
  match/Storage acceptance.
- Full lint and strict TypeScript passed.
- The normal Turbopack build passed. Its first attempt rejected a local
  dependency junction; physical local dependency copies resolved that tooling
  issue without an application/configuration change.
- The earlier 64 combined disposable-database checks and 40 registration checks
  remain applicable to the unchanged frozen SQL; they were not repeated.

Hosted rollback-only core assertions passed against the actual Staging database.
They covered 31 scoped inbox records, pagination/counts/details, platform versus
unassigned membership, mixed-set atomic rejection, read-all across pages, shared
team state, retained notifications, legacy status/read separation, optimistic
versions, old raw service read/hide/delete rejection, and closed raw browser
access. The full request rolled back and persisted no fixtures. Server-side
digests confirmed all pre-existing domain, notification and permanent UAT rows
were unchanged within that transaction. Simulated SQL role/JWT claims are not
genuine browser Clerk/RLS verification.

The complete hosted registration rollback suite also passed. It exercised the
real capacity-eight limit and waitlist confirmation, ELO eligibility, duplicate
registration rejection, the same player in two tournaments, all six statuses,
retained notes, rejection/withdrawal/rereview rules, mixed-tournament bulk
rejection, FIFO vacancies, offer acceptance/decline/cancellation/expiry, closed
registration windows, real bracket generation/population/launch, roster locking
and first-round deadline activation. All fixtures rolled back and existing rows
retained their transaction-snapshot digests.

Earlier setup attempts stopped safely at real prerequisites: derived profile
completion, tournament-enabled derivation after bracket creation, and separate
current account legal acceptance. Only fictional test setup was corrected, using
the same derivation and acceptance authorities as the application. No rule was
weakened. Upstream ELO/Steam facts and SQL legal acknowledgements are explicitly
synthetic; no live provider lookup, human consent or Clerk JWT proof is claimed.
The expired-offer fixture is an isolated historical snapshot, with the same
transaction-local waitlist confirmation used by the real submission authority.

The hosted match/chat rollback suite passed through the real SQL authorities.
It checked private room access, original message bodies, message idempotency,
read cursors, outsider denial and admin attribution. Both opponents' modern
assistance requests joined the same episode; reading/dismissing its notification
did not resolve it, and explicit resolution did not change the match/deadline.
The current replay prepare/claim/commit path retained chronological 2–1 game
winners, rejected foreign ownership/result changes/duplicate hashes, supported
safe retries, and required opponent confirmation before an official result.
Dispute, self-confirmation, outsider and expired-window guards also passed.
All fixtures rolled back. Replay sizes, hashes and file references were
synthetic: actual bytes, parsing, upload/download, provider access, realtime
delivery and genuine Clerk JWT/RLS were not tested by this SQL suite.

An existing limitation in the unused legacy `submit_match_game_result` was
verified rather than changed: game 1 makes the match pending review, after which
the existing actionable-match insert guard rejects game 2. No current app/lib
caller uses this writer; the current replay-attempt series path above passed.
Both authorities predate Patch 2. Full legacy per-game series compatibility is
not claimed. Do not broaden this release into a match-reporting repair.

Genuine two-session inbox races also passed using distinct database backends and
overlapping cross-agent requests. Two readers produced changes `[1,0]`, two
dismissals `[1,0]`, and two assistance updates against the same version
`[true,false]`. Source notices/cases remained present; the foreign tournament
remained unread and visible. These calls used explicit simulated service claims,
not two real Clerk admin sessions. A first same-orchestrator attempt ran
sequentially and was not counted as concurrency; its read state was preserved.
For the combined final request, PostgreSQL's reported transaction-start value
was shared across statements; no precise second-transaction start is claimed.

Committed manual inbox fixtures are deliberately visible only in the Staging
environment and clearly labelled:

- Run: `patch2-staging-20261102-c7bf6a3-race-v1`.
- "Patch 2 synthetic inbox A": `a5e1146d-883b-4d96-9840-fa9abd6a3120`.
- "Patch 2 synthetic inbox B": `e1e8689b-1b17-4e5e-b229-c0abca00135a`.
- Both are Upcoming, registration disabled, without dates, registrations,
  generated competition, matches or offer timers. They are not registration
  acceptance fixtures and contain no real player help requests.
- 32 source notices remain. A has 30 active notices across two pages, 28 unread;
  B has one active unread notice. One dismissal retained its original row.
- Two synthetic legacy cases retain source links: one In progress/version 2,
  one Open/version 1. Both genuine pre-existing requests remain untouched.
- The two eligible fixture pushes were marked skipped with
  `PATCH2_STAGING_FIXTURE_SUPPRESSED` before commit; 30 ineligible/null delivery
  states were left null. No attempts or enqueue history was invented. No fixture
  push/email is pending, retryable or processing, so these notices cannot later
  be delivered when Staging push is restored. Subscriptions/unrelated queues
  were not changed. Preserve these records and the manifest after testing.

Browser legal acceptance and a positive authenticated profile write/reload have
passed. Existing admin-session availability, private Storage upload/retrieval,
multi-admin/mobile inbox controls, already-open forms and full browser
match/chat/result acceptance remain unverified; they are not inferred from the
SQL/local suites. The new inbox is enabled only on Staging for acceptance.

The ordinary player was denied `/admin` access. The initial dashboard displayed
"Polls could not be refreshed" before the profile existed; it cleared after the
profile save. This agrees with the existing poll authority's requirement for a
player row and was not changed by Patch 2. The attempted private-replay browser
request was blocked by the browser client before a readable response, so neither
HTTP denial headers nor actual Storage authorization is claimed for that test.
After the authorized synthetic sign-out, anonymous tournaments, the six-entry
archive and player directory loaded through the existing Vercel access. At the
checked 390×844 mobile viewport, tournaments/archive/directory had no horizontal
overflow and directory search/filter controls remained visible. The viewport
was reset. No real registration or provider connection was submitted.
Password sign-in to that same synthetic player also succeeded, retained the
saved profile and did not repeat the legal gate. The browser was left on its
dashboard. No existing user's session or role was changed.

The synthetic legal gate had no mobile horizontal overflow at the checked phone
viewport. Cookie-free requests correctly reached Vercel SSO protection. Automatic
approval review refused temporary-share creation and the proposed synthetic
sign-out, so neither was executed or bypassed at that point. The human has since
explicitly approved this synthetic player's terms/privacy acceptance and its
sign-out/sign-in. Those exact actions passed with that narrow authorization;
temporary-share creation remains unauthorized and was not retried.

On an acceptance failure, turn the Staging inbox off and rebuild the same safe
source. Retain both migrations, tournament guards, durable assistance cases and
new records. Do not revert to a historical build with global notification writes.

## Manual Staging checks

Use an existing authorized Staging admin login, then open the tournament workspace
for "Patch 2 synthetic inbox A" or "Patch 2 synthetic inbox B". The Notifications
tab supports individual/selected read and removal, plus read-all across pages.
All changes are shared by the whole admin team. Removal keeps the source record
and does not resolve an assistance request. The dedicated legacy assistance
queue remains accessible independently of the inbox switch/visibility.

Switch between A and B to check selection clearing and separate counts. These
permanent fixtures exercise inbox pages only: registration rules/all six statuses
were verified with rollback-only synthetic database fixtures, not with retained
player registrations. Use only clearly identified test data for manual changes.

The preserved application source is `c7bf6a3`; a later documentation/test-evidence
commit records the hosted assertions without changing runtime code or migrations.
Private assistance conversations, Discord and translation remain later phases.
