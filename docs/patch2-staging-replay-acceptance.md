# Patch 2 Staging replay acceptance — 3 November 2026 (Sydney)

This continues the `e35a18f` acceptance checkpoint. The human explicitly approved
signing out this task's Staging admin browser session and signing in as the
prepared TestAcademy1 participant. Production remains prohibited and unchanged.

## Fresh isolation and browser readiness

At 18:23:42 UTC on 2 November, the existing Staging alias still served `e35a18f`.
Remote Staging matched that commit. Supabase `zzbnneprhjicmajpjkdg` retained its
167 migration receipts, including the same two Patch 2 receipts; none was applied
again. The exact Staging dispatcher fingerprint, postgres-only push claim ACL,
unchanged claim/review bodies, all four active cron jobs, zero processing claims,
private `match-proofs` bucket and zero old A/B deliverable pushes were verified.
The existing Preview/staging application-email binding remained disabled.

The approved admin sign-out and normal Development test-email-code sign-in
succeeded. TestAcademy1's real browser dashboard showed Profile Complete, no
admin navigation and the expected A/B registrations. No legal gate appeared and
no new consent was accepted. No role, password, provider fact or credential changed.

## Dedicated retained fixture

Only the two operator-attestation timestamps changed in the already reviewed
`tests/patch2-db/hosted-replay-fixtures.sql`: browser readiness 18:24:56 UTC and
email-disabled verification 18:23:45 UTC. Executed source SHA-256:
`9f166ea5a444ba3f79393328c240d124e84cb1d31b3466cbaeedf52c55ee81ef`.
The whole actual-ready request first passed with its sole COMMIT replaced by
ROLLBACK, retaining the genuine readiness assertion. The same request was then
committed explicitly. All captured pre-existing public/private application rows
passed their unchanged-row checks.

- Run: `patch2-staging-replay-20261102-v1`.
- Tournament: `b75f6539-2271-417a-8338-51694a698e20`.
- Academy bracket: `a74120bc-7da0-4281-a93c-f6d7a0ae2d3f`.
- Match: `08c25bd8-437b-41fc-9ca1-6e8878036698`, TestAcademy1 versus TestAcademy2.
- Eight existing synthetic participants were enrolled through the guarded fixture
  authority and approved through scoped review; provider facts remained false.
- Normal map-pool publication, bracket assignment and launch created four BO3
  seven-day deadlines. The confirmation window is the supported 1,440 minutes.
- Sixteen initial source notices were retained, labelled and made nondeliverable
  before commit. Future browser events require their own scoped delivery retirement.
- No replay object, report, result, chat message or legal acceptance was fabricated.

