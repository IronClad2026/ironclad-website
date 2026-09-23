# P03 candidate file inventory

Final preparation snapshot relative to Production baseline `0f23d7d906c8588de3051fd9a7cdcf218a576ab3`. Staging source is `4900d00c81a2c3f1ea0c126444f44499f3726aa4`; branch is `codex/p03-production-ready`. The PR and final seal separately bind the resulting commit SHA.

## Method and totals

Combines `git diff --name-status <baseline>` and non-ignored untracked paths. Ignored private evidence, credentials, archives, build output and recovery directories are excluded. `M` means modified baseline; `A` means added candidate path, regardless of staging state.

- **198 paths:** 109 selected P03 source paths and 89 preparation paths.
- **64 modified, 134 added; no deletions or renames.
- **Seven new migrations:** four historical P03 originals, two prior safety migrations, one additive retention/privacy migration.
- Imported provenance is independently rebuilt from the nine non-merge commits in the scope audit. Its 110-path union excludes only the unrelated P04 release queue. Integration preserves relevant master behavior.

## Exact categorized candidate paths

### Review PDF binary preservation (1)

| Change | Path |
| --- | --- |
| M | `.gitattributes` |

### Imported CI integration, extended for final P03 preparation (1)

| Change | Path |
| --- | --- |
| M | `.github/workflows/ci.yml` |

### Preview build isolation and local artifact hygiene (4)

| Change | Path |
| --- | --- |
| M | `.gitignore` |
| A | `lib/p03-preview-safety.ts` |
| M | `next.config.ts` |
| A | `tests/unit/lib/p03-preview-safety.test.ts` |

### Imported P03 application and localization integration (44)

| Change | Path |
| --- | --- |
| A | `app/admin/system/match-room-actions.ts` |
| M | `app/admin/system/page.tsx` |
| M | `app/admin/tournaments/[tournamentId]/page.tsx` |
| A | `app/tournaments/room-actions.ts` |
| A | `app/tournaments/room-unread-actions.ts` |
| M | `app/tournaments/support-actions.ts` |
| M | `components/AdminMatchManagementDialog.tsx` |
| A | `components/AdminMatchRoomControl.tsx` |
| M | `components/AdminMatchWorkspace.tsx` |
| A | `components/MatchRoom.tsx` |
| A | `components/MatchRoomAssistanceControls.tsx` |
| M | `components/RequestAdminAssistanceButton.tsx` |
| M | `components/TournamentsExperience.tsx` |
| M | `components/admin/tournaments/AdminTournamentMatches.tsx` |
| A | `components/tournaments/MatchRoomAttentionAction.tsx` |
| A | `components/tournaments/useMatchRoomUnread.ts` |
| M | `lib/admin-operations.ts` |
| M | `lib/i18n/dictionaries/en/competition.ts` |
| M | `lib/i18n/dictionaries/en/notifications.ts` |
| M | `lib/i18n/dictionaries/es/competition.ts` |
| M | `lib/i18n/dictionaries/es/notifications.ts` |
| M | `lib/i18n/dictionaries/fr/competition.ts` |
| M | `lib/i18n/dictionaries/fr/notifications.ts` |
| M | `lib/i18n/dictionaries/it/competition.ts` |
| M | `lib/i18n/dictionaries/it/notifications.ts` |
| M | `lib/i18n/dictionaries/ko/competition.ts` |
| M | `lib/i18n/dictionaries/ko/notifications.ts` |
| M | `lib/i18n/dictionaries/pt-BR/competition.ts` |
| M | `lib/i18n/dictionaries/pt-BR/notifications.ts` |
| M | `lib/i18n/dictionaries/ru/competition.ts` |
| M | `lib/i18n/dictionaries/ru/notifications.ts` |
| M | `lib/i18n/dictionaries/zh-CN/competition.ts` |
| M | `lib/i18n/dictionaries/zh-CN/notifications.ts` |
| A | `lib/i18n/match-room-control.ts` |
| A | `lib/i18n/match-room.ts` |
| M | `lib/i18n/notification-copy.ts` |
| A | `lib/match-room-assistance.ts` |
| A | `lib/match-room-settings.ts` |
| A | `lib/match-room-unread-events.ts` |
| A | `lib/match-room-unread.ts` |
| A | `lib/match-room.ts` |
| M | `lib/notifications.ts` |
| M | `lib/web-push/policy.ts` |
| M | `lib/web-push/worker.ts` |

