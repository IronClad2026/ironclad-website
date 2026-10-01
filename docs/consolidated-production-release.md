# Consolidated Production release candidate

**PRODUCTION NOT YET AUTHORIZED. CURRENT LIVE TOURNAMENT MUST FINISH BEFORE RELEASE.**

This is a prepared procedure, not a Production execution record. No command in the new release CLI connects to a database, deploys an application, publishes legal authority, changes a flag, or sends a message. An offline GO is never release authorization. The final user instruction must explicitly authorize the exact approved candidate, Production target, migration package and legal publication plan.

## Pinned authority and evidence labels

VERIFIED SOURCE: Production base is `0114b1c9f4908c0f8a0e43cfa7a25fb96d361fd1`; approved Staging source is `17979c40c7e9bee154dbc9c9a98bcbb9b36152cb`. The branch is `release/consolidated-production-2026-10`, based on Production. The candidate SHA is resolved only after its final commit and recorded in external exact-head evidence. A placeholder, branch name, latest build, or earlier successful run does not bind the final candidate.

USER MANDATE: Production `ironclad-v2` (`nsyjtqpvyxlzyujlbzos`) and Staging `ironclad-staging` (`zzbnneprhjicmajpjkdg`) retain permanently separate users, identities, application data, media and histories. Approved code and forward schema changes may move; application rows and credentials may not. No Production PII may become a Staging/local fixture.

VERIFIED SOURCE: The five pre-deployment forward migrations preserve the existing application signature while adding explicit versioned authority. A separate post-deployment guard retires old-signature new creation only after application/legal verification, retaining historical edits. UNVERIFIED UNTIL FINAL PREFLIGHT: the later real tournament/season state, absence of schema drift, actual deployment/environment configuration, exact-head CI, real backup/restore evidence, and provider provisioning. A synthetic test pass is evidence about the tool or rehearsed scenario, never evidence that real Production is terminal.

EXPECTED DEVELOPMENT DRIFT: the approved feature/schema extension. POTENTIAL RELEASE RISK: a partial legacy official season, any unexpected live catalog/ledger drift, incomplete results/accounting, unverified backup/restore, or an unbound candidate. Release intent for any other difference is UNVERIFIED; do not label it intentional merely because it occurs in Staging.

## Feature, preservation and exclusion mapping

| Approved change | Candidate paths/contract | Production preservation |
|---|---|---|
| P01 Player Showcase | `lib/player-showcase/`, `components/showcase/`, dashboard/admin showcase actions, first forward migration | Switch initially OFF; prepared explicit final activation ON after app/legal/guard/history verification; genuine profile/Clerk ownership; no imported showcases or identities |
| P02 Combat Highlights | `lib/combat-highlights/`, `components/combat-highlights/`, `workers/combat-highlights/`, second forward migration | Application/provider/SQL enablement OFF; independent future Worker/R2/signing/origin contract; no Staging resource reuse |
| P04 CoH3/Relic news | `app/news/`, `lib/news/`, `components/news/` | Official-source read/projection; independent tournament functionality |
| P03.1 Realtime invalidation | `components/useMatchRoomRealtime.ts`, `components/MatchRoom.tsx`, third forward migration | Private generation-scoped invalidation, unchanged server authority, reconnect/fallback polling; existing retention/privacy preserved |
| Dashboard/Career and Performance Phase 1 | `lib/player-dashboard.ts`, `components/dashboard/`, navigation/dictionaries, parallel public leaderboard loads | Production dashboard/tournament poll `initialSnapshot` recovery wiring survives; no history reconstruction |
| Four future divisions | `lib/division-model.ts`, tournament loaders/admin editor/actions, registration/profile ELO, fourth/fifth forward migrations | Existing tournaments are `legacy_three_v1`; source v1 ELO snapshots retain meaning; new saves explicitly `four_division_v1`; unknown models fail closed |
| Scoring and badge compatibility | `lib/leaderboard/public.ts`, `lib/badges/authority.ts`, leaderboard/career views | Legacy `main` accounting remains combined Main / Pro; future Main is `main_progression`; Pro is `pro`; existing awards/evidence remain immutable |
| Rulebook/PPA 3.2 and PDF delivery | `scripts/consolidated-legal/publication.mjs`, `content/production-four-division-legal-release.json`, corpus/delivery files | Privacy 1.3 and Terms 1.1 exact authority preserved; old PDF bytes/acceptances retained; stable authority URLs remain distinct from verified PDF download URLs |
| Release safety | `scripts/consolidated-release/`, `tests/consolidated-release/`, `scripts/consolidated-db/` | Offline tooling, read-only aggregate fingerprints, exact-head gates, no Production mutation executor |

