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
bodies. It receives only small result and prepared-object metadata.

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

One submission attempt shares one random attempt UUID. Game numbers are
contiguous from one, and each object receives a distinct random UUID. Paths do
not contain Clerk IDs, email addresses, Steam IDs, Discord identities, display
names, or original filenames.

The signed capability permits upload only to its server-selected path for the
provider-defined lifetime. It is not stored, logged, placed in notifications or
analytics, or persisted in browser storage. It cannot finalize a result,
authorize a player, read another object, or change another match. Ordinary
anonymous and authenticated browser sessions have no general write policy for
`match-proofs`; direct upload works only through the native path-specific
capability.

## Trusted stored-object verification

After direct upload, the finalization server independently:

1. re-authenticates the Clerk user;
2. reloads and re-authorizes the current match and participant ownership;
3. revalidates launched, non-terminal, score, winner and replay-count state;
4. validates that all submitted paths use the exact match namespace, one
   attempt root, contiguous game order and the opaque `.rec` structure;
5. opens each private Storage object one at a time;
6. streams the stored bytes, measuring their actual size and computing SHA-256;
7. rejects a missing, empty or larger-than-10-MiB object;
8. rejects duplicate stored replay payloads by authoritative hash; and
9. calls the existing `submit_match_series_result_report` RPC with the trusted
   ordered paths and SHA-256 hashes.

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

Before `submit_match_series_result_report` succeeds, a failed upload,
verification, state recheck or RPC causes best-effort cleanup of only the
current attempt's validated, unreferenced paths. Cleanup re-authenticates and
re-authorizes the participant, rejects paths outside that match and attempt,
and refuses to remove an object already referenced by result history.

Once the RPC succeeds, its replay objects are authoritative audit evidence and
must not be removed. Notification, cache revalidation, response or UI failures
after that commit boundary cannot delete referenced proof or turn the committed
result into a generic retryable submission failure. A later retry may be
rejected because the result already exists, but cleanup must still preserve all
referenced objects.

If a browser uploads and then disappears before finalization or explicit
cleanup, the opaque private object can remain as an unreferenced orphan. This is
the bounded residual of the native capability lifetime; it does not authorize
result finalization or access to any other object. IronClad does not add an
upload-intent table, token-revocation service, worker, queue or global Storage
sweeper for this edge case.

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
