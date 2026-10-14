# Approved legacy Main / Pro continuation

Preparation baseline for `release/consolidated-production-legacy-pro-2026-10`, derived from frozen candidate `b74b9d37ab3e8e2c5787d6e8a3d7c1ce65c82864` and Production predecessor `0114b1c9f4908c0f8a0e43cfa7a25fb96d361fd1`. Production release remains unauthorized. The [release runbook](consolidated-production-release.md) governs execution and recovery; this note records the approved continuation contract.

## Governing compatibility

**PASS for the approved continuing-one-plus-five preparation.** Rulebook 3.1 §§14.3–14.5 retain the six genuine qualifying-event threshold and finalization only after scoring all six. Event seven begins the successor season. The existing event remains governed by its accepted Rulebook/PPA 3.1; successors 3.2 apply prospectively to future registrations and events. Rulebook §21.4, PPA §19.4 and Terms 1.1 §§16/22 protect accepted versions, completed results and accrued rights. No retrospective 3.2 acceptance is created.

The published event prize commitments total **$200 USD**: Academy $40, Challenge $60 and historical Main / Pro $100. Those commitments and any accrued entitlement remain preserved; this change neither creates a season payout nor declares existing prizes paid, waived or cancelled. Rulebook 3.1 §§14.7/20, PPA 3.1 §13 and Terms 1.1 §17 retain separate prize terms, eligibility, payout-information, timeframe and true-tie authority. Complete applicable Event Prize Terms were not located. That remains an evidence limitation; it is not an invented conflict with the continuing six-event policy and does not justify changing prize rights. The [preserved 3.1 corpus](../content/legal-history/production-rulebook-ppa-v3.1-corpus.json), all ten predecessor PDFs and immutable acceptances remain authoritative within their original scope. Terms stays 1.1; Privacy stays 1.3.

## Exact source and authority boundaries

| Binding | Approved value |
|---|---|
| Policy | `legacy-main-pro-event-one-v1` |
| Season | `003db606-b891-4f4e-8893-a54dd4cd503c`, year 2026, season number 1 |
| Genuine Event 1 | `1cb06045-0ffc-4745-a8cd-1a16b71baffc` |
| Historical Main bracket | `f34400e9-f7c8-43ac-90dc-6c70b438a04d` |
| Source accounting | 45 point rows across the event; **15 Main rows, 105 Main points, eight Main contributors** |
| Source completion | 21 resolved event matches, seven Main matches, three launched divisions and three checksum-bearing settlements |

The single scored, nonvoided membership remains genuine slot 1. Zero-point withheld-participation records remain historical facts and do not become badge participation. Null direct bracket references resolve only through the matching registration/player/tournament. Historical `main`, v1 ELO snapshots and all eight original contributors remain preserved without a new 1700 ELO filter. The original season UUID/name/year/number, registrations, results, points, memberships, settlements, cache history, awards, reveals, notifications and acceptances are not relabelled or copied.

Six atomic pre-deployment migrations advance the ledger from 153 to 159. The sixth installs one **inactive** private singleton and binds SHA-256 digests of all 45 source point rows, all three settlements and the original membership. No official Pro role, new event, award, champion or finalization is created at that boundary. After exact application/legal/history verification, the separate post-deployment package advances the ledger to 160 and activates the continuation together with the creation guard and Showcase. Highlights remains OFF.

Only that activation derives the existing season's official **Pro** role and public presentation. Private official standings combine exact historical Main Event 1 with genuine future Pro contributions; public views retain privacy masking and factual historical source labels. Five later genuinely completed Pro events occupy slots 2–6 in the same season. Future Main remains `main_progression` career authority. Academy, Challenge and future Main cannot substitute for an official Pro slot. The entire sixth parent tournament must complete before finalization, champion snapshots or season badges become available.

## Badge, privacy and recovery authority

Historical Elite Champion remains `main`-derived; future Elite remains `main_progression`-derived. Triple Crown still requires Academy, Challenge and Main. Genuine Pro wins retain generic tournament authority. Official Pro Season Campaigner uses eligible genuine Pro participation plus only the exact historical Main Event 1; season podium/champion authority uses the same private official ranking after six genuine events. Existing awards, source evidence, timestamps and reveal state remain unchanged.

Production account closure and retention/privacy definitions remain protected. Source immutability permits only the existing trusted closure path's narrowly scoped actor erasure/pseudonymization, preserving all competitive fields. Public private/closed-account masking remains in force.

Before legal publication, continuation activation or new authority writes, recovery may retain the additive inactive schema and return the application to the exact verified predecessor. After any of those boundaries, freeze writes and use a compatible forward recovery; never remove the continuation, rewrite historical families, delete new authority, or restore over Production to discard user history. Highlights stays OFF and Match Room retains polling/reconnect fallback.

## Proof index and outstanding release gates

The shared [native/hosted rehearsal](../scripts/consolidated-db/rehearse.mjs) integrates these synthetic proofs; actual PASS claims require its corresponding receipt:

| Proof | Source |
|---|---|
| Historical CHECK rendering, changed semantics/identity and exact catalog preservation | [historical constraint regression](../scripts/consolidated-db/historical-constraint-regression.mjs) |
| Exact source/marker gate and adversarial source changes; canonical UTC fingerprints with timezone restoration | [27-case release gate contract](../tests/consolidated-db/legacy-pro-gate-contract.mjs) |
| One genuine Main event plus five Pro events, preserved achievements and excluded Main career participation | [badge contract](../tests/consolidated-db/legacy-pro-badge-contract.sql) |
| Completed Pro division cannot finalize an unfinished parent | [completion contract](../tests/consolidated-db/legacy-pro-completion-contract.sql) |
| Scoped corrections, ordinary retry/recalculation, protected closure and immutable source | [recovery contract](../tests/consolidated-db/legacy-pro-recovery-contract.sql) |
| Anonymous/private/closed-player projections and private authority denial | [public privacy contract](../tests/consolidated-db/legacy-pro-public-privacy.sql) |
| Concurrent official-slot allocation and exact synthetic cleanup | [concurrency contract](../tests/consolidated-db/legacy-pro-concurrency.mjs) |

The 27-case gate module passed against isolated native PostgreSQL; its synthetic mutations rolled back and the initial session timezone was restored. This does not certify a hosted-provider rehearsal or real Production recovery. Final immutable candidate/source/package receipts and all six mandatory exact-head CI jobs remain required. The frozen candidate's earlier CI is not evidence for the replacement.

Fresh real Production terminal/source and catalog/ledger checks, protected backup plus isolated restore evidence, operational freeze/admin verification, live Supabase/Vercel/Clerk/environment targeting and the final release preflight remain separate gates. An unverified critical check remains STOP. No release, migration, publication or Production restore is authorized by this note.
