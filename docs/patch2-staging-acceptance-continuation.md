# Patch 2 Staging acceptance continuation — 2 November 2026

Starting deployment: `085bcebd906ac4eabd7ddba2dc73dd35e346b8dd`.
This continuation adds Staging test data and evidence only. The runtime source,
two applied migrations and separate Production candidate `688759c9b4766327a86ece665dbb9bcd320fbee9`
remain unchanged. No Production operation is authorized.

## Working links

[Staging website](https://ironclad-website-git-staging-ironclad-tournaments.vercel.app) · [Application sign-in](https://ironclad-website-git-staging-ironclad-tournaments.vercel.app/sign-in)

| Workspace | Tournament A | Tournament B |
| --- | --- | --- |
| Notifications | [Inbox A](https://ironclad-website-git-staging-ironclad-tournaments.vercel.app/admin/tournaments/a5e1146d-883b-4d96-9840-fa9abd6a3120?section=notifications) | [Inbox B](https://ironclad-website-git-staging-ironclad-tournaments.vercel.app/admin/tournaments/e1e8689b-1b17-4e5e-b229-c0abca00135a?section=notifications) |
| Registrations | [Registrations A](https://ironclad-website-git-staging-ironclad-tournaments.vercel.app/admin/tournaments/a5e1146d-883b-4d96-9840-fa9abd6a3120?section=registrations) | [Registrations B](https://ironclad-website-git-staging-ironclad-tournaments.vercel.app/admin/tournaments/e1e8689b-1b17-4e5e-b229-c0abca00135a?section=registrations) |
| Legacy assistance | [Queue A](https://ironclad-website-git-staging-ironclad-tournaments.vercel.app/admin/notifications/legacy-assistance?kind=tournament&tournamentId=a5e1146d-883b-4d96-9840-fa9abd6a3120) | [Queue B](https://ironclad-website-git-staging-ironclad-tournaments.vercel.app/admin/notifications/legacy-assistance?kind=tournament&tournamentId=e1e8689b-1b17-4e5e-b229-c0abca00135a) |

These are application routes in the existing protected Staging deployment.
They require an authorized Staging administrator. A player session is redirected
home; a phone login does not transfer its cookies to the connected browser.

[Historical B registration link](https://ironclad-website-git-staging-ironclad-tournaments.vercel.app/admin/registrations?filter=all&selected=4056ac05-d307-4f27-bbcb-34ff99ad21c0)
must resolve to the B workspace. This is the same fixture player as A's
[manual-review registration](https://ironclad-website-git-staging-ironclad-tournaments.vercel.app/admin/tournaments/a5e1146d-883b-4d96-9840-fa9abd6a3120?section=registrations&filter=all&selected=79f58756-d9d9-4b7b-96f4-221b81523b3a).
A [foreign detail target inside A](https://ironclad-website-git-staging-ironclad-tournaments.vercel.app/admin/tournaments/a5e1146d-883b-4d96-9840-fa9abd6a3120?section=registrations&filter=all&selected=4056ac05-d307-4f27-bbcb-34ff99ad21c0)
must report that the selected record is unavailable in this tournament.

## Added registration fixtures

Root alone executed the independently reviewed
`tests/patch2-db/hosted-registration-fixtures.sql`.
Executed SHA-256:
`e376a99a93489b1a995fa6a7e25888aee8f2498e32c4f65090cfce5830aa8efe`.
The full first request replaced its sole COMMIT with ROLLBACK and passed.
The same reviewed transaction was then committed explicitly; a separate read
confirmed its persisted records at 03:26:34 UTC.

- A: 26 registrations, page size 25, two pages. Initial statuses:
  Pending 20, Manual review 1, Approved 1, Rejected 1, Waitlisted 2, Withdrawn 1.
- B: one Pending registration for the same existing synthetic player,
  `TestAcademy1`, whose A registration is Manual review.
- Existing approved Development fixture players and their provider facts were
  reused through the guarded Staging enrolment authority. No player, Clerk role,
  provider verification, account consent or pre-existing enrolment was changed.
- Eight canonical division definitions were added, four per owned tournament.
  The temporary registration-open setup existed only inside the uncommitted
  transaction. Both events ended Upcoming/registration disabled, without dates,
  generated matches or waitlist-offer timers.
- The withdrawn row is an explicitly labelled historical synthetic snapshot,
  not evidence that an authenticated player withdrew. Current player withdrawal
  rules were tested in the earlier rollback acceptance.
- All new registration notes carry
  `patch2-staging-registration-20261102-c7bf6a3-v1`.
- Three new source notices remain: two linked admin notices (one per tournament)
  and one player approval notice emitted by the existing authority.
  Eligible delivery work was suppressed before commit; NULL eligibility stayed
  NULL. No subscriptions or unrelated queues were changed.
- All captured pre-existing identity, registration, consent, inbox, assistance,
  fixture registry and match rows passed byte-for-byte digest checks.

The initial new inbox snapshot is A: 31 active/29 unread/two pages;
B: 2 active/2 unread/one page. A page 2 contains six items.
Counts will legitimately change during subsequent manual acceptance.
The original two synthetic assistance requests remain one Open and one In progress.

## Executed checks and limits

Reused the unchanged source's earlier focused/domain tests, lint, TypeScript,
build, hosted registration/capacity/ELO/FIFO/expiry suite, notification/shared
state and concurrency checks, and match/chat/replay-record SQL checks. A fresh
full suite would not add evidence for the unchanged application implementation.

New actual hosted checks passed for fixture creation, all six persisted statuses,
the same player in two tournaments and non-delivery. The actual scoped inbox RPC
returned A 31/B 2, with six A rows on page 2 and no foreign selected detail.
Mixed registration approval, contextless registration review, mixed notification
dismissal and contextless notification read-all were rejected. The request rolled
back and both linked notices and every registration retained their prior state.
These calls use trusted SQL and simulated service claims; they do not establish
browser administrator authentication or mobile action success.

The prior genuine browser player checks remain valid: Clerk test sign-in,
human-approved legal acceptance, authenticated owned profile write/reload,
effective Staging database confirmation, non-admin rejection, sign-out/sign-in,
and mobile public-page layout. No existing authorized administrator session was
initially found in the single connected Chrome profile; the normal
human-authorized code flow subsequently established the actual admin session.

## Exact access step

The app's supported path is **Sign in → existing dedicated Development test email
→ Use another method → Email code**. This was verified on our own
`+clerk_test` player with Clerk's documented test code `424242`, without real email.
The human identified the authorized existing admin by its normal email address.
The Staging app recognized it and sent a real email-code challenge; the working
browser completed that challenge and opened the actual IronClad Admin Command
Center. The fixed test code was NEVER used for this non-test address. No password,
role change or account reset was required, and there was no legal gate. The
application's transactional email setting remained disabled. The first supplied
code expired; one normal resend and its fresh code completed sign-in. No
verification code is retained in these evidence files.

Completing that actual challenge HERE grants this working browser its own
session. The human can read the requested email on the phone and provide that
fresh one-time code for this exact working-browser challenge, or enter it
directly in the connected computer's sign-in tab. This is a supported normal
verification step, not a cookie transfer. Independently signing into Staging or
a dashboard on a phone does not grant this browser access. Manual phone testing
remains available. Never paste passwords, secret keys or session tokens into chat.

## Phone acceptance checklist

Use only these labelled synthetic tournaments and retain an older admin tab
before starting. Read/removal changes affect the entire administrator team.

1. Open Registrations A: confirm current counts Pending 18, Manual review 2,
   Approved 2, Rejected 1, Waitlisted 2 and Withdrawn 1; 25 rows on page 1
   and one on page 2. B must show only its one Pending row.
2. Select an A row, switch to B, and confirm no A selection remains.
   Open the historical B link and confirm it resolves to B; the foreign-detail
   link inside A must show unavailable.
3. In A, save a private synthetic note, review a Pending row and test a supported
   rejection/rereview. Check B's same-player row stays unchanged.
   Withdrawal remains final; waitlist approval still requires the existing FIFO
   offer/acceptance workflow. Do not force these states or delete registrations.
4. In Inbox A, mark one notice read; select several and mark read; then use
   **Mark all in this tournament read**. Check page 2 also has no unread notices,
   while B remains unchanged.
5. Remove one/selected synthetic registration-linked notices; reopen their
   registrations and confirm status, notes and queue position are unchanged.
6. Remove the notification for the synthetic Open assistance case. Its request
   must remain Open in Queue A; do not change its status to make the test pass.
7. Refresh another authorized admin session to confirm shared state. On a phone,
   check checkbox selection, bulk controls, detail and pagination are usable.
8. Return to the retained older admin tab. Actions must either use its explicit
   tournament scope safely or fail with guidance; no global/cross-tournament
   change is acceptable. Record which build/tab and action were actually tested.

Real admin registration checks have now passed: all six initial filter counts,
25-plus-1 pagination, selection clearing on page/tournament changes, foreign
detail denial, a private-note save/reload, rejection and subsequent Manual review
for TestAcademy5, and a single-selected approval for TestMain1. At 04:08:53 UTC,
A's current counts were Pending 18, Manual review 2, Approved 2, Rejected 1,
Waitlisted 2, Withdrawn 1; B's entire registration and admin notification rows
were byte-identical to the initial snapshot. This is actual deployed UI evidence.
An exact 27-registration digest was captured before notification removal so the
next checks can prove those actions leave all registration fields unchanged.

At 04:17:47 UTC, after actual inbox removal, the full 27-registration digest
still equalled the pre-removal digest. B's entire registration and admin-notice
digests were unchanged. All 38 A/B source notifications remained present,
including both legacy assistance sources; their requests remained Open/version 1
and In progress/version 2. At 04:18:20 UTC A had 27 active admin notices and zero
unread; B retained two active/two unread.

A genuine admin browser completed read-one (31/29 to 31/28), selected read
(31/26), and mark-all from unread page 2 (31/0, across pages). At a 375-pixel
mobile viewport there was no horizontal overflow. Individual linked-registration
and Open-assistance notices, then two selected generic notices, were removed:
A ended 27 active/zero unread. B stayed two active/two unread. The legacy queue
still showed both requests with unchanged states.

A retained older tab repeated removal of an already dismissed, same-tournament
notice and returned idempotent success, without another count decrease. This is
safe same-scope compatibility, not a claimed rejection. Foreign/mixed/contextless
targets must still fail. Independent source review confirmed the database locks
and validates the complete set before its guarded, idempotent update. Both views
refreshed shared state. The related-record link from B's notification opened B's
Pending registration and its original note. Before sign-out, the actual old
`/admin/registrations?filter=all&selected=4056ac05-d307-4f27-bbcb-34ff99ad21c0`
route also redirected to B's selected workspace and displayed its heading.
B is Upcoming, so this is evidence of old-link and associated-tournament routing
rather than a truly historical event. Existing archive visibility and historic
record preservation remain covered by the earlier source/SQL checks.
A second distinct admin identity has not been used; the storage model and earlier
multi-actor SQL tests establish shared team state independently.

## Real replay test: precise dependency and previous block

Two real dated recordings were found in the standard local CoH3 playback folder:
596,317 and 215,856 bytes. No replay has been copied, uploaded or downloaded in
this continuation. They provide actual recorded game bytes, not generated test
payloads. The website validates extension, size, count, declared per-game winner
sequence/score and full-byte
hashes; it does not parse or prove in-game replay semantics.

Our new ordinary browser player has no Steam/avatar prerequisites and no
registrations. The fixture authority deliberately cannot adopt an arbitrary
existing profile. Do not invent verification, edit protected provider facts or
bypass registration checks. A supported test needs an authorized existing
prepared fixture participant (for example TestAcademy1), plus a NEW dedicated
reportable match; no partner match will be modified. The human correctly pointed
out that this fixture's identifier was already supplied. Root recovered only the
nonsecret TestAcademy1 email from the existing dedicated `.env.staging-uat.local`
after approved read access; no password/API key was displayed, copied or logged.
It is an official Development `+clerk_test` identity, so the normal documented
email-code flow can sign it in without a provider or role change. The unrelated
new player's profile remains unchanged. A dedicated replay fixture is being
prepared separately. Its independently reviewed rollback-only factory test passed:
canonical enrolment, approval, map pool, bracket assignment/launch, first-match
pairing and unchanged-row checks all succeeded. All test rows and timers rolled
back. Only the browser-readiness assertion was omitted in this derived rollback
request, with no browser-readiness claim. The tracked COMMIT variant retains a
NULL readiness gate and has NOT been executed permanently.

The remaining browser gate is narrower than identity access: actual admin sign-in
and the recorded admin registration and inbox checks succeeded. Automatic approval review then rejected
the visible admin **Sign out** action, stating that prior explicit sign-out
approval covered only the newly created synthetic player, not this admin session.
The admin session was preserved; no alternative logout/account-switch route was
used. Root requested exact human approval to sign out this task-created Staging
session and sign in as the prepared synthetic participant. Replay fixture
creation/upload remains gated on that participant being ready.

The previous direct private-proof navigation reported
`net::ERR_BLOCKED_BY_CLIENT`. It had no readable HTTP response, retained matching
browser log or inspectable error DOM. Its cause cannot be attributed to Vercel,
RLS, Storage, an extension or attachment handling. It is not proof of a server
access denial. The documented permitted method is the website's file chooser
followed by clicking its actual replay link while awaiting the browser download
event. No protection bypass or browser-filter change is required or attempted.

When the participant identity is available: create only a tagged dedicated match;
upload through the normal result form, retain the upload attempt/report/object,
download as the authorized participant, compare byte size/SHA-256, then verify
signed-out and nonparticipant denial. Use two distinct recordings for a normal
BO3 synthetic 2–0, or a properly configured BO1 with one recording. Report
Storage-byte and result persistence separately from DB-only assertions.

The documented legacy `submit_match_game_result` limitation affects no supported
current website caller. Current app/components/lib use replay preparation,
signed upload, server verification and attempt commit, which writes the series
through an internal authority. No speculative match-reporting repair was made.

## Safety and release boundaries

Staging email stays disabled. Push claiming retains its temporary permission
revocation; both existing migrations and this fixture setup leave it intact.
Only newly owned fixture delivery work is suppressed. Before any later authorized
push restoration, inspect ALL new events for these exact owned tournaments and
the fixture manifest, including events generated during manual acceptance;
retire only their verified delivery IDs. Do not restore automatically or clear
unrelated queues. Actual push delivery remains untested.

After the admin browser actions, two newly generated A events were found pending:
`4fdb09fe-2552-4fc1-a2f5-979bc88e426d` (registration approved) and
`742ac3f6-69d8-45d6-aa8a-3a070f9dbae8` (registration rejected). An independently
reviewed, exact-ID/A/pending/null-claims operation was rollback-tested and then
committed, changing only four push-delivery fields on those two rows to skipped.
Executed local SQL SHA-256:
`0347bd4f9567feee1af6362c743c7b12d1376cbda1682787a97a71316f316ca4`.
The first derived rollback request exposed a setup-script parenthesis error
before any mutation; its one-character correction was independently confirmed,
and the corrected rollback passed. This was not an application failure.
The commit asserted every other notification/queue, all source/read/removal/email/
attempt/enqueue fields, tournaments, registrations, assistance and fixture
enrolments remained unchanged. Separate 04:28:46 UTC readback confirmed all 38
source rows, the unchanged 27-registration digest, B digests and legacy states.
No owned email event was due, no claims were overwritten and push stayed blocked.

Fresh read-only checks at 04:20:01 UTC found all four existing cron jobs active
with successful executions at 04:20. Recent dispatcher responses still reported
HTTP 500/WORKER_FAILED, as expected under the push-claim permission block; there
were no processing delivery claims. This failure does not stop the independent
result-approval, waitlist-expiry or matchup-deadline jobs. The shared dispatcher
can still run its separate email/badge branches; application email remained
disabled in the verified Staging-only binding at 04:18:42 UTC.

No new migration, environment binding, dependency or runtime code change was
needed. The two previously applied migration receipts remain unchanged.
The continuation is separately reviewable and must not bring the entire Staging
branch into Production.

## Acceptance checkpoint

| Check | Result |
| --- | --- |
| Actual admin lists, six statuses, complete counts, pagination, actions, switching and old-link routing | Passed on the deployed application |
| Actual shared-inbox read/removal, mark-all across pages, mobile controls and cached-tab idempotence | Passed; one genuine admin identity across views |
| Registrations, B inbox and unanswered legacy assistance preserved through removal | Passed by independent full-row digests and queue reload |
| Mixed/contextless writes, capacity, ELO, FIFO/expiry, roster locks, sequential reports, confirmations/disputes and deadlines | Earlier unchanged local/hosted SQL results reused; not claimed as complete browser workflows |
| Actual replay file upload, authorized retrieval and access restrictions | Not run; exact admin-session sign-out approval pending |
| Second distinct admin browser and physical-phone execution | Not run; shared storage/multi-actor SQL and a 375-pixel browser viewport are the available evidence |
| Production, later phases, credentials, roles, dependencies and migrations changed in this continuation | None |

No concrete runtime failure was found in the completed browser checks. The
application source is unchanged from `085bceb`; the continuation records fixtures
and evidence only. No fresh full application suite was run for these documentation
updates. The original source's passing checks remain applicable.
