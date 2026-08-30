# Badge Staging E2E Harness

This harness is a staging-only adversarial E2E runner for the Badge System.
It is designed to prove the production badge authority chain, not a copied
test implementation.

- Allowed staging project: `ironclad-staging`
- Allowed staging ref: `zzbnneprhjicmajpjkdg`
- Forbidden production project: `ironclad-v2`
- Forbidden production ref: `nsyjtqpvyxlzyujlbzos`

The runner has no generic linked-project mode and does not read `.env.local`.

## Architecture

Applied badge assertions follow this path:

```text
staging fixture
-> production tournament/profile/match/season authority path
-> production evaluator export from lib/badges/authority.ts
-> player_badge_awards ledger write by production evaluator only
-> independent harness read assertion
```

The harness never writes, upserts, updates, or deletes
`player_badge_awards`. It reads that table for assertions and duplicate scans.

Production evaluator calls are routed through
`scripts/badges/staging-helpers/production-evaluator.mjs`, which loads the
real TypeScript module `lib/badges/authority.ts` under a Node server-only
loader. The harness does not duplicate badge thresholds or eligibility
predicates.

## Usage

Dry-run is the default and performs no database mutation:

```bash
npm run test:badges:staging -- --confirm-project-ref zzbnneprhjicmajpjkdg
```

To suppress the read-only remote preflight in dry-run:

```bash
npm run test:badges:staging -- --confirm-project-ref zzbnneprhjicmajpjkdg --skip-remote-preflight
```

An applied staging run requires both confirmation and `--apply`:

```bash
npm run test:badges:staging -- --confirm-project-ref zzbnneprhjicmajpjkdg --apply
```

Do not run `--apply` without explicit staging approval.

Even with `--apply`, mutation helpers stay blocked until the remote preflight
has returned the exact staging ref and environment expected by the harness.

## Required Environment Variables

Only these explicit staging variables are read. Values are never printed or
written to the manifest.

- `BADGE_E2E_STAGING_SUPABASE_URL`
- `BADGE_E2E_STAGING_SERVICE_ROLE_KEY`
- `BADGE_E2E_STAGING_ANON_KEY`
- `BADGE_E2E_STAGING_AUTHENTICATED_JWT`
- `BADGE_E2E_STAGING_SUPABASE_ACCESS_TOKEN`

