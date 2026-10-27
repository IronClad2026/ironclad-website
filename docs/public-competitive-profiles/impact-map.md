# Public competitive profile impact map

Baseline: `origin/master` at `56668b5e6613fd15f5a230e0a0d882149ca199d5`, independently fetched and verified by the root agent before implementation. This document is an audit, not a release authorization. No credential, account identifier, source payload, or private storage path is recorded. Production remains read-only.

## Search coverage and reproducibility

All searches use Git tracked baseline files, including documentation, scripts, tests, fixtures and historical migration/snapshot files. This avoids parent-workspace ignore patterns excluding a worktree. Counts are matching lines and distinct tracked paths, not runtime references.

Commands (run from this worktree):

```text
git grep -n -I -i -F -e "<term>" origin/master -- .
git grep -n -I -i -E "public_profile_enabled|publicProfileEnabled|public[- ]profile|private[- ]profile|profile visibility|profile enabled|directory visibility|leaderboard privacy|player visibility|public standings|privateProfile|privateVisibilityHelp|publicVisibilityHelp|makePrivate|makePublic|profileNowPrivate|profileNowPublic" origin/master -- .
git grep -l -I -i -E "public_profile_enabled|publicProfileEnabled|public[- ]profile|private[- ]profile|profile visibility|profile enabled|directory visibility|leaderboard privacy|player visibility|public standings|privateProfile|privateVisibilityHelp|publicVisibilityHelp|makePrivate|makePublic|profileNowPrivate|profileNowPublic" origin/master -- .
```

| Literal term | Matching lines | Tracked paths |
| --- | ---: | ---: |
| `public_profile_enabled` | 200 | 61 |
| `publicProfileEnabled` | 78 | 36 |
| `public profile` | 82 | 32 |
| `private profile` | 11 | 11 |
| `profile visibility` | 38 | 12 |
| `profile enabled` | 0 | 0 |
| `directory visibility` | 0 | 0 |
| `leaderboard privacy` | 0 | 0 |
| `player visibility` | 1 | 1 |
| `public standings` | 0 | 0 |

The expanded semantic/key search matches **491 lines in 119 tracked paths**. Localized dictionaries are included through their semantic keys even when their visible wording is not English. The complete path inventory is below.

## Meaningful runtime and database use

