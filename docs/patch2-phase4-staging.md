# Patch 2 Phase 4 — player Match Room translation

## Scope and baseline

Prepared in isolated branch `feature/patch2-match-chat-translation-staging`,
based on Phase 3 evidence commit `e4af0fa9d9637259ea5b50ce31d4ec2775b8a4da`.
Refreshed Staging source was `a0d15ad9587524353c718bd8c6e52a124a843157`;
master was `ad3eb5b7aee24878252b52bb483d14adf488764c`.
No Production release or entire-Staging merge is authorized.
Preserved Phase 1/2 candidate: `688759c9b4766327a86ece665dbb9bcd320fbee9`.

## Design

- Existing saved player-chat originals and send/history contracts stay unchanged.
  Translation uses a separate same-origin POST endpoint, not the client Server
  Action queue. Provider delays cannot queue ordinary chat sends or result actions.
- Reading language defaults to website locale; reading-language and automatic
  preferences are independent, versioned and account-scoped in local storage.
  Message text and translations are never saved in browser storage.
- Each original can be translated. New incoming opponent messages can optionally
  translate automatically; existing history, self and admin messages are skipped.
  Output is labelled, rendered as React text and has Show original. The localized
  information control supports hover, keyboard focus, Escape and touch.
- Source is determined from actual saved text using local full-language Franc
  ranking. Short, mixed, unsupported or ambiguous samples abstain and ask for an
  individual source choice. Website locale is never a source-language assertion.
  This conservative detector often abstains on ordinary English, Spanish,
  Portuguese and Russian examples; Italian, Chinese, Korean and French examples
  were detected locally. Automatic mode always detects each new message separately.
- Every request, including cache hits and final delivery after provider work,
  rechecks Clerk, active Player and immutable room membership. Clients submit IDs
  and languages, never authoritative message text or ownership.
- A private PostgreSQL cache is keyed by message, source/target language, model
  revision and source hash. A per-key lease prevents duplicate concurrent provider
  calls. Only a trusted server completion RPC can store provider output.
- Existing body-redaction updates invalidate derivatives. Existing message
  deletion cascades to cache entries; existing retention and assistance holds are
  unchanged. Late completions recheck hash, tombstones, purge and account closure.
  UI derived state clears on scope/session/language change, hidden/offline state,
  denied access or failed validation. Active results revalidate every 15 seconds
  and on focus/reconnect; at most 50 derived results are retained. Already delivered
  text cannot be retroactively erased from a user's memory or screenshots.

## Free-only provider gate

Official Cloudflare documentation checked 3 November 2026:

