# Match Result Replay Storage

## Current played-match proof contract

- Bucket: `match-proofs`
- Visibility: private
- Per-replay limit: 10 MiB (`10 * 1024 * 1024` bytes)
- Accepted played-match proof: `.rec`, case-insensitive
- Required count: one replay for every game actually played
- Authoritative count: player-one score plus player-two score
- Authoritative content hash: SHA-256 derived by trusted server code from the
  stored object bytes

No screenshot is required for a normal played-match result. No-show reporting
is a separate workflow and does not require a replay.

The database retains legacy screenshot columns and the protected retrieval
route retains screenshot compatibility for historical records. That
compatibility does not make screenshots current result proof and must not be
used to bypass the replay requirement.

## Direct-upload transport

Normal replay file bodies travel directly from the player's browser to the
private Supabase bucket:

```text
player browser -> private Supabase Storage
```

The Next.js/Vercel result-submission request does not receive replay `File`
bodies. Preparation receives only score and file metadata. Finalization and
cleanup receive the opaque server-issued attempt ID, never replay bytes or a
caller-selected Storage path list.

Before upload, an authenticated IronClad server operation reloads the match,
authorizes the player as an assigned participant, verifies that competition is
launched and non-terminal, validates the score and winner, and requires exact
`.rec` file metadata for the score-derived replay count. The server selects
every object path and creates one native Supabase signed upload capability per
path with overwrite disabled.

Paths are opaque and use this bounded shape:

```text
{match_uuid}/{attempt_uuid}/game-{game_number}-{object_uuid}.rec
```

One submission attempt owns one database-generated attempt UUID and a fixed
five-path namespace; a BO1/BO3/BO5 result uses only its required leading paths.
Game numbers are contiguous from one, and each object receives a distinct
random UUID. Paths do
not contain Clerk IDs, email addresses, Steam IDs, Discord identities, display
names, or original filenames.

The signed capability permits upload only to its server-selected path for the
provider-defined lifetime. It is not stored, logged, placed in notifications or
analytics, or persisted in browser storage. It cannot finalize a result,
authorize a player, read another object, or change another match. Ordinary
anonymous and authenticated browser sessions have no general write policy for
`match-proofs`; direct upload works only through the native path-specific
capability.

## Private attempt ownership and bounds

`public.match_replay_upload_attempts` is a private, service-mediated table
specific to this workflow. One active attempt is allowed per participant and
match. It binds the server-generated namespace, submitting registration,
declared replay sizes, score, winner and required replay count. RLS is forced;
`anon` and `authenticated` have no table or RPC access, and direct DML is not
granted to `service_role`.

Preparation is serialized on the match. Only one attempt may be actively
prepared, finalized, cleaned or recycled for one participant/match. A second
prepare inside 60 seconds is refused; after that boundary it may safely claim
and clean an abandoned preparation before continuing. At most three
non-committed namespaces may exist for that participant/match. This gives a
normal failed upload two immediate fresh-path retries without allowing
unbounded signed-capability or object-path creation.

A path batch is never signed twice. A cleaned namespace remains inside the
three-slot budget until the native two-hour capability lifetime plus a
five-minute issuance/clock buffer has passed. Reuse then requires an exclusive
recycling claim, a final server-side deletion of all five old paths, and fresh
random object UUIDs before any new capability is issued. A failed sweep stays
non-finalizable and can be retried after its five-minute lease; it never opens a
new namespace.

Finalization atomically claims an attempt for a ten-minute lease before any
Storage download or hashing. Only one caller receives the private claim token,
so parallel losing requests do not repeat the expensive stored-byte work.
Cleanup has a separate five-minute claim and cannot claim an actively
finalizing or committed attempt. Claim tokens remain trusted-server-only.

## Trusted stored-object verification

After direct upload, the finalization server independently:

1. re-authenticates the Clerk user;
2. reloads and re-authorizes the current match and participant ownership;
3. revalidates launched, non-terminal, score, winner and replay-count state;
4. loads the database-owned paths and validates their exact match namespace,
   attempt root, contiguous game order and opaque `.rec` structure;
5. opens each private Storage object one at a time;
6. streams the stored bytes, measuring their actual size and computing SHA-256;
7. rejects a missing, empty or larger-than-10-MiB object;
8. rejects duplicate stored replay payloads by authoritative hash; and
9. calls the attempt commit RPC with trusted hashes; that wrapper reuses the
   existing `submit_match_series_result_report` implementation with the
   database-owned ordered paths.

A client-computed hash, if ever used for early duplicate-selection feedback,
is not authoritative. The existing database replay-count, unique-path,
SHA-256, duplicate-payload and finalization guards remain authoritative.

## Database and commit boundary

`public.match_result_submissions` stores the private replay path and trusted
content hash for each played game, including:

- `game_number`
- `replay_storage_path`
- `replay_content_hash`
- `status`
- `review_notes`
- `reviewed_by`
- `reviewed_at`

`public.match_result_report_groups` retains the series report, opponent
confirmation/dispute state and the historical first-replay compatibility
reference. `public.tournament_matches` retains its official-result audit link.
The database stores private object paths, never permanent public URLs.

Finalization and cleanup take mutually exclusive atomic database claims before
hashing or deleting. Cleanup re-authenticates, requires the participant who
prepared the attempt, receives paths only from the private attempt row, and
retains a result-reference check as defense in depth. Once cleanup owns the
attempt, finalization cannot commit. Once finalization owns the attempt,
ordinary cleanup cannot delete it.

The attempt commit wrapper and existing result-report RPC run in one database
transaction. Success both creates the normal result history and marks the
attempt committed. Committed proof can never transition to cleanup. A lost
response is reconciled from the stored committed result; later notification,
cache revalidation or serialization failures cannot delete proof. Direct
service-role execution of the older normal-result RPC overloads is revoked so
the attempt arbiter cannot be bypassed.

If a browser uploads and then disappears before finalization or explicit
cleanup, the opaque private objects remain confined to the participant/match's
fixed three-namespace budget. A late unexpired token still cannot authorize
finalization, and its namespace cannot be reused until token expiry plus the
buffer and a final sweep. Without a later preparation, a bounded abandoned
private object may remain; IronClad does not add a token-revocation service,
worker, queue, scheduler or global Storage sweeper.

## Private replay retrieval

Replay downloads remain behind the existing protected IronClad route:

```text
/api/match-proofs/{matchId}/{source}/{recordId}/{kind}
```

The route authenticates the requester, establishes match scope through the
authenticated database boundary, requires participant or administrator access,
cross-checks the proof record and tournament, validates the private object
path, and then streams the object through trusted server code with private,
no-store response headers. It does not return a permanent Storage URL or expose
the raw private path in public/player DTOs. A signed upload capability is not a
download capability.

## Existing workflow and history guarantees

After the result-report RPC commits, the existing opponent confirmation,
dispute, administrator review, automatic confirmation, official result,
bracket advancement, deadline, leaderboard and notification workflows continue
unchanged. Administrator-entered results and no-show reporting also remain
separate and unchanged.

Match reset retains referenced proof for audit. Void retains factual replay
history. Competition-history-safe account closure retains referenced private
proof while neutralizing live identity. Hard-delete guards prevent a launched
or history-bearing tournament from erasing official result evidence. Cancel
does not manufacture result proof, and terminal tournaments cannot accept a
late result even if a player obtained an upload capability before the terminal
transition.
