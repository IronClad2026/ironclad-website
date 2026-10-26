# Phase 2 — persisted verified Relic identity binding

## Status and scope

**Phase 2 Staging acceptance: GREEN.** Real hosted provider verification,
same-identity refresh and registration through the identity-aware writer have
passed. The disposable registration/event were removed through the existing
guarded deletion RPC; the user explicitly approved retaining normal private
legal, notification and deletion receipts. Production promotion remains
unauthorized and has not occurred.

The Production candidate below remains uncommitted and excludes temporary
diagnostics and Staging synthetic adapters. Staging application commit
`5f4fcab76b8a53604a34feb6bfc496206221891f` is deployed as Preview only; no
Production deployment, migration, backfill, partner endpoint or master merge
was performed. Earlier audit observations below retain their original dates.

Worktree: `ironclad-relic-binding`; branch:
`feature/persist-relic-profile-id`; base:
`e104e9ee512fd2f775ab3605a75e977110f2864f`.
Production project: `nsyjtqpvyxlzyujlbzos`; Staging:
`zzbnneprhjicmajpjkdg`. Fresh remote refs were fetched before implementation.
The existing Phase 1 function was inspected only; its hash remains
`da46de3f814689ac8a337f3df237a64e` in both databases.

The user separately approved passing the already trusted provider ID into the
existing registration transaction with a narrow atomic duplicate/mismatch
check. No ELO, Division, approval, capacity, waitlist, launch or registration
snapshot rule was changed.

## Root cause and identity authority

The existing Relic resolver checks the exact server-loaded `/steam/<id>` member
and personal-stat-group relationship, then selects its highest eligible 1v1
rating. It discarded the member's `profile_id`. Neither the profile snapshot
RPC nor the independently verified registration RPC accepted that ID.

The canonical source is **member.profile_id**, not group.id,
personal_statgroup_id, alias, card URL or user input. The initial focused HTTP
resolver test reproduced this loss: ELO succeeded but the required ID was absent.
The original Staging claim/save RPC reproduction likewise saved ELO while
leaving the ID null; all fixture writes were rolled back.

Reuse `public.players.coh3_profile_id`, nullable TEXT. Its original migration
already intended server-verified COH3Stats/Relic identity ownership. Canonical
text is a positive decimal without signs, leading zeroes or whitespace. Safe
numeric provider values are converted to text; unsafe JSON numbers are rejected
instead of rounded. Decimal string values are retained without lossy conversion.

## Database change

Staging migration receipt:
`20261026181023_persisted_verified_relic_identity`.
The CLI-created local migration was renamed to match this receipt; its SQL was
not changed after application. Staging now has 164 migration receipts;
Production remains at 162. Existing historical migration-name/receipt
differences were not repaired or included in this work.

The migration:

- Adds a validated positive-canonical CHECK; null legacy accounts remain valid.
- Retains the existing unique partial Btree index
  `players_coh3_profile_id_unique_idx`; no duplicate identity column/index.
- Adds service-only profile and registration `*_with_identity` wrapper RPCs.
- Adds two private helper functions for row-lock/ownership validation and
  transaction context validation; no API role can execute them directly.
- Tightens the two existing player guards to prevent binding overwrite and
  unchecked ELO refresh on already-bound identities. Existing invoker/definer,
  owner, ACL and safe search-path properties are preserved.
- Documents the internal binding's semantics on the existing column.

The original eight-argument profile and twenty-argument registration function
definitions are byte-for-byte unchanged. No new trigger, registration field,
registration snapshot, table, public policy or grant was added.

The wrappers authenticate the trusted server role, lock and recheck the same
active player/Clerk/Steam tuple, reject conflicting ownership, install scoped
transaction context, and call the original RPC. A null binding is established
only after actual success. An existing identical binding is accepted. A changed
binding is rejected. The database unique index resolves concurrent duplicate
ownership. The exception boundary covers the entire operation, including prior
ELO/registration/legal writes, and rethrows a generic identity conflict only for
the identity index. Ordinary duplicate-registration errors retain their meaning.

Profile stale claims/identity races return no saved row and do not bind.
Registration capacity-confirmation prompts return the original result without
binding or ELO mutation. Existing cooldown-only claims remain permitted.