Excluded: Staging migration ledger replay; fixture users/emails/passwords/UUIDs/Clerk IDs; synthetic registration and ELO adapters; synthetic consent exceptions; UAT tournaments/brackets/results/rooms/replays/points/seasons/badges/notifications/legal acceptances/media; fabricated legacy transition events; Staging Privacy 1.2; Staging Worker/R2 endpoints and secrets. Schema-only catalog snapshots and deterministic synthetic tests are permitted tooling inputs; they contain no exported application rows.

## Forward database package

The sole migration owner prepares `scripts/consolidated-db/package.mjs` and checksum manifests. Apply these five pre-deployment files atomically, then the separate reviewed old-creation guard after application/legal postconditions. Never replay the Staging ledger:

1. `20261001032942_production_showcase_authority.sql`: optional showcase tables/functions/RLS, OFF by default.
2. `20261001032957_production_combat_highlights_authority.sql`: media metadata and private upload/moderation authority, OFF by default; no provider provisioning.
3. `20261001032959_production_private_match_room_realtime.sql`: private invalidation authorization and generation compatibility; preserve message/privacy/retention authority.
4. `20261001033000_production_versioned_competition_authority.sql`: immutable event model and explicit new save signature; genuine model-specific Relic registration/profile evidence.
5. `20261001033001_production_versioned_accounting_badges.sql`: legacy/future accounting families, official-season projection and badge compatibility.

The mandatory sixth file is `20261001040810_production_retire_legacy_creation.sql`, bound by `scripts/consolidated-db/post-deployment-manifest.json` (normalized source SHA-256 `d21fcc5f035773bf941b63066badc2f7dcc3a11caa2f3f02af2aa55bc1c612b4`). `scripts/consolidated-db/post-deployment.mjs` builds one separate atomic post-deployment transaction containing this guard, its ledger entry and approved `player_showcase` activation ON. It requires exact target/candidate/deployed-app session attestation, exact applied five-file SQL, exact activated legal successors, and both optional switches initially OFF. It preserves old legacy edits, keeps Highlights OFF, and must run before unfreeze. The generator has no network/client and does not execute its SQL.

VERIFIED SOURCE: the package builder binds all five checksums, the verified 153-entry predecessor ledger, and normalized public/private function catalog. A discrepancy stops execution. The old 19-argument `save_tournament` remains available; the new 20-argument signature has no default ambiguity and requires four divisions for new events and the persisted model for edits. Existing tournament metadata defaults to legacy during the DB-before-application interval. Existing seasons remain `main`. No season is fabricated/finalized, and no existing row is reclassified as future Main/Pro.

Build one atomic transaction from the reviewed package; do not execute the five files independently or substitute `supabase db push`. Full success is recorded with exact migration statements/checksums. A retry may skip only an exact fully applied five-file ledger with verified postconditions; no guessed continuation from a partial/mismatched ledger. A transaction failure must leave schema/ledger/history unchanged. All package replay, retry, injected failure, permission and concurrency evidence comes from disposable synthetic environments and must pass at the final candidate head.

The mandatory hosted rehearsal uses the exact `supabase/postgres:17.6.1.127` image for PostgreSQL and its seven real extensions. A separately digest-attested `node:22.12.0-bookworm-slim` sidecar shares only each matching database container's network namespace, keeping the client endpoint at literal loopback. Node runs unprivileged with a read-only root and exact read-only checkout/client mounts, no published ports or capabilities, and bounded non-executable scratch storage. Complete seeded-before and candidate-after archives must restore with identical schema, owners, grants, rows, sequences, roles, memberships and extension inventories; a native compatibility pass cannot substitute for this CI proof. Relation permissions compare effective PostgreSQL ACLs: a NULL catalog ACL assumes `acldefault('r', owner)`, so an explicit identical default-owner grant and an implicit default are equivalent. Ownership, grantor, grantee, privileges and grant options remain checked; the complete normalized schema dump is still independently compared.

