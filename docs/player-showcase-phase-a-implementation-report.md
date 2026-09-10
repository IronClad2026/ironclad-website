**Player Showcase Phase A — implementation handoff**

Prepared 10 September 2026. Scope: Current Thought, Featured Achievement Badge, public identity foundation, dedicated editor, moderation, schema/security and local verification.

**1. Workspace safety verification**

Implementation stayed in `C:/Users/pc/Documents/IronClad/03_Website/ironclad-player-showcase-phase-a`, on `codex/player-showcase-phase-a`, at base/HEAD `631e5ad225fdd8e702e99a3e80e57e2f62368051`. The worktree was clean before implementation and has no upstream. No branch switch, commit, merge or push occurred. The original master checkout and older audit worktree were not implementation sources.

**2. Architecture implemented**

Presentation state lives in `player_showcases`. Server-only loaders and mutations under `lib/player-showcase` connect authenticated field-specific RPCs to the dedicated editor. Public profile reads use a separate allowlisted view. Optional Showcase failures fall back safely without changing competition operations. The existing `platform_settings` convention provides a global flag; no new feature framework was introduced.

**3. Exact files added**

- [app/admin/player-showcase/ModerationForm.tsx](C:/Users/pc/Documents/IronClad/03_Website/ironclad-player-showcase-phase-a/app/admin/player-showcase/ModerationForm.tsx)
- [app/admin/player-showcase/actions.ts](C:/Users/pc/Documents/IronClad/03_Website/ironclad-player-showcase-phase-a/app/admin/player-showcase/actions.ts)
- [app/admin/player-showcase/page.tsx](C:/Users/pc/Documents/IronClad/03_Website/ironclad-player-showcase-phase-a/app/admin/player-showcase/page.tsx)
- [app/dashboard/showcase/actions.ts](C:/Users/pc/Documents/IronClad/03_Website/ironclad-player-showcase-phase-a/app/dashboard/showcase/actions.ts)
- [app/dashboard/showcase/page.tsx](C:/Users/pc/Documents/IronClad/03_Website/ironclad-player-showcase-phase-a/app/dashboard/showcase/page.tsx)
- [components/showcase/FeaturedBadgeButton.tsx](C:/Users/pc/Documents/IronClad/03_Website/ironclad-player-showcase-phase-a/components/showcase/FeaturedBadgeButton.tsx)
- [components/showcase/FeaturedBadgePicker.tsx](C:/Users/pc/Documents/IronClad/03_Website/ironclad-player-showcase-phase-a/components/showcase/FeaturedBadgePicker.tsx)
- [components/showcase/PlayerShowcaseEditor.tsx](C:/Users/pc/Documents/IronClad/03_Website/ironclad-player-showcase-phase-a/components/showcase/PlayerShowcaseEditor.tsx)
- [components/showcase/ShowcaseProfileHeader.tsx](C:/Users/pc/Documents/IronClad/03_Website/ironclad-player-showcase-phase-a/components/showcase/ShowcaseProfileHeader.tsx)
- [components/showcase/badge-presentation.ts](C:/Users/pc/Documents/IronClad/03_Website/ironclad-player-showcase-phase-a/components/showcase/badge-presentation.ts)
- [components/showcase/support.ts](C:/Users/pc/Documents/IronClad/03_Website/ironclad-player-showcase-phase-a/components/showcase/support.ts)
- [docs/player-showcase-phase-a-implementation-report.md](C:/Users/pc/Documents/IronClad/03_Website/ironclad-player-showcase-phase-a/docs/player-showcase-phase-a-implementation-report.md)
- [lib/player-showcase/moderation.ts](C:/Users/pc/Documents/IronClad/03_Website/ironclad-player-showcase-phase-a/lib/player-showcase/moderation.ts)
- [lib/player-showcase/mutations.ts](C:/Users/pc/Documents/IronClad/03_Website/ironclad-player-showcase-phase-a/lib/player-showcase/mutations.ts)
- [lib/player-showcase/read.ts](C:/Users/pc/Documents/IronClad/03_Website/ironclad-player-showcase-phase-a/lib/player-showcase/read.ts)
- [lib/player-showcase/types.ts](C:/Users/pc/Documents/IronClad/03_Website/ironclad-player-showcase-phase-a/lib/player-showcase/types.ts)
- [lib/player-showcase/validation.ts](C:/Users/pc/Documents/IronClad/03_Website/ironclad-player-showcase-phase-a/lib/player-showcase/validation.ts)
- [supabase/migrations/20260909234122_player_showcase_phase_a.sql](C:/Users/pc/Documents/IronClad/03_Website/ironclad-player-showcase-phase-a/supabase/migrations/20260909234122_player_showcase_phase_a.sql)
- [tests/browser/showcase/index.html](C:/Users/pc/Documents/IronClad/03_Website/ironclad-player-showcase-phase-a/tests/browser/showcase/index.html)
- [tests/browser/showcase/link.tsx](C:/Users/pc/Documents/IronClad/03_Website/ironclad-player-showcase-phase-a/tests/browser/showcase/link.tsx)
- [tests/browser/showcase/main.tsx](C:/Users/pc/Documents/IronClad/03_Website/ironclad-player-showcase-phase-a/tests/browser/showcase/main.tsx)
- [tests/browser/showcase/playwright.config.ts](C:/Users/pc/Documents/IronClad/03_Website/ironclad-player-showcase-phase-a/tests/browser/showcase/playwright.config.ts)
- [tests/browser/showcase/showcase.spec.ts](C:/Users/pc/Documents/IronClad/03_Website/ironclad-player-showcase-phase-a/tests/browser/showcase/showcase.spec.ts)
- [tests/browser/showcase/vite.config.ts](C:/Users/pc/Documents/IronClad/03_Website/ironclad-player-showcase-phase-a/tests/browser/showcase/vite.config.ts)
- [tests/database/player-showcase-concurrency.mjs](C:/Users/pc/Documents/IronClad/03_Website/ironclad-player-showcase-phase-a/tests/database/player-showcase-concurrency.mjs)
- [tests/database/player-showcase-phase-a.sql](C:/Users/pc/Documents/IronClad/03_Website/ironclad-player-showcase-phase-a/tests/database/player-showcase-phase-a.sql)
- [tests/integration/player-showcase-actions.test.ts](C:/Users/pc/Documents/IronClad/03_Website/ironclad-player-showcase-phase-a/tests/integration/player-showcase-actions.test.ts)
- [tests/integration/player-showcase-moderation.test.ts](C:/Users/pc/Documents/IronClad/03_Website/ironclad-player-showcase-phase-a/tests/integration/player-showcase-moderation.test.ts)
- [tests/integration/player-showcase-phase-a-migration.test.ts](C:/Users/pc/Documents/IronClad/03_Website/ironclad-player-showcase-phase-a/tests/integration/player-showcase-phase-a-migration.test.ts)
- [tests/integration/player-showcase-projection.test.ts](C:/Users/pc/Documents/IronClad/03_Website/ironclad-player-showcase-phase-a/tests/integration/player-showcase-projection.test.ts)
- [tests/unit/components/PlayerShowcase.test.tsx](C:/Users/pc/Documents/IronClad/03_Website/ironclad-player-showcase-phase-a/tests/unit/components/PlayerShowcase.test.tsx)
- [tests/unit/lib/i18n/showcase.test.ts](C:/Users/pc/Documents/IronClad/03_Website/ironclad-player-showcase-phase-a/tests/unit/lib/i18n/showcase.test.ts)
- [tests/unit/player-showcase-validation.test.ts](C:/Users/pc/Documents/IronClad/03_Website/ironclad-player-showcase-phase-a/tests/unit/player-showcase-validation.test.ts)

**4. Exact files modified**

- [app/admin/system/page.tsx](C:/Users/pc/Documents/IronClad/03_Website/ironclad-player-showcase-phase-a/app/admin/system/page.tsx)
- [app/dashboard/page.tsx](C:/Users/pc/Documents/IronClad/03_Website/ironclad-player-showcase-phase-a/app/dashboard/page.tsx)
- [app/dashboard/public-profile-actions.ts](C:/Users/pc/Documents/IronClad/03_Website/ironclad-player-showcase-phase-a/app/dashboard/public-profile-actions.ts)
- [app/players/[playerId]/page.tsx](C:/Users/pc/Documents/IronClad/03_Website/ironclad-player-showcase-phase-a/app/players/[playerId]/page.tsx)
- [components/DiscordContactButton.tsx](C:/Users/pc/Documents/IronClad/03_Website/ironclad-player-showcase-phase-a/components/DiscordContactButton.tsx)
- [components/PublicPlayerProfileHeader.tsx](C:/Users/pc/Documents/IronClad/03_Website/ironclad-player-showcase-phase-a/components/PublicPlayerProfileHeader.tsx)
- [components/badges/BadgeArtwork.tsx](C:/Users/pc/Documents/IronClad/03_Website/ironclad-player-showcase-phase-a/components/badges/BadgeArtwork.tsx)
- [components/dashboard/DashboardIdentity.tsx](C:/Users/pc/Documents/IronClad/03_Website/ironclad-player-showcase-phase-a/components/dashboard/DashboardIdentity.tsx)
- [lib/i18n/dictionaries/en/account-dashboard.ts](C:/Users/pc/Documents/IronClad/03_Website/ironclad-player-showcase-phase-a/lib/i18n/dictionaries/en/account-dashboard.ts)
- [lib/i18n/dictionaries/es/account-dashboard.ts](C:/Users/pc/Documents/IronClad/03_Website/ironclad-player-showcase-phase-a/lib/i18n/dictionaries/es/account-dashboard.ts)
- [lib/i18n/dictionaries/fr/account-dashboard.ts](C:/Users/pc/Documents/IronClad/03_Website/ironclad-player-showcase-phase-a/lib/i18n/dictionaries/fr/account-dashboard.ts)
- [lib/i18n/dictionaries/it/account-dashboard.ts](C:/Users/pc/Documents/IronClad/03_Website/ironclad-player-showcase-phase-a/lib/i18n/dictionaries/it/account-dashboard.ts)
- [lib/i18n/dictionaries/ko/account-dashboard.ts](C:/Users/pc/Documents/IronClad/03_Website/ironclad-player-showcase-phase-a/lib/i18n/dictionaries/ko/account-dashboard.ts)
- [lib/i18n/dictionaries/pt-BR/account-dashboard.ts](C:/Users/pc/Documents/IronClad/03_Website/ironclad-player-showcase-phase-a/lib/i18n/dictionaries/pt-BR/account-dashboard.ts)
- [lib/i18n/dictionaries/ru/account-dashboard.ts](C:/Users/pc/Documents/IronClad/03_Website/ironclad-player-showcase-phase-a/lib/i18n/dictionaries/ru/account-dashboard.ts)
- [lib/i18n/dictionaries/zh-CN/account-dashboard.ts](C:/Users/pc/Documents/IronClad/03_Website/ironclad-player-showcase-phase-a/lib/i18n/dictionaries/zh-CN/account-dashboard.ts)
- [tests/browser/ui-redesign/runtime.ts](C:/Users/pc/Documents/IronClad/03_Website/ironclad-player-showcase-phase-a/tests/browser/ui-redesign/runtime.ts)
- [tests/browser/ui-redesign/vite.config.ts](C:/Users/pc/Documents/IronClad/03_Website/ironclad-player-showcase-phase-a/tests/browser/ui-redesign/vite.config.ts)
- [tests/integration/admin-system-page-authorization.test.tsx](C:/Users/pc/Documents/IronClad/03_Website/ironclad-player-showcase-phase-a/tests/integration/admin-system-page-authorization.test.tsx)
- [tests/integration/admin-tournament-workspace-contract.test.ts](C:/Users/pc/Documents/IronClad/03_Website/ironclad-player-showcase-phase-a/tests/integration/admin-tournament-workspace-contract.test.ts)
- [tests/integration/public-profile-active-tournament-elo-snapshots.test.tsx](C:/Users/pc/Documents/IronClad/03_Website/ironclad-player-showcase-phase-a/tests/integration/public-profile-active-tournament-elo-snapshots.test.tsx)

