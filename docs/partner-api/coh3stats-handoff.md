# Draft handoff to Peg / CoH3Stats — not sent

IronClad provides authenticated, read-only competition endpoints for server-side
integration. The release owner confirms Production readiness before credential
handoff through a separate secure channel.

## Connection

- Production base: `https://www.ironcladtournaments.com/api/partners/v1`.
- Header: `X-Api-Token: <partner credential supplied securely>`.
- Schema: `ironclad.competition.v1`.
- Server-to-server only. Do not embed the token in browser code, query strings,
  analytics or logs. There is no broad browser CORS policy.

The API never refreshes ELO, registers players, binds identities or changes
competition state.

## Requests

```http
GET /api/partners/v1/tournaments?limit=5&offset=0
X-Api-Token: <partner credential>
```

Optional `status`: `upcoming`, `registration_open`, `in_progress`, `completed`.
Limit 1–10; offset 0–10000. Discovery returns `{schemaVersion,data,pagination}`;
follow `pagination.nextOffset` until null. Cancelled/voided events are omitted
from discovery but retain direct-reference history. `truncated: true` explicitly
indicates that additional events exceed the supported offset boundary.

```http
GET /api/partners/v1/tournaments/hold-the-line
X-Api-Token: <partner credential>
```

Returns `{schemaVersion,data}` with tournament/Division identity and lifecycle,
ELO ranges, approved counts, separate readiness/generation/publication/launch
facts, public participants and published official results. Generated but
unlaunched topology is withheld. Capacity does not mean launched.

Tournament participants include `relicProfileId: string | null`. It is the
active player's trusted canonical Relic profile ID when one is verified, and
null otherwise. Active linked players receive their public IronClad
`/players/{id}` URL, including when no Relic binding exists. The legacy profile
visibility flag no longer controls competitive identity. Closed competitors
retain existing anonymization and have no profile URL or Relic correlation.
This is an additive DTO change; no identity is inferred from event aliases,
Steam names, URLs or ELO.

```http
GET /api/partners/v1/players/123456/tournaments?limit=10&offset=0
X-Api-Token: <partner credential>
```

Use the actual canonical Relic profile ID as a positive decimal string, maximum
20 digits. The example ID is illustrative. Visible players return 200 and
`{schemaVersion,data,pagination}`; `data` contains permitted current identity,
event alias/ELO snapshots, public competition history and page-scoped record.
A known visible player may have an empty entry list.

Player limit is 1–10, default 10; offset is 0–10000. This is a bounded
candidate-page view. It does not expose candidate counts or `hasMore`/`nextOffset`;
short/empty pages do not prove no later public entries exist. Do not label its
aggregate a lifetime record. A different all-history contract would need review.

## Privacy and errors

Closed and unknown player identities return the same 404. An active player with
an exact canonical binding resolves regardless of the legacy visibility flag:

```json
{
  "schemaVersion": "ironclad.competition.v1",
  "error": "player_not_available"
}
```

Other errors: 401 `unauthorized`, 400 `invalid_request`, 404
`tournament_not_available`, 500 `internal_error`. Unsupported write methods
receive framework 405. Retry unexpected 500s conservatively; do not interpret
them as unknown players.

No request rate limiter is currently implemented; no 429 guarantee is made.
Use modest request frequency and refresh competitive data on demand. Responses
are private/no-store, especially for player visibility changes. `Server-Timing`
reports authentication, selector and total server duration.

Legacy Main / Pro remains distinct from the newer separate Main and Pro model.
Historical event snapshots remain authoritative. Advancement without factual
play does not increase played-match records; unsupported placement or evidence
remains null/unknown. No private evidence/storage information is returned.

Existing Production players may initially be unavailable by Relic ID until they
naturally complete trusted verification. No identity backfill accompanies this
integration. Do not fall back to alias matching.

For complete field mapping and operating limits, use the reviewed
[internal contract](./README.md) and Phase 3 exported TypeScript models.
