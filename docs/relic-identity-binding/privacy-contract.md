# Verified Relic identity: storage and privacy contract

This document describes the Phase 2 identity boundary. It does not authorize or
implement a public partner endpoint, a Production write, a backfill, an account
recovery flow, or changes to registration history.

## Existing field and source authority

Reuse `public.players.coh3_profile_id` as the canonical internal Relic profile ID.
The original ownership migration already describes it as a server-authoritative
numeric COH3 Stats profile ID linked after successful ELO verification. CoH3Stats
player URLs use the Relic profile identity, not a Steam ID or a personal stat-group
ID. Do not create a parallel player-identity column.

Source: `supabase/migrations/20260629090000_coh3_profile_ownership.sql`.

An accepted binding means that the trusted server matched the exact linked Steam
identity to one provider member and retained that member's canonical Relic
`profile_id`. A display alias, a manually supplied card URL, the enclosing group
ID, and `personal_statgroup_id` are not interchangeable with that ID. Canonical
decimal text avoids application/SQL type disagreement; validation must reject
zero, signs, whitespace, leading zero variants and lossy numeric input.

The existing `players_coh3_profile_id_unique_idx` already uniquely indexes all
non-null bindings. Null legacy players may coexist. A verified duplicate must
fail rather than transfer ownership or disclose the other account. Existing
bindings must not be silently changed by re-verification. Same-ID refresh may
update ELO/faction/version/time using existing rules.

The currently deployed producer in `lib/elo-verification/relic.ts` discards the
provider member's canonical profile identity while retaining Steam-name/group
validation. `app/profile/relic-elo-action.ts` passes only rating, faction,
Division, calculation version and claim metadata to the snapshot RPC. The
snapshot RPC persists those fields without a profile ID.

## Internal authority does not imply external permission

| Account state                            | Internal binding                       | Future partner correlation                                                |
| ---------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------- |
| Active, public profile, verified binding | Retain                                 | Eligible for an explicitly allow-listed public read model                 |
| Active, private profile                  | Retain                                 | Hidden; do not correlate a known Relic ID to the private IronClad account |
| Legacy/null binding                      | Remain null until trusted verification | Unresolved; do not infer from alias, ELO or historical form URLs          |
| Closed retained competitor               | Existing closure clears the binding    | Hidden; never reconnect retained history to the former identity           |
| Fully deleted player                     | No player row remains                  | Unknown                                                                   |
| Opted-in player without verified binding | No externally resolvable binding       | Unresolved                                                                |

The internal resolver may distinguish `visible`, `hidden` and `unknown` for
trusted policy enforcement and diagnostics. An eventual external caller must
receive the same unavailable/not-found shape for hidden and unknown identities,
with no private account key, alias, existence flag or reason. An eventual cache
must be invalidated when visibility/closure changes; the endpoint and caching
implementation are later work.

Current visibility is `players.public_profile_enabled`. The public profile view
already requires it to be true and `account_closed_at` to be null. No independent
"hidden competitive identity" flag or partner disclosure consent is implemented
in the current application. Phase 2 must not invent a new opt-in or claim that an
unimplemented partner policy exists. Future public correlation must preserve at
least the existing public-profile boundary and receive a policy review before
release.

Sources:

- `app/dashboard/public-profile-actions.ts`: visibility changes only the profile
  visibility flag and revalidates existing public pages.
- `supabase/migrations/20260813101000_competition_history_safe_account_closure.sql`:
  `public_player_profiles` filters active opted-in players.
- `lib/public-players.ts`: explicit public field allow-list does not include
  Steam or `coh3_profile_id`.

## Historical competition facts remain distinct

An event registration alias is a historical competition fact. Existing public
tournament mapping can retain that alias for private active players while hiding
their profile link, country and ELO. Closed competitors display `Former
Competitor`. This does not authorize Relic-ID correlation for private accounts.
Phase 2 does not change these existing public-event semantics.

Source: `lib/tournaments.ts`, `mapPublicTournamentParticipant`.

No registration Relic-ID snapshot is needed for this canonical-binding phase.
Existing registration alias, verified ELO, Division model and player foreign key
remain unchanged. Whether a future event-level verified identity snapshot is
appropriate requires a separate retention/privacy decision; current player
correlation must not be presented as an immutable historical identity snapshot.

## Closure, reconnect, aliases and freshness

The established account-closure chain does one of two things: deletes the player
when no protected competition history exists, or retains its stable player UUID
and pseudonymizes it when history exists. The latter clears `coh3_profile_id`,
Steam ID/name, card URL, profile ELO and verification fields, disables public
profile visibility and sets `account_closed_at`. The closure wrappers also clean
their respective private operational records. Phase 2 preserves that chain and
its privileged closure exception. It must not make the binding immutable in a
way that blocks lawful closure.

Sources:

- `app/profile/delete-account-action.ts`: avatar cleanup, trusted closure RPC,
  then Clerk deletion; failures retain explicit recovery boundaries.
- `supabase/migrations/20260817120000_polls_decisions.sql`: full closure body and
  identity scrub, including `coh3_profile_id = null`.
- Subsequent closure wrappers extend operational cleanup without replacing
  competitive identity semantics.