## Privacy and historical compatibility

See [privacy-contract.md](privacy-contract.md) for source locations and policy.
Internal binding is not external visibility permission. A future partner read
must require a public, active account and an explicit field allow-list. Hidden
and unknown identities must produce the same external unavailable response.
Alias changes, private-profile toggles and ELO staleness retain the binding.
The supported same-owner Steam refresh remains unchanged; no new disconnect or
transfer/recovery flow was created. Existing account closure may clear identity,
Steam and ELO while preserving anonymized competitive history.

No historical Main / Pro record, current four-Division record, competition
ownership or tournament/result authority was changed. No registration Relic
snapshot was added. Future historical correlation must not infer identity for
closed/unbound players from aliases or ELO.

## Existing-player backfill assessment

Production read-only aggregate: 37 players, 35 Steam-connected, 34 verified-ELO,
zero persisted Relic IDs; zero duplicate non-null Relic/Steam groups.

| Classification                               | Confirmed count | Meaning                                                                            |
| -------------------------------------------- | --------------: | ---------------------------------------------------------------------------------- |
| A — proven from stored authoritative mapping |               0 | No stored canonical provider evidence can reconstruct the binding.                 |
| B — fresh verification/provider proof needed |              37 | 35 linked-Steam candidates; 2 must first connect Steam through the supported flow. |
| C — stored ambiguous/conflicting binding     |               0 | No stored conflict observed; fresh-provider outcomes remain untested.              |

These counts do not claim all 35 Steam candidates have been looked up or can be
silently backfilled. Existing raw provider snapshot and legacy profile URL
sources provide no reliable stored canonical mapping. No Production provider
batch or identity backfill was executed. Future deterministic backfill needs
fresh exact-Steam provider proof, conflict handling, privacy checks and separate
approval. No alias inference is acceptable.

## Executed validation

- `npm run lint`: exit 0.
- `npx tsc --noEmit --incremental false`: exit 0.
- `npm run test -- --reporter=dot`: exit 0; **376 files / 4,431 tests passed**.
  This includes protected authentication/Steam/profile/registration, Division,
  tournaments, brackets, results, replay, Career History and privacy suites.
- Focused resolver/profile/registration suites: 207 tests passed; three adapted
  current-call-site contract suites: 38 passed. The initial failing identity
  regression now passes.
- `git diff --check`: exit 0. New test/docs use cached Prettier; no whole-file
  formatting of existing large components was introduced.
- `tests/database/persist-relic-profile-id.sql`, executed on verified Staging
  with origin-mode triggers: **76 assertions passed**. All **67 permanent
  tables** retained identical fingerprints after fixture subtransaction rollback;
  outer transaction also rolled back. No fixture rows remain.
- Staging pre-migration/post-test 14-table aggregate fingerprints are identical.
- Service-only RPC access, actual authenticated-client denial, canonical CHECK,
  unique index, closure boundary, stale claims, same-ID/new-ELO/alias refresh,
  duplicate/mismatch rejection, ordinary approval and immutable event snapshot,
  eight-slot capacity, waitlist prompt/confirmation and no automatic launch
  were verified in SQL.
- Old profile and registration writers reject unchecked updates on bound
  accounts; old null-binding legacy verification remains compatible. Context
  is restored after successful and failed calls.
- Staging security-advisor findings are unchanged: 49 RLS-without-policy info,
  6 definer-view, 6 anon-callable and 36 authenticated-callable definer notices.
  None references the new service-only wrappers. No unrelated policies changed.

Two initial SQL fixture attempts correctly failed on existing setup guards
(exact Division ELO rule text, then opening registration only after a Division
exists). Both rolled back. The fixtures were corrected; no application or
database rule was relaxed to pass tests.

The default `npm run build` could not resolve the existing dependency junction
outside Turbopack's filesystem root. `npm run build -- --webpack` compiled and
completed TypeScript, then failed page-data collection because this isolated
worktree has no `NEXT_PUBLIC_SUPABASE_URL`. A build using only the repository's
existing dummy local test environment **passed** (exit 0), and is recorded
separately in verification.json.
No credentials were copied or configuration changed to bypass those checks.