- [M2M100](https://developers.cloudflare.com/workers-ai/models/m2m100-1.2b/)
  accepts explicit source/target base language codes; no documented auto-detection.
- [Pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/):
  Workers Free has 10,000 neurons per account/day, resetting 00:00 UTC. Free
  operations fail at exhaustion; Workers Paid can charge above that allowance.
  M2M100 lists 31,050 neurons per million input and output tokens.
- [Data use](https://developers.cloudflare.com/workers-ai/platform/data-usage/):
  synchronous stateless processing does not train on Customer Content. Operational,
  legal and security exceptions still apply. No Gateway, batch, provider cache,
  chat-content logging or paid fallback is introduced here.
- [Meta model card](https://huggingface.co/facebook/m2m100_1.2B): en, it, zh, ru,
  es, pt, ko and fr are supported. `zh` and `pt` do not guarantee regional output.
  Local OpenCC normalizes Chinese script to Simplified; it does not guarantee
  vocabulary or translation accuracy. Portuguese can use non-Brazilian wording.

Fresh existing Wrangler authentication can identify the account, but actual
subscription, AI model search and schema reads each returned HTTP 403/error 10000.
It lacks Billing Read and Workers AI access. No inference was attempted.
There is no fresh proof of Workers Free or model entitlement on this account.

**Provider must remain OFF.** An absent/empty/unknown subscription response is
not Free evidence. The code requires explicit fresh account-scope `Workers Free`,
top-level subscription price zero, an active state and no conflicting Workers
subscription before every inference. This positive response shape is tested with
mocks, not established for the real account. Do not weaken it based on an empty
subscriptions list or a Free website/domain plan. No upgrade API is called.

Server-side configuration keys only:

- `PATCH2_CHAT_TRANSLATION_PROVIDER_ENABLED` (default false)
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_AI_API_TOKEN` (server-only sensitive value)

Supply a same-account Billing Read + Workers AI Read/Edit token directly in
Vercel's existing project Environment Variables, Preview/staging branch only;
never chat, logs, Git, local environment copies or Production bindings. Keep
the provider switch false until actual Free-plan/model checks pass. If Workers
Paid is shown, leave this provider disabled; do not change its plan or billing.

The independent database flag is `match_chat_translation_enabled`, initially
`{"enabled":false}`. Both gates are required. Limits are 5 new attempts/minute
and 40/day/player; 100/day and 100,000 UTF-8 input bytes/day globally in this
database, reset by UTC. Failures remain charged; cache hits do not. These caps
are not exact neuron accounting and cannot replace the verified provider Free
hard stop. Other applications may consume the shared account allowance.

## Migration and safe order

Only new migration:
`20261103024129_patch2_match_chat_translation.sql`

SHA-256: `53b067a4fa10ca7280a536264be87430387497755fc31cb98bd99b485ba55c69`.

It adds three private RLS tables, a default-off setting, body-change invalidation
trigger, two authenticated room-scoped RPCs and one service-only completion RPC.
It replaces no existing function, grants no push permission and changes no chat
send, registration, result, deadline, replay, assistance or Storage policy.
DDL has a two-second lock timeout and 60-second statement timeout.

Fresh Staging inspection verified current actor/access/context/privacy/retention
and notification initializer source hashes against the repository; digest support,
message columns, redaction cascade and immutability triggers match dependencies.
No translation tables or migration receipt existed before application.
Staging proof Storage is private. Push claim remains postgres-only with body hash
`5d2f52d80bc91a3ffdd632d702a10eff55aa20d57f602ab2ad3958b34196e115`.
Four existing cron jobs remain active, with no processing delivery/claims. The
branch-specific Staging `TRANSACTIONAL_EMAIL_MODE` was independently read as disabled.

Order: reviewed default-off additive migration → verify grants/old definitions →
fast-forward only staging → existing Vercel Git deployment → actual browser and
authorized Clerk/RLS checks. Apply no unrelated migration. Keep switches off when
Free evidence is missing. Disabling either switch preserves all submitted chat
messages, cached records and ordinary sending. Roll back application code only
to the reviewed Phase 3 build if needed; retain additive schema and previous
tournament guards/durable assistance. Do not drop cache or original messages.

## Validation evidence

- 144 focused unit/mocked integration checks passed, including eight locales,
  all mappings, conservative detection, scheduling literals, source overrides,
  typed outages/quota, privacy/authorization changes, bounded UI state, HTTP
  origin/body checks and independent request dispatch. Provider output is mocked;
  scheduling accuracy is not established by those assertions.
- 18 actual disposable PostgreSQL 17 groups passed with the final migration hash.
  Real competing connections exercised same-key lease races, rate/global caps,
  edit/delete/completion races and unchanged old-client chat send/history/retry.
  Database is hardcoded loopback port 56735, fresh data directory, no env files.
  Minimal local domain/JWT shims are used; full Clerk, triggers, Storage, privacy
  executor, provider and full competition engine are not simulated as real.
- Full lint passed. TypeScript and Next build passed after the independent HTTP
  transport change. A simultaneous typecheck during route-type generation saw
  transient `.next` output; sequential typecheck is the authoritative result.
- Independent read-only source/SQL and UI reviews found no remaining blocking
  defect for a Staging release with provider OFF. They do not approve enablement.
- Existing admin Match Room browser regression: 7 passed. First player browser
  run: 9 passed/8 failed due six viewport setup assumptions and two pre-existing
  retired assistance-button expectations. Test setups now scroll the actual tail
  before read assertions and exercise only supported legacy resolution. No unread
  assertions or product behavior were weakened. Corrected targeted browser run:
  9 passed in 16 seconds; unchanged earlier passing checks were reused. The first
  sandboxed runners needed only their two identified local Vite servers stopped
  to exit; the corrected run used the same credential-stripped, network-blocked
  harness with permission to clean up its own child processes and exited normally.

Dependencies added: exact `franc@6.2.0` and `opencc-js@1.4.2`; no AI SDK,
translation service, worker, queue, new database or paid fallback was provisioned.

## Fixture safety and remaining release gates

`tests/patch2-db/hosted-chat-translation-fixtures.sql` is a root-reviewed fixture,
not a migration. Committed source has NULL attestations and fails closed. It
uses existing approved Development TestAcademy1–8, creates one tagged tournament
through canonical synthetic enrolment/approval/launch and one Test1/Test2 room.
It preserves hashes of every old application row and Storage object. Initial
owned notifications are tagged and suppressed before commit. Whole-file rollback
rehearsal is required before execution. Four real seven-day synthetic timers
are created, so cancel only this new tournament canonically after live chat tests,
retain its original chat for review and suppress its later owned notification
events before any future restoration. Do not clear queues or subscriptions.

Outstanding Production release requirements remain:

1. Fresh actual replay upload, persistence, authorized download and denied access
   through a permitted browser method. The blocked extension upload is not retried.
2. A second distinct authorized admin login proving shared team-inbox state.
3. Physical-phone testing and the user's manual Staging review.
4. Real Free-plan/model/account verification followed by all eight live targets,
   representative non-English pairs, scheduling/negation/scores/usernames/links,
   cache behavior, actual provider errors and quota exhaustion. No live provider
   quality, exhausted-allowance behavior or paid safety is claimed while OFF.

Production requires explicit user approval after all applicable release gates.
Prepare an isolated local release branch by cherry-picking only reviewed Patch 2
commits and resolving baseline differences; never merge all of Staging.