Steam OpenID callback supports refresh of the same connected Steam identity. It
does not permit replacing an existing different Steam ID, and no normal Steam
disconnect/unlink flow exists. Do not introduce reconnect or transfer semantics.
Same-owner refresh preserves the Relic binding. Alias or profile-visibility
changes do not alter binding authority. ELO freshness is separate from stable
identity; failed/stale rating retrieval preserves the previous identity and
snapshot rather than transferring or deleting them.

Source: `app/api/steam/callback/route.ts`, same-owner refresh and
`already-connected` branches; `app/profile/relic-elo-action.ts`, failure handling.

## Server/database write boundary

Keep all canonical binding input out of client forms and mutation arguments.
Only the existing trusted provider-verification server code may supply it to a
service-only atomic database save. The owner identity, player ID, linked Steam
ID and exact claimed verification attempt must still agree at write time.

`protect_player_coh3_profile_id()` already strips/retains the field for
non-service callers. Its privileged closure exception must remain. An
application conflict check alone cannot enforce uniqueness under concurrency;
the existing database unique index remains authoritative. Trusted save logic
must reject a different existing binding before changing any ELO snapshot. A
generic safe conflict response must not expose the other player or database
error details. Diagnostic logs may identify the conflict class and internal
correlation request, but should not serialize the raw provider payload, Steam
ID, Clerk ID or another account's private fields.

Existing authenticated self-read policy is row-owned by the Clerk `sub` claim.
The canonical column is already among allowed authenticated self-read columns;
it is not part of the anonymous public projection. Phase 2 does not require new
public grants, RLS policies or public view fields. Service-role credentials stay
server-only, and any new save function must revoke execution from `public`,
`anon` and `authenticated`, pin `search_path`, and explicitly authorize the
service role.

Sources: `20260611080000_base_schema.sql` player owner policies,
`20260804090000_relic_profile_verification.sql` column grants, and
`20260813101000_competition_history_safe_account_closure.sql` protection trigger.

Registration is a second trusted ELO writer: `app/tournaments/actions.ts` calls
the provider, and `submit_verified_player_registration` updates the player's
current verified ELO in the registration transaction. A binding fix must account
for this consistency boundary without changing eligibility, approval, event
snapshots or current-registration semantics. Do not silently claim profile-save
coverage also verifies this second writer.

### Approved Staging-only atomic identity check

The user approved addressing that second writer through a narrow atomic identity
check. The reviewed migration
`20261026181023_persisted_verified_relic_identity.sql` adds two explicitly named
service-only wrappers while preserving both original RPC bodies. Each wrapper
locks and rechecks the active player, Clerk identity, linked Steam and same/null
Relic binding. The original RPC still decides rating acceptance, eligibility,
legal requirements, capacity, approval status and event snapshots.

An exact transaction-local player/Clerk/Steam/Relic context permits the original
RPC's snapshot write and the later canonical binding update. The context is
restored on normal completion and exceptions. Once a player is bound, the
existing Relic verification guard requires that context when snapshot fields
change, preventing old unchecked writers from accepting a different provider
identity. Cooldown-only, alias, privacy and same-owner Steam-name updates remain
outside that new check. Existing trusted account-closure exceptions remain.

The profile wrapper binds only after an actual successful saved snapshot; an
invalid/stale claim or zero-row save cannot bind. The registration wrapper binds
only after an actual registration ID is returned. A waitlist-confirmation prompt
is not a submission and cannot bind or update ELO. If the unique index rejects a
concurrent duplicate, the wrapper's whole transaction block rolls back the
registration, acceptance records, ELO and binding together before returning a
generic conflict. No registration Relic-ID snapshot is added.

This paragraph records source review, not a claim that Staging assertions have
passed. Those results belong in the release verification evidence. Old
application writers intentionally cannot update verification for already-bound
accounts, so any future application rollback must account for that constraint
instead of claiming unconditional old-writer compatibility.

## Backfill assessment rules

No stored current Relic raw response is retained by the existing workflow.
Relic-sourced registrations explicitly require `elo_verification_payload IS
NULL`. Legacy URLs, names, ELO or imported fixtures do not establish ownership.

Source: `20260804100000_relic_registration_snapshot.sql` complete-snapshot
constraint and subsequent unchanged snapshot semantics.

Classify each active unbound account only after authoritative evidence review:

- **A — deterministically backfillable:** a fresh exact Steam-to-provider-member
  lookup succeeds, canonical profile ID validates, ownership matches and the
  batch has no duplicate/mismatched existing binding. This lookup is a read,
  not authorization to persist a Production backfill.
- **B — re-verification required:** no trustworthy stored or fresh mapping is
  available; missing Steam or provider unavailability is not an inferred ID.
- **C — ambiguous/conflicting:** duplicate canonical mapping, member/group
  ambiguity, Steam mismatch or differing existing bound identity; manual trusted
  review is required, with no automatic transfer.

A Steam-connected count alone is a candidate count, not a proved A count.
Synthetic Staging fixtures must be excluded from a real-account assessment.
Production remains read-only; a later approved backfill must re-check ownership,
privacy/closure and conflicts at the atomic write point without changing ELO or
registration snapshots unless separately authorized.