### Legal successor, privacy readiness and historical contract compatibility (23)

| Change | Path |
| --- | --- |
| A | `content/legal-privacy-successor-v1.3.json` |
| A | `docs/legal-drafts/p03-privacy-v1.3/ironclad-privacy-policy-v1.3.pdf` |
| A | `docs/legal-drafts/p03-privacy-v1.3/legal-corpus.json` |
| A | `docs/legal-drafts/p03-privacy-v1.3/predecessor-corpus.json` |
| A | `docs/legal-drafts/p03-privacy-v1.3/predecessor-release.json` |
| A | `docs/legal-drafts/p03-privacy-v1.3/review-manifest.json` |
| A | `docs/p03-privacy-readiness.json` |
| A | `docs/p03-privacy-successor-runbook.md` |
| A | `docs/p03-retention-decision.json` |
| M | `scripts/generate-legal-pdfs.py` |
| A | `scripts/legal-successor/p03-legal-runtime.mjs` |
| A | `scripts/legal-successor/p03-privacy-publication.mjs` |
| A | `scripts/legal-successor/prepare-p03-privacy.mjs` |
| A | `scripts/legal-successor/rehearse-p03-privacy.mjs` |
| A | `scripts/legal-successor/stage-p03-privacy.mjs` |
| M | `tests/integration/legal-privacy-successor-v1.2-publication.test.ts` |
| M | `tests/integration/legal-publication-contract.test.ts` |
| M | `tests/unit/legal-gate-stability-wording.test.ts` |
| A | `tests/unit/legal-p03-privacy-readiness.test.ts` |
| A | `tests/unit/legal-p03-staging.test.ts` |
| M | `tests/unit/legal-privacy-successor-v1.2-contract.test.ts` |
| M | `tests/unit/legal-rulebook-ppa-v3.1-publication.test.ts` |
| M | `tests/unit/legal-successor-contract.test.ts` |

### Imported P03 design and checkpoint evidence (7)

| Change | Path |
| --- | --- |
| A | `docs/match-room-phase-1-checkpoint.md` |
| A | `docs/match-room-phase-1-evidence.json` |
| A | `docs/match-room-phase-1.md` |
| A | `docs/match-room-phase-2.md` |
| A | `docs/match-room-phase-3.md` |
| A | `docs/match-room-production-hardening.md` |
| A | `docs/match-room-unread-card-indicator.md` |

### Candidate preparation, inspection, inventory, and release documents (7)

| Change | Path |
| --- | --- |
| A | `docs/p03-candidate-file-inventory.md` |
| A | `docs/p03-preview-validation.md` |
| A | `docs/p03-production-inspection.json` |
| A | `docs/p03-production-ledger.json` |
| A | `docs/p03-production-readiness.md` |
| A | `docs/p03-release-runbook.md` |
| A | `docs/p03-scope-audit.md` |

### Database package, disposable rehearsal, and concurrency evidence (23)

| Change | Path |
| --- | --- |
| A | `scripts/p03-db/README.md` |
| A | `scripts/p03-db/attention-concurrency.mjs` |
| A | `scripts/p03-db/concurrency.mjs` |
| A | `scripts/p03-db/dependencies.json` |
| A | `scripts/p03-db/execute.mjs` |
| A | `scripts/p03-db/local-pg.mjs` |
| A | `scripts/p03-db/manifest.json` |
| A | `scripts/p03-db/package.mjs` |
| A | `scripts/p03-db/rehearse-executor.mjs` |
| A | `scripts/p03-db/rehearse.mjs` |
| A | `scripts/p03-db/replay-baseline.mjs` |
| A | `scripts/p03-db/retention-concurrency.mjs` |
| A | `scripts/p03-db/retention.mjs` |
| A | `scripts/p03-db/seed-rehearsal.mjs` |
| A | `tests/p03-db/attention-concurrency-evidence.json` |
| A | `tests/p03-db/concurrency-evidence.json` |
| A | `tests/p03-db/executor-evidence.json` |
| A | `tests/p03-db/package-checks.mjs` |
| A | `tests/p03-db/partial-tournament.sql` |
| A | `tests/p03-db/rehearsal-evidence.json` |
| A | `tests/p03-db/retention-concurrency-evidence.json` |
| A | `tests/p03-db/retention-evidence.json` |
| A | `tests/p03-db/retention.sql` |

### Safe hosted Preview validation and prepared synthetic fixtures (12)

| Change | Path |
| --- | --- |
| A | `scripts/p03-preview/README.md` |
| A | `scripts/p03-preview/create-fixture.mjs` |
| A | `tests/p03-preview/fixture-guards.mjs` |
| A | `tests/preview/p03/admin-identity.ts` |
| A | `tests/preview/p03/fixture.ts` |
| A | `tests/preview/p03/hosted.spec.ts` |
| A | `tests/preview/p03/playwright.config.ts` |
| A | `tests/preview/p03/receipt-scope.ts` |
| A | `tests/preview/p03/runtime.ts` |
| A | `tests/preview/p03/target.ts` |
| A | `tests/unit/p03-preview/admin-identity.test.ts` |
| A | `tests/unit/p03-preview/fixture.test.ts` |

### Backup, restore, fingerprint, release gate and privacy tooling (16)

| Change | Path |
| --- | --- |
| A | `scripts/p03-release/README.md` |
| A | `scripts/p03-release/backup.mjs` |
| A | `scripts/p03-release/cli.mjs` |
| A | `scripts/p03-release/core.mjs` |
| A | `scripts/p03-release/facts.mjs` |
| A | `scripts/p03-release/gate.mjs` |
| A | `scripts/p03-release/privacy-operations.md` |
| A | `scripts/p03-release/privacy-readiness.mjs` |
| A | `scripts/p03-release/privacy.mjs` |
| A | `scripts/p03-release/production-extensions.json` |
| A | `scripts/p03-release/rehearsal-evidence.json` |
| A | `scripts/p03-release/rehearse-hosted-runtime.mjs` |
| A | `scripts/p03-release/restore-runtime.compose.yml` |
| A | `tests/unit/p03-release/privacy-readiness.test.ts` |
| A | `tests/unit/p03-release/privacy.test.ts` |
| A | `tests/unit/p03-release/release-tooling.test.ts` |

### Imported P03 migrations (4)

| Change | Path |
| --- | --- |
| A | `supabase/migrations/20260919011425_match_room_phase_one.sql` |
| A | `supabase/migrations/20260919235836_match_room_phase_three.sql` |
| A | `supabase/migrations/20260920014644_match_room_production_hardening.sql` |
| A | `supabase/migrations/20260922054205_match_room_unread_summary.sql` |

### New atomic-release safety and retention migrations (3)

| Change | Path |
| --- | --- |
| A | `supabase/migrations/20260923040206_match_room_production_bootstrap.sql` |
| A | `supabase/migrations/20260923040754_match_room_disabled_assistance_gate.sql` |
| A | `supabase/migrations/20260923062127_match_room_retention_and_privacy.sql` |

### Imported P03 regression and browser coverage (53)