Real external-provider HTTP, Steam OpenID, signed-in browser onboarding and
multi-session race/load tests were **not** executed. Database index collision
and transaction rollback assertions were executed; they are not described as
a multi-session concurrency test. No Staging application deployment occurred.

## Lookup performance

Inside the rollback-only fixture, a successful canonical-ID lookup naturally
used `players_coh3_profile_id_unique_idx`: one row, planning **0.021 ms**,
execution **0.014 ms**. A separate forced-index availability check also passed.
No additional index or premature optimization was needed. These are small
Staging-data measurements, not a Production load-test claim.

## Live HOLD THE LINE safety

Read-only Production observations: 2026-10-26 17:56:58Z to 18:13:32Z.

| Division  | Approved before → after | Pending before → after |
| --------- | ----------------------- | ---------------------- |
| Academy   | 1 → 1                   | 0 → 0                  |
| Challenge | 4 → 4                   | 0 → 0                  |
| Main      | 1 → 1                   | 1 → 1                  |
| Pro       | 2 → 2                   | 1 → 2                  |

Total registrations/unique players: **10 → 11**. Approved: **8 → 8**;
pending: **2 → 3**. One legitimate pending Pro registration was created at
18:09:20Z. Its associated player is the only updated player and the only new
verified-ELO timestamp in the window. The original ten registration rows retain
the exact pre-work fingerprint `d5149013d27aaf180b3d0315f22a0445`.

Tournament remains registration_open/enabled; all four Divisions remain
unlaunched, capacity eight. HOLD THE LINE brackets, rounds, matches, completed
matches, official results and report/evidence counts remain zero. Tournament
and Division fingerprints are unchanged. Twelve other complete competition
table fingerprints are unchanged, including all historical result/evidence and
championship records. All 383 Production function hashes/ACLs are identical.

The final read-only recheck at 18:20:02Z returned the same post-work registration,
table and function fingerprints; no additional change was observed.

Production identity aggregates remain 37/35/34/0 (players/Steam/ELO/Relic), with
zero duplicate identity groups. Every Production statement issued for this task
was inside an explicit READ ONLY transaction. **No Production write, migration,
backfill, application deployment or competition mutation was performed.**

## Exact local file scope

Application:

1. `lib/elo-verification/relic.ts` — retain trusted canonical provider identity.
2. `app/profile/relic-elo-action.ts` — atomic identity-aware save/internal check.
3. `app/tournaments/actions.ts` — approved narrow identity-aware registration.
4. `components/RelicEloVerificationCard.tsx` — one existing safe translation mapping.
5. `components/TournamentsExperience.tsx` — one equivalent result mapping.

Tests:

6. `tests/unit/lib/elo-verification/relic.test.ts`.
7. `tests/unit/lib/elo-verification/relic-identity-binding.test.ts`.
8. `tests/integration/profile-relic-elo-action.test.ts`.
9. `tests/integration/relic-registration-action.test.ts`.
10. `tests/integration/relic-registration-migration.test.ts`.
11. `tests/integration/phase15a-consent-discord-migration.test.ts`.
12. `tests/integration/staging-synthetic-uat-fixture-migration.test.ts`.
13. `tests/database/relic-identity-binding-reproduction.sql`.
14. `tests/database/persist-relic-profile-id.sql`.

Migration:

15. `supabase/migrations/20261026181023_persisted_verified_relic_identity.sql`.

Documentation:

16. `docs/relic-identity-binding/proposed-change.md`.
17. `docs/relic-identity-binding/privacy-contract.md`.
18. `docs/relic-identity-binding/verification.json`.
19. `docs/relic-identity-binding/phase2-report.md`.

No new dependencies, environment-variable keys or secrets. The two component
changes add no UI/layout/hook behavior; React quality review found no new issue.
No CoH3Stats files/branches/PRs, IronClad frontend design, deployment settings or
unrelated database authority were changed.

## Remaining work and future Production plan — not executed

1. Signed-in Staging acceptance is complete; see the final acceptance record
   below. Retain real-account browser evidence separately from rollback SQL
   fixtures. Do not promote the Staging branch or its temporary diagnostics.
2. Review this exact branch/migration. After separate approval, capture fresh
   Production baselines and verify both existing guards/old RPCs, uniqueness,
   null compatibility and migration preconditions have not drifted.
