# Match Room Phase 1: lifecycle authority decision checkpoint

Date: 2026-09-19
Historical checkpoint: the lifecycle integration was subsequently explicitly approved on 2026-09-19. See match-room-phase-1.md for implementation and delivery status.

## Verified environment

- Fresh `git fetch origin staging` and remote verification: `26f351806691713de4a28c851081a8444063c29b`.
- Branch: `codex/match-room-phase-1`.
- Isolated worktree: `C:/Users/pc/Documents/IronClad/03_Website/ironclad-match-room-phase-1`.
- Supabase project positively verified by metadata: `ironclad-staging`, `zzbnneprhjicmajpjkdg`, ACTIVE_HEALTHY.
- Production project was not queried or modified. No master checkout or branch was modified.

## Blocking finding

The agreed design requires a new immutable room for every actual Match reset, including the same opponents, while ordinary report/review reset preserves its room. A mechanism that only observes the Match when room commands run cannot reliably distinguish all these operations.

Single-elimination actual reset advances activation_version. The hosted Staging round-robin reset implementation, `admin_reset_tournament_match_without_deadline_outcomes(uuid,text)`, clears result fields and sets status to scheduled without advancing activation or writing a universal reset event. It has no completed-only guard. An actual reset with no official result can therefore leave no distinct durable lifecycle fact for later room resolution.

Existing outcome-authority reset facts are conditional on clearing a previous official decision/outcome. The tournament_matches_record_authority trigger does not cover participant-only changes. Current participant equality cannot detect an intervening A/B -> A/C -> A/B transition. Those arbitrary postlaunch replacements are restricted in current ordinary workflows, but no universal assignment ledger exists to support the stronger requested guarantee.

Neither updated_at nor row versions are an adequate substitute: they also change for benign operations, so rotating rooms on them would violate report-reset/hold/deadline continuity. Best-effort hooks or asynchronous reconciliation must not be advertised as an atomic lifecycle guarantee.

## Source evidence

All lines refer to starting commit 26f351806691713de4a28c851081a8444063c29b.

- supabase/migrations/20260808100000_matchup_deadlines_double_forfeit.sql:2668: round-robin delegates to the legacy reset.
- supabase/migrations/20260808100000_matchup_deadlines_double_forfeit.sql:2801: single-elimination actual reset increments activation.
- supabase/migrations/20260613114000_round_robin_reset_recalculates_standings.sql:134: legacy reset clears result fields and returns to scheduled without an epoch increment.
- supabase/migrations/20260821006000_match_authority_foundation.sql:589: outcome reset facts require a prior official timestamp/outcome to be cleared.
- supabase/migrations/20260821006000_match_authority_foundation.sql:804: outcome-authority trigger columns exclude participant-only changes.
- supabase/migrations/20260823100000_match_result_transactional_trust.sql:732: report review/reset can restore active play without starting a new competitive lifecycle.

## Concrete decision requested

Recommended: authorize the minimum synchronous lifecycle authority integration needed for a durable communication generation. Keep generation metadata isolated from message/history operations. Record an actual reset within the existing reset transaction, and record actual participant changes at their authoritative database boundary. Use that generation plus fixed registration membership to resolve rooms lazily and safely.

A narrowly scoped reset wrapper/integration is needed to distinguish an actual round-robin reset even when its before/after Match values are identical. A participant-change hook would record membership transitions. Neither mechanism should create messages, send notifications, or change result/deadline/advancement decisions.

Tradeoff requiring explicit authorization: if recording the generation fails, the affected reset/reassignment must roll back to preserve the invariant. This creates a small synchronous dependency in competition mutation paths and must be independently reviewed and tested, including failure rollback. Do not swallow marker-write failures.

Alternative requiring an explicit product scope change: restrict Phase 1 to supported launched single-elimination lifecycles, with round-robin communication excluded. Do not silently choose this narrower scope.

## Exact database/migration state at checkpoint

- Database operations performed: project metadata, migration ledger, function/trigger definitions, and table-presence reads only.
- Latest Staging ledger entry observed: `20260914004801`, `player_combat_highlights`.
- `public.match_rooms`: absent.
- `public.match_messages`: absent.
- `public.match_room_reads`: absent.
- New migrations: none. Names, versions, checksums: not applicable.
- New database objects: none.
- No migration applied or partially applied; no business data changed.
- Full pre/post competition fingerprints were not captured because no migration was prepared or applied. Capture the requested focused baseline immediately before future application.
- Existing historical ledger/source discrepancies were left untouched.

## Source/test/delivery state

- Only this checkpoint document was added; no application code, dependencies, environment files, or configuration changed.
- Focused read-only source and hosted definition checks completed.
- Lint, TypeScript, build, application/database/concurrency/security tests, CI, and Preview were not run: no implementation candidate exists.
- No feature push, PR, staging merge, or deployment performed.
- Usage observed at checkpoint: approximately 27% remaining.

## Exact next action

Obtain the lifecycle integration decision above. If approved, implement a forward migration with isolated generation metadata and narrow transactional hooks, then the three private room/message/read tables, authenticated RPCs/actions, closure integration, and focused security/concurrency tests. Verify local tests, preservation evidence, exact Staging application, CI/Preview and staging merge under the original authorization. Keep Production/master excluded.

Root remains the only nominated migration owner. Future changes overlap reset/match authority, account closure and migrations; coordinate before editing shared files. Other implementation work was deliberately not started to avoid preserving a misleading or incomplete security foundation.