# Supabase Security Boundaries

Updated 8 September 2026 against the focused Phase 1 investigation and source
`112cad6fac88bead5f2e7444c9ee583a1c1032f0`. The five view definitions and ten
reviewed privileged function definitions were compared with deployed Production
and staging. This is a scoped contract, not a platform-wide security audit or
a claim that proposed fixes are already deployed. Deployment status belongs in
the release manifest; the initial environment audit is in
`poll-rpc-release-readiness.md`.

## Migration lineage

| Migration | Relevant responsibility |
| --- | --- |
| `20260724090000_supabase_security_hardening.sql` | Historical A2 server-mediated bracket/settings boundary, restricted helpers, sanitized profiles and then-invoker leaderboard views. |
| `20260806130000_phase4_withdrawal_waitlist_division_launch.sql` | Owned withdrawal/waitlist RPCs; locks, capacity/FIFO and lifecycle behavior. |
| `20260813101000_competition_history_safe_account_closure.sql` | Active opted-in profiles, closed-account masking and intentional history retention. |
| `20260813102000_phase7_public_leaderboard_integration.sql` | Current four owner-rights leaderboard views, including champions; competition facts survive optional-profile opt-out. |
| `20260817100000_authenticated_match_dice_rolloff.sql` | Participant/admin dice reads and participant-only rolls. |
| `20260817120000_polls_decisions.sql` | Private poll eligibility, ballots, sanitized public decisions and internal helpers. |
| `20260903130000_not_held_division_closure.sql` | Public-safe division closure getter and terminal-state safeguards. |

The August definitions deliberately supersede July's invoker-rights leaderboard
design. They read protected source tables directly, not through
`public_player_profiles`. Do not replay obsolete hardening instructions or
edit an applied migration. Ledger presence alone does not prove the current
definition; compare deployed bodies, signatures, owners and effective ACLs.

## Five intentional owner-rights views

All five have owner `postgres`, `security_barrier=true` and
`security_invoker=false`. The owner has `BYPASSRLS`: explicit projections and
predicates provide the public boundary, not caller RLS on base tables.
`anon`, `authenticated` and `service_role` have SELECT only; PUBLIC has no
relation grant. Effective API-role view mutation privileges are denied.

| View | Public contract |
| --- | --- |
| `public.public_player_profiles` | Only opted-in, nonclosed profiles; conditional Discord and player-ID avatar linkage. |
| `public.leaderboard_current_season` | Featured season and valid-event aggregate; public finalization/review booleans, not internal reasons, actors or membership rows. |
| `public.leaderboard_public_season_standings` | Official seasonal facts with optional-profile and closed-account masking. |
| `public.leaderboard_public_all_time_standings` | Official career facts with equivalent identity/location/ELO/avatar masking. |
| `public.leaderboard_public_season_champions` | Historical champion facts with masked profile linkage and pseudonymous private champion identifiers. |

### Profile privacy is not competition-history deletion

The profile view has exactly 12 columns: `id`, `display_name`,
`player_name`, `country`, `region`, `current_elo`,
`public_profile_enabled`, `discord_public_enabled`, `discord_username`,
`has_avatar`, `avatar_url`, `created_at`.
`player_name` aliases `in_game_name`. Rows require
`public_profile_enabled=true AND account_closed_at IS NULL`. Discord requires
explicit opt-in. Raw `avatar_url` is always NULL; `has_avatar` supports the
server-mediated player-ID proxy. Clerk IDs, email, raw avatar/proof paths,
private Steam/COH3 identifiers and administrative fields are not projected.
The opted-in profile UUID and creation date are intentionally public.

Active opted-out competitors are absent from the profile directory but remain
in official standings/champions. Their factual in-game names and statistics
remain; player IDs and optional location/ELO/avatar linkage are masked. Closed
competitors are labelled `Former Competitor`. Seasonal
`last_tournament_id` is also NULL for closed accounts; the historical
tournament title remains. Raw avatar paths are never published. Private/closed
champion IDs use `private-champion:` plus a hash of the record UUID. This is
pseudonymity, not guaranteed unlinkability from earlier public history.

Mechanical SECURITY INVOKER conversion would break legitimate reads: API
roles do not have general raw players/leaderboard SELECT access. The featured
season's membership source is owner-only. Authenticated self-profile column
reads under textual Clerk-sub RLS are not general public player access.
Granting broad base-table reads to make invoker views work would violate this
boundary. An Advisor warning alone justifies neither change.

