# Internal competition read models — Phase 3

These server-only selectors are an internal, bounded read layer. They do not
create HTTP routes, partner credentials, a new database authority, or a public
integration. No existing page or write path imports them in this phase.

## Reviewed Phase 3 checkpoint and isolation

- Branch: `feature/competition-read-models`.
- Base: `b9679dca26416744285dad1cdf1ad44eeb747f87`.
- Phase 2 automatic post-merge CI: run `40406503066`, all six jobs passed;
  4,433 unit/integration tests, 292 browser tests, and the native build passed.
- Production inspection: `nsyjtqpvyxlzyujlbzos` (`ironclad-v2`), READ ONLY.
- Staging identity: `zzbnneprhjicmajpjkdg` (`ironclad-staging`). No Staging
  migration, fixture, user interaction or write is necessary for this phase.
- No database migration, dependency, environment variable, UI, release guard,
  registration/verification writer or infrastructure change.

These baseline observations describe the reviewed Phase 3 checkpoint. Release
evidence and environment-specific verification artifacts are retained separately
from application source. These modules introduce no database release dependency.

## Entry points and contracts

`lib/competition-read-models/tournaments.ts`:

```ts
loadTournamentCompetitionView(client, slug, { now? });
loadTournamentCompetitionViews(client, tournamentIds, { now? });
```

`lib/competition-read-models/players.ts`:

```ts
loadPlayerCompetitionHistory(client, canonicalRelicId, { limit?, offset?, now? });
projectPublicPlayerCompetitionLookup(internalResult);
```

The client must be an existing trusted server-side Supabase client. The required
interface exposes only `from`; there is no RPC, authentication, provider call,
client construction, lazy reconciliation, cache or writer in these modules.
They use explicit SELECT lists, runtime source parsers and allow-list DTO mapping.
Database/network errors remain errors and are not disguised as unknown players.
Provider messages and private row contents are not returned as error details.

Both visible products carry `schemaVersion: "ironclad.competition.v1"`. Exported
TypeScript types describe the normalized products; database rows never become
the product through an object spread. No new validation package was added.

## Authority and field mapping

| Read-model field                                    | Authoritative source / transformation                                                                                                                    |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tournament `id`, `slug`, `name`, `status`, `format` | `tournaments.id`, `slug`, `title`, `status`, `format`                                                                                                    |
| `divisionModelVersion`                              | Required `tournaments.division_model_version`; missing/unknown values fail closed                                                                        |
| `game`                                              | Constant Company of Heroes 3, the actual platform game; no per-event game column exists                                                                  |
| Registration window                                 | `registration_enabled`, `registration_open_at`, `registration_close_at`; existing `getTournamentRegistrationAvailability`                                |
| `approvedPlayers`                                   | Sum of approved registration counts in the returned event's Divisions                                                                                    |
| Start/end/first completion                          | Existing tournament timestamps; unsupported values remain null                                                                                           |
| Division identity/name                              | `tournament_brackets.id`, `name`; existing immutable-model display resolver                                                                              |
| `eloRule`, `eloRange`                               | Stored `elo_rules`; existing `parseEloEligibilityRule`, including exclusive/inclusive boundaries; unparseable range is null                              |
| Capacity/readiness                                  | Existing active review cohort including offered waitlist places; `least(max_players, 8)`; approved roster must equal capacity and active count for ready |
| Launch/publication                                  | `tournament_brackets.launched_at`; existing public bracket boundary                                                                                      |
| Division state                                      | Existing pure `resolveTournamentDivisionStates`, generated competition facts and Not Held closure records                                                |
| Public participant                                  | Registration `player_name`, verified/submitted ELO snapshots; existing `mapPublicTournamentParticipant` and current player privacy/closure               |
| Bracket                                             | `generated_brackets` belonging to that Division                                                                                                          |
| Round/match topology                                | `bracket_rounds` and `tournament_matches` belonging to the launched generated bracket                                                                    |
| Official score/winner/status                        | `tournament_matches`; never inferred from a submitted report or replay                                                                                   |
| `decidedAt`                                         | `official_result_decided_at`; null remains null, with no `updated_at` substitute                                                                         |
| Competition placements                              | Actual `tournament_standings` rank/wins/losses/points; no invented elimination placement                                                                 |
| Champion                                            | Existing Career final/round-robin derivation, described below                                                                                            |
| Player lookup                                       | Exact equality on `players.coh3_profile_id`; no alias, Steam nickname or card-URL fallback                                                               |
| Current public identity                             | Current active opted-in player's in-game/display alias and existing `/players/{id}` link                                                                 |
| Player entries                                      | `registrations.profile_id -> players.id`; eligible public event participation from approved or publicly referenced withdrawn registrations               |
| Player event alias/ELO                              | Returned public event registration snapshots, never current profile alias/ELO                                                                            |
| Played-match record                                 | Existing Career/leaderboard predicate over official matches and accepted no-show classification                                                          |