| Surface | Baseline meaning | New contract / disposition |
| --- | --- | --- |
| Players Directory and public player page | `lib/public-players.ts` queried `public_player_profiles` and redundantly filtered legacy true. `/players` and `/players/[playerId]` composed this safe DTO. | Remove legacy selects/filters. The database view excludes closed accounts. Keep existing search, ELO/country filters, ordering, country/region display, layout and links. The current directory has no region filter to preserve. |
| Public profile DTO | Legacy `publicProfileEnabled` traveled in the safe DTO. | Retain a documented literal `true` compatibility property derived only from active-only public view membership, so untouched scoped Discord code still works. It never reads the legacy column. |
| Avatar proxy | `app/players/[playerId]/avatar/route.ts` allowed legacy public or authenticated owner/admin access. | Require explicit `account_closed_at === null`; active legacy false behaves like true. Closed/missing/invalid accounts receive the same fallback, including for owner/admin. Preserve byte proxy, no-store, bounded signatures/MIME/size, no signed URL/path disclosure. |
| Public active tournament ELO snapshots | `lib/active-tournament-elo-snapshots.ts` required a joined legacy true player. | Replace only public read filtering/parsing with explicit active closure state. Own snapshot loader and all registration snapshot writes, verification and division semantics stay unchanged. |
| Dashboard | Page selected legacy flag and rendered `PublicProfileVisibilityCard`; `public-profile-actions.ts` could mutate it. | Remove the control, related state/type/query field and obsolete externally callable mutation module. Discord, Steam, Relic/ELO, account, legal, registration and notification controls are retained. |
| Public tournament participant mapping | `lib/tournaments.ts` masked profile link/country/event ELO for legacy false. Public page, admin workspace and partner model passed the flag. | Use known explicit active closure state only; keep immutable registration alias and verified/submitted event snapshot selection unchanged. Unknown identity stays unlinked/masked. Closed identity remains Former Competitor without link/country/ELO. Public/admin call sites change SELECT/type/mapping only. |
| CoH3Stats read models | `lib/competition-read-models/players.ts` gated exact canonical lookup; tournament participant snapshot selected flag. | Active exact `coh3_profile_id` binding resolves regardless legacy flag; participant DTO adds string/null `relicProfileId` and active public profile URL. No identity guesses, backfill, write, authentication, pagination or result semantics change. |
| Admin analytics | `lib/admin-operations.ts` counted legacy true active profiles; `PlayersAnalytics` rendered that count. | Read-only count becomes all active accounts; no operational or moderation state change. |
| Showcase | Owner editor selected legacy flag and showed private/enable wording; public view also gated it. | Remove owner privacy state and obsolete link/text; always link active owner public profile. Preserve optional current thought, featured earned badge, feature flag and moderation hiding. Public view gains active-only contract. |
| Combat Highlights | Owner JSON/parser/type/UI read `publicProfileEnabled`; public read/delivery authorization helper required legacy true. | The user explicitly approved the two read-helper successors in this candidate. `can_read_public_player_combat_highlight(uuid)` no longer requires the legacy flag; feature enablement, ready/verified upload, current slot, individual hiding and active account remain mandatory. `combat_highlight_state(uuid)`, TypeScript and fixtures remove the dead state field. Obsolete editor/provider wording is updated. Upload/processing/cleanup/write functions remain unchanged. Hosted Staging acceptance is still pending. |
| Career History and badges | Authenticated Dashboard career/history reads operational records; public profile shows featured earned badge, not full private award evidence. | No new statistics or public history engine. Existing public profile tournament history/match statistics cards are placeholders and remain placeholders. Existing supported public results/partner history remain factual. |
| Discord | `discord_public_enabled` plus usable username is a separate source of contact visibility. `app/dashboard/actions.ts` owns that setting. | Independent opt-in unchanged. Public view and DTO neutralize hidden/blank contact. Unchanged support action reads active-only public DTO and separately requires Discord opt-in. |
| Profile save / signup / registration | New rows retain private-default legacy column; profile saving intentionally does not force it true. | No profile bulk update, registration action/RPC/schema/status/capacity/approval/notification change. Eligibility is now a read contract; do not change write defaults merely to implement it. No new signup checkbox or legal receipt. |
| Relic / Steam / ELO verification | Legacy column exists in historical identity grants/contracts; Phase 2 persists canonical trusted Relic binding. | Identity persistence, ownership uniqueness, verification providers, refresh, snapshots and trusted binding rules remain unchanged. Absent binding remains null. |
| Account closure | Historical chained closure functions set legacy false while clearing or pseudonymizing identity and preserving competition history. | Retain all closure write behavior and raw field retention rules. Public active predicates exclude closed accounts; leaderboard/history keeps approved Former Competitor protection. No reconnection to Relic/profile. |
| Product translations | Eight account/dashboard and public dictionaries carry opt-in profile/home/directory wording. | Update product explanatory copy in en, it, fr, es, pt-BR, ru, ko, zh-CN. Remove obsolete competitive privacy keys; preserve optional Discord wording. |
| Legal documents and summaries | Effective corpora, immutable historical copies and help/rules summaries describe earlier opt-in contract. | Do not publish/version/reaccept. Exact proposed changes and publication/reacceptance blocker are in legal-impact.md. The eight help-legal-ui Rules summaries now reflect the approved active-public application behavior; the current governing documents remain unchanged under Marco's explicit temporary-mismatch release decision. |
| Documentation and recovery snapshots | Integration docs, historical reports, schema/function JSON snapshots and protected baseline scripts mention flag or privacy. | Update current integration contract documents; retain immutable historical SQL/migration/recovery snapshots. Flag remains in protected player fingerprint inventories and old source descriptions; these are not current visibility authorities. |
| Tests and synthetic fixtures | Old tests covered opting out; SQL fixtures and provenance guards deliberately contain false flags and private assertions. | Replace obsolete toggle/opt-out runtime tests with permanent public visibility tests. Preserve historical migration/security tests and fixture provenance write guards. New current-contract tests cover active true/false, null ELO, closure, profile links, independent Discord, safe allowlists and both leaderboard products. Old SQL privacy assertions are historical and cannot be claimed as acceptance for the new views. |

## Additional semantic inspection

These surfaces were inspected because their behavior matters even when their translated wording or field names do not match the literal baseline searches above.