**5. Migration file**

`20260909234122_player_showcase_phase_a.sql` is the only new migration. It is transactional and requires PostgreSQL 15+ with UTF8. Only the nominated migration owner edited migrations. No previously committed migration was edited, and no migration was applied to any database.

**6. RLS/security model**

RLS is enabled and forced. Authenticated owners can read only their allowed fields on their own active player's row; they receive no direct insert/update/delete grants. Field-specific SECURITY DEFINER RPCs derive the player from the authenticated JWT `sub`, validate ownership and input, and enforce expected revisions under parent-row locks. Content additions/edits require the current account legal acceptance; clears remain available during feature shutdown or legal-gate outages. Functions use a fixed search path and explicit grants/revocations.

A composite foreign key from `(featured_badge_award_id, player_id)` to `player_badge_awards(id, player_id)` enforces ownership. Award deletion clears only the preference column. The service-only moderation RPC requires the trusted service role; the page, Server Action and server-only helper independently verify Clerk `sessionClaims.metadata.role === "admin"`.

**7. Public Showcase projection**

`public_player_showcases` exposes only player UUID, normalized thought, canonical badge slug and a safe award timestamp. The application narrows this again to thought and canonical badge presentation data; it never returns Clerk IDs, raw award IDs, source metadata, registration/proof identifiers or moderator attribution publicly. The view requires the global flag, public-profile opt-in and an unclosed account. A moderation hold hides only the thought. Unknown catalogue entries are omitted. Existing `public_player_profiles` is unchanged.