`registrations.profile_id` is the existing foreign key to `players.id`, despite
its legacy name. It is not a second profile authority. Existing nullable Relic
bindings remain unresolved until trusted verification populates them naturally.

## Tournament lifecycle

The event status and the Division state remain separate. A Division has explicit
`capacityReached`, `ready`, `bracketGenerated`, `bracketPublished`, and
`launchedAt` facts. Eight approved players never imply launch.

Generated-but-unlaunched brackets expose only generation state. Their rounds,
matches, standings and champion are not queried or returned. A launched bracket
is published under the existing IronClad rule; there is no separate invented
publication switch. Missing required authority or malformed ownership links
fail closed rather than producing a partial bracket.

Registration `open`/availability is a submission-window fact, not a guarantee of
an active place: capacity/waitlist semantics remain unchanged. Division state
uses the existing terminal overlays for cancelled/voided events. Historical
official final/standing facts are retained with that status; the read layer does
not create a new prize, award, badge or voiding policy.

## Historical identity and privacy

| Internal outcome | Meaning                                                                    | Disclosure projection                |
| ---------------- | -------------------------------------------------------------------------- | ------------------------------------ |
| `FOUND_VISIBLE`  | Exact canonical binding and active account                                 | Allow-listed competitive product     |
| `HIDDEN`         | Binding exists but account closure disallows correlation                   | Same `NOT_FOUND` response as unknown |
| `NOT_FOUND`      | No verified canonical binding                                              | `NOT_FOUND`                          |

Every active IronClad player has a public competitive profile. The legacy
`public_profile_enabled` column is retained for rollback compatibility but does
not authorize or prevent competitive disclosure. Account closure remains a
disclosure boundary. The pure disclosure projection is
not an endpoint; it also removes internal candidate-pagination coverage.

Account closure normally clears the binding, so closed accounts generally
resolve as NOT_FOUND. A defensive closed-but-bound row is HIDDEN. An alias change
or stale ELO does not revoke a stable verified binding. Visibility is checked
again after history reads; a changed binding or closure fails
closed. Each SELECT has its own database snapshot; the full multi-query model is
not a transactional snapshot. Detected join/state inconsistencies fail closed
and may require a retry during concurrent competition changes. No caching is
enabled.

Public event facts retain their event alias and ELO snapshot; current profile
values do not replace those historical facts. Active linked competitors receive
their public `/players/{id}` URL regardless of the legacy visibility value.
Tournament participant DTOs include `relicProfileId: string | null`, sourced only
from the current trusted canonical `players.coh3_profile_id` binding. An unbound
player still has a public profile URL and a null Relic ID. No alias, URL or rating
is used to infer an identity. Closed competitors display `Former Competitor`
with no profile URL, ELO or Relic correlation. Unlinked historical participants
retain the pre-existing limited event presentation.

Never expose Clerk/Steam identities, emails, Discord data, legal acceptances,
IP addresses, private avatar/replay paths, signed evidence URLs, provider
credentials, admin notes, dispute notes or internal report payloads.

## Legacy divisions and result semantics

The existing `lib/division-model.ts` resolver is authoritative:

- `legacy_three_v1`: stored Main displays **Main / Pro**.
- `four_division_v1`: stored Main and Pro remain separate.
- No old Main / Pro entry is relabelled current Pro, and no ELO/alias snapshot is
  replaced by current profile values.