3. Promote only this exact additive migration and both application writer
   changes together. Use the established scoped release workflow; do not run a
   blanket migration push to repair unrelated historical receipt differences.
4. No bulk identity backfill. New supported verification establishes bindings.
   After deployment verify permissions, canonical/duplicate counts and live
   competition fingerprints with read-only queries.
5. Roll back application routing only to code that retains the new wrappers.
   Already-bound accounts intentionally reject old unchecked writers. Do not
   silently restore an old application, clear bindings, relax guards or delete
   migration history. Prefer a reviewed forward repair; any restoration must
   explicitly preserve existing bindings and their authority.

Do not begin CoH3Stats APIs/read models or Production promotion without separate
explicit approval. Phase 1 remains untouched. The live tournament takes priority
over integration readiness.

## Final hosted Staging acceptance — 2026-10-26 UTC

- The first real profile verification established the canonical provider ID;
  an independent Steam-matched provider read confirmed it. The later normal
  same-identity refresh completed visibly in 5.7 seconds without a behavioral
  patch. The earlier one-off delayed response remains an unattributed,
  non-reproduced transient; it is not a remaining release blocker.
- The actual signed-in registration UI submitted a genuine provider-backed
  entry to the disposable `phase2-relic-registration-acceptance-20261027` event.
  Fixture setup reused the existing database-test row pattern with every
  normal trigger enabled: current four-Division model, Academy enabled,
  capacity eight, no prizes or storage objects. This was direct Staging
  fixture setup, not a normal admin creation operation; the unchanged
  `save_tournament` ranked-cycle guard was not altered or exercised.
- PostgreSQL statement telemetry records one PostgREST invocation of
  `submit_verified_player_registration_with_identity`, returning one row in
  24.91 ms. The UI reached `Registration submitted` / `Pending Admin Review`,
  with no stuck pending control or browser error.
- Canonical Relic and Steam bindings were unchanged. Fresh provider ELO and
  event snapshot were 824, US Forces, Academy, `relic-highest-1v1-v2`.
  Registration retained existing pending-review semantics. No approval,
  bracket generation, automatic launch, match, result or evidence occurred.
- Existing `delete_tournament_data` removed exactly one pending registration,
  one Division and its disposable event. All storage manifests were empty.
  The original four registration rows regained their exact fingerprint.
  One immutable consent receipt, one normal in-app notification history row
  and one empty cleanup-job receipt remain private in Staging as approved.
  Automatic approval review rejected deleting the cleanup-job receipt; it
  was retained. No legal-maintenance bypass or receipt rewrite occurred.
- All 67 tables were fingerprinted. The 63 unrelated tables, including all
  tournament/registration/competition/ranking/badge tables, match their
  original contents. Only the selected player's ordinary verification
  timestamp/update state and the three approved receipt/history tables differ.
  Other players' row hashes are unchanged. Zero duplicate Relic or Steam IDs,
  invalid IDs or orphan registrations remain; both wrappers are service-only.
- Staging focused validation: 287 tests across nine files; lint, TypeScript
  and diff checks passed. The repeated rollback SQL contract passed all 76
  assertions, retained normal triggers and restored all 67 table fingerprints.
  Waitlist/conflict/private-account cases remain automated/database coverage;
  no additional genuine-account conflicts or capacity fixtures were fabricated.
  Final candidate-native validation also passed 264 tests across nine files,
  lint, TypeScript and diff checks; the Staging-only helper suite was excluded.
- Production read-only snapshots at 20:54:56 and 21:12:42 UTC match exactly:
  12 registrations / 12 unique players; approved Academy 1, Challenge 4,
  Main 2, Pro 4; one pending Main. All Divisions unlaunched; zero brackets,
  rounds, matches, results or evidence. Phase 1's hash is unchanged and both
  Phase 2 wrappers remain absent. This acceptance issued zero Production writes.

Sanitized full commands, screenshots, hashes, SQL and cleanup evidence are in
`C:/Users/pc/AppData/Local/Temp/ironclad-relic-registration-acceptance-20261027/`.
Temporary timing diagnostics remain confined to the Staging branch. Only the
two permanent deferred-response completion tests were ported to this candidate;
no Staging synthetic test or application adapter was copied.
