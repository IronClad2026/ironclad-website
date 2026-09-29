# Four-division remaining-assumptions audit

The inventory categorizes 5422 matching source lines across 398 files. It found one application defect: all-four map-pool publication was rejected by an old three-bracket limit. That limit is fixed and its four/five boundary is tested.

The JSON companion contains every indexed file/line, exact matched terms, source-line SHA256, category, reviewed-family rationale, and SQL definition context. This is a reviewed-family audit, not a claim that every historical SQL harness was rerun. Immutable migrations and version-scoped historical tests remain historical evidence; current authority was checked with a full 159-migration replay, model/permission checks, twelve P03 division variants, and the played lifecycle/concurrency harness.

## Counts

| Category | Matching lines |
| --- | ---: |
| unrelated | 258 |
| correct_historical | 2810 |
| correct_compatibility | 2353 |
| defect_fixed | 1 |

Unclassified source residuals: 0. Ignored directories, dependencies, generated test evidence, lock files and binary documents are excluded. The scan includes Main/main, Main / Pro, 1400+, model/accounting keys, season references, fixture aliases/contracts, three-count checks and three-column layouts.

## Manually reviewed semantic cases

| File:line | Decision |
| --- | --- |
| [lib/tournaments.ts:23](../../lib/tournaments.ts#L23) | Three-entry legacy config is selected only by legacy_three_v1; future config adds Pro and narrows Main. Current call sites pass model. |
| [lib/division-model.ts:25](../../lib/division-model.ts#L25) | Stored Main resolves to legacy main versus future main_progression; Pro accepted only for four_division_v1. |
| [lib/leaderboard/public.ts:290](../../lib/leaderboard/public.ts#L290) | main/pro whitelist selects official historical/current season standings; career query handles academy/challenge/main_progression separately. |
| [components/LeaderboardExperience.tsx:454](../../components/LeaderboardExperience.tsx#L454) | CareerExplanation fallback Main is reached only from the career branch; Pro/main official views render their separate explanation. |
| [lib/badges/authority.ts:330](../../lib/badges/authority.ts#L330) | Three trophy-family keys are fixed Academy/Challenge/Main badge legs, not division whitelist; actual Main source metadata can be main_progression. |
| [lib/admin-operations.ts:840](../../lib/admin-operations.ts#L840) | Four current names plus conditional historical Main / Pro; legacy records keep their display identity. |
| [components/AdminTournamentMapPools.tsx:126](../../components/AdminTournamentMapPools.tsx#L126) | Grid has three columns but maps every card; fourth wraps without filtering or disabling Pro. This is distinct from the fixed action limit. |
| [app/admin/tournaments/map-pool-actions.ts:39](../../app/admin/tournaments/map-pool-actions.ts#L39) | Actual cardinality defect fixed to four and independently tested at four/five boundary. |
| [scripts/lib/staging-synthetic-uat.mjs:198](../../scripts/lib/staging-synthetic-uat.mjs#L198) | Main alias regex 1–14 and Pro 1–4 are exact catalogue identities; future eligibility derives from immutable numeric ratings. |
| [scripts/four-division/provision-additions.mjs:15](../../scripts/four-division/provision-additions.mjs#L15) | slice(0,30) protects original credentials; only 8 additions are provisioned. It does not truncate the current 38-fixture catalogue. |
| [supabase/migrations/20260929011812_four_division_fixture_authority.sql:600](../../supabase/migrations/20260929011812_four_division_fixture_authority.sql#L600) | Provider-null cross-division exception explicitly requires legacy_three_v1; future snapshots require current typed provenance. |
| [supabase/migrations/20260929011829_four_division_accounting_badges.sql:2998](../../supabase/migrations/20260929011829_four_division_accounting_badges.sql#L2998) | valid_main_event_count remains a response alias; valid_qualifying_event_count and immutable official_bracket_type carry current season semantics. |
| [content/legal-corpus.json:324](../../content/legal-corpus.json#L324) | 1400+ is retained only in an explicit historical-event paragraph; future Main 1400–1699 and Pro 1700+ have separate rows. |
| [PROJECT_CONTEXT.md:3](../../PROJECT_CONTEXT.md#L3) | Historical banner prevents old two-division prototype text from being mistaken for current source. |

## Badge identity gate

All 30 catalogue entries, badge type definitions, and PNG assets 1–30 match baseline bad52b92ce1e0cbc6260f523c43d1d33b30375b8. Catalogue/type SHA256 comparisons normalize only CRLF/LF; artwork hashes compare exact bytes. No badge identity, artwork, slug, or number was changed.

Progression (5), Season Campaigner (9), Elite Champion (26), Triple Crown (28), and season podium/champion (29–30) require model/authority compatibility. The remaining generic qualifications retain their contracts while current SQL summaries include all five stored accounting IDs. Triple Crown deliberately remains Academy + Challenge + Main/Elite; Pro championships do not substitute for Main. Detailed per-badge names, slugs, and hashes are in the JSON companion.

## Verification and limits

The discovered map action change passed five focused integration tests. All seven existing database CI commands passed locally, as did the complete four-division runner. The final full application lint/type/build and hosted UI checks are recorded by the release coordinator. This audit performs no live database mutation and reads no environment files.

Reproduce: node scripts/four-division/audit-assumptions.mjs. The command fails if catalogue/artwork changes or an unclassified source file appears. Reviewed-family classifications and manual decisions remain visible in the generator; new behavior requires review even when its file belongs to an existing family.
