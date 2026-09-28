# P03.1 Realtime Match Room — Staging implementation

Starting Staging: `4900d00c81a2c3f1ea0c126444f44499f3726aa4`.
Read-only Production comparison: `0114b1c9f4908c0f8a0e43cfa7a25fb96d361fd1`.
Feature branch: `codex/p03-1-realtime-match-room`; PR base: `staging`.

## Foundation reconciliation

The core P03 component, actions, room authority and private unread summary were
already identical to final Production. Staging lacked the final OFF gate for
admin assistance resolution and retention/privacy SQL. A new additive foundation
migration carries those definitions forward, preserving the enabled setting and
existing data. The Production bootstrap is deliberately excluded: it expects a
pre-P03 database and would disable the already-installed Staging feature.

All four historical Staging P03 migrations remain untouched and are not replayed
on the hosted project. Localized kill-switch copy now matches the final gate.
Account-closure reload documentation/lint annotation is carried forward. P01
Showcase, P02 Highlights, P04 News and their migrations/dependencies stay intact.
This task does not publish legal documents or perform retention maintenance.

## Transport and authority

Database triggers enqueue private Supabase Broadcast invalidations in the same
transaction as legitimate messages, assistance changes and lifecycle transitions.
Topic: `match-room:<immutable-room-UUID>:<communication-generation>`.
Event: `invalidate`. Application payload: `roomId`, `communicationGeneration`;
Supabase may append a transport `id`. There is no body, sender/recipient identity,
Clerk ID, read receipt, presence or profile information in the event.

Receive-only RLS checks Clerk identity, active account, exact current immutable
pair/generation, live Match lifecycle and the existing feature switch. Admins use
the existing trusted Clerk metadata role. Client Broadcast writes are denied.
No private Match Room table grants or publications are added. The existing
authenticated room RPCs remain the only source of message content and authority.

An event coalesces into the existing refresh queue after 80ms. Signals received
during an in-flight read cause a queued follow-up; messages merge by ID/sequence.
Successful subscription/rejoin immediately refreshes authoritative state.
Healthy transport uses 60-second safety polling; unavailable transport uses the
existing 10-second fallback. Hidden/offline tabs stop transport and polling;
visibility, focus and network recovery resynchronize. Clerk tokens refresh every
25 seconds. Cleanup removes timers/listeners/channels and explicitly disconnects
the dedicated client, with stale asynchronous callbacks gated by attempt identity.

Only server-authorized writable rooms subscribe. Completed/closed rooms remain
read-only with existing polling. TBD, BYE and empty future Matches have no room
subscription. Disabled rooms unsubscribe after the switch invalidation/next safe
read. Reassignment invalidates only the old topic; a new generation can never
publish to the previous opponent's stream. Auth/session changes remount the room
and discard the previous draft/transcript.

Realtime arrival itself never acknowledges messages. Existing viewport/tail,
focus, visibility and history rules decide genuine reads. Scrolling through
older history remains stable. Bracket attention and assistance controls retain
their existing private polling; sender/recipient attention is unchanged.

Supabase caches channel authorization until a new JWT or expiry. Account closure
immediately denies authoritative RPC access and new subscriptions; an existing
socket can receive content-free invalidation timing until reauthorization. No
message content is transported through this cache. Generation separation is
independent of that cache. Polling remains necessary if an invalidation is lost,
the provider is unavailable, or a trigger cannot enqueue an event.

## Staging configuration and verification

Hosted database target is pinned to `zzbnneprhjicmajpjkdg` (`ironclad-staging`).
No paid service, plan change, Production configuration, or Production data change.
Preview build configuration rejects Production Supabase references and live Clerk
keys for this feature branch and canonical Staging. Vercel secrets remain
sensitive/redacted; no credentials are copied to tracked files. The feature
Preview uses the same two non-secret legal-origin keys as Staging.

See [validation evidence](p03-1-validation.md) for executed checks. The small hosted
smoke uses an existing fully verified synthetic pair, creates only a temporary
Clerk test session, checks authorized/unauthorized subscriptions and a content-free
signal followed by authoritative RPC refresh, and revokes that session. It creates
no messages, users, tournaments or read acknowledgments. Final conversation speed,
mobile feel and back-and-forth UX are reserved for the user.

Reference contracts: [Supabase Broadcast](https://supabase.com/docs/guides/realtime/broadcast),
[Realtime authorization](https://supabase.com/docs/guides/realtime/authorization),
[Clerk test session tokens](https://clerk.com/docs/guides/development/testing/overview).