| Change | Path |
| --- | --- |
| M | `tests/browser/bracket-layout/README.md` |
| M | `tests/browser/bracket-layout/bracket.spec.ts` |
| M | `tests/browser/bracket-layout/main.tsx` |
| M | `tests/browser/match-result/flow.spec.ts` |
| M | `tests/browser/match-result/main.tsx` |
| M | `tests/browser/match-result/playwright.config.ts` |
| M | `tests/browser/match-result/runtime.ts` |
| M | `tests/browser/match-result/vite.config.ts` |
| A | `tests/browser/match-room/README.md` |
| A | `tests/browser/match-room/flow.spec.ts` |
| A | `tests/browser/match-room/index.html` |
| A | `tests/browser/match-room/main.tsx` |
| A | `tests/browser/match-room/playwright.config.ts` |
| A | `tests/browser/match-room/runtime.ts` |
| A | `tests/browser/match-room/visibility-runtime.ts` |
| A | `tests/browser/match-room/vite.config.ts` |
| A | `tests/database/match-room-phase-1-concurrency.mjs` |
| A | `tests/database/match-room-phase-1.sql` |
| A | `tests/database/match-room-phase-3-backfill.mjs` |
| A | `tests/database/match-room-phase-3-concurrency.mjs` |
| A | `tests/database/match-room-phase-3.sql` |
| A | `tests/database/match-room-production-hardening-concurrency.mjs` |
| A | `tests/database/match-room-production-hardening.sql` |
| A | `tests/database/match-room-unread-concurrency.mjs` |
| A | `tests/database/match-room-unread-summary.sql` |
| M | `tests/integration/account-legal-mutation-boundary.test.ts` |
| M | `tests/integration/admin-operations-authorization.test.ts` |
| M | `tests/integration/admin-operations-loader-metrics.test.ts` |
| M | `tests/integration/admin-system-page-authorization.test.tsx` |
| M | `tests/integration/admin-tournament-workspace-contract.test.ts` |
| M | `tests/integration/match-admin-assistance-action.test.ts` |
| A | `tests/integration/match-room-actions.test.ts` |
| A | `tests/integration/match-room-migration.test.ts` |
| A | `tests/integration/match-room-phase-3-migration.test.ts` |
| A | `tests/integration/match-room-production-hardening-migration.test.ts` |
| A | `tests/integration/match-room-settings.test.ts` |
| A | `tests/integration/match-room-unread-actions.test.ts` |
| M | `tests/integration/notification-destination-resolution.test.ts` |
| M | `tests/integration/notification-projection-privacy.test.ts` |
| M | `tests/integration/stage-a-notification-event-keys.test.ts` |
| A | `tests/unit/components/AdminMatchRoomControl.test.tsx` |
| M | `tests/unit/components/AdminMatchWorkspace.test.tsx` |
| M | `tests/unit/components/AdminTournamentMatches.test.tsx` |
| M | `tests/unit/components/MatchDeadlinePresentation.test.tsx` |
| M | `tests/unit/components/MatchResultStatus.test.tsx` |
| A | `tests/unit/components/MatchRoom.test.tsx` |
| A | `tests/unit/components/MatchRoomAssistanceControls.test.tsx` |
| A | `tests/unit/components/useMatchRoomUnread.test.tsx` |
| A | `tests/unit/lib/i18n/match-room.test.ts` |
| M | `tests/unit/lib/i18n/notification-copy.test.ts` |
| A | `tests/unit/lib/match-room.test.ts` |
| M | `tests/unit/lib/web-push-policy-payload.test.ts` |
| M | `tests/unit/lib/web-push-worker.test.ts` |

## Baseline behavior preserved

Every tracked baseline path outside the candidate inventory remains inherited.
All 146 baseline migration files are untouched; the migration delta contains
only the seven additions above. The following specifically audited baseline paths
have **no diff** against `0f23d7d906c8588de3051fd9a7cdcf218a576ab3`:

- `app/api/polls/route.ts`
- `lib/player-polls.ts`
- `lib/polls.ts`
- `lib/poll-diagnostics.ts`
- `lib/poll-loading.ts`
- `lib/supabase-server.ts`
- `components/PollsAndDecisions.tsx`
- `app/tournaments/page.tsx`
- `lib/account-legal-mutation-guard.ts`
- `lib/account-legal-rpc-error.ts`
- `supabase/migrations/20260908052210_member_rpc_current_account_acceptance.sql`
- `components/tournaments/bracket-layout.ts`
- `components/tournaments/useBracketLayout.ts`
- `app/tournaments/match-actions.ts`
- `app/tournaments/dice-actions.ts`
- `app/admin/tournaments/actions.ts`
- `app/admin/tournaments/deadline-actions.ts`
- `lib/match-result-entry.ts`
- `package.json`
- `package-lock.json`
- `.env.example`

These preserve Production poll recovery, current-account legal acceptance,
bracket alignment, official result/replay/dice/deadline authorities, and dependency
versions. The unchanged `app/tournaments/page.tsx` preserves the Production poll
snapshot loading and excludes the unrelated synthetic Academy override.

