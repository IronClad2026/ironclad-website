# Authenticated competition partner API — Phase 4

Internal implementation and Staging acceptance documentation. This is a
server-to-server integration, not an anonymous public API. Production promotion
and sending the handoff to CoH3Stats require separate approval.

## Architecture and authority

Request → exact self-authenticated route → centralized partner token check →
strict input validation → server-only client → Phase 3 selector → allow-listed
DTO → private, uncached JSON response.

The Phase 3 checkpoint is `b80566b02b61f5289aaa0bc330526d9b45a1385c`, based on
verified master `b9679dca26416744285dad1cdf1ad44eeb747f87`. Existing Phase 3
selectors and semantics are unchanged. The additive tournament-list selector
selects only a bounded page of event IDs, then delegates to the existing batch
selector. Routes contain no database queries or RPC calls.

Hosted acceptance exposed one direct Phase 3 boundary defect: PostgREST returns
416/PGRST103 for a positive offset beyond the available rows, and the SDK drops
the count on that error response. The paged read helper now confirms this exact
case with a fresh HEAD exact-count SELECT using the same filters. Only a valid
count at/below the requested offset becomes an empty page. It never parses
provider error prose, normalizes unrelated errors or skips the final player
visibility check. This preserves the intended empty-page/identity semantics;
no authority, writer, constraint or transactional behavior changes.

There are no database changes, new dependencies, authentication-provider calls,
identity/provider refreshes, lazy reconciliation, notification/consent writes,
or competition mutations in this request path. The service client is created
only after partner authentication and input validation.

## Authentication

- Header: `X-Api-Token`.
- Server environment key: `COH3STATS_API_TOKEN`.
- Named partner: `coh3stats`, centralized in the authentication registry.
- Use a cryptographically random token; this implementation accepts 32–256
  visible ASCII characters excluding whitespace and commas.
- Hash both inputs with SHA-256 and compare fixed-size digests with
  `timingSafeEqual`. Missing/malformed configuration fails closed.
- No query-string credential, Bearer fallback or Clerk-session fallback.
- Never put the key in a `NEXT_PUBLIC_` variable or a client bundle.
- Never log tokens or send them in URLs. Provision and distribute credentials
  through a separate secure channel.

Only the three implemented path shapes bypass Clerk's interactive sign-in
requirement. Every GET still authorizes the partner token. Other API paths and
authentication behavior remain unchanged. Vercel Preview deployment protection
is an additional platform gate; it is not replaced or disabled by this API.

For this phase the credential is sensitive, Preview-only, and scoped to the
existing `staging` branch. No Production credential is created.

## Routes and schema

Base namespace: `/api/partners/v1`.

Every JSON response has `schemaVersion: "ironclad.competition.v1"`. Success uses
`data`; errors use `error`. Nested Phase 3 products retain their matching schema
version. GET is the only implemented application method. Next.js handles HEAD,
OPTIONS and unsupported methods according to its standard route conventions;
there are no POST/PUT/PATCH/DELETE writers.

### Tournament discovery

`GET /api/partners/v1/tournaments`

Supported query parameters:

| Parameter | Default                | Accepted values                                             |
| --------- | ---------------------- | ----------------------------------------------------------- |
| `limit`   | 5                      | Canonical integer 1–10                                      |
| `offset`  | 0                      | Canonical integer 0–10000                                   |
| `status`  | All discovery statuses | `upcoming`, `registration_open`, `in_progress`, `completed` |

Discovery follows the native public tournament listing policy. Cancelled and
voided events are excluded from discovery but remain available by direct slug
reference and in historical competition records. Ordering is `created_at DESC,
id DESC`. Source totals are not returned.

```json
{
  "schemaVersion": "ironclad.competition.v1",
  "data": [],
  "pagination": {
    "offset": 0,
    "limit": 5,
    "hasMore": false,
    "nextOffset": null,
    "truncated": false
  }
}
```

Use `nextOffset` until null. Concurrent status changes can omit candidates from
a page; pagination advances over the scanned event page. These multi-query
products are not transactional snapshots. If more events exist beyond the
maximum supported offset, `hasMore` stays true, `nextOffset` is null and
`truncated` is true; the API never advertises an invalid continuation.

### One tournament

`GET /api/partners/v1/tournaments/{slug}`

No query parameters. Slugs are lowercase alphanumeric components separated by
hyphens, at most 100 characters. The response's `data` is the complete Phase 3
`TournamentCompetitionView`, including:

- Identity, lifecycle, format, registration window and public URL.
- Immutable Division model, ELO ranges, approved counts and readiness.
- Separate generated/published/launched facts; eight players never imply launch.
- Public participant snapshots and published rounds/official match results.
- Supported standings/champion; unsupported placement/timestamps remain null.

Generated-but-unlaunched topology, standings and champions are withheld. Official
score/winner authority remains `tournament_matches`; replay/report payloads are
never returned. Direct-reference cancelled/voided history retains its status and
existing factual authority without inventing new award rules.

### Player history by canonical Relic ID

`GET /api/partners/v1/players/{relicProfileId}/tournaments`

Supported query parameters: `limit` (default/max 10, minimum 1) and `offset`
(default 0, maximum 10000). IDs must be canonical positive decimal strings of
1–20 digits. No sign, leading zero, exponent, alias, Steam nickname or internal
account identifier is accepted. IDs remain strings, without lossy conversion.