[Dedicated Staging match](https://ironclad-website-git-staging-ironclad-tournaments.vercel.app/tournaments?tournament=b75f6539-2271-417a-8338-51694a698e20&tab=brackets&match=08c25bd8-437b-41fc-9ca1-6e8878036698).

## Browser transport and access results

The participant opened the actual result form, selected Won/2–0 and retained a
labelled synthetic note. An original 119-byte match-chat message was sent and
rendered without clearing that result draft. Independent Staging readback
confirmed message sequence 1, ID `99791bf9-da7a-465e-9977-d6468cbc9741`, body digest
`b2483f674341eacfb0318880c883c635` and the owned participant registration.
An actual fresh page load in a second tab displayed exactly that message; no
second send occurred. The original tab still retained its 2–0 selection, tagged
note and empty file inputs afterward.

The documented file chooser reached the real Game 1 input. Its `setFiles` action
stopped at an extension capability check: **Allow access to file URLs** is disabled.
Both file inputs remain empty, Submit Result is disabled, and Staging readback at
18:29:36 UTC confirmed zero upload attempts, reports and referenced Storage objects.
This occurred before application upload validation; it is not a website rejection.
The authenticated participant and unsent draft remain intact. No filesystem/API
upload fallback or extension-setting change was attempted.

The exact required user step is on the **working PC's connected Chrome profile**:
open `chrome://extensions`, choose **Details** for the ChatGPT extension and enable
**Allow access to file URLs**, then resume this Chrome task. Changing a phone's
Chrome settings does not enable the extension on this PC. This is the
[official OpenAI file-upload setup](https://learn.chatgpt.com/docs/chrome-extension#upload-files).

Actual replay upload, downloaded-byte comparison and access-restriction checks
remain unverified until that capability is enabled. Two real CoH3
recordings are available: 596,317 bytes / SHA-256
`17de3b07c6bf304a5611fd11bcfed0245f54178bde4e2cd4eff1d259378c9e8c`, and
215,856 bytes / SHA-256
`53aea8ec775f492e1526ce0ee3a449b7e475da599e7ff25d1509e33f0a3f26ae`.
The website validates declared per-game winners/score and byte hashes; it does
not parse the recordings to prove game chronology or the synthetic match score.

No earlier database-only replay check is counted as a completed byte transfer.
The older `ERR_BLOCKED_BY_CLIENT` navigation lacked a readable response and is
not evidence of a server authorization denial. This run reached the documented
file chooser; after upload succeeds, the supported next method is the actual
replay-link download event, without changing protection.

The human confirmed they are on a phone and cannot reach the working PC. At their
request, the browser owner checked the documented alternative: inventory exposes
only one Chrome browser of type `extension`; creating a built-in-browser tab on
the ordinary Staging URL returned **Browser is not available: iab**. No tab was
created and no protected-access workaround was attempted. Native computer APIs
are disabled, and the available browser API exposes only the blocked chooser's
`setFiles` path. No available supported alternative can complete the actual
upload/download without the working-PC extension setting. There was no Chrome
chooser retry, cookie/token transfer, outside Playwright runner, direct API/
filesystem upload or permission change. Replay acceptance remains **BLOCKED**.

## Preservation and release boundaries

The chat created one new pending push event, ID
`4df23fb9-0ea5-4ba4-a9c4-7c0dac4d9c28`, type `match.message_received`. Root
independently reviewed the exact-ID/tournament/match/recipient/type operation,
ran its complete rollback check, then committed the same request. Only four
push-delivery fields changed on that row. All 17 source notices, eight
registrations, the original chat, assistance, upload/result/Storage state,
read/removal/email/attempt/enqueue evidence and unrelated queues were preserved.
Executed SQL SHA-256:
`6054d7a6827ae86d725d2df8ca54c97828d6a0d76f9f0619cb308ee658bcea09`.
Push claiming remained blocked.

Root independently reviewed a separate **no-report** cancellation request, first
ran the whole request with ROLLBACK, then committed the same request. The existing
canonical `cancel_tournament` authority changed only this exact new fixture's
terminal metadata to Cancelled. Its actor was explicitly labelled
`patch2-synthetic-sql-operator`; no human Clerk action was invented.
Executed SQL SHA-256:
`fa9f7300e27ae710d23c1bdd8ffb64dfc313f7e7b8911002937cf317470a72cf`.
The locked guards required zero attempts, reports, submissions, official results
and leaderboard history, eight canonical registrations, 17 nondeliverable notices
and the one original chat. Complete comparison checks preserved all registrations,
rooms/messages, assistance, match rows and deadline values, Storage, notifications,
unrelated tournaments and queues. No Void, delete, reset, result decision or push
permission restoration occurred. There was no replay object to retain or download.

Separate Staging readback at 18:39:22 UTC confirmed Cancelled, one unpurged chat
message, zero attempts/reports/submissions, 17 source notices and zero deliverable
push/email events. All four historical match deadlines remain recorded; existing
terminal guards stop their competitive/notification effects.

An actual second-page load showed **Cancelled Tournament**, **Read-only historical
record** and **Tournament Match History**. Result and dice controls were absent.
The read-only room still displayed the exact original message. No assistance
action was invoked. The original tab still retained its unsent 2–0 draft and
empty file inputs; it was not refreshed or submitted. That stale draft cannot be
used to submit into this cancelled fixture. A later authorized replay run must
create a fresh dedicated fixture, not reopen/reset this historical tournament.

Keep email disabled and the temporary push claim permission block in place.
The existing A/B fixtures remain available for admin acceptance, untouched by this
cleanup. Actual push delivery remains untested while delivery is blocked.

No runtime implementation, migration, dependency, environment binding or
Production candidate change is required by the checks completed so far.

Final read-only checks at 18:42:10 UTC confirmed the fixture Cancelled, all eight
registrations/17 source notices retained, zero deliverable events across A/B and
this fixture, private replay Storage, all four cron jobs active and push claim
ACL still `{postgres=X/postgres}`. Staging application email remained disabled.
The two existing Patch 2 migration receipts remained `20261102015821` and
`20261102015841`; the 167-entry ledger was unchanged. The separate Production
candidate remained `688759c9b4766327a86ece665dbb9bcd320fbee9`.

## Result

| Check | Result |
| --- | --- |
| Explicitly approved admin sign-out and normal TestAcademy1 sign-in | Passed; no new legal gate |
| Dedicated canonical Staging fixture and original chat persistence | Passed, including actual fresh browser loads |
| Private Storage, email off, push blocked and exact owned delivery suppression | Passed; no real push delivery tested |
| Historical read-only view and preserved messages after canonical cancellation | Passed in the actual browser and independent database checks |
| Actual replay upload, downloaded-byte comparison, authorized download and negative access tests | BLOCKED / not completed; zero replay bytes uploaded |
| Supported alternative | Unavailable: only Chrome extension connected, IAB unavailable |

Only fixture timestamps and evidence documents changed locally. The already
passing unchanged runtime checks were reused; no new full lint/TypeScript/test
suite was run for those non-runtime edits. Whole hosted SQL rollback checks and
post-commit preservation checks were run for each data operation. No new
migration was prepared or applied, and no credential/environment/dependency or
Production change was made.