## Offline checks and final read-only SQL

Preparation commands from the candidate root:

```text
node scripts/consolidated-release/cli.mjs check-source
node_modules/.bin/vitest run tests/consolidated-release
node scripts/consolidated-release/cli.mjs bindings --candidate <40-char-final-head>
```

The source checker scans deployable application/components/library/content/public/Worker/configuration/workflow inputs. It detects known fixture aliases, resource/secret patterns, literal identity constants and runtime imports of test/script tooling. It reports only file, line and rule; it never prints a matched credential or identity. Exact exceptions are the existing non-Production Preview guard lines in `lib/p03-preview-safety.ts` and exact dummy Clerk keys in `.github/workflows/ci.yml`. Tests/docs/read-only release tooling are outside deployable scan scope. Any new runtime exception requires review, not a broad exclusion. `bindings` prints inert exact manifest hashes for the later receipts; it does not certify the supplied candidate head or authorize release. The migration package hash binds both the pre-deployment five-file and separate post-deployment manifests, not just the first transaction.

Manifest hashes bind UTF-8 content with CRLF normalized to LF, matching canonical Git content across Windows and Linux. PDF hashes remain hashes of exact binary bytes.

The complete SQL packages can also be generated offline from the candidate repository, without reconstructing individual migrations. These commands require the exact head and explicit target and print preparation headers plus a final ROLLBACK:

```text
node scripts/consolidated-release/cli.mjs migration-sql --candidate <40-char-final-head> --target nsyjtqpvyxlzyujlbzos
node scripts/consolidated-release/cli.mjs legal-sql --candidate <40-char-final-head> --target nsyjtqpvyxlzyujlbzos
node scripts/consolidated-release/cli.mjs postdeployment-sql --candidate <40-char-final-head> --target nsyjtqpvyxlzyujlbzos
```

These are SQL generators, not database executors. Their DDL/DML must not be run on Production even as a rollback dry-run without separate authorization; rehearse only against disposable synthetic databases. The post-deployment package additionally requires the independently verified session attestations described below. No command accepts a connection URL or credential.

After the explicit release authorization, the following PowerShell-compatible commands generate the exact COMMIT versions for the separately authorized operator. Run from the approved candidate checkout and replace the head placeholder with the verified immutable SHA. The acknowledgement string is a generation guard, not evidence that the human approved a release. Keep the authorization and exact package/head/target receipts alongside the generated SQL in protected release records; do not execute any package out of the cutover order.

```powershell
node --input-type=module -e 'import { buildAtomicMigrationSql } from "./scripts/consolidated-db/package.mjs"; process.stdout.write(buildAtomicMigrationSql());'
node --input-type=module -e 'import { buildProductionLegalSql } from "./scripts/consolidated-legal/publication.mjs"; process.stdout.write(buildProductionLegalSql({ projectRef: "nsyjtqpvyxlzyujlbzos", candidateSha: "<40-char-final-head>", apply: true, authorization: "Release the approved candidate to Production." }));'
node --input-type=module -e 'import { buildPostDeploymentSql } from "./scripts/consolidated-db/post-deployment.mjs"; process.stdout.write(buildPostDeploymentSql({ projectRef: "nsyjtqpvyxlzyujlbzos", candidateSha: "<40-char-final-head>" }));'
```

Before the legal-publication transaction, independently verify the approved candidate and actual Production endpoint, then prepend the first two session attestations below to its generated SQL in the same independently verified operator connection. Before the sixth-package transaction, additionally verify the deployed application tree/head and prepend all three to its generated SQL in that same batch/connection. The legal publisher checks the target/candidate settings; the sixth package also checks the application setting. If a future authorized operator uses MCP `execute_query`, the applicable SET statements and complete generated package must be sent together in one query to the independently verified target parameter. Do not run attestations in an earlier pooled call or assume session state survives between calls. GUC values are bookkeeping assertions, not independent target proof; they grant no authority to create a tournament or bypass a gate. A distinct Vercel merge commit is acceptable only with recorded exact tree equivalence to the approved candidate; the verified candidate SHA is the value below. These are future authorized procedures only; no batch is executed during candidate preparation.