**8. Current Thought implementation**

Add/edit/remove, null/empty support, NFC normalization, trimmed surrounding whitespace, tabs and line breaks converted to spaces, and a 160-Unicode-code-point limit are enforced in client, server and SQL. Remaining C0/C1 controls and dangerous bidi overrides/isolates are rejected before trimming; JavaScript also rejects unpaired surrogates. Ordinary RTL letters, CJK, combining text and emoji remain supported. React renders plain text; HTML-looking strings and URLs are inert. No expiry, Markdown or rich-link behavior was added.

**9. Featured Badge implementation**

The editor lists owned canonical awards and persists one exact award UUID. Authentication, active-player resolution, UUID validation, ownership filtering and canonical-definition checks precede saving. SQL independently enforces ownership. Selection, replacement and removal touch only presentation state. No evaluator, grant, reveal acknowledgement or badge notification is invoked. A stale selected UUID remains available privately for removal even if the catalogue entry disappears; it is omitted publicly. Dates are not displayed in Phase A because recorded and historical award dates have different provenance.

**10. Public profile UI integration**

An enabled Showcase uses a single capped 1280px steel/zinc identity surface with restrained orange accents. It preserves existing authoritative name, country, region and current ELO facts, uses the player avatar proxy, shows a small featured badge and wraps the thought at a readable line length. No Division field or competition fact was invented. The legacy header remains the fallback when Showcase is disabled or unavailable.

**11. Dashboard Showcase UX**

Dashboard Identity has a compact Manage Showcase entry when enabled. `/dashboard/showcase` contains a capped 960px editor with visibility status, existing visibility-management navigation, a public-profile link when enabled, Current Thought controls, owned badge picker and moderation feedback. Showcase edits never enable public profile visibility. Thought and badge operations preserve independent drafts. Conflicts require an explicit review of the latest saved state before retrying; unsaved thought text is retained.

