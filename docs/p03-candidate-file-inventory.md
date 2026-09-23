# P03 candidate file inventory

This is a path-level snapshot of the candidate preparation on 2026-09-23,
relative to Production baseline `0f23d7d906c8588de3051fd9a7cdcf218a576ab3`.
The selectively imported Staging source is
`4900d00c81a2c3f1ea0c126444f44499f3726aa4`; candidate branch is
`codex/p03-production-ready`. This document does not embed its own future commit
SHA. The final clean candidate, CI, Preview and release seal must bind the final
full SHA separately.

## Method and totals

The inventory combines `git diff --name-status <baseline>` with
`git ls-files --others --exclude-standard`, then includes this new inventory
document itself. Ignored private evidence, credentials, local backup archives,
generated build output and recovery directories are excluded.

- **163 candidate paths:** 109 selected P03 source paths and 54 preparation paths.
- **56 modified baseline files; 107 added files; no deleted or renamed baseline files.**
- **Six new migrations:** four unchanged P03 originals plus two new safety migrations.
- The imported set was independently rebuilt from the nine non-merge commits in
  [the scope audit](p03-scope-audit.md). Their 110-path union excludes only the
  unrelated `docs/production-release-queue.md`, leaving exactly 109 imported paths.
- `M` = modified relative to baseline; `A` = added and already tracked;
  `A*` = new prepared file untracked at inspection (including this document).
  These markers describe the snapshot, not whether a later reviewed commit has
  added the file.

“Imported” describes provenance, not blind Staging replacement. Overlapping
Production behavior was reconciled, and final preparation may extend the selected
P03 files. [The scope audit](p03-scope-audit.md) records those integration decisions.

## Exact categorized candidate paths

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
| M | `components/admin/tournaments/AdminTournamentMatches.tsx` |
| M | `components/AdminMatchManagementDialog.tsx` |
| A | `components/AdminMatchRoomControl.tsx` |
| M | `components/AdminMatchWorkspace.tsx` |
| A | `components/MatchRoom.tsx` |
| A | `components/MatchRoomAssistanceControls.tsx` |
| M | `components/RequestAdminAssistanceButton.tsx` |
| A | `components/tournaments/MatchRoomAttentionAction.tsx` |
| A | `components/tournaments/useMatchRoomUnread.ts` |
| M | `components/TournamentsExperience.tsx` |
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
| A* | `docs/p03-candidate-file-inventory.md` |
| A | `docs/p03-preview-validation.md` |
| A | `docs/p03-production-inspection.json` |
| A | `docs/p03-production-ledger.json` |
| A | `docs/p03-production-readiness.md` |
| A | `docs/p03-release-runbook.md` |
| A | `docs/p03-scope-audit.md` |

### Database package, disposable rehearsal, and concurrency evidence (18)

| Change | Path |
| --- | --- |
| A | `scripts/p03-db/attention-concurrency.mjs` |
| A | `scripts/p03-db/concurrency.mjs` |
| A | `scripts/p03-db/dependencies.json` |
| A | `scripts/p03-db/execute.mjs` |
| A | `scripts/p03-db/local-pg.mjs` |
| A | `scripts/p03-db/manifest.json` |
| A | `scripts/p03-db/package.mjs` |
| A | `scripts/p03-db/README.md` |
| A | `scripts/p03-db/rehearse-executor.mjs` |
| A | `scripts/p03-db/rehearse.mjs` |
| A | `scripts/p03-db/replay-baseline.mjs` |
| A | `scripts/p03-db/seed-rehearsal.mjs` |
| A | `tests/p03-db/attention-concurrency-evidence.json` |
| A | `tests/p03-db/concurrency-evidence.json` |
| A | `tests/p03-db/executor-evidence.json` |
| A | `tests/p03-db/package-checks.mjs` |
| A | `tests/p03-db/partial-tournament.sql` |
| A | `tests/p03-db/rehearsal-evidence.json` |

### Safe hosted Preview validation and prepared synthetic fixtures (12)

| Change | Path |
| --- | --- |
| A | `scripts/p03-preview/create-fixture.mjs` |
| A | `scripts/p03-preview/README.md` |
| A | `tests/p03-preview/fixture-guards.mjs` |
| A* | `tests/preview/p03/admin-identity.ts` |
| A | `tests/preview/p03/fixture.ts` |
| A | `tests/preview/p03/hosted.spec.ts` |
| A | `tests/preview/p03/playwright.config.ts` |
| A | `tests/preview/p03/receipt-scope.ts` |
| A | `tests/preview/p03/runtime.ts` |
| A | `tests/preview/p03/target.ts` |
| A* | `tests/unit/p03-preview/admin-identity.test.ts` |
| A | `tests/unit/p03-preview/fixture.test.ts` |

### Backup, restore, fingerprint, and release gate tooling (11)