Generic `SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, and `.env.local` do not
select the target.

## Preflight

Applied runs abort before fixture creation unless read-only preflight proves:

- exact staging project identity;
- production project exclusion;
- required badge migrations;
- required tables, columns, and key column types;
- required RPC/function names, exact identity signatures, argument fragments,
  and return types;
- required status/check-constraint values;
- required uniqueness indexes, including `(player_id, badge_slug)`;
- required seeded map IDs used by fixtures;
- RLS/FORCE RLS on private ledgers;
- service-role table and RPC capability;
- unsafe anon/authenticated grants absent;
- SECURITY DEFINER and safe `search_path` on required functions.

Preflight does not mutate Supabase.

## Coverage Matrix

The executable registry lives in `BADGE_SCENARIOS` in
`scripts/badges/staging-helpers/assertions.mjs`.

Each row records:

- badge number and slug;
- primary positive scenario;
- primary negative scenario;
- additional positive/negative cases where the badge requires more than one
  boundary;
- production evaluator entry point;
- authority source;
- runtime classification.

Classifications use this vocabulary:

- `REAL E2E`: the handler uses fixture evidence, the real production authority
  path, the real production evaluator, independent `player_badge_awards` reads,
  authority evidence assertions, and precondition reads.
- `PARTIAL`: implemented cases use real production paths, but at least one
  requested boundary cannot currently be exercised without bypassing production
  lifecycle or authority.
- `SIMULATED`: not allowed in the harness.
- `BROKEN`: not allowed in the harness.

| # | Badge | Positive handler | Negative handler | Production evaluator | Authority source | Classification |
|---|---|---|---|---|---|---|
| 1 | IronClad Recruit | `profile-positive` | `profile-negative` | `evaluateProfileBadgeAwards` | players trigger + profile row | REAL E2E |
| 2 | First Deployment | `first-deployment-positive` | `zero-played-matches` | `evaluateMatchBadgeAwardsForPlayer` | match participant authority | REAL E2E |
| 3 | First Victory | `first-victory-positive` | `played-loss` | `evaluateMatchBadgeAwardsForReportGroup` | match participant authority | REAL E2E |
| 4 | Battle Tested | `battle-tested-exact` | `nine-victories` | `evaluateMatchBadgeAwardsForPlayer` | `get_player_badge_match_threshold_summary` | REAL E2E |
| 5 | Rising Through the Ranks | `rising-through-ranks-positive` | `same-bracket-history` | `evaluateTournamentBadgeAwardsForPlayer` | `get_player_badge_bracket_progression_summary` | REAL E2E |
| 6 | First Campaign | `first-campaign-exact` | `launched-incomplete-tournament` | `evaluateTournamentBadgeAwardsForTournament` | leaderboard participation events + tournament summary | REAL E2E |
| 7 | Iron Regular | `iron-regular-exact` | `two-completed-tournaments` | `evaluateTournamentBadgeAwardsForPlayer` | `get_player_badge_tournament_summary` | REAL E2E |
| 8 | Tournament Veteran | `tournament-veteran-exact` | `nine-completed-tournaments` | `evaluateTournamentBadgeAwardsForPlayer` | `get_player_badge_tournament_summary` | REAL E2E |
| 9 | Season Campaigner | `career-positive` | `active-season-under-threshold` | `evaluateSeasonBadgeAwardsForSeason` | finalized season summary | REAL E2E |
| 10 | Reliable Competitor | `reliable-competitor-exact` | `nine-victories` | `evaluateReliableCompetitorBadgeAwardsForPlayer` | `get_player_badge_reliable_competitor_summary` | REAL E2E |
| 11 | Five Victories | `five-victories-exact` | `four-victories` | `evaluateMatchBadgeAwardsForPlayer` | `get_player_badge_match_threshold_summary` | REAL E2E |
| 12 | Ten Victories | `ten-victories-exact` | `nine-victories` | `evaluateMatchBadgeAwardsForPlayer` | `get_player_badge_match_threshold_summary` | REAL E2E |
| 13 | Twenty-Five Victories | `twenty-five-victories-exact` | `twenty-four-victories` | `evaluateMatchBadgeAwardsForPlayer` | `get_player_badge_match_threshold_summary` | REAL E2E |
| 14 | Iron Streak | `iron-streak-exact` | `two-win-streak` | `evaluateMatchExcellenceBadgeAwardsForPlayer` | `get_player_badge_match_excellence_summary` | REAL E2E |
| 15 | Unbroken | `unbroken-exact` | `four-win-streak-then-loss` | `evaluateMatchExcellenceBadgeAwardsForPlayer` | `get_player_badge_match_excellence_summary` | REAL E2E |
| 16 | Clean Sweep | `clean-sweep-bo3-positive`; extra case `clean-sweep-bo5-positive` | `clean-sweep-2-1` | `evaluateMatchExcellenceBadgeAwardsForPlayer` | game result authority + match excellence summary | REAL E2E |
| 17 | Comeback Commander | `comeback-positive` | `comeback-no-game1-loss` | `evaluateComebackCommanderBadgeAwardsForPlayer` | ordered game result authority | REAL E2E |
| 18 | Giant Slayer | `giant-positive` | `giant-plus-199` | `evaluateMatchExcellenceBadgeAwardsForPlayer` | registration ELO snapshots | REAL E2E |
| 19 | Giant Hunter | `giant-positive` | `giant-two-upsets` | `evaluateMatchExcellenceBadgeAwardsForPlayer` | registration ELO snapshots | REAL E2E |
| 20 | Flawless Campaign | `flawless-clean-champion-positive`; extra cases `flawless-no-show-positive`, `flawless-automatic-bye-positive` | `flawless-one-game-loss`; extra cases `flawless-admin-default`, `flawless-incomplete-championship-path`, `flawless-reset-invalidated-evidence`, `flawless-void-invalidated-evidence` | `evaluateFlawlessCampaignBadgeAwardsForPlayer` | championship path summary, path segments, game authority, participant authority | REAL E2E |
| 21 | First Advance | `career-positive` | `first-round-exit` | `evaluateTournamentPrestigeBadgeAwardsForPlayer` | tournament prestige summary | REAL E2E |
| 22 | Semifinalist | `career-positive` | `first-round-exit` | `evaluateTournamentPrestigeBadgeAwardsForPlayer` | tournament prestige summary | REAL E2E |
| 23 | Finalist | `career-positive` | `semifinal-exit` | `evaluateTournamentPrestigeBadgeAwardsForPlayer` | tournament prestige summary | REAL E2E |
| 24 | Academy Champion | `career-positive` | `academy-finalist-loss` | `evaluateTournamentPrestigeBadgeAwardsForPlayer` | tournament-win leaderboard event | REAL E2E |
| 25 | Challenge Champion | `career-positive` | `challenge-finalist-loss` | `evaluateTournamentPrestigeBadgeAwardsForPlayer` | tournament-win leaderboard event | REAL E2E |
| 26 | Elite Champion | `career-positive` | `main-finalist-loss` | `evaluateTournamentPrestigeBadgeAwardsForPlayer` | tournament-win leaderboard event | REAL E2E |
| 27 | Double Champion | `career-positive` | `one-championship` | `evaluateTournamentPrestigeBadgeAwardsForPlayer` | tournament prestige summary | REAL E2E |
| 28 | Triple Crown | `career-positive` | `two-bracket-championships` | `evaluateTournamentPrestigeBadgeAwardsForPlayer` | tournament prestige summary | REAL E2E |
| 29 | Season Podium | `career-positive` | `season-rank-four`; extra case `active-season-not-finalized` | `evaluateSeasonBadgeAwardsForPlayer` | finalized season summary | REAL E2E |
| 30 | Season Champion | `career-positive` | `season-rank-two`; extra case `active-season-not-finalized` | `evaluateSeasonBadgeAwardsForPlayer` | finalized season summary | REAL E2E |

Applied runtime assertions still fail closed: a negative pass requires a real
production evaluator invocation followed by an independent absent-award read.
Infrastructure errors are not converted into negative passes.

Every declared scenario ID in the registry resolves to an executable handler in
`SCENARIO_HANDLER_REGISTRY`. The focused integration test rejects missing
handlers, empty handler bodies, direct award writes, direct authority-table
fixture writes outside denial probes, synthetic final season authority writes,
and obvious hardcoded-pass shortcuts.

## Profile Fixtures

Fixture players do not set `profile_completed` directly. The insert supplies
the current production profile-completion fields, then reloads the row and
verifies the trigger-computed `profile_completed` value before badge
evaluation. The positive profile fixture includes avatar, display/IGN,
SteamID64, country, region, and timezone. The negative profile fixture is both
incomplete and unverified without bypassing triggers.

## Match Authority

Normal match fixtures use replay upload attempts, report-group creation, and
confirmation. Authority rows are produced by the production report-group
finalization path.

No helper writes `match_participant_outcome_authority` or
`match_game_result_authority` except isolated anon/authenticated RLS-denial
security probes with valid fixture IDs.

For game-specific boundaries such as Clean Sweep and Comeback Commander, the
current replay-attempt API cannot express different per-game winners. The
harness creates `match_result_submissions` as submission fixtures, then uses the
production `create_match_result_report_group` and confirmation path so the badge
evidence still comes from production game authority rows.

The applied handler covers:

- normal confirmed replay-attempt result;
- explicit per-game BO3 2-0 Clean Sweep;
- explicit per-game BO5 3-0 Clean Sweep through the grand final;
- explicit BO3 2-1 non-sweep;
- explicit Game 1 loss followed by series victory for Comeback Commander;
- explicit Game 1 win in a 2-1 series as the Comeback negative;
- opponent no-show;
- admin/default result;
- admin reset.

## Flawless Campaign

The harness asserts:

- champion evidence from leaderboard tournament-win events;
- latest championship path summary via
  `get_tournament_championship_path_summary`;
- latest championship path segments via
  `get_tournament_championship_path_segments`;
- latest game authority rows;
- participant outcome authority;
- positive clean championship path;
- positive opponent no-show path;
- positive left-fed automatic-bye path through the real matchup deadline;
- negative one-game-loss path;
- negative admin/default path;
- negative incomplete path through tournament-not-completed evaluation.
- negative reset-invalidated path through superseded participant/path authority
  and invalidated latest game authority.
- negative completed-path invalidation through the protected Void operation.

The automatic-bye case is deliberately two-phase because production assigns a
real seven-day matchup deadline. Phase 1 creates an eight-player bracket, seeds
the champion into the supported left feeder, completes the opposite half, and
persists an integrity-bound resume state. Phase 2 rejects early execution,
calls `process_matchup_deadlines` only after the persisted deadline, verifies
the double forfeit and derived bye, completes the Final through the replay and
confirmation workflow, recalculates, and invokes the production evaluator.

Completed championship-path regeneration is not a legal production state.
The executable legal invariant completes a clean path without evaluating Badge
20, invokes `void_tournament`, verifies voided latest segments, an invalidated
summary, and removed current tournament-win evidence, then proves a first
Flawless Campaign evaluation grants nothing.

Production defect note: automatic-bye participant authority currently appears
asymmetric because the relevant trigger checks only
`player_one_registration_id`. This task does not change production semantics;
the real E2E fixture intentionally uses the supported left-fed bye path.

## Season Testing

The harness no longer inserts synthetic season standings or champions.
Season scenarios are driven through completed tournaments, leaderboard
recalculation, season membership, finalized season stats, and production season
badge evaluators.

Negative Season Podium and Season Champion assertions use lower-ranked players
from real finalized season standings.

Additional not-finalized negatives run a player through completed Main
tournaments and season recalculation without finalization; the production
season evaluator must complete successfully and leave Season Podium and Season
Champion absent.

## Idempotency

The harness repeats:

- the same player evaluator;
- match evaluation through completed report groups;
- tournament recalculation;
- season recalculation;
- live evaluation plus controlled backfill;
- controlled backfill twice.

It independently scans `player_badge_awards` for duplicate
`(player_id, badge_slug)` pairs and preflight checks the uniqueness index.

## Corrections

Correction assertions verify:

- reset appends invalidated authority and invalidated evidence cannot create a
  new award;
- voided tournament history does not delete already-earned badge awards;
- append-only award retention is respected.

Completed-path correction coverage uses the legal `void_tournament` recovery
operation. The harness never weakens regeneration or terminal-history guards.

## Security

Runtime security uses three clients:

- anon;
- authenticated with `BADGE_E2E_STAGING_AUTHENTICATED_JWT`;
- service role.

Before authenticated denial probes, the harness proves that the anon client is
denied direct `players` access while the JWT-bearing client can execute the
same exact read without an authentication error. Invalid or expired JWT errors,
including `PGRST301`, fail the run rather than counting as authorization denial.

Mutation-denial probes use valid fixture IDs so FK failures cannot masquerade
as RLS protection. The harness checks permission/RLS-style error semantics.

## Manifest

Applied runs write:

```text
artifacts/badge-e2e/<run-marker>.json
```

The manifest is written immediately after preflight and atomically replaced
after each recorded fixture or assertion. If the process dies after fixture 17,
fixtures 1-17 are already recorded.

The manifest records all current run-scoped IDs that the harness can identify:
players, tournaments, registrations, registration acceptances, brackets,
generated brackets, matches, report groups, match result submissions, replay
upload attempts, season IDs touched by membership lookup, and storage paths.

The manifest writer rejects secret-shaped keys and any registered secret value,
including JWTs, service-role keys, anon keys, access tokens, authorization
headers, and environment values.

The Badge 20 SHA-256 resume digest detects accidental state corruption. It is
not a keyed signature and is not cryptographic proof of manifest authorship.

## Cleanup Dry-Run

Cleanup support is manifest-scoped and read-only unless a future actual cleanup
mode is explicitly implemented.

```bash
npm run test:badges:staging -- --confirm-project-ref zzbnneprhjicmajpjkdg --cleanup-dry-run --manifest artifacts/badge-e2e/<run-marker>.json
```

The dry-run prints only manifest-recorded IDs, their bucket, and their cleanup
classification when they are eligible for cleanup planning. Retained launched
or completed tournament history is not listed as cleanup-eligible. It does not
connect to Supabase and does not mutate Storage.

Once a fixture tournament launches, its players, registrations, acceptance
records, bracket topology, matches, result artifacts, replay objects, and
derived season references are reclassified as retained staging history.

Cleanup must never use broad delete predicates, arbitrary staging user filters,
or unmanifested IDs.

## Estimated Applied Run

A full applied run is expected to create roughly:

- 40-55 fixture players, including bracket filler players;
- 55-70 tournaments;
- 380-500 generated matches;
- 40-70 report groups, depending on advancement paths;
- replay upload attempts and storage paths for normal confirmed results;
- existing or newly touched leaderboard season memberships and season IDs.

Expected runtime is high for a staging E2E suite: plan for 30-60 minutes,
depending on Supabase latency and Storage upload speed. Expected residue is
run-marked fixture players, launched/completed tournament history, generated
matches/brackets, report groups, replay attempts, replay storage paths, and
leaderboard/season recalculation rows. Launched or completed tournament history
is retained by design.

## Future Controlled Run

Only after explicit staging approval, the controlled applied command is:

```bash
npm run test:badges:staging -- --confirm-project-ref zzbnneprhjicmajpjkdg --apply
```

Create the delayed automatic-bye fixture:

```bash
npm run test:badges:staging -- --confirm-project-ref zzbnneprhjicmajpjkdg --apply --badge20-bye-phase-1
```

After the printed real deadline, resume the same run with the exact manifest
and run marker printed by phase 1:

```bash
npm run test:badges:staging -- --confirm-project-ref zzbnneprhjicmajpjkdg --apply --badge20-bye-phase-2 --manifest artifacts/badge-e2e/<run-marker>.json --run-marker <run-marker>
```

Phase 2 validates the filename, run marker, staging project, manifest-created
IDs, integrity digest, persisted deadline, current match deadline, and the
production database clock returned by read-only preflight before deadline
processing. No secret is stored in the manifest.

Do not add production refs, generic Supabase environment variables, or linked
project fallbacks. Do not run cleanup as part of the coverage run.

## Current Readiness

The harness has executable real-production handlers for all 30 badges. Badge 20
is REAL E2E once its delayed phase-1 manifest has reached the real deadline and
phase 2 completes successfully. The impossible completed-history regeneration
case is represented by the legal completed-path Void invariant.