Minimal administrator moderation is at `/admin/player-showcase`, linked from System & Recovery. It looks up a player UUID and hides/restores the thought using a revision check. Reporting/support links reuse the existing Discord support destination.

**12. Mobile/responsive work**

Mobile avatar is 80px; desktop is 112px. Featured artwork is secondary and remains below the avatar without overlap, within an accessible interaction target. New header labels have a 12px minimum, and thought text is 16px. Long names/facts and translated text wrap. Native ReferenceDialog behavior supplies keyboard dismissal and focus restoration.

Synthetic Chromium checks cover 320, 390, 844 landscape, 1024, 1440 and 2560px; seven additional locales at 320px; large text, reduced motion, empty state, badge focus and editor save flows. Existing Dashboard checks cover 360–3440px and its registration/notification/dialog flows.

**13. Localization work**

Only Showcase keys were added to account-dashboard dictionaries for English, Italian, Simplified Chinese, Russian, Spanish, Brazilian Portuguese, Korean and French. Existing badge dictionaries supply canonical badge wording. No competition dictionary was modified or copied from the older audit worktree.

**14. Account closure integration**

The new closure wrapper removes the player's Showcase before calling the preserved announcement → push → competition/polls closure chain. It also clears the closing moderator's attribution from other Showcase rows. Parent locking prevents a concurrent owner save from recreating the row after closure. Cleanup covers both deleted and historically pseudonymized players, rather than relying only on cascade deletion. The public projection independently excludes closed accounts.

**15. Tests added**

New tests cover Unicode normalization/limits, inert text, owned/foreign/missing/unknown awards, clear/change operations, stale preference removal, conflict recovery, legal/auth/admin failures, response allowlists, feature-off behavior, private/closed projections, localization and UI interactions. Migration contract tests preserve historical migration hashes and compare both SQL badge allowlists to the canonical catalogue.

Executable SQL contracts cover real database roles, bypass attempts, moderation, privacy, FK removal and deleted/pseudonymized closure. A bounded multi-session race harness covers concurrent first saves, closure before a late first save, and a save followed by account closure. These SQL runtime tests are written but were not executed.

**16. Commands run**

All implementation/build/test commands targeted the isolated worktree explicitly. Commands included:

```text
git status --short
git branch --show-current
git rev-parse HEAD
git worktree list --porcelain
git diff --check
git diff --stat
git ls-files --others --exclude-standard
npm ci
supabase migration new player_showcase_phase_a  (cached local CLI)
npm run lint
npx tsc --noEmit
npm run test:unit
npm run test:unit -- --maxWorkers=4
npm run test:integration
npm run test:integration -- --maxWorkers=4
npx vitest run tests/unit tests/integration --maxWorkers=4
npm run build
npx playwright test --config tests/browser/showcase/playwright.config.ts
npx playwright test --config tests/browser/ui-redesign/playwright.config.ts
node --check tests/database/player-showcase-concurrency.mjs
```

The existing Dashboard Playwright config used its required process-only `UI_REDESIGN_SURFACE=dashboard` selector. Focused Vitest/ESLint checks were also run during development. Read-only tool discovery found no usable local PostgreSQL runtime. No SQL test or migration execution command was issued against a database.

**17. Exact pass/fail results**

| Check | Final result |
|---|---|
| Final combined unit + integration run | **317 files / 3,188 tests passed** |
| Earlier separate full unit run | 149 files / 1,620 tests passed; subsequent tests included in final combined run |
| Earlier separate full integration run | 168 files / 1,566 tests passed |
| Showcase Chromium fixture | **16/16 passed** |
| Existing Dashboard Chromium fixture | **21/21 passed** |
| Full ESLint | Passed: 0 errors, 1 existing warning in unchanged DeleteAccountSection.tsx:37 |
| TypeScript | Passed; also passed during the final production build |
| Final production build | Passed, including the new /dashboard/showcase and /admin/player-showcase routes |
| Migration source contracts | 17/17 focused tests passed; also included in final combined run |
| SQL race harness JavaScript syntax | Passed |
| Git whitespace check | Passed |
| Executable SQL/RLS/closure/race tests | **Not run: no usable local PostgreSQL runtime** |

