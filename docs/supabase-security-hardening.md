# Supabase Security Hardening

This document records the conservative A2 security boundary introduced by
`20260724090000_supabase_security_hardening.sql`. The migration must be applied
only after the matching application code is deployed or as part of the same
controlled release. It has not been applied to the linked Supabase project by
this work.

## Public view decisions

| View | A2 security mode | API grants | Intended audience |
| --- | --- | --- | --- |
| `public_player_profiles` | Owner rights (`security_invoker=false`) | `SELECT` only for `anon`, `authenticated`, and `service_role` | Public, opted-in player profiles |
| `leaderboard_current_season` | `security_invoker=true` | `SELECT` only for `anon`, `authenticated`, and `service_role` | Public leaderboard |
| `leaderboard_public_season_standings` | `security_invoker=true` | `SELECT` only for `anon`, `authenticated`, and `service_role` | Public leaderboard |
| `leaderboard_public_all_time_standings` | `security_invoker=true` | `SELECT` only for `anon`, `authenticated`, and `service_role` | Public leaderboard |

The three leaderboard views are altered in place. Their definitions, columns,
ordering, object identities, dependencies, and existing column comments are
not recreated or changed. Their public source tables retain the existing
anonymous `SELECT` grants and RLS read policies.

Both standings views join `public_player_profiles`. That nested view remains
the reviewed masking boundary, so anonymous standings continue to include only
players who enabled their public profile.

## Intentional player-profile exception

`public_player_profiles` remains an intentionally public, sanitized
owner-rights view. Converting it directly to invoker rights would make
anonymous reads fail because `players` has no anonymous table access or public
row policy. Granting direct access to `players` would be unsafe: row-level
security cannot prevent callers from selecting private base columns such as
Clerk identifiers, raw avatar paths, and unmasked Discord values.

The retained view exposes the existing compatibility contract only:

- opted-in profiles are selected;
- Discord names are returned only after the player's explicit opt-in;
- raw avatar storage paths remain `NULL`;
- Clerk identifiers and private profile fields are not projected;
- external API roles receive `SELECT` only.

Eliminating this final Security Definer View finding requires a separately
reviewed replacement. The safe options are a dedicated public projection
relation that never stores private columns, or a server-only API/loader with a
fixed output allowlist. The `/players` directory, player detail, champion
archive, avatar proxy, opt-out behavior, and anonymous leaderboard results must
all move to and pass role-level tests against that replacement before this
view can become invoker-rights or lose anonymous access.

## Tournament bracket data boundary

Direct `anon` and `authenticated` access is removed from
`generated_brackets` and `tournament_matches`, and their permissive public read
policies are dropped. Public tournament presentation now uses
`lib/tournament-bracket-data.ts`, which is protected by `server-only` and uses
the service-role client with a fixed projection.

The public projection includes only:

- generated bracket identity, bracket identity, format, slot count, and
  generation time;
- round number and display name;
- match identity, number, series length, status, public participant slots and
  registration identifiers, scores, and winner;
- public standings registration identity, wins, losses, points, and rank.

It does not select or copy `generated_by`,
`official_result_submission_id`, `official_result_decided_by`, or
`official_result_decided_at`. Unexpected extra properties are discarded while
the server rebuilds the safe response. Non-admin client props omit the three
official-result audit properties entirely.

Administrators receive audit data through a second query. That helper calls
Clerk `auth()` again, requires both a user ID and
`sessionClaims.metadata.role === "admin"`, creates its own service-role client
only after authorization, selects only the three audit columns plus match ID,
and limits the query to match IDs already present in the safe bracket result.
An audit-query failure returns no audit properties and does not widen the
public projection.

## Platform settings and protected workflows

`platform_settings` loses all direct `anon` and `authenticated` table
privileges and its public read policy. `service_role` retains explicit table
access. Existing application reads go through the server-only platform settings
module, and updates remain behind Clerk-admin-authorized Server Actions.

The authenticated admin-update RLS policy remains in the catalog but is inert
without an authenticated table privilege. Removing that policy can be
considered separately; A2 does not need it to enforce service-only access.

The capacity, ELO setting, and leaderboard mutation RPCs are also restricted
to the owner and `service_role`. Application capacity reads, ELO configuration
reads, recalculations, and adjustments already use protected service-role
clients.

This batch does not revoke the existing authenticated-administrator DML grants
or `"Admins can manage ..."` policies on the six leaderboard base tables.
Those direct table paths predate A2. The audited mutation RPCs become
service-role-only here, but a future hardening batch must separately inventory
and remove the base-table grants and policies before the leaderboard write
boundary can be described as exclusively service mediated.