```sql
set ironclad.release_project_ref = 'nsyjtqpvyxlzyujlbzos';
set ironclad.release_candidate_sha = '<40-char-final-head>';
set ironclad.release_app_verified_sha = '<40-char-final-head>';
```

Later, after the real tournament is finished and the user requests final preflight, generate SQL using the immutable final candidate SHA, explicit Production ref, and 1–5 independently confirmed real tournament UUIDs:

```text
node scripts/consolidated-release/cli.mjs sql --candidate <40-char-final-head> --target nsyjtqpvyxlzyujlbzos --tournaments <real-tournament-uuid> --phase before-schema
```

This prints SQL only. It uses a repeatable-read READ ONLY transaction, bounded direct-table SELECTs, statement/lock timeouts and ROLLBACK. It invokes no application, Match Room, registration, settlement, lifecycle or finalization RPC; even apparently observational Match Room RPCs can update closure state and are forbidden here. Connection credentials/URLs are not accepted by this CLI. The operator must independently attest the actual endpoint/project before executing the query through an authorized read-only session. A self-declared SQL `projectRef` does not independently prove the target.

The one aggregate JSON row contains table counts/hashes, check counts, scope hash, ledger hash, timestamp and candidate binding. No raw rows, player identifiers, names, emails, Steam/Discord/Clerk values, message bodies, proof paths, signed URLs, or secrets leave PostgreSQL. Whole-relation digest projections include internal identities/proof/message fields so those authorities can be checked, but only a single SHA-256 per relation is exported. An overflow produces no digest and STOP; do not increase limits without scope/resource review.

The gate covers all ever-launched events plus the requested live event: terminal tournament metadata; exactly one generated bracket for each launched division; all relevant matches resolved; no held match, pending confirmation/dispute/admin review/no-show/legacy submission or unfinished replay attempt; durable division settlements; official memberships/scored events; settlement/point season parity; unique six-event slots; legacy/official active/finalized/review status; pending competition accounting/badge work; protected effective Privacy 1.3 and Terms 1.1 hashes. It also directly counts violations of all five original NOT VALID tournament CHECK predicates, over all historical rows: end-after-start, allowed format, registration ordering, slug format and start-after-registration. SQL CHECK three-valued semantics are preserved by `expression IS FALSE`; a null expression is not invented corruption. Any nonzero count STOPs. No `ALTER TABLE ... VALIDATE CONSTRAINT` is run by this framework. It is deliberately conservative: terminal cancellation does not automatically waive an unresolved required-match check. A legitimate all-nonplayed/disqualified division can score zero; zero points alone is not a corruption predicate. STOP requires investigation of real authority, not a repair RPC inside preflight.

Any unfinalized legacy Main season with fewer than six real, nonvoided qualifying events, any unscored six-event season, or an unfinalized complete season STOPs. Historical under-review state STOPs. Never manufacture a sixth event, finalize/void a season to satisfy the gate, migrate Staging memberships, or silently allow parallel official families. A product decision requiring changed authority needs separate approval and a separately tested change.

Use `scripts/consolidated-release/evidence.example.json` as an inert template. All null/unverified fields STOP. Fill it only from independently checked, redacted receipts. Mandatory evidence includes exact candidate head; unchanged Production base; exact successful `validate`, `p03-database`, `p03-hosted-backup`, `consolidated-database`, `consolidated-release-safety`, `browser` jobs; original browser suites inside `validate` and new feature/responsive/dashboard/admin suites in `browser`; zero known relevant P0/P1/P2; target and complete schema/ledger drift verification; hash-bound migration/legal plans; protected backup/restore evidence bound to the same history/ledger/scope; verified quiet window; Highlights OFF; no hosted Preview usage or proved non-Production isolation.

