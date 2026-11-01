# Patch 2.0 Phase 1 — local review package

Status: local code and migration draft only. Nothing pushed, merged, deployed,
provisioned, or applied to a remote database. No Production environment files
were copied. No registrations were deleted, reset, or reassigned.

## Baseline and ownership

- Refreshed `origin/master` with `git fetch origin master`.
- Production source: `ad3eb5b7aee24878252b52bb483d14adf488764c`.
- Read-only Vercel lookup confirmed that commit serves the Production domain:
  `dpl_7bpukSEUqCWAZWV7jt8F4YGS5LxB`, READY.
- Branch: `feature/patch2-tournament-registration-separation`.
- Worktree: `ironclad-patch2-phase1`.
- Root agent owned mutation contracts and the single migration. Separate agents
  owned scoped read/UI and compatibility links/tests. No simultaneous edits to
  the same application file were allowed.
- Existing worktrees were inspected and left alone. Unfinished announcement
  documents, partner verification evidence, data-centre audit material and the
  championship-path migration belong to other work. Partner APIs (#152), public
  profiles/history and homepage changes are already in this baseline.
- The divergent Staging branch was not merged. No commit was created.

## Changes

The existing tournament workspace now contains all six registration statuses.
The former global registrations route is an authorized tournament chooser or
an exact legacy-link resolver, not an aggregated operational list.

The server scopes summary rows, complete counts, filters, pages and direct
details to the tournament. Rich records are fetched 25 at a time. Narrow summary
reads advance by the actual returned length, so provider row limits cannot
silently truncate counts or FIFO position inputs. Header summaries reuse this
request-local projection. Ordering is `(created_at, id)`.

Every form carries tournament, section and page context. Missing context fails
with guidance, rather than granting an old form global authority. Selections
and menus reset on tournament, filter, page or status revision changes.

Single and bulk decisions use new service-role-only scoped wrappers around the
unchanged `review_tournament_registration(uuid,text,text)` authority. A bulk
selection is validated in full before any writes and revalidated under locks.
Domain failures on a valid selection retain the existing partial-approval
behaviour. Capacity, eligibility, ELO, waitlist and roster rules are not rewritten.

The unused exported deletion action is retained for old forms but now fails
without deleting any registration. There is no delete control in this workspace.
This removes a broader, hidden cleanup capability: the old action could physically
delete rejected/withdrawn records without competitive references. The existing
`registrations_protect_history_delete` database trigger already prevents deletion
for an existing tournament, so the practical removed capability is orphan/unassigned
terminal-record cleanup. This phase adds no database deletion ban. Supported
rejection and player withdrawal remain unchanged and retain their historical rows.

Old links resolve from the selected registration's stored tournament association.
Missing associations are not guessed. Notification changes are confined to
registration destination links; inbox read/delete, assistance and translation
behaviour are unchanged. Player registration, chat, result, deadline and replay
implementation files are unchanged.

Summaries and pages are separate statements. Changed totals, page membership,
statuses, bracket associations, chronology or waitlist-offer state fail closed
with retry guidance. Each returned page slice must match the complete summary,
including at provider-cap boundaries. This is not a database-wide transactional
snapshot; private notes may change between reads. Mutation scope remains checked
independently under database locks.

## Migration: prepared, not remotely applied

`supabase/migrations/20261101220837_patch2_scoped_registration_review.sql`

Created using `supabase migration new`; contains only two new functions and
their ownership/grants. No existing function signature, table, record, index or
trigger is replaced. Both wrappers use `search_path=pg_catalog`, verify the
service role, lock brackets before registrations, and reject foreign/missing
targets. No player/anonymous execute grant is added.

The file was applied twice only to fresh disposable local PostgreSQL 17 clusters
to verify repeatability. It has NOT been applied to Staging or Production.
The application fails closed if these functions are missing; there is no fallback
to the unscoped mutation.

## Read-only Staging evidence and release blockers

Staging deployment `dpl_75t8GGqrjXr5TvbyCYGrESMqbccP` is READY at
`c21a23855df61e953b89ee798a6962a3b823bd74`. Separate databases are healthy:
Production `nsyjtqpvyxlzyujlbzos`, Staging `zzbnneprhjicmajpjkdg`.

The live review authority is identical in both (definition MD5
`8f739a2586d19db6ae660005076b6ce4`), with effective EXECUTE denied to anon and
authenticated and granted to service_role. Waitlist response/expiry, withdrawal,
availability and the identity-aware submit wrapper also match. Some raw function
digest differences are whitespace only. Semantic differences remain in base
submission, synthetic fixture eligibility and deferred acceptance guards.

Registrations have the same 40 columns, eight indexes, grants and ownership
SELECT policy. Staging adds a legacy-transition trigger and allows v1/v2 fixture
provenance where Production allows v1. Bounded aggregates found no missing or
mismatched tournament/bracket associations. Neither environment currently covers
manual_review, so real acceptance needs deliberate isolated fixtures.

Ledgers have 164/165 entries, but 15 Production and 16 Staging entries differ.
Canonical launch ordering has different ledger versions. Staging has Academy
and four-division fixture/authority entries; Production has its own bootstrap,
legacy Main/Pro, retention, highlights and competition authority entries. Recent
announcement, championship-path, Relic identity and public-profile features also
have environment-specific timestamps. Do not run wholesale `db push`, assume
count equality proves parity, or replay all Production migrations into Staging.

Both projects have separate private match-proofs and player-avatar buckets. This
does not establish that a future Preview uses those buckets. Clerk key names
exist, but matching test public/secret keys and the accepted issuer were not
attested. No secret values were decrypted or printed.

Staging has email/push credentials, active five-minute email dispatch and active
deadline/waitlist/result jobs. Vault worker configuration names exist. Effective
worker destinations, disabled/allowlisted email behaviour and distinct push
credentials/subscriptions were not verified. Email allowlisting does not isolate
push. Avoid hosted mutations that could enqueue delivery until verified.

The Phase 1 branch has no branch-specific environment entries in the inspected
metadata. The broad inventory truncates, so inherited defaults cannot be assumed
absent. Existing preview guards intentionally reject this branch. They were not
relaxed. A separate non-secret resource attestation is required before changing
that guard or releasing to a hosted test environment.

## Safe local verification

Independent review completed for the actual diff, database wrappers and callers.
One pagination snapshot finding was fixed; the reviewer verified the correction.
The new race tests plus existing component tests passed (29 checks); TypeScript
and targeted lint passed again. Unchanged full-suite, database, build and browser
results below are reused rather than repeated for this two-file correction.

Run from this worktree:

```text
node scripts/patch2/verify-local.mjs test
node scripts/patch2/verify-local.mjs lint
node scripts/patch2/verify-local.mjs typecheck
node scripts/patch2/verify-local.mjs build
node --test tests/patch2/network-guard.test.mjs
node scripts/patch2/verify-local.mjs browser --config tests/browser/match-result/playwright.config.ts
node scripts/patch2/verify-local.mjs browser --config tests/browser/match-room/playwright.config.ts
node scripts/patch2/registration-db-test.mjs
```

The verification launcher refuses environment files, gives child processes only
inert CI identities and loopback Supabase configuration, and preloads a guard
blocking non-loopback fetch/TCP/TLS connections. Vitest also uses MSW with
unhandled requests denied. Build output and dependencies are local/ignored.

The optional DB runner uses workspace-local native PostgreSQL tools and pg
client under the neighbouring release-execution-tools directory. It creates a
new UUID-named cluster under `.release-local`, binds only 127.0.0.1:56732,
uses an ephemeral password and explicit connection settings, and stops in
finally. It does not consume a caller's database URL or application credentials.

Forty local DB checks passed, including permissions, same player/two events,
mixed/missing targets, bounds, chronological ordering, all statuses, actual
review authority guards and concurrent context changes during a lock wait.
The legacy authority definition remains unchanged. This minimal fixture does
not load the full capacity/ELO/FIFO/consent/notification/match/RLS/Storage/Clerk
stack; it is not full Supabase acceptance evidence.

Validation results on 2 November 2026:

| Check | Result |
| --- | --- |
| Full Vitest suite | 389 files / 4,929 tests passed |
| Latest focused action/link/workspace checks | 6 files / 93 tests passed, including the two final UUID/link regressions |
| Network-denial self-tests | 7 passed |
| Disposable PostgreSQL authority checks | 40 passed; migration repeated successfully; cluster stopped |
| TypeScript | Passed with `--noEmit --incremental false` |
| ESLint | Passed, zero errors; two existing unused-variable warnings in unrelated public-profile rehearsal tooling |
| Production-mode local build | Passed using inert configuration and blocked external Node networking |
| Result/replay browser fixtures | 7 passed |
| Chat/assistance/replay-draft browser fixtures | 17 passed |
| Diff whitespace check | Passed |

Initial sandboxed browser runs completed assertions but stalled during Windows
process-tree cleanup. Only those identified Phase 1 verifier trees were stopped.
Reruns with local process-cleanup permissions exited successfully; the same
dummy credentials, loopback fixtures and Node network guard remained in place.
No unrelated process was stopped. Real Clerk sessions, cross-deployment open
browser sessions and hosted Supabase behaviour have not been exercised here.

## Before a test-environment release

1. Recheck Production source and parallel-work ownership.
2. Attest the exact Preview branch/commit, Staging key/project binding, matching
   Clerk test instance/issuer, private storage, disabled outbound delivery and
   isolated worker destinations. Keep the existing block until this passes.
3. Review only this additive migration against fresh dependency definitions and
   ledger evidence. Obtain separate authorization before any remote application.
4. Prepare isolated unlaunched fixtures for two tournaments, the same player,
   every status, pagination, old links and old forms; account for active jobs.
5. Rehearse permissions, capacity/FIFO races, eligibility, roster locking,
   notification production and the original player/match/replay/deadline flows.
6. Preserve old RPC signatures and deploy migration before the new application
   only through an approved release procedure. No remote release is authorized
   by this local review package.

Rollback keeps the old authority and all records. Returning to the prior app
does not require a database downgrade; the new wrappers can remain installed.
Never restore a database snapshot over registrations submitted since release.