- Visible canonical binding: 200 with the Phase 3 disclosure projection.
- Visible player with no returned entries: 200 with an empty `entries` array.
- Hidden, private, closed or unknown binding: identical 404 `player_not_available`.
- Provider/database failure: generic 500; never disguised as unknown identity.

The `data` product includes public current identity, event alias/ELO snapshots,
tournament/Division history, official published matches, factual played record,
and supported placements/titles. It excludes internal candidate coverage.

```json
{
  "schemaVersion": "ironclad.competition.v1",
  "data": {
    "schemaVersion": "ironclad.competition.v1",
    "relicProfileId": "123456",
    "currentIdentity": {
      "alias": "Example competitor",
      "profileUrl": "https://www.ironcladtournaments.com/players/example-public-id"
    },
    "entries": [],
    "aggregate": {
      "scope": "returned_entries",
      "tournamentsEntered": 0,
      "matchesPlayed": 0,
      "wins": 0,
      "losses": 0,
      "titles": 0
    }
  },
  "pagination": { "offset": 0, "limit": 10 }
}
```

This is a bounded candidate-page contract, not a lifetime-history completeness
claim. Explicit offsets advance through approved/withdrawn event candidates;
only publicly supported participation is returned. Filtering can produce empty
or short pages before later public entries. No candidate total, `hasMore`,
`nextOffset` or scan count is disclosed for players, because these could reveal
unpublished withdrawn participation. Aggregates cover the returned page only.

## Errors and validation

| Status | Body `error`               | Meaning                                                        |
| ------ | -------------------------- | -------------------------------------------------------------- |
| 401    | `unauthorized`             | Missing/invalid token or unavailable token configuration       |
| 400    | `invalid_request`          | Malformed path/query input, unsupported or duplicate parameter |
| 404    | `tournament_not_available` | Unknown tournament slug                                        |
| 404    | `player_not_available`     | Hidden/closed/unknown canonical player identity                |
| 500    | `internal_error`           | Unexpected selector/configuration/source failure               |
| 405    | Framework response         | Unsupported application method                                 |

No 429 is claimed. Unsupported parameters, duplicate query keys and
noncanonical numbers fail before the database client is created. Authentication
runs first, including for invalid input. No raw error, stack, owner detail or
source row is returned or logged.

## Privacy, historical semantics and side effects

Public profile/closure policy and the final identity visibility recheck come
from Phase 3. Internal HIDDEN is never an external outcome. Current account
correlation is separate from historical event facts: private event participants
retain only existing allowed alias facts; closed competitors are anonymized.

Legacy `legacy_three_v1` Main remains Main / Pro. Current `four_division_v1` Main
and Pro remain distinct. Event alias/ELO snapshots are not replaced by current
profile values. Byes, no-shows and administrative advancement are not invented
played matches. Incomplete per-game proof remains unknown.

Never disclose emails, Clerk IDs, Discord data, Steam ownership, legal records,
IP data, admin/moderation notes, report payloads, replay paths/signed URLs or
service-role metadata. IDs already used as public tournament, registration,
bracket/match/profile references are deliberate stable relationship identifiers;
the player lookup itself does not return a separate internal account ID.

Every selector is SELECT-only. No request establishes a Relic binding, refreshes
ELO, registers/approves a player, launches/generates competition, settles a
result, changes privacy, sends a notification or creates a legal receipt.

## Rate limits, cache and telemetry

There is no suitable existing general HTTP limiter. Request rate limiting is
**deferred**, not simulated with an unreliable per-instance counter. Central
`runPartnerRead` is the future named-partner enforcement hook. Authentication,
page limits and exact-count overflow checks bound each request; they do not
constitute a requests-per-minute limit. No new external infrastructure is added.

All success/error responses use `private, no-store, max-age=0`, CDN no-store
headers and `Vary: X-Api-Token`. There is no application response/auth cache.
Player privacy decisions are re-read. No broad CORS header is added; CoH3Stats
must call from its server and keep the credential out of browser JavaScript.

Sanitized telemetry logs partner identifier, constant endpoint label, status,
authentication time, selector time and total duration. No URL, input Relic ID,
credential, payload or raw source error is logged. `Server-Timing` provides the
same duration categories. Selector time includes client/network/query/mapping
work and is not a standalone SQL execution measurement.

## Staging and future release

Use only the established `staging` Preview path, retaining its existing guard
and synthetic adapter. Do not deploy the master-based candidate as Preview by
removing its guard. Preserve Production branch, aliases and environment values.

Before/after hosted acceptance compare all actual Staging business tables and
catalogs, plus Production HOLD THE LINE snapshots. The existing visible verified
Staging identity and existing unlaunched/completed events suffice; no backfill,
privacy change or competition fixture is needed.

Production is not authorized in Phase 4. A later approved release should verify
master drift and exact patches, provision a distinct Production token, validate
Phase 2 database prerequisites first, then promote only the reviewed application
candidate and perform safe authenticated read checks. This phase introduces no
new migration prerequisite. Never send the Staging token as a Production token.

The prepared [CoH3Stats handoff](./coh3stats-handoff.md) is draft-only and contains
no secret. Do not send it before Production approval and validation.