| Change | Path |
| --- | --- |
| A | `scripts/p03-release/backup.mjs` |
| A | `scripts/p03-release/cli.mjs` |
| A | `scripts/p03-release/core.mjs` |
| A | `scripts/p03-release/facts.mjs` |
| A | `scripts/p03-release/gate.mjs` |
| A | `scripts/p03-release/production-extensions.json` |
| A | `scripts/p03-release/README.md` |
| A | `scripts/p03-release/rehearsal-evidence.json` |
| A | `scripts/p03-release/rehearse-hosted-runtime.mjs` |
| A | `scripts/p03-release/restore-runtime.compose.yml` |
| A | `tests/unit/p03-release/release-tooling.test.ts` |

### Imported P03 migrations (4)

| Change | Path |
| --- | --- |
| A | `supabase/migrations/20260919011425_match_room_phase_one.sql` |
| A | `supabase/migrations/20260919235836_match_room_phase_three.sql` |
| A | `supabase/migrations/20260920014644_match_room_production_hardening.sql` |
| A | `supabase/migrations/20260922054205_match_room_unread_summary.sql` |

### New atomic-release safety migrations (2)

| Change | Path |
| --- | --- |
| A | `supabase/migrations/20260923040206_match_room_production_bootstrap.sql` |
| A | `supabase/migrations/20260923040754_match_room_disabled_assistance_gate.sql` |

### Imported P03 regression and browser coverage (53)

| Change | Path |
| --- | --- |
| M | `tests/browser/bracket-layout/bracket.spec.ts` |
| M | `tests/browser/bracket-layout/main.tsx` |
| M | `tests/browser/bracket-layout/README.md` |
| M | `tests/browser/match-result/flow.spec.ts` |
| M | `tests/browser/match-result/main.tsx` |
| M | `tests/browser/match-result/playwright.config.ts` |
| M | `tests/browser/match-result/runtime.ts` |
| M | `tests/browser/match-result/vite.config.ts` |
| A | `tests/browser/match-room/flow.spec.ts` |
| A | `tests/browser/match-room/index.html` |
| A | `tests/browser/match-room/main.tsx` |
| A | `tests/browser/match-room/playwright.config.ts` |
| A | `tests/browser/match-room/README.md` |
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
only the six additions above. The following specifically audited baseline paths
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
historical boundary while classifying the two new safety migrations.
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

## Final atomic-package read-only audit

The manifest, actual canonical LF sources, runbook and package builder agree on
this exact execution order and checksum:

| Order | Migration | Canonical SHA-256 |
| --- | --- | --- |
| 1 | `20260923040206_match_room_production_bootstrap.sql` | `0fe7e3da5e819bb433f9018b3d78f01fb2a13b394eded4c7677d6a2d367856cf` |
| 2 | `20260919011425_match_room_phase_one.sql` | `eed2aec0caa5f7ca07a48de76b11209e7b1aa337cc9cca7b1f958e32d6ad7753` |
| 3 | `20260919235836_match_room_phase_three.sql` | `afafc5b80f7baecff212cb368af4c3dbedb785159888b06744bd21c420638720` |
| 4 | `20260920014644_match_room_production_hardening.sql` | `a03c4a3492ab54124c35ff9a487d7cd20441c5014b880747187e1e5b6643c725` |
| 5 | `20260922054205_match_room_unread_summary.sql` | `42efbf9b372b57e1007ba74fc282fad3bf96535be2b60f6c8578504f8e0618ef` |
| 6 | `20260923040754_match_room_disabled_assistance_gate.sql` | `e832709b6fead11abda0287a7fdaa38f1ed910527accdb70f1d5819286023565` |

Built atomic SQL SHA-256:
`fa6f011102211889ac1ec478231865157f10220913ebf17a1447371dcdabcc93`.

The four original sources also match the Staging commit after CRLF-to-LF
normalization. The two existing database rehearsal evidence files record the
same package hash. No migration or executor source was changed during this audit.

Read-only code review confirmed one transaction for schema and all six ledger
entries; 2-second lock / 60-second statement limits; checksummed envelope handling;
bootstrap OFF before capability installation; final no-history assertions;
three normalized dependency-definition checks; and competition comparison under
bounded table locks in the same transaction. The executor separately requires
the exact approval phrase, a fresh PASS receipt, clean sealed HEAD, unchanged
remote master, correct endpoint identity and fingerprint bindings. Unknown commit
outcomes require read-only inspection rather than automatic retry.

`node --test tests/p03-db/package-checks.mjs` passed all nine checks during this
audit. No database connection, migration application, live gate, deployment,
setting mutation or fixture creation was performed for the audit. Prior database
rehearsal evidence is historical proof of the same package, not a fresh final-SHA
hosted release gate.

No unresolved atomic-package defect was identified. Release readiness still
requires the final exact-SHA CI and hosted validation, successful compatible
backup/restore evidence, the approved privacy decision, and the fresh release-day
gate. Prepared fixture source is included above; it does not mean the new admin
or tournament exists. Privileged-admin and actual Staging-worker verification
holds remain documented in the fixture preparation README. Fixture planning also
requires an already active IronClad admin profile and genuine acceptance of the
current Terms/Privacy pair; it never creates profiles or acceptance evidence.
