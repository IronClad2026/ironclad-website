# Patch 2 Phase 3 — private assistance, Staging only

Production changes are prohibited. This work starts from Staging
`9c6856e42c28d4b0760ae5b55fb38bf969cc3f49` in the isolated
`feature/patch2-private-assistance-staging` worktree. The separate reviewed
Production candidate `688759c9b4766327a86ece665dbb9bcd320fbee9` remains intact.
Future Production integration must select the reviewed Patch 2 commits, never
merge the entire Staging branch.

## What changes

Each player gets one private conversation per immutable match room. The first
message is required. The authenticated database authority derives the requester,
registration, tournament, division, match and room. Opponents have separate
conversations. Only the original requester and authorized admins can read/reply;
every admin operation requires the selected tournament. Admins share the queue
and Open / In progress / Resolved workflow. A requester reply reopens a resolved
case; an admin reply marks it In progress. Reading/removing a website notification
never resolves or hides an outstanding request.

The existing durable `assistance_requests` model gains a distinct
`private_match_room` source and child `assistance_messages`. Legacy notification
requests retain their known status/history. Old shared-room requests retain their
original room controls, linked separately from the selected tournament's new
Assistance section. No legacy requester or private transcript is inferred.
The old textless request endpoint fails closed with MESSAGE_REQUIRED; older
pages must reopen help. Legacy reads and supported resolution remain available.
Creation and reopening of old textless shared-room episodes are retired; their
admin widget now offers only supported resolution and retained history. This is
an explicit capability reduction, not a silent new legacy workflow. Existing
global analytics are labelled as earlier shared/legacy assistance and direct
admins to the selected tournament for private requests.

Stable client message IDs, body checks, actor/request locks and unique constraints
make retries idempotent and serialize simultaneous requests/replies. When another
creation wins, the losing text stays in the form and can be sent as a reply; it is
never silently marked sent. Status updates use the current version. Polling is
confined to assistance components; match forms and replay drafts are not refreshed.

Private text never enters shared match messages, shared realtime topics or
notification metadata. Generic website-only notifications link to the private
request. Raw tables are inaccessible to browser roles. The existing privacy lock,
account-closure provenance scrub, bounded subject export/redaction and support
retention rules also cover the new messages. Unresolved support holds content;
resolved support follows the existing 24-month policy. Authorized redactions and
purges are reflected by subsequent reads rather than cached transcript bodies.

## Discord evidence and player wording

On 3 November 2026 (Sydney), the operator explicitly confirmed that
https://discord.com/channels/1440092095619662105/1440201093110960137
contains IronClad's existing ticket-creation panel. This is **operator-confirmed**,
not independently observed in Discord by the browser. The new help choice uses
that exact destination. Players get a copyable tournament/division/match reference,
must click Discord's ticket-creation button, and are told that opening the link
does not create a ticket and response time depends on staff availability.
All new player controls and website reply notifications use all eight website
languages. Existing optional opponent Discord-contact privacy is unchanged.

## Migration and release order

Only new migration:
`supabase/migrations/20261102192200_patch2_private_assistance_conversations.sql`.
It extends assistance, adds private message/RPC/ACL/retention integration and a
default-off database creation switch. It does not grant push delivery, change
cron, modify VAPID settings or change competition/result/replay authorities.

Before application, compare the current Staging schema and exact dependency
bodies; the existing privacy, legal, email/push initializer and closure authorities
were freshly fingerprinted. Apply this migration explicitly once, with its creation
switch off; do not replay the earlier two Phase 2 migrations or push unrelated
history. Then release the reviewed commits by a normal fast-forward Staging push
and verify the READY build's exact commit/configuration. Enable only
`platform_settings.private_assistance_new_requests_enabled` on Staging after the
off-state checks. No new environment variable, credential binding, service,
dependency or scheduler is required.

## Safe fallback

Set that database creation switch false and keep the reviewed Phase 3 build.
Existing transcripts, requester/admin replies, statuses and the tournament queue
remain accessible; the scoped inbox switch is independent. Discord remains
available. Never revert to an old build that loses admin access to private cases
or restores unsafe global inbox actions. Do not drop tables/migrations or delete
submitted messages. Production rollout requires separate authorization/review.

## Acceptance carried forward

Reuse the dated Phase 1/2 evidence where unchanged. These remain Production
release requirements, and are not counted as passed here:

- Actual replay upload, persisted-byte download and access restrictions. The
  connected Chrome extension requires “Allow access to file URLs” on the working
  PC. The human is on a phone; no permitted available alternative was found.
  Do not retry the blocked chooser until that permission or another permitted
  method becomes available. See `patch2-staging-replay-acceptance.md`.
- A second distinct real admin login (shared-state SQL/browser evidence is not
  a substitute).
- Testing on a physical phone (responsive browser/DOM tests are not that test).

Staging email remains disabled and its temporary push claim permission remains
revoked. All new assistance events are website-only by design. Tagged fixture
events must also be checked/suppressed so they cannot deliver after push is
eventually restored. Never re-enable push automatically or touch unrelated queues.

## Verification evidence

Local lint, TypeScript and a network-blocked placeholder-credential Next build
passed on the final app revision. **241 focused tests in 14 files passed**, covering
actions, privacy projection, UI, localization, notification links,
legacy assistance and tournament workspace tests passed. The existing workspace
migration allowlist was extended solely for this new file. Disposable PostgreSQL
tests exercise real new SQL, the existing Phase 2 inbox and the current legal,
retention and notification-initializer authorities; local JWT shims do not prove
Clerk signatures or hosted browser behavior. The complete pre-existing account
closure/Storage chain is not re-executed by those local tests.

The final reviewed migration SHA-256 is
`2eedac3923c0645e5133e14590c700b36357bbb2b17db6a0f80807d41bfeb922`.
All **22 actual disposable PostgreSQL check groups passed** at that exact hash.
Independent review found no unresolved critical/high issue after the retry,
redaction and earlier-metric wording corrections. The committed file is the
frozen migration input; no hosted application is implied by this checkpoint.

Deployment, migration receipt/hash and hosted acceptance evidence are recorded
below after those operations; preparation alone is not deployment or acceptance.