An official match counts as played using the existing Career History and
`is_tournament_match_played_for_leaderboard` predicate: completed, two distinct
participants, scores and a participating winner, no automatic outcome, and no
accepted finalized no-show. Only minimal no-show classification columns are
read from `match_result_report_groups`; that table is not score/winner authority.

A bye, empty feeder, double forfeit or accepted no-show can advance competition
without adding a played match. A normal scored result corrected by an
administrator retains the existing played-match meaning; an administrative
advancement is not converted into a played game. Fresh reads use the current
official match state, so resets/corrections do not retain cached outcomes.

This played-match predicate does not require complete per-game replay proof.
Legacy incomplete game evidence remains unknown: no game count, per-game proof
assertion, badge claim or evidence repair is produced here.

A launched completed single-elimination final awards the factual champion under
the existing Career predicate, including an automatic final bye. Round-robin
champions require a completed expected fixture set and an actual rank-1 standing.
A title does not itself add a played match. Missing precise placement is null.
Standing wins/losses are competition standings, separate from factual played
match aggregates.

## Bounds, query count and performance

- One slug or at most **10 event IDs** per tournament batch.
- Every complete batch SELECT requests exact count and at most **1,000 rows**;
  1,000 is an overflow sentinel, not a silently accepted truncated result.
  Count/row mismatch also rejects a lower server row cap.
- Player candidate page: default/max **10**, offset integer **0–10,000**, one
  sentinel, deterministic descending `created_at, id`. Only approved/withdrawn
  candidates are considered; withdrawn entries require public match/placement
  reference. Pagination advances by scanned candidates, including filtered ones.
- Candidate totals stay internal. Both aggregate and coverage scope explicitly
  say `returned_entries`; no lifetime win rate or all-career total is claimed.
- Tournament: up to **6** SELECTs without published competition, **10** with
  published competition. Batches are shared across Divisions/events, not N+1.
- Player: **1** query for hidden/unknown, **3** for empty visible history, up to
  **13** including the bounded event batch and final visibility check.
- Division detail is a projection of the same bounded tournament read; it does
  not trigger another per-Division query sequence.

Production EXPLAIN/ANALYZE evidence and selected indexes are retained in the
internal release evidence; representative timings follow. Small-table scans do not
justify an index migration. There is no demonstrated need for a schema change.

| Representative Production SELECT        | Rows | Execution | Separate exact count |
| --------------------------------------- | ---: | --------: | -------------------: |
| HOLD THE LINE by slug                   |    1 |  1.311 ms |             0.775 ms |
| HOLD THE LINE registrations             |   13 |  0.156 ms |             0.172 ms |
| THE NEW FRONT Academy matches           |    7 |  0.109 ms |             0.130 ms |
| THE NEW FRONT published match batch     |   21 |  0.106 ms |             0.113 ms |
| Canonical Relic lookup, absent binding  |    0 |  1.314 ms |             0.132 ms |
| Representative player registration page |    1 |  1.444 ms |             0.183 ms |

These are single-observation SQL plans, not end-to-end selector or HTTP latency.
The Relic probe uses the existing unique partial index; there are currently no
populated Production bindings. The history probe includes an extra internal
parameter-selection subquery to avoid exporting a private player identifier.
The full raw registration source for THE NEW FRONT contains 27 rows before
cohort/visibility projection; this is not a claim of 27 competitors. Maximum-page
history, large datasets and network latency were not benchmarked.

## Validation and release boundary

Tests cover lifecycle/publication, legacy/current models, current versus event
identity, private/closed/unresolved identities, privacy changes mid-read, factual
played results, byes/no-shows, historical unknowns, bounds, source errors and
field redaction. The integration tests compose both actual selectors through a
SELECT-only filtering transport rather than mocking one product into the other.

Fresh Production snapshots and 67-table fingerprints prove this work caused no
competition/player writes. No identity backfill, fixture, migration, trigger,
grant or RLS change occurred. No route, token, rate limiting or CoH3Stats client
exists. The two known historical unknown Academy proof rows remain untouched.

Phase 4 may consume these internal products only after its separate approval.
Its authorization, external DTO/pagination contract, error mapping and cache
privacy policy remain future work. Any later release with database prerequisites
must install and verify those prerequisites **before** application promotion;
this phase changes no release infrastructure.
