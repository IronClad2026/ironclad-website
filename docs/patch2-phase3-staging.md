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

First new migration:
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

The reviewed additive follow-up
`20261102195256_patch2_private_assistance_active_actor.sql` restores the existing
match-room active-account rule for every private RPC, including admin reads.
Admins need an active linked Player record; complete-profile, match participation,
Steam/ELO verification or legal acceptance for reads are not additional conditions.
Normal account closure deletes or pseudonymizes that link, so a still-valid Clerk
admin token must be denied immediately by the database. The first migration is
already applied and remains byte-for-byte unchanged. Follow-up SHA-256:
`cee0d9264ae7ee2942df66d91b7e7e3bb72b6b731af697bd488ed5beb939c435`.
The local runner applies both files and passes **25 actual PostgreSQL check
groups**, including missing, closed, deleted and pseudonymized admin identities.
This checks modeled final closure shapes, not the complete prior Storage/Clerk
deletion chain. New Staging requests remain OFF until this follow-up is applied.

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

### Initial Staging release — 2 November 2026, 19:45 UTC

- Reviewed implementation commit: `f4836c3c8cd177084b394b8a6887dc366a189816`.
- The one new migration was applied successfully to **Staging only** as receipt
  `20261102194457 / patch2_private_assistance_conversations`, at the frozen hash
  above. The earlier two Patch 2 migrations were not replayed.
- Existing four legacy requests and one shared request passed exact before/after
  row-digest checks. The preserved underlying purge/closure function bodies match
  their preflight hashes. No private message existed at migration completion.
- Normal `staging` fast-forward push triggered READY deployment
  `dpl_Ckuaoe7YuGaPXAt4z3KZnuu7Mp3G`, immutable URL
  https://ironclad-website-k24q1g20x-ironclad-tournaments.vercel.app,
  alias https://ironclad-website-git-staging-ironclad-tournaments.vercel.app.
  Vercel reports the exact implementation commit and `staging` ref, with a
  nonproduction target. No Production branch/configuration was changed.
- The real TestAcademy1 browser displayed the new help choices in retained match
  history with creation OFF, the confirmed Discord link/instructions and a
  readonly copyable reference. After enabling the database switch on Staging,
  the initial-message form appeared through component polling without a page
  refresh; blank submission remained disabled.
- `TRANSACTIONAL_EMAIL_MODE` remains disabled on Preview / staging. Push claim
  ACL remains `{postgres=X/postgres}` and its body hash remains
  `5d2f52d80bc91a3ffdd632d702a10eff55aa20d57f602ab2ad3958b34196e115`.
  Private `match-proofs` Storage and all four existing cron jobs remain intact.
  Actual push delivery is intentionally untested while disabled.