The Phase 1 aggregate snapshot found no disabled/closed public-profile rows,
unapproved Discord values or raw public avatar URLs in either environment.
Production standings were empty, so their zero-violation counts were vacuous.
Populated staging standings/champions had matching definitions and no observed
masking violations. These observations do not replace synthetic transition tests.

## Ten reviewed privileged functions

All signatures below are in `public`. At baseline they are SECURITY DEFINER,
owner postgres, `search_path=pg_catalog`, with inherited PUBLIC EXECUTE revoked.
Two public getters allow anon/authenticated/service_role; the remaining eight
allow authenticated and owner only. A service-role client is not a drop-in
replacement for a member's identity.

| Signature | Boundary and intentional privilege |
| --- | --- |
| `get_public_tournament_decisions(uuid)` | Public getter: requested tournament, decision purpose, final published/noncancelled state. Fixed payload without voters/individual ballots; totals depend on `public_final_totals`. |
| `get_tournament_division_not_held_states()` | Public getter: bracket ID, tournament ID, closure timestamp, reason code only; no administrator/private detail/registration snapshots. |
| `get_my_community_polls()` | Active player from textual JWT sub; own frozen eligibility, published community polls. |
| `get_my_tournament_polls(uuid)` | Same identity/eligibility plus requested tournament and purpose. |
| `get_my_poll(uuid)` | Own eligible published poll or generic 42501 denial; no alternate player ID. |
| `cast_poll_ballot(uuid, integer, uuid[])` | Own eligible voter under locks; post-lock voting window, revision, options/count/duplicates/NULL validation and idempotent retries. S1 caveat below. |
| `get_match_dice_rolloff(uuid)` | Current participant or verified administrator read; fixed projection without raw Clerk IDs. |
| `roll_match_dice(uuid, integer, smallint, integer)` | Current participant, not admin shortcut; match/tournament locks, launched single elimination, active/deadline state, activation/game/tie checks and idempotency. S1 caveat below. |
| `respond_to_waitlist_offer(uuid, text)` | Ownership before/after locks; offered waitlisted state, unlaunched division and expiry; accept becomes pending, not approved; capacity/FIFO/lifecycle triggers remain. S1/S2 caveats below. |
| `withdraw_tournament_registration(uuid)` | Owned registration rechecked under locks, supported state, unlaunched division and guarded downstream effects; exit remains available without new acceptance. |

`current_poll_player_id()` and `build_poll_payload(uuid, uuid, text)` are
owner-only helpers. API callers cannot supply another identity or request an
admin projection through them. `polls`, `poll_options`,
`poll_eligible_voters`, `poll_ballot_choices` and `match_dice_rolls` have
FORCE RLS without direct API-role table access in the inspected ACLs, including
no direct service-role table access. Composite keys, constraints and triggers
protect poll/option/voter identity, revisions and dice version history.

Clerk is the session authority: use its textual sub, not UUID auth.uid() or a
client-provided player identifier. Navigation is not authorization. Keep
authentication, ownership, eligibility and lifecycle checks at every callable
mutation boundary. Fixed search_path and grants supplement caller validation.

## Targeted September corrections and explicit deferrals

The owner has confirmed current account Terms/Privacy acceptance is required
for ballot casting, dice rolls and **accepting** a waitlist offer. Withdrawal
and **decline** remain available without accepting new terms.

At baseline the website enforces this rule but the three direct RPCs do not.
S1 is an authorized separate database-hardening release, not something this
documentation or the application-only poll release fixes. Use the existing
canonical effective-document/acceptance-evidence contract; unavailable evidence
must fail safely. Never manufacture acceptances or alter legal text, versions,
effective dates or historical evidence.

S2 also requires separate verified SQL release: reject NULL, empty and
unsupported waitlist responses before mutation. The old
`p_response NOT IN ('accept','decline')` check does not reject NULL, which then
selects the decline branch. Ordinary website validation already rejects it;
ownership restrictions still apply. This is not another-user account takeover
or a proven Production incident.

S3 is specifically deferred unless individual dependency review and tests
justify revocation: TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on
`public.players` and `public.tournaments` for anon/authenticated only.
No ordinary API exploit was demonstrated. RLS does not protect TRUNCATE, but
this does not authorize blanket revocation. Any approved cleanup requires a
separate forward migration preserving required DML/column access.