```text
node scripts/consolidated-release/cli.mjs gate --snapshot <aggregate-before.json> --evidence <redacted-final-evidence.json>
```

Missing, stale, unexpected, skipped or wrong-head evidence STOPs. The CLI hashes the checked-in migration and legal manifests and requires the external receipts to match those exact bytes; a merely well-formed substitute hash fails. A GO expires ten minutes after the earlier snapshot/attestation time, and any state change invalidates it. Historical comparison retains the immutable before checkpoint even if a deployment takes longer; its after snapshot and publication/activation receipts must still be fresh. A historic checkpoint is never a fresh release GO. The offline validator checks attestations; it does not authenticate the receipts or discover live facts itself. Do not manufacture `verified: true` values. Backup artifacts/credentials remain in approved protected Production recovery storage, outside the repository. Backup/restore verification must comply with permanent data separation: no real Production application data restored into Staging or local tests. A real restore verification requiring a Production-only recovery environment needs explicit authorization. Synthetic restore rehearsal alone is not a verified real backup.

## Deterministic future cutover

These are future authorized actions. Nothing below is authorized by candidate preparation.

1. **Final GO preparation.** Resolve immutable PR head, migration checksum manifest and legal publication manifest. Verify all mandatory exact-head CI and browser/SQL/security/leak tests. Independently confirm master/deployed Production remain at the pinned predecessor and Staging remains the referenced source. Unexpected drift STOPs for reconciliation/retest. Preview remains unused unless its complete non-Production resource isolation is proven.
2. **Real state and recovery gate.** Confirm the live event is terminal; collect the read-only aggregate snapshot and schema/catalog/ledger receipts. Verify no partial legacy season/review/accounting issue. Verify protected backup and real restore/recovery evidence. Report GO/STOP. GO does not authorize release. Ask for the final explicit user instruction only after presenting the concrete candidate and receipts.
3. **Authorization and quiet window.** Record the user's explicit release instruction with exact candidate SHA, Production project ref, pre/post-deployment package/legal hashes and approved actions, including the prepared final P01 activation. Establish and independently verify a coordinated freeze of tournament creation, registration and competition/admin writes using already approved operational controls. Coordinate background/retention/badge/accounting writers and any reads that mutate authority so the protected fingerprints are stable; none is paused by this CLI. The framework does not install a freeze flag. Keep the freeze through migration, deployment, publication and postconditions. Capture a fresh read-only snapshot and re-run the gate after freeze; any change/expiry STOPs. Keep Showcase OFF until its final authorized activation and all Highlights/provider enablement OFF.
4. **Database first.** While predecessor application remains deployed, apply the reviewed atomic five-file forward package through the separately authorized, target-attested procedure. Verify complete ledger/checksums/functions/grants/RLS and legacy metadata postconditions. Re-run the aggregate SQL with `--phase after-schema` using the same candidate/scope. Compare immediately, before legal publication or any new application writes:

   ```text
   node scripts/consolidated-release/cli.mjs compare --candidate <40-char-final-head> --before <aggregate-before.json> --after <aggregate-after-schema.json>
   ```

   All historical relation counts/hashes, legal registry/acceptances and core settings must remain exact. The only schema additions permitted are the reviewed immutable metadata/functions/tables/flags. The SQL explicitly requires every existing tournament to be `legacy_three_v1`, every season to remain `main`, new optional feature rows to be empty and both new feature switches OFF; accepting either known model would not prove preservation. Existing Match Room/ELO settings remain unchanged. Any history difference STOPs. No legal publication occurs in schema migrations.