| Paths | Finding |
| --- | --- |
| `components/PublicPlayersDirectory.tsx`, `components/PublicPlayerCard.tsx`, `components/PublicPlayerProfileHeader.tsx`, `components/PublicPlayerStats.tsx` | Existing public DTO presentation, player links, search/country/ELO filters, region display, avatar proxy and conditional Discord contact. Tournament history and match statistics remain explicit placeholders. No private Dashboard model is passed into these components. |
| `lib/player-dashboard.ts`, `components/dashboard/DashboardCareerHistory.tsx`, `components/dashboard/DashboardIdentity.tsx` | Career/registration/account presentation remains authenticated. Public profile visibility does not make this private model public. |
| `app/sign-up/[[...sign-up]]/page.tsx`, `components/PlayerProfileForm.tsx`, `app/profile/actions.ts`, `app/profile/relic-elo-action.ts` | Signup/profile editing, trusted identity/ELO and profile completion are separate from public read eligibility. No registration, verification, legal acceptance or account write change was made here. |
| `lib/i18n/dictionaries/en/public.ts`, `lib/i18n/dictionaries/it/public.ts`, `lib/i18n/dictionaries/fr/public.ts`, `lib/i18n/dictionaries/es/public.ts`, `lib/i18n/dictionaries/pt-BR/public.ts`, `lib/i18n/dictionaries/ru/public.ts`, `lib/i18n/dictionaries/ko/public.ts`, `lib/i18n/dictionaries/zh-CN/public.ts`, `lib/i18n/dictionaries/en/public-players.ts` | Product copy now explains permanent active competitive profiles, private personal account data and optional Discord. Non-English visible strings require semantic-key inspection instead of an English phrase search. |
| `lib/i18n/dictionaries/en/account-dashboard.ts`, `lib/i18n/dictionaries/it/account-dashboard.ts`, `lib/i18n/dictionaries/fr/account-dashboard.ts`, `lib/i18n/dictionaries/es/account-dashboard.ts`, `lib/i18n/dictionaries/pt-BR/account-dashboard.ts`, `lib/i18n/dictionaries/ru/account-dashboard.ts`, `lib/i18n/dictionaries/ko/account-dashboard.ts`, `lib/i18n/dictionaries/zh-CN/account-dashboard.ts` | Competitive privacy control and private-Showcase keys removed; Discord keys retained. Approved Combat Highlights provider copy now describes eligible active-account clips and separate hiding/closure protection. Showcase admin copy preserves closed-account exclusion. Legal declaration text/version and governing documents remain unchanged; the Rules summaries are updated separately. |
| `lib/i18n/dictionaries/en/help-legal-ui.ts`, `lib/i18n/dictionaries/it/help-legal-ui.ts`, `lib/i18n/dictionaries/fr/help-legal-ui.ts`, `lib/i18n/dictionaries/es/help-legal-ui.ts`, `lib/i18n/dictionaries/pt-BR/help-legal-ui.ts`, `lib/i18n/dictionaries/ru/help-legal-ui.ts`, `lib/i18n/dictionaries/ko/help-legal-ui.ts`, `lib/i18n/dictionaries/zh-CN/help-legal-ui.ts` | All eight Rules guide privacy summaries now describe nonclosed competitive profiles as public, independent Discord opt-in, private evidence and closed-account protection. Governing documents remain unchanged under the accepted temporary mismatch documented in `legal-impact.md`. |

Private-data boundary evidence: the public player query explicitly selects only public competitive identity, rating, country/region, conditional Discord, avatar-presence/null raw avatar URL and creation date. Mapping returns only its declared public DTO and rewrites avatar access to the player-ID proxy. The new permanent-visibility regression feeds sensitive sentinel fields into the source row and checks both returned public responses and public-page player props contain none of them. Checked categories include email, Clerk identity, legal receipts, admin/moderation notes, IP, notifications, raw Steam/Relic payloads, service credentials, private storage paths and internal audit data. Avatar tests separately prove closed/missing fallback behavior and absence of signed URL/path headers. Source allowlist inspection supplements those tests; real hosted output verification remains required.

## Database ownership boundary

The root agent is the sole migration owner. The five necessary public read views are `public_player_profiles`, `leaderboard_public_season_standings`, `leaderboard_public_all_time_standings`, `leaderboard_public_season_champions`, and `public_player_showcases`. Audit current live definitions/owners/grants/security options rather than editing old migrations. Latest Season/Champion definitions include the later legacy Main/Pro bridge; preserve every factual ranking/season column and join. Preserve raw-table browser restrictions, owner-rights/security-barrier posture, null raw avatar URLs, Discord gating and closed-account anonymization.

The user explicitly approved the minimum Combat Highlights read-helper scope extension: `public.can_read_public_player_combat_highlight(uuid)` and `ironclad_private.combat_highlight_state(uuid)`. The candidate replaces only those two existing read helpers alongside the five views, preserving signatures, OIDs, owners, ACLs, stable/security-definer properties and fixed search paths. No business-row mutation or recalculation is required. This records the approved source contract; hosted Staging application/acceptance and a separately approved Production release remain distinct steps.