- The Supabase advisor reports the expected deny-all table RLS/no-policy INFO
  and authenticated SECDEF-entrypoint warnings for private assistance. Explicit
  authorization and grants are tested; no anonymous private entrypoint is
  granted. Its existing public-view SECDEF findings are unrelated to this
  migration, which creates no views. See the
  [Supabase RLS advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

Hosted conversation creation/replies, admin browser actions and access-denial
results are still pending at this initial release checkpoint.

### Active-account fix and hosted player acceptance

The account-closure follow-up was independently reviewed and applied as Staging
receipt `20261102195541 / patch2_private_assistance_active_actor`. Readback
confirmed the strict active-Player check, creation OFF, no private messages yet,
and the unchanged push block before acceptance resumed. Implementation follow-up
commit is `951662c`; guarded acceptance tooling/fixtures are separately committed
as `1d878c782a183f45e81408f6d6d795264a576dac`, also deployed READY through the normal
Staging branch workflow. No application-code change required repeating its
unchanged build/test results; the migration allowlist test passed again.

The two new cancelled fixtures are tagged
`patch3-staging-assistance-20261103-v1-a` and `-b`. The complete factory request
first passed with rollback; an alias-shadowing SQL error was corrected during
that safe rehearsal before any commit. The committed factory source SHA-256 is
`51fb22a6ef71051a3e50757c6448feec23c730217d73b7e9b4ddcb7ab2a94f06`.
Both tournaments launch/allocate one canonical room and cancel in the same
transaction, preserving recorded deadlines but exposing no live tournament at
commit. All sixteen registrations are canonical synthetic manual-review
snapshots; no consent, provider verification, replay, result or assistance body
is manufactured. Existing application/private/Storage rows passed transaction
digest checks. Repeatable-read checks establish preservation by this transaction,
not an absence of unrelated concurrent external activity.

| Fixture | Tournament | Match / room |
| --- | --- | --- |
| A: TestAcademy1 / TestAcademy2 | `f57d9890-5ac1-4c81-a966-f7c9324c937f` | Match `5131a673-4df4-4530-8f35-969997e2a5ec`; room `18640aaf-ce50-4f34-ad14-1ca5906b223a` |
| B: TestAcademy1 / TestAcademy3 | `87ca54d4-e6a7-4a49-b348-a4230b9a9476` | Match `5ad14749-7fbf-4811-bfaa-4e4a892aed9e`; room `68004246-962d-4982-ba86-2baeb85acec7` |

The reviewed API runner used only the existing protected Staging environment in
memory, exact project/issuer guards and permanent synthetic registry proof. The
create run passed 126 assertions, with four temporary Clerk Development sessions
created and all four revoked. A separate creation-OFF run passed 103 assertions,
again revoking all four temporary sessions. These are real signed player JWTs
accepted by hosted Supabase, not local claim shims or admin impersonation.
They cover four separate opponent/requester conversations, the same player in
two tournaments, simultaneous creates, exact nonce retries, replies, forged
tournament/queue/status targets, opponent/outsider/anonymous denial and closed
raw-table access. Admin browser behavior is not established by those API tests.

The real signed-in TestAcademy1 website also read A's private transcript and sent
a reply while creation was OFF. A matching independent readback proved exactly
one saved message, an Open request and zero eligible delivery events. After
creation resumed, the browser submitted the required initial message from the
existing dedicated cancelled replay-fixture room, creating request
`357577d7-45fc-4587-b587-88df2e4d2ac9`. Its match, room and tournament row hashes
remained identical, with zero reports and zero upload attempts. No existing
replay/chat/history row was changed; this is an additive private support record.

An already-open old browser still showed the previous textless help widget.
Its actual request failed safely; readback confirmed identical legacy/shared
request digests and only the single intended new private case in that room.
Its old error copy is generic; reopening help loads the message-required flow.
The older match view was already readonly after the prior deliberate fixture
cancellation; no blocked upload method was retried.

The attempted browser viewport override did not take effect (measured width
remained 1507px despite requesting 390px), so this is **not** counted as a passed
phone-width or physical-phone test. The override was reset. Physical-phone and
the carried-forward replay/second-admin tests remain outstanding.

### Working test links

- [Staging home](https://ironclad-website-git-staging-ironclad-tournaments.vercel.app)
- [A assistance queue](https://ironclad-website-git-staging-ironclad-tournaments.vercel.app/admin/tournaments/f57d9890-5ac1-4c81-a966-f7c9324c937f?section=assistance)
- [B assistance queue](https://ironclad-website-git-staging-ironclad-tournaments.vercel.app/admin/tournaments/87ca54d4-e6a7-4a49-b348-a4230b9a9476?section=assistance)
- [A shared inbox](https://ironclad-website-git-staging-ironclad-tournaments.vercel.app/admin/tournaments/f57d9890-5ac1-4c81-a966-f7c9324c937f?section=notifications)
- [B shared inbox](https://ironclad-website-git-staging-ironclad-tournaments.vercel.app/admin/tournaments/87ca54d4-e6a7-4a49-b348-a4230b9a9476?section=notifications)
- [A TestAcademy1 conversation](https://ironclad-website-git-staging-ironclad-tournaments.vercel.app/assistance/86c6c249-14f3-4dc0-bcad-7b100437dc51?tournament=f57d9890-5ac1-4c81-a966-f7c9324c937f)
- [B TestAcademy1 conversation](https://ironclad-website-git-staging-ironclad-tournaments.vercel.app/assistance/b09f68d1-3c46-455e-b836-c3d25e49b344?tournament=87ca54d4-e6a7-4a49-b348-a4230b9a9476)
- [Historical-match request created through the website](https://ironclad-website-git-staging-ironclad-tournaments.vercel.app/assistance/357577d7-45fc-4587-b587-88df2e4d2ac9?tournament=b75f6539-2271-417a-8338-51694a698e20)
- [Retained legacy requests in original synthetic inbox A](https://ironclad-website-git-staging-ironclad-tournaments.vercel.app/admin/notifications/legacy-assistance?kind=tournament&tournamentId=a5e1146d-883b-4d96-9840-fa9abd6a3120)

Player links require their requester session or an authorized active admin.
The queue and inbox links require an admin. A and B each have two private
conversations; opponents must not see each other's conversation.

The existing synthetic player was signed out through Clerk's normal UI after
player checks, and the previously authorized existing admin email was submitted
to the normal Staging sign-in form. Clerk's Development email-code page is
waiting for a fresh code. No role, credential or dashboard configuration changed;
admin sessions were not manufactured through a backend API. Signing in on a
phone alone does not grant this working browser access. The human may provide
the current code or complete the queue checks directly from those phone links.

At the waiting checkpoint, five modern cases/eight messages exist. All eight
assistance notices are explicitly tagged as this synthetic run, generic, and
have no eligible email/push delivery. Earlier fixture source notices were already
suppressed before commit. No unrelated event, subscription or queue was cleared.
New requests are enabled on Staging; existing conversations remain available
when that switch is turned off. Admin reply/notification/status browser acceptance
remains pending until the admin login completes; local SQL coverage is separate.

### Remaining-acceptance review: player notification link

The independent source review of `e1aa047` found that the player notification
center did not include `assistance.admin_replied` among notifications that open
their related page. The server already projected the exact private conversation
URL, but clicking that notice only marked it read. This was a source finding;
the pending admin login had not yet produced a browser-observed admin reply.

The scoped correction adds that exact event type to the existing navigation
handler, shared by the collapsed dashboard preview and expanded inbox. A missing
private URL now leaves the notice unread, displays the existing localized error,
and does not fall back to a shared tournament page. Server recipient filtering,
UUID-based relative URL projection and private conversation authorization remain
the authority. No schema, configuration, dependency or registration change is
required.

Independent review approved the actual diff. Ten new component regressions cover
both presentations, unread/already-read notices, missing links and a failed read
mutation. The five related notification/navigation suites passed 96 tests.
Full lint, TypeScript and the network-blocked placeholder-credential Next build
passed. Unchanged database/hosted acceptance evidence above is reused; these
local checks do not establish the remaining real admin/requester browser flow.