5. **Deploy exact application.** Only after database postconditions pass, merge the approved PR to master with auto-merge disabled, allowing the configured automatic Vercel Production deployment. Verify the deployed source/build binds the approved candidate. If merge produces a distinct commit, prove its Git tree exactly matches the tested candidate and record both SHAs; changed content requires new tests and authorization. Do not accept an unrelated latest deployment. If Vercel fails, hold the freeze and use the recovery boundary below. Verify Production Supabase, production Clerk, private storage and optional resource contracts without printing values. Check routes through known read-only paths; do not submit a real registration/result/upload as a smoke test.
6. **Publish exact legal authority.** Keep registration/creation frozen while candidate files exist but the registry is still 3.1. Verify delivered Rulebook/PPA 3.2 PDFs/source against `content/production-four-division-legal-release.json`. Execute only the separately reviewed exact authorized SQL from `scripts/consolidated-legal/publication.mjs`, whose default generated procedure rolls back. Preserve effective Privacy 1.3/Terms 1.1 and every old acceptance/PDF hash. Verify the exact effective 3.2/3.2/1.3/1.1 set, stable authority URLs and separate hash-checked PDF downloads. Never infer publication from files alone. The legal registry hash is expected to change only here according to the approved plan; the schema comparison has no generic legal exemption.
7. **Legal/history postconditions.** Collect another aggregate snapshot while all new-feature and competition writes remain frozen. Require exact non-legal history/acceptance/core-settings equality to the schema-boundary snapshot, and the exact approved legal-only delta from the legal package's own preservation checks. `compare-legal --candidate <head> --before <aggregate-after-schema.json> --after <aggregate-after-publication.json> --receipt <exact-publication-receipt.json>` permits only a separately verified hash-bound 10-to-12 registry transition with unchanged predecessor rows and effective 3.2/3.2/1.1/1.3 set; all other histories and acceptances must match. It does not authenticate the receipt itself. Verify all legacy events remain `legacy_three_v1`, existing official seasons remain `main`, no fabricated memberships/points/awards/media exist, optional Highlights remain OFF, and registration uses genuine model-specific Relic evidence. Confirm the season decision still permits future Pro creation.
8. **Apply old-creation guard and activate P01 atomically, then verify before reopening.** Only after every app/legal/history check passes, execute the separately checksum-bound sixth post-deployment package, containing the guard plus `platform_settings.key='player_showcase'` to `{"enabled":true}` in one transaction. This is the only prepared optional switch activation. The 19-argument new-creation path must now raise before mutation, while its existing legacy edit path and the independent 20-argument four-division path remain intact. Do not re-run the first five migrations. Generate the same read-only SQL with `--phase after-activation`: it requires Showcase ON, Highlights OFF, no new feature application rows, exactly one reviewed guard ledger row/checksum, 159 total ledger entries, and legacy historical metadata. Then run `compare-activation --candidate <head> --before <aggregate-after-publication.json> --after <aggregate-after-activation.json> --receipt <exact-postdeployment-readonly-receipt.json>`; every history/acceptance/core-setting hash must remain exact, and the receipt must bind the reviewed post-deployment manifest and read-only verification of the three creation/edit signatures. Verify actual function definitions via catalog receipts, not real test creations. The provider stays OFF. Record the final checkpoint before opening real writes. Reopen creation/registration/competition only after successful activation/postconditions; all new events use the explicit four-division save contract. No extra manual flag plan or improvised migration is required. Any changed season policy still requires a separately approved, tested change.
9. **Optional providers later.** Provision/verify a dedicated Production Worker, private R2 bucket, signing keys, origin allowlist and credentials only under separate authorization. Follow `workers/combat-highlights/PRODUCTION_CONTRACT.md`. Never reuse Staging resources. Keep application `COMBAT_HIGHLIGHTS_ENABLED`, Worker `ENABLED`, and SQL `player_combat_highlights` OFF until every provider/privacy/cleanup/playback condition is verified. Optional media must not block tournament functionality.

## Recovery boundaries