The existing lint warning concerns window.location.assign() in account deletion. JSDOM emitted existing scrollTo-not-implemented notices without failing the final suite. Synthetic browser failure-state fixtures intentionally logged their injected errors.

Earlier runs exposed issues that were corrected: a new UI copy assertion, request-locale mocks for updated pages, the exact migration ledger, malformed RPC result mapping and a temporary browser-fixture type error. An existing timing-sensitive registration-navigation unit test failed under the initial high worker count, then passed alone and in the bounded full suite. One Dashboard browser invocation selected no tests because its surface selector was absent; the corrected invocation passed all 21 tests. No failing assertion was removed to obtain a pass.

**18. Runtime verification intentionally unavailable**

No `.env.local`, Vercel project link or Supabase project link exists. Real Clerk → Server Action → Supabase behavior, live grants/RLS, SQL concurrency/closure behavior and Staging migration compatibility are not verified. Browser tests use synthetic in-memory fixtures with external requests and service imports blocked. Build checks used the repository's CI dummy values with a loopback-only Supabase URL; they do not establish authenticated runtime success.

**19. Known limitations and unresolved assumptions**

The migration must be replayed and its SQL contracts/races executed on an explicitly approved isolated PostgreSQL 15+ UTF8 environment before Staging application. Live migration history/version was not assumed. The feature is disabled by default and cannot be reviewed against real profiles until the later approved configuration step. Badge dates and event context are intentionally omitted. No new dependencies or environment variables were added; `npm ci` reported nine vulnerabilities in the existing unchanged dependency lockfile. Potential integration overlap with the older audit worktree remains in Dashboard and account dictionaries; those changes were neither read as an implementation source nor copied, discarded or modified.

**20. Phase B integration points**

The capped identity surface ends before existing public statistics; later content can be inserted immediately beneath it. Phase A adds no Combat Highlights headings, fake clip slots, video UI, storage, Workers/R2, media tables or media flags. No Phase B behavior is present.

**21. Rollback strategy**

The existing settings convention uses key `player_showcase` with JSON `{ "enabled": false }` by default. After explicit approval in a verified environment, disabling this same key hides public Showcase, removes the Dashboard entry and prevents content additions while retaining presentation rows and allowing clears. Missing/malformed flag state also fails closed. No destructive rollback is needed. If application code is later reverted, retain the additive schema and closure cleanup until a separately reviewed database rollback is prepared; do not drop live personal data or break the closure wrapper chain.

**22. Git status**

Final worktree state: **21 modified tracked files and 33 untracked new files**, all implementation changes unstaged; no staged files or commits. Branch and HEAD remain `codex/player-showcase-phase-a` / `631e5ad225fdd8e702e99a3e80e57e2f62368051`. The original checkout is clean on `master` at `6b37295ce9e6874cc753d902f93223566e82015d`. No environment file or project link was introduced.

**23. Git diff summary**

**54 files total:** 21 existing files modified and 33 files added. Git's tracked-file diff reports **604 insertions and 7 deletions**; untracked new files are separately enumerated in item 3 and intentionally remain unstaged.

Only Phase A application, localized copy, migration, tests and this handoff report are changed. The existing Dashboard browser fixture gained a feature-off stub so it retains its original service isolation. Package manifests, lockfile, environment example, competition dictionaries, global stylesheet, root layout, proxy configuration and competition authority modules are unchanged.

**24. Production and external services**

Production master and the older audit worktree were not modified. No secrets or environment files were copied/read for values. No production or Staging data was accessed or mutated for this task. No live migration, external project link, deployment, commit, merge, push or PR was created. Local fixture servers were stopped after testing. Work stops here for review before any Staging database application or deployment.
