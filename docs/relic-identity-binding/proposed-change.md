# Verified Relic identity binding — application contract

This records the original defect and the narrowly approved application changes
in the isolated Phase 2 worktree. Production is unchanged. Database application
and live Staging verification are recorded separately by the migration owner.

## Original loss point

`lib/elo-verification/relic.ts` requests Relic `getpersonalstat` using the exact
server-loaded Steam profile name. It validates one matching stat group/member
and the member-to-personal-stat-group join. The provider member's `profile_id`
is the canonical Relic identity, distinct from `personal_statgroup_id`.
Originally `parseStatGroups` discarded `profile_id`; `selectRelic1v1Elo` returned only
the rated ELO, faction, Division and calculation version.

`app/profile/relic-elo-action.ts::verifyRelicProfileElo()` authenticates with Clerk,
checks current legal acceptance, loads player/Steam identity server-side, claims
the existing cooldown and calls the resolver. It then invokes:

```text
save_relic_profile_elo_snapshot(
  p_player_id uuid,
  p_clerk_user_id text,
  p_steam_id64 text,
  p_claimed_at timestamptz,
  p_relic_elo integer,
  p_relic_faction text,
  p_relic_division text,
  p_relic_calculation_version text
)
```

The latest committed definition is in
`20261001033000_production_versioned_competition_authority.sql`. Neither its
arguments nor its atomic update include a Relic profile ID.

## Protected registration consistency boundary

`app/tournaments/actions.ts::submitTournamentRegistration()` independently calls the
same Relic resolver. Its existing `submit_verified_player_registration` RPC also
updates the player's verified ELO and event snapshot. That transaction has no
Relic profile-ID argument or identity-consistency check.

Only changing the profile save path would leave an unchecked second writer:
a bound player X could later resolve to Y through registration and receive Y's
ELO while retaining X's identity binding. An application-only preflight check
would not prove atomic consistency against a concurrent initial binding.

Implementation initially stopped at this boundary. The user subsequently
approved the narrow atomic identity check for registration in Staging. The
implementation uses separate identity-aware service RPCs and preserves the
original registration decisions and snapshot contracts.

## Narrow approved design

1. Reuse `players.coh3_profile_id` as canonical positive decimal text, after
   documenting its legacy semantics and preserving the existing unique partial
   index. Keep null valid for unbound legacy accounts.
2. Preserve only the provider `profile_id` from the unique exact Steam-owned
   member. Never substitute the personal-stat-group ID, alias or client input.
   Validate numeric IDs before conversion so unsafe JSON numbers cannot be
   silently rounded into an identity. Positive canonical decimal string IDs are
   retained as text without an artificial numeric conversion or range limit.
   Numeric provider values must be positive safe integers before conversion.
3. Extend both trusted atomic verification writers, not just profile refresh:
   `save_relic_profile_elo_snapshot` and
   `submit_verified_player_registration`. A separately named versioned service
   RPC/wrapper avoids ambiguous overloaded PostgREST signatures.
4. Pass a server-resolved `p_relic_profile_id text`. Lock and recheck the same
   player, Clerk ownership, Steam identity, closure state and existing cooldown
   where applicable. Bind null or accept the same ID; reject a different ID.
   Preserve all existing ELO, Division, capacity, legal, approval and event
   snapshot rules.
5. Perform binding, ELO acceptance and registration creation, where applicable,
   in one transaction. A uniqueness conflict must roll back the operation and
   return one generic user-safe conflict without exposing another account.
6. Keep the ID out of profile action client DTOs and future external reads until
   the existing visibility/closure policy explicitly permits correlation.
   Persisting a verified binding does not itself grant external visibility.

No registration Relic snapshot, identity backfill, account-recovery interface,
public endpoint, new dependency or unrelated workflow change is proposed here.

## Implemented application call sites

- `lib/elo-verification/relic.ts`: parsed provider member and rated result type.
- `app/profile/relic-elo-action.ts`: trusted atomic save arguments, conflict
  handling and internal confirmation of the persisted ID.
- `app/tournaments/actions.ts`: trusted registration transaction arguments and
  conflict handling, while preserving all existing registration decisions.
- Corresponding resolver, profile-action, registration-action and SQL regression
  tests, including concurrency and null legacy controls.

The profile action calls `save_relic_profile_elo_snapshot_with_identity` with
the original eight named arguments plus `p_relic_profile_id`. It requires the
returned `coh3_profile_id` to match the provider ID while preserving the previous
client-facing ELO snapshot shape.

The registration action calls
`submit_verified_player_registration_with_identity` with its original named
arguments plus `p_relic_profile_id`. Its client input and output remain
unchanged. A client-supplied Relic ID is ignored.

The resolver adds `relicProfileId: string | null` to its rated result without
changing ELO selection. Either action rejects an unavailable/noncanonical ID
before its verification writer. Both map only the fixed
`P0001`/`RELIC_IDENTITY_CONFLICT` database marker to a generic safe conflict.
An ordinary registration `23505` retains the duplicate-registration response.

## Defect reproduction

`tests/unit/lib/elo-verification/relic-identity-binding.test.ts` invokes the real
HTTP/resolver code path against an intercepted synthetic provider response. The
provider contains canonical profile ID `42` and personal-stat-group ID `7001`.
Before implementation, the ELO assertions passed and the required
`relicProfileId: "42"` assertion failed. After implementation the same regression
passes. No provider request leaves the test process and no database is used.

This proves loss before persistence and tests its correction. It does not by
itself claim an authenticated browser or real Staging account was verified.