| Failure point | Safe prepared response | Required evidence/limitation |
|---|---|---|
| Before atomic DB commit | Abort transaction, retain predecessor application and freeze until inspected | Injected-failure rehearsal must prove schema/ledger/history unchanged; no partial replay |
| DB committed, application not deployed, legal 3.2 not published, no new authority writes | Keep the compatible additive schema; predecessor SHA `0114b1c9f4908c0f8a0e43cfa7a25fb96d361fd1` remains the application recovery target | Recheck exact history, old-app signature compatibility, settings and ledger; avoid DROP/reverse migrations |
| Candidate deployment fails before legal publication/new authority | Restore verified predecessor application deployment; leave additive DB in place and optional features OFF | Verify source pin/resources and history; do not claim a recovery without evidence |
| Legal 3.2 published or any future four-division/feature authority written | Freeze writes, disable optional Highlights/provider access, preserve all records and deliver a compatible forward fix/recovery | Unconditional predecessor rollback is unsafe: old app lacks 3.2 delivery/new Main/Pro semantics. Never delete new acceptances/results to fit old code |
| Provider failure | Keep app/Worker/SQL Highlights OFF; retain metadata and resume cleanup only against the attested Production bucket | No Staging fallback bucket; no cleanup against guessed resources |
| Realtime transport failure | Retain existing polling/reconnect fallback and server-mediated read/write authority | Do not make channels/publications public or weaken generation/participant checks; no independent kill switch is assumed |

Schema/accounting/legal-history changes are deliberately forward-only once real writes exist. No destructive down migration or whole-database restore that discards post-cutover user history is prepared. Disaster recovery is a separately authorized Production recovery operation with verified backups and a reconciled write boundary; it is never a route for moving data into Staging or test fixtures.

## What remains deferred

UNVERIFIED: final real terminal/season state, live drift and independent endpoint/resource attestation, protected real backup/restore receipts, exact immutable candidate CI/deployment evidence, authorized quiet window, approved merge/deployment/legal activation, and any future Production Highlights resource provisioning. Mandatory synthetic/local checks can be prepared and run now; final live checks cannot be replaced by Staging UAT history. This document must not be used to declare zero P0/P1/P2 or release readiness when any relevant issue or critical verification remains outstanding.

Production has not been modified by this framework.

## Baseline risk disposition

The original Section 31 audit risk IDs/priorities remain historical audit evidence. These candidate measures do not erase or downgrade them:

| Baseline risk | Candidate disposition | Remaining verification |
|---|---|---|
| R1 blind Staging replacement | Selective Production-based reconciliation, explicit preservation/exclusion map | Exact final tree and manifest checks |
| R2 ledger/catalog provenance | Production schema-only baseline, exact forward package, atomic/retry/injected-failure rehearsal | Fresh complete live schema/function/grant/policy/ledger receipts; drift STOP |
| R3 cross-service partial save/deletion | Existing compensation/cleanup/privacy paths preserved; focused failure tests cover banner replacement, safe DB refusals and account closure partial failure | Real provider recovery is not proved by mocks; this platform risk is not declared solved. Review material new media cleanup paths and their disposable/provider-independent failure evidence |
| R4 observation writes/locks | New final audit uses direct-table READ ONLY SQL exclusively, no room/lifecycle RPC | Unknown authenticated UI/read paths remain outside preflight |
| R5 replay semantic identity | Production hash/size/count/uniqueness, participant confirmation/dispute and admin official-result/audit authority preserved | No semantic replay decoder is added. Manual review efficacy remains an explicit platform limitation; no exploit or automatic replay-authenticity guarantee is claimed |
| R7 inaccessible environment/Clerk administration | Release Preview denied before application evaluation; isolated local tests; target-attested future cutover | Actual Production Supabase/Clerk/storage/provider configuration still requires final access/receipts; lack of access is not a proven misconfiguration |
| R8 insufficient required checks | Six mandatory exact-head release jobs, including separate browser and DB/release jobs | Confirm actual check conclusions/branch policy at final head, not only `validate` |
| R11 five NOT VALID CHECKs | Both exact original five definition/NOT VALID inventory and all five historical violation counts now fail closed; no Production validation/mutation performed | Actual final counts remain UNVERIFIED; catalog NOT VALID status remains separate validation debt. Do not claim certified clean rows before the query |
| R12 oversized avatar boundary | Separate owner prepares bounded proxy/MIME/signature checks and synthetic failures | Record actual final implementation/tests; bucket setting itself is not mutated by candidate preparation |

The final quality gate still requires zero known relevant P0/P1/P2. A retained risk is not automatically resolved by this table, and an unverified critical platform check is not a pass. Any remaining relevant P2 or release-critical access gap must be reported as STOP or addressed under authorized scope rather than hidden in a readiness count.