The poll identity helper rejects missing or closed players before checking for
polls. An incomplete existing active profile is different. Application handling
must positively verify account state, preserve public decisions, never
blanket-suppress 42501, and retain individual-poll denial. Historical Production
log attribution remains unproven. Keep strict projection validation and bounded
privacy-safe diagnostics: never log arbitrary error objects/messages, payloads,
tokens, private identifiers or ballot contents.

## Existing server-mediated boundaries retained

July A2 bracket/settings work remains historical context, but its obsolete
leaderboard assumptions and old unresolved-review claims are not current
evidence. Public bracket data uses the server-only fixed allowlist in
`lib/tournament-bracket-data.ts`; privileged audit data needs a separate
Clerk-admin check and scoped query. Platform settings and private match proofs
remain server mediated. Check current source/deployed ACLs before changing
adjacent workflows; this focused release does not re-audit or redesign them.

RLS-enabled tables without client policies may intentionally serve only
owner/service workflows. The private ELO-policy helper schema must stay outside
Data API exposed schemas. Do not add permissive policies to remove an
informational warning. Verify effective table/column ACLs, memberships, exposed
schemas and caller context.

## Expected Advisor findings

Phase 1 rule `0010 security_definer_view` reported all five intentional views.
Rules `0028 anon_security_definer_function_executable` and
`0029 authenticated_security_definer_function_executable` reported the two
public getters and ten authenticated-callable functions respectively: twelve
function notices, ten distinct functions. They are expected while these
contracts remain intentional and protected, not a command to convert views or
revoke needed RPC access.

New unexpected grants, mutable search paths, private projections or missing
caller checks still need investigation. Database lint is supplemental, not
equivalent to every Dashboard Advisor check. No platform-wide clearance, full
auth-configuration audit or complete exposed-schema audit is asserted.

## Required verification and zero-data-loss release rules

1. Compare actual definitions, signatures, owners, search_path, view options,
   inherited PUBLIC/effective grants, column ACLs, RLS and trigger dependencies.
   Retain secure scoped pre-change definitions/ACLs.
2. Test actual PostgreSQL definitions/dependencies with synthetic local data,
   then exact allowlisted migrations in verified hosted staging. Member tests
   use authenticated role plus the intended textual-sub identity, not
   postgres/service-role calls labelled as user tests.
3. Test profiles/rankings/champions across opted-in/out/closed identities:
   conditional Discord, avatar proxy, denied raw private reads/view mutations,
   and preserved official facts despite profile opt-out.
4. Test canonical acceptance current/missing/stale/unavailable states and
   successor activation; direct RPC and website agree. Preserve decline,
   withdrawal, ownership, expiry/terminal denials, capacity/FIFO, concurrency,
   revisions/idempotency. Invalid offer inputs must not change state; admins
   gain no participant mutation shortcut.
5. Test poll full-list recovery, empty versus unavailable/partial states, each
   RPC half failing, multiple tournaments, account distinctions, malformed
   output and token/transport failure. Preserve drafts, cancel stale responses,
   prevent duplicate surfaces and clear private data on account changes.
   Redaction tests must include synthetic private values.
6. Verify staging app/database/Clerk targets and external-effect isolation
   before fixtures. No real email/push/webhook/charges, integration changes or
   Production dataset copies. Isolate task fixtures and preserve partner data.
7. Run lint, TypeScript, build, regression tests and required CI on the actual
   candidate. Fulfil human review/last-pusher gates without bypass. Record
   SHA/tree, migration checksums, affected objects, compatibility, order and
   recovery conditions.
8. Before Production, reverify target/candidate/pending migrations and exact
   top-level SQL. Only narrow forward definitions and justified grants: no
   business-data rewrite, destructive DDL, resets, backfills or cleanup.
   Existing mutations inside a replaced function body are not executed by
   CREATE OR REPLACE, but must retain their reviewed invariants.
9. Verify available backup capability without changing it; a platform feature
   or WAL-G flag does not prove a usable backup. Record important table
   counts/state aggregates before/after Production. Investigate unexpected
   decreases using timestamps/audit context without exporting private data or
   repairing business records.
10. Production smoke tests are read-only after source-side-effect review.
    Verify both domains, source/environment, definitions/ACLs and bounded logs.
    Empty polls/inaccessible logs cannot prove error elimination. A compatible
    application rollback does not undo SQL; never automatically restore
    acceptance bypasses or NULL-decline behavior. SQL correction needs a tested
    explicit forward migration; destructive recovery needs separate approval.