The non-verified registration path inserts as `authenticated`, and its RLS
policy must read the ELO feature flag. A2 keeps that write on the existing RLS
boundary and preserves the policy's complete eligibility expression. The
policy now calls an equivalent security-definer helper in the non-exposed
`ironclad_private` schema. `authenticated` receives only schema `USAGE` and
function `EXECUTE` so PostgreSQL can evaluate the policy; the helper is not in
the exposed API schema and `ironclad_private` must never be added to the
project's Data API exposed-schema list. The public
`is_elo_verification_enabled()` RPC can therefore become
owner/service-role-only without bypassing registration-window,
identity-canonicalization, or eligibility triggers.

The schema and helper use fail-closed `CREATE` statements. An unexpected
pre-existing object with either name stops and rolls back the migration rather
than reusing an unknown owner or ACL.

## Function hardening

Direct `PUBLIC`, `anon`, and `authenticated` execution is removed from the
eight audited trigger functions. Existing triggers continue to invoke them,
and `service_role` retains explicit execution for protected workflows.

The same API-role revocation is applied to:

- `get_tournament_bracket_capacity()`;
- `is_elo_verification_enabled()`;
- `leaderboard_require_write_access()`;
- the five audited leaderboard season/recalculation/adjustment functions.

The exact zero-argument functions below receive
`search_path = pg_catalog` without replacing their bodies:

- `ironclad_set_updated_at()`;
- `is_admin_jwt()`;
- `sync_tournament_registration_enabled()`.

## Intentional RLS-with-no-policy state

These existing tables remain unchanged and deliberately deny API-role access:

- `player_notification_dismissals`;
- `player_report_group_notification_dismissals`;
- `tournament_deletion_jobs`.

They are service-role workflow tables. RLS is enabled, there are no client
policies, and application access is server mediated.

After A2, `generated_brackets` and `tournament_matches` also have RLS enabled
without client policies. This is intentional because public reads now use the
server allowlist. Security Advisor may report these five tables as
RLS-enabled-with-no-policy informational findings; adding permissive policies
would undo the boundary.

## Independent review follow-ups outside A2

The independent application review found older tournament-result DTOs that
serialize raw proof storage paths and internal reviewer or resolver Clerk IDs
to some authenticated participant clients. Signed proof URLs are required for
participant workflows, but raw storage paths and internal actor identifiers
must be split into an administrator-only DTO. The signed-out path receives no
result DTOs, and A2 does not introduce or change this behavior. It remains a
high-priority follow-up and must not be treated as resolved by the generated
bracket allowlist.

The same review found defense-in-depth gaps in existing service-role helpers:
platform-setting mutation helpers rely on their Clerk-admin-authorized Server
Action callers, and the player-dashboard helper relies on its page caller to
pass the authenticated Clerk ID. Their current callers authorize correctly,
but the helpers should eventually derive or revalidate identity internally
before creating service-role clients.

## Expected Advisor and lint state

After applying A2 to a matching database:

- the three leaderboard Security Definer View errors should clear;
- the `public_player_profiles` Security Definer View error remains as the
  documented exception;
- the three audited mutable-search-path warnings should clear;
- the three permissive public-table exposures should clear;
- the five intentional RLS-with-no-policy findings described above may remain;
- extension placement, RLS init-plan/performance findings, multiple permissive
  policy findings, shadowed variables, temporary-table findings, project auth
  settings, and platform-version findings remain outside this batch.

`supabase db lint` is supplemental and does not reproduce every Dashboard
Security Advisor result.

## Required release verification

The repository tests are mock/static contract tests. They verify application
allowlists, authorization order, payload shaping, preserved public loader
contracts, opt-out behavior, migration statements, and protected settings
actions. They do not prove deployed PostgreSQL ownership, grants, RLS, trigger
execution, or view behavior.

Before production application, replay all migrations in a disposable Supabase
instance and test as `anon`, an ordinary authenticated user, an authenticated
admin, and `service_role`:

1. Compare all four view columns, row counts, ordering, and representative
   values before and after A2.
2. Confirm anonymous seasonal and all-time standings remain populated through
   the nested player-profile view.
3. Confirm opted-out players remain absent from profiles, standings, and
   champions, Discord masking remains intact, and raw avatar paths and Clerk
   IDs cannot be read.
4. Confirm direct API-role reads of `generated_brackets`,
   `tournament_matches`, and `platform_settings` fail.
5. Smoke signed-out and signed-in `/tournaments`, `/players`, player detail,
   avatar proxy, and `/rankings` flows.
6. Confirm public bracket payloads contain no generator or audit identifiers,
   while admins retain the official-result audit display.
7. Exercise default and verified registrations, all eight affected trigger
   paths, capacity reads, platform-setting reads/updates, leaderboard
   recalculation, and admin adjustment.
8. Inspect view owners/options, table and function ACLs, RLS flags/policies,
   and rerun both Dashboard Security Advisor and linked database lint.

Deploy the application boundary before the migration or release them
together. Applying only the migration preserves the current server-side page
query, but the older page code would still serialize audit identifiers obtained
through its service-role client.