Overlapping files intentionally changed by P03 retain their Production behavior:
`components/TournamentsExperience.tsx` keeps poll snapshots; the eight
`competition.ts` dictionaries keep missing/closed-player poll copy;
`app/admin/system/page.tsx` adds only Match Room administration;
`tests/integration/admin-tournament-workspace-contract.test.ts` preserves the
historical boundary while classifying the separate P03 safety and retention migrations.
These overlaps are changed paths, so they are not claimed byte-identical.

## Explicit excluded packages

The candidate does not merge Staging. The following feature families remain
excluded, including their actions, UI, data helpers, fixtures, workers and related
dependency additions:

| Package | Excluded source families |
| --- | --- |
| P01 Showcase / Thought / featured badge | `app/dashboard/showcase/`, `app/admin/player-showcase/`, `components/showcase/`, `lib/player-showcase/`; public-profile Showcase composition |
| P02 Combat Highlights | `app/admin/combat-highlights/`, `app/dashboard/showcase/highlight-actions.ts`, `components/combat-highlights/`, `lib/combat-highlights/`, `workers/combat-highlights/`; clip/media-parser dependencies |
| P04 Official News | `app/news/`, `lib/news/`, `tests/browser/news/`; grouped public navigation and News ingestion/parser additions |
| Other Staging-only behavior | Permanent synthetic Academy event and Academy registration/Relic overrides |

The following excluded individual paths were also checked absent:

- `supabase/migrations/20260903230000_permanent_staging_academy_uat.sql`
- `supabase/migrations/20260909234122_player_showcase_phase_a.sql`
- `supabase/migrations/20260910020800_player_showcase_owner_read_rls.sql`
- `supabase/migrations/20260914004801_player_combat_highlights.sql`
- `docs/production-release-queue.md`

The baseline achievement/badge platform is preserved. It is not the excluded P01
Showcase feature. `package.json`, `package-lock.json` and `.env.example` remain
identical to the Production baseline.

## Final atomic package

Manifest, canonical LF sources and package builder agree on this sequence. The four historical files also match the Staging source; the previous two safety files remain unchanged.

| Order | Migration | Canonical SHA-256 |
| --- | --- | --- |
| 1 | `20260923040206_match_room_production_bootstrap.sql` | `0fe7e3da5e819bb433f9018b3d78f01fb2a13b394eded4c7677d6a2d367856cf` |
| 2 | `20260919011425_match_room_phase_one.sql` | `eed2aec0caa5f7ca07a48de76b11209e7b1aa337cc9cca7b1f958e32d6ad7753` |
| 3 | `20260919235836_match_room_phase_three.sql` | `afafc5b80f7baecff212cb368af4c3dbedb785159888b06744bd21c420638720` |
| 4 | `20260920014644_match_room_production_hardening.sql` | `a03c4a3492ab54124c35ff9a487d7cd20441c5014b880747187e1e5b6643c725` |
| 5 | `20260922054205_match_room_unread_summary.sql` | `42efbf9b372b57e1007ba74fc282fad3bf96535be2b60f6c8578504f8e0618ef` |
| 6 | `20260923040754_match_room_disabled_assistance_gate.sql` | `e832709b6fead11abda0287a7fdaa38f1ed910527accdb70f1d5819286023565` |
| 7 | `20260923062127_match_room_retention_and_privacy.sql` | `0cd225d191adbf1cda83023b10b3f023e9c7886bffa30dd0ca44f501a0bf004b` |

Atomic package SHA-256: `40ad016e6ff05960733f4e61e0de5b949eefb3466b4978abe5990f0e4bbf318f`.

One transaction covers all seven schema/ledger steps, with OFF before visibility, 2-second lock and 60-second statement timeouts, dependency hashes and unchanged competition fingerprints. The executor requires an exact clean sealed candidate and fresh read-only PASS receipt plus the later explicit Production instruction. Unknown commit outcomes require inspection, never automatic retry.

The authorized Development admin, new synthetic Staging fixture and preliminary 14-case run now exist; the old approval holds are resolved. Final exact-SHA CI and Preview evidence belongs to the draft PR. Production fingerprint validation was read-only; all remaining release-day requirements are in the current readiness and release runbooks.