## Hosted Staging validation path and blockers

This subsection records read-only inspection only: no deployment, environment mutation, session creation or service action was executed.

| Existing tooling | What it does | Suitability / constraint |
| --- | --- | --- |
| Current `next.config.ts`, `lib/release-preview-safety.ts`, `lib/p03-preview-safety.ts` | The release guard rejects every `VERCEL_ENV=preview` build. The older candidate guard recognizes only `codex/p03-production-ready` and verifies Staging/Test isolation. | Current feature cannot simply be deployed as Preview without explicit staging-only guard integration. Do not bypass by labeling Preview as Production. |
| Previous Phase 4 worktree `ironclad-partner-api-staging/next.config.ts` and `lib/p03-1-preview-safety.ts` | Uses an older Staging-only guard for known staging branches; verifies Staging Supabase ref, Clerk test keys and rejects Production ref. | Historical branch allowlist does not include this feature branch. Preserve isolated Staging configuration in a dedicated validation worktree/branch; do not merge unrelated divergent staging implementation into master. |
| Previous `scripts/four-division/hosted-ui.mjs` | Real hosted public/participant/admin responsive reads at 375, 390, 768 and 1440; records redacted summaries; no saved sessions/traces or explicit application writes. | Reusable architecture, not a runnable new acceptance suite. Route allowlists omit /players and current contract assertions, and authenticated locale sync can write the fixture locale. Adapt a narrow read-only public/Dashboard subset after exact deployment identity verification. |
| Previous `scripts/four-division/hosted-auth.mjs` | Validates Staging environment, Clerk Development instance and registry-proven permanent synthetic fixture, creates a one-use 60-second sign-in ticket and in-memory session, revokes sessions/tickets afterward. | Authenticated Dashboard path is available as tooling; no active authenticated session is demonstrated. Requires an existing approved private Staging environment source and valid registry identity. Never emit token/user/credential values, saved storage state or private DOM dumps. |
| Previous `scripts/four-division/preview-access.mjs` | Creates/revokes a deployment-scoped one-hour Vercel Preview grant, keeps cookies in an isolated browser context, never saves token-bearing URL. | Hardcodes previous four-division branch and project/deployment conditions. Cannot run unchanged for this candidate; exact new READY non-Production deployment/commit/ref must be verified before scoped access. |
| Current `tests/preview/p03/{target,runtime,playwright.config}.ts` | Older exact-SHA hosted verifier, bounded Staging reads, restricted outbound requests, development authentication and no trace/screenshot/video. | Fixed old branch, missing default environment directory and old feature fixtures. Use safety concepts, not its broad historical suite or fixture mutations. |
| Current `playwright.config.ts` and `tests/browser/showcase/playwright.config.ts` | Public smoke can target an external base URL; Showcase tests are local Vite fixtures. Default traces are retained on failure. | Local component tests do not prove hosted acceptance. For hosted private Dashboard validation explicitly disable trace, screenshots, video and prompt/DOM error copying. |
| Current `scripts/consolidated-db/hosted-runtime.mjs`, `scripts/p03-release/rehearse-hosted-runtime.mjs` | GitHub-hosted Linux disposable Postgres/restore rehearsals with synthetic data. | These are database rehearsal tools, not hosted Staging website acceptance; never reuse their old hardcoded ledgers/expected counts blindly. |

Environment/session availability metadata: the current worktree, `ironclad-release`, `ironclad-relic-staging`, and `ironclad-partner-api-staging` contain no `.env.local`, `.env.staging-uat.local`, or `test-results` directory at inspection time. The historical default sibling `ironclad-website` is absent. Only existence/filenames were checked; no credential values or saved state was read. Existing secret configuration may be available to the root through connected tools or other approved private locations, but this audit does not claim that it is present. No production or staging Clerk session API was called.

Safe integration sequence after resolving explicit scope blockers:

1. Keep the implementation branch based on verified master and create a distinct Staging validation artifact using existing isolated Staging deployment architecture. Verify the exact candidate code SHA/ref and READY non-Production deployment identity.
2. Preserve Staging Supabase `zzbnneprhjicmajpjkdg`, Clerk Development, Staging storage and outbound isolation; verify environment metadata without dumping values. Extend only the staging validation guard/branch allowlist as explicitly reviewed. Do not replace Production environment variables or use Production mode to bypass a guard.
3. Apply only the reviewed new public-read migration to Staging under root ownership. Capture protected-table fingerprints and view ownership/grants/security/schema before and after.
4. Reuse existing synthetic records without changing competition facts. Exercise active legacy true/false, genuine null ELO and closed read cases; do not run old fixture enrolment, result, legal publication, registration, identity backfill or media mutation scripts.
5. Validate desktop and mobile hosted /players, a real legacy-false active /players/{id}, Current Season, All Time, visible champion archive, plus authenticated Dashboard via a registry-proven Development fixture and transient session. Preserve Discord setting during acceptance.
6. Query both authenticated partner endpoints through the deployed hosted origin with approved Staging credential handling; inspect only allowlisted DTOs and exact canonical identity/null cases. Keep private page artifacts and credentials out of logs.
7. Revoke temporary Development sessions and deployment-scoped access, compare protected facts allowing known concurrent activity, return Staging evidence, and stop before any Production release.

## Complete baseline matching tracked-path inventory

Each row is one tracked baseline path. Counts are matching lines for the expanded semantic/key search. Translated product copy and old immutable sources are deliberately classified separately.

| Baseline path | Lines | Classification |
| --- | ---: | --- |
| `app/dashboard/actions.ts` | 2 | Discord visibility action and independent opt-in; unchanged |
| `app/dashboard/page.tsx` | 2 | Competitive privacy control/select removed; other private controls retained |
| `app/dashboard/public-profile-actions.ts` | 12 | Removed obsolete competitive privacy mutation/control |
| `app/players/[playerId]/avatar/route.ts` | 2 | Active-only server-mediated avatar bytes; no raw paths or signed URLs |
| `app/players/[playerId]/page.tsx` | 1 | Public profile route/read composition; supported product surface preserved |
| `app/tournaments/page.tsx` | 3 | Read-only participant mapping/call sites; snapshots and competition writes unchanged |
| `app/tournaments/support-actions.ts` | 1 | Unchanged scoped Discord read; effective-true compatibility property only |
| `components/PublicProfileVisibilityCard.tsx` | 8 | Removed obsolete competitive privacy mutation/control |
| `components/admin/operations/PlayersAnalytics.tsx` | 1 | Admin read-only public-profile count; active account metric |
| `components/combat-highlights/CombatHighlightsEditor.tsx` | 2 | Approved successor removes obsolete private-profile message; individual hiding, owner preview and upload behavior retained |
| `components/showcase/PlayerShowcaseEditor.tsx` | 4 | Showcase active-only public view/editor state; removed legacy privacy state |
| `content/legal-corpus.json` | 15 | Legal artifact / immutable history; unchanged, separate publication |
| `content/legal-history/production-rulebook-ppa-v3.1-corpus.json` | 15 | Legal artifact / immutable history; unchanged, separate publication |
| `content/legal-privacy-successor-v1.2.json` | 2 | Legal artifact / immutable history; unchanged, separate publication |
| `content/legal-successors-v1.1.json` | 4 | Legal artifact / immutable history; unchanged, separate publication |
| `docs/competition-read-models/README.md` | 2 | Current integration contract; updated to active public model |
| `docs/legal-drafts/p03-privacy-v1.3/legal-corpus.json` | 15 | Legal artifact / immutable history; unchanged, separate publication |
| `docs/legal-drafts/p03-privacy-v1.3/predecessor-corpus.json` | 15 | Legal artifact / immutable history; unchanged, separate publication |
| `docs/p03-candidate-file-inventory.md` | 1 | Historical evidence/scope/performance report; unchanged |
| `docs/p03-scope-audit.md` | 1 | Historical evidence/scope/performance report; unchanged |
| `docs/partner-api/README.md` | 1 | Current integration contract; updated to active public model |
| `docs/partner-api/coh3stats-handoff.md` | 1 | Current integration contract; updated to active public model |
| `docs/performance-phase2.md` | 2 | Historical evidence/scope/performance report; unchanged |
| `docs/relic-identity-binding/phase2-report.md` | 1 | Historical evidence/scope/performance report; unchanged |
| `docs/relic-identity-binding/privacy-contract.md` | 6 | Current integration contract; updated to active public model |
| `docs/relic-identity-binding/verification.json` | 2 | Historical evidence/scope/performance report; unchanged |
| `docs/supabase-security-hardening.md` | 3 | Prior security posture report; historical opt-in paragraph requires reading with new contract |
| `lib/active-tournament-elo-snapshots.ts` | 5 | Public registration snapshot read; active-only gate, no ELO write changes |
| `lib/admin-operations.ts` | 3 | Admin read-only public-profile count; active account metric |
| `lib/admin-tournament-match-workspace.ts` | 3 | Read-only participant mapping/call sites; snapshots and competition writes unchanged |
| `lib/combat-highlights/read.ts` | 2 | Approved successor removes dead owner visibility state; exact safe clip/state allowlists retained |
| `lib/combat-highlights/types.ts` | 1 | Approved successor removes dead owner visibility field; write/action contracts retained |
| `lib/competition-read-models/players.ts` | 5 | Partner competitive read model; canonical active identity and DTO only |
| `lib/competition-read-models/tournaments.ts` | 4 | Partner competitive read model; canonical active identity and DTO only |
| `lib/i18n/dictionaries/en/account-dashboard.ts` | 19 | Localized product/UI copy; public model updated in 8 locales |
| `lib/i18n/dictionaries/en/help-legal-ui.ts` | 1 | Current effective legal summary; unchanged pending separate legal publication |
| `lib/i18n/dictionaries/en/public-players.ts` | 4 | Localized product/UI copy; public model updated in 8 locales |
| `lib/i18n/dictionaries/en/public.ts` | 3 | Localized product/UI copy; public model updated in 8 locales |
| `lib/i18n/dictionaries/es/account-dashboard.ts` | 7 | Localized product/UI copy; public model updated in 8 locales |
| `lib/i18n/dictionaries/fr/account-dashboard.ts` | 4 | Localized product/UI copy; public model updated in 8 locales |
| `lib/i18n/dictionaries/it/account-dashboard.ts` | 7 | Localized product/UI copy; public model updated in 8 locales |
| `lib/i18n/dictionaries/ko/account-dashboard.ts` | 4 | Localized product/UI copy; public model updated in 8 locales |
| `lib/i18n/dictionaries/pt-BR/account-dashboard.ts` | 4 | Localized product/UI copy; public model updated in 8 locales |
| `lib/i18n/dictionaries/ru/account-dashboard.ts` | 5 | Localized product/UI copy; public model updated in 8 locales |
| `lib/i18n/dictionaries/zh-CN/account-dashboard.ts` | 7 | Localized product/UI copy; public model updated in 8 locales |
| `lib/player-profile.ts` | 1 | Private account type; removed obsolete competitive visibility field |
| `lib/player-showcase/read.ts` | 2 | Showcase active-only public view/editor state; removed legacy privacy state |
| `lib/player-showcase/types.ts` | 1 | Showcase active-only public view/editor state; removed legacy privacy state |
| `lib/public-players.ts` | 6 | Public allowlist loader; no legacy filter; effective-true compatibility property |
| `lib/tournaments.ts` | 2 | Read-only participant mapping/call sites; snapshots and competition writes unchanged |
| `scripts/consolidated-db/production-function-definitions.json` | 6 | Historical schema/function recovery snapshot; unchanged, never dynamically rewritten |
| `scripts/consolidated-db/production-schema-baseline.json` | 1 | Historical schema/function recovery snapshot; unchanged, never dynamically rewritten |
| `scripts/consolidated-db/production-structure-definitions.json` | 5 | Historical schema/function recovery snapshot; unchanged, never dynamically rewritten |
| `scripts/consolidated-db/rehearse.mjs` | 1 | Historical validation/rehearsal tooling; not a runtime visibility authority |
| `scripts/consolidated-release/sql.mjs` | 1 | Protected player fingerprint projection includes legacy field; retained |
| `scripts/p03-release/README.md` | 1 | Historical validation/rehearsal tooling; not a runtime visibility authority |
| `supabase/migrations/20260613128000_public_player_profiles.sql` | 5 | Historical public profile view definition; superseded by new view migration |
| `supabase/migrations/20260613129000_public_player_profile_avatar_presence.sql` | 3 | Historical public profile view definition; superseded by new view migration |
| `supabase/migrations/20260730090000_secure_steam_identity.sql` | 1 | Identity/verification contracts and grants; unchanged |
| `supabase/migrations/20260804090000_relic_profile_verification.sql` | 1 | Identity/verification contracts and grants; unchanged |
| `supabase/migrations/20260813101000_competition_history_safe_account_closure.sql` | 10 | Historical closure + public view definitions; closure writes untouched |
| `supabase/migrations/20260813102000_phase7_public_leaderboard_integration.sql` | 18 | Historical leaderboard read projection; latest definitions used as baseline |
| `supabase/migrations/20260814121000_phase7_counterpart_notification_privacy.sql` | 1 | Historical closure-wrapper/write definition; unchanged |
| `supabase/migrations/20260815100000_coh3_map_catalogue_division_pools.sql` | 1 | Historical closure-wrapper/write definition; unchanged |
| `supabase/migrations/20260817120000_polls_decisions.sql` | 1 | Historical closure-wrapper/write definition; unchanged |
| `supabase/migrations/20260823120000_private_by_default_player_profiles.sql` | 16 | Historical default correction; no repeat data correction in this task |
| `supabase/migrations/20260824100000_staging_synthetic_uat_fixtures.sql` | 6 | Synthetic fixture provenance/write guards; unchanged |
| `supabase/migrations/20260831133000_staging_badge_cross_division_acceptance.sql` | 1 | Synthetic fixture provenance/write guards; unchanged |
| `supabase/migrations/20261001032942_production_showcase_authority.sql` | 2 | Historical Showcase public view; owner/moderation/closure writes untouched |
| `supabase/migrations/20261001032957_production_combat_highlights_authority.sql` | 2 | Historical migration unchanged; approved new migration explicitly replaces only the public read authorization helper and private owner JSON helper |
| `supabase/migrations/20261013184857_production_legacy_main_pro_event_one.sql` | 10 | Historical leaderboard read projection; latest definitions used as baseline |
| `tests/browser/combat-highlights/highlights.spec.ts` | 1 | Runtime/read-model/UI fixture or privacy/closure/Discord regression; updated where current behavior changed |
| `tests/browser/combat-highlights/main.tsx` | 1 | Runtime/read-model/UI fixture or privacy/closure/Discord regression; updated where current behavior changed |
| `tests/browser/showcase/main.tsx` | 2 | Runtime/read-model/UI fixture or privacy/closure/Discord regression; updated where current behavior changed |
| `tests/browser/showcase/showcase.spec.ts` | 1 | Runtime/read-model/UI fixture or privacy/closure/Discord regression; updated where current behavior changed |
| `tests/browser/ui-redesign/fixtures.ts` | 1 | Runtime/read-model/UI fixture or privacy/closure/Discord regression; updated where current behavior changed |
| `tests/consolidated-db/highlights-contract.sql` | 2 | Historical SQL privacy contract; do not treat old private-mode assertion as new acceptance |
| `tests/consolidated-db/legacy-pro-public-privacy.sql` | 3 | Historical SQL privacy contract; do not treat old private-mode assertion as new acceptance |
| `tests/consolidated-db/legacy-pro-recovery-contract.sql` | 2 | Historical SQL privacy contract; do not treat old private-mode assertion as new acceptance |
| `tests/consolidated-db/showcase-contract.sql` | 3 | Historical SQL privacy contract; do not treat old private-mode assertion as new acceptance |
| `tests/database/persist-relic-profile-id.sql` | 6 | Identity/synthetic fixture/closure regression; no Production fixture or identity writes |
| `tests/database/relic-identity-binding-reproduction.sql` | 1 | Identity/synthetic fixture/closure regression; no Production fixture or identity writes |
| `tests/database/staging-synthetic-uat-fixtures.sql` | 2 | Identity/synthetic fixture/closure regression; no Production fixture or identity writes |
| `tests/integration/account-legal-mutation-boundary.test.ts` | 3 | Runtime/read-model/UI fixture or privacy/closure/Discord regression; updated where current behavior changed |
| `tests/integration/active-tournament-elo-snapshots.test.ts` | 5 | Runtime/read-model/UI fixture or privacy/closure/Discord regression; updated where current behavior changed |
| `tests/integration/admin-operations-loader-metrics.test.ts` | 3 | Runtime/read-model/UI fixture or privacy/closure/Discord regression; updated where current behavior changed |
| `tests/integration/combat-highlights-actions.test.ts` | 1 | Runtime/read-model/UI fixture or privacy/closure/Discord regression; updated where current behavior changed |
| `tests/integration/competition-history-safe-account-closure-migration.test.ts` | 4 | Historical migration security/regression test; old SQL source remains immutable |
| `tests/integration/competition-read-models.test.ts` | 2 | Runtime/read-model/UI fixture or privacy/closure/Discord regression; updated where current behavior changed |
| `tests/integration/dashboard-badges-section.test.tsx` | 1 | Runtime/read-model/UI fixture or privacy/closure/Discord regression; updated where current behavior changed |
| `tests/integration/discord-visibility-guard.test.ts` | 1 | Runtime/read-model/UI fixture or privacy/closure/Discord regression; updated where current behavior changed |
| `tests/integration/match-admin-assistance-action.test.ts` | 2 | Runtime/read-model/UI fixture or privacy/closure/Discord regression; updated where current behavior changed |
| `tests/integration/phase7-public-leaderboard-integration-migration.test.ts` | 3 | Historical migration security/regression test; old SQL source remains immutable |
| `tests/integration/phase7-raw-leaderboard-read-privacy-migration.test.ts` | 1 | Historical migration security/regression test; old SQL source remains immutable |
| `tests/integration/player-dashboard-hierarchy.test.tsx` | 2 | Runtime/read-model/UI fixture or privacy/closure/Discord regression; updated where current behavior changed |
| `tests/integration/player-showcase-projection.test.ts` | 16 | Runtime/read-model/UI fixture or privacy/closure/Discord regression; updated where current behavior changed |
| `tests/integration/private-by-default-player-profiles-migration.test.ts` | 5 | Historical migration security/regression test; old SQL source remains immutable |
| `tests/integration/profile-save-steam-regression.test.ts` | 3 | Runtime/read-model/UI fixture or privacy/closure/Discord regression; updated where current behavior changed |
| `tests/integration/public-player-avatar-route.test.ts` | 5 | Runtime/read-model/UI fixture or privacy/closure/Discord regression; updated where current behavior changed |
| `tests/integration/public-player-projection.test.ts` | 5 | Runtime/read-model/UI fixture or privacy/closure/Discord regression; updated where current behavior changed |
| `tests/integration/public-profile-active-tournament-elo-snapshots.test.tsx` | 2 | Runtime/read-model/UI fixture or privacy/closure/Discord regression; updated where current behavior changed |
| `tests/integration/public-profile-opt-out-flow.test.ts` | 14 | Obsolete opt-out/toggle tests removed; replaced by permanent-visibility regression |
| `tests/integration/public-profile-request-cache.test.ts` | 2 | Runtime/read-model/UI fixture or privacy/closure/Discord regression; updated where current behavior changed |
| `tests/integration/public-profile-visibility-action.test.ts` | 15 | Obsolete opt-out/toggle tests removed; replaced by permanent-visibility regression |
| `tests/integration/tournament-result-client-payload.test.ts` | 6 | Runtime/read-model/UI fixture or privacy/closure/Discord regression; updated where current behavior changed |
| `tests/performance/public-profile-rsc-fixture.mjs` | 2 | Runtime/read-model/UI fixture or privacy/closure/Discord regression; updated where current behavior changed |
| `tests/unit/components/CombatHighlights.test.tsx` | 1 | Runtime/read-model/UI fixture or privacy/closure/Discord regression; updated where current behavior changed |
| `tests/unit/components/DiscordContactVisibilityCard.test.tsx` | 1 | Runtime/read-model/UI fixture or privacy/closure/Discord regression; updated where current behavior changed |
| `tests/unit/components/PlayerShowcase.test.tsx` | 5 | Runtime/read-model/UI fixture or privacy/closure/Discord regression; updated where current behavior changed |
| `tests/unit/components/PollsAndDecisionsRecovery.test.tsx` | 9 | Runtime/read-model/UI fixture or privacy/closure/Discord regression; updated where current behavior changed |
| `tests/unit/components/PublicPlayerCard.test.tsx` | 1 | Runtime/read-model/UI fixture or privacy/closure/Discord regression; updated where current behavior changed |
| `tests/unit/components/PublicPlayerStats.test.tsx` | 1 | Runtime/read-model/UI fixture or privacy/closure/Discord regression; updated where current behavior changed |
| `tests/unit/components/PublicPlayersDirectory.test.tsx` | 1 | Runtime/read-model/UI fixture or privacy/closure/Discord regression; updated where current behavior changed |
| `tests/unit/components/PublicProfileFallbacks.test.tsx` | 2 | Runtime/read-model/UI fixture or privacy/closure/Discord regression; updated where current behavior changed |
| `tests/unit/components/PublicProfileVisibilityCard.test.tsx` | 11 | Obsolete opt-out/toggle tests removed; replaced by permanent-visibility regression |
| `tests/unit/lib/competition-read-models/players.test.ts` | 5 | Runtime/read-model/UI fixture or privacy/closure/Discord regression; updated where current behavior changed |
| `tests/unit/lib/competition-read-models/read-page.test.ts` | 1 | Runtime/read-model/UI fixture or privacy/closure/Discord regression; updated where current behavior changed |
| `tests/unit/lib/competition-read-models/tournaments.test.ts` | 3 | Runtime/read-model/UI fixture or privacy/closure/Discord regression; updated where current behavior changed |
| `tests/unit/lib/tournament-public-participant.test.ts` | 5 | Runtime/read-model/UI fixture or privacy/closure/Discord regression; updated where current behavior changed |
