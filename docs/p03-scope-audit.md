# P03 selective-port scope audit

Audit date: 2026-09-23. This document records source selection and integration boundaries; it is not a release authorization or a substitute for the final exact-candidate gate.

## Baselines and method

- Current fetched Production baseline: `origin/master` = `0f23d7d906c8588de3051fd9a7cdcf218a576ab3`.
- Current fetched Staging source: `origin/staging` = `4900d00c81a2c3f1ea0c126444f44499f3726aa4`.
- Candidate starts from the current Production baseline on `codex/p03-production-ready`.
- Pre-P03 Staging source boundary: `26f3518`. This boundary already contains P01/P02, which are not imported.
- Only the nine non-merge P03 commits below are used. No Staging merge commit or whole-Staging tree is imported.
- Source commits change 110 unique paths. `docs/production-release-queue.md` is deliberately excluded because the source file is a P04 operational queue; its P03 information is covered by the candidate release documents. The remaining 109 source paths form the imported inventory below. Release-preparation files are additional candidate work and must be inventoried by the final release manifest.

| PR | Non-merge source commits, in application order |
| --- | --- |
| #130 | `4d056c68e8a1ee58f2c2ecb858264a2e294990fa`, `1b2ed913a8215206b6fe3f162e36dda16735b90d`, `bc48bde7abc632d59e3403f82a2c3c44cc980b5c` |
| #131 | `1e3977ce199ab5460a0004e63bc318dcfb868e68`, `f76b6cb1d4a6dd26299bde7591bdd86dad9073cb` |
| #132 | `9aac13fc1f2991105434b2882cea0f8ba2be5a29`, `3d709bde7a76a29dfaaca8e57c52400270669cc2` |
| #133 | `f4ca426300fcc330ca1f210cb79c57e02a8a58e8` |
| #135 | `68046ab247a3bb1f9603e2f91885f88b63f00e08` |

## Preserved Production behavior

P03 never replaces the candidate with a Staging checkout. All other master files and migration history remain inherited from the baseline. The overlapping changes needing reconciliation are:

- `components/TournamentsExperience.tsx`: retain `PollListSnapshot`, `pollSnapshotsByTournament`, and `PollsAndDecisions.initialSnapshot` from Production poll recovery while adding the private Match Room and unread attention.
- All eight `lib/i18n/dictionaries/*/competition.ts` files: retain the Production `polls.missingPlayer` and `polls.closedPlayer` entries while adding P03 copy.
- `app/admin/system/page.tsx`: add Match Room controls without importing the unrelated Showcase link or Showcase translation loading.
- `tests/integration/admin-system-page-authorization.test.tsx`: preserve Production authorization coverage and add only the locale/control mocks required by Match Room.
- `tests/integration/admin-tournament-workspace-contract.test.ts`: retain Production dependency fingerprints and migration classifications; classify new P03 migrations independently of the historical workspace snapshot.
- `.github/workflows/ci.yml`: import the P03 browser coverage with Chromium installation, without P04 News test steps.

Master-only poll recovery files (`app/api/polls/route.ts`, `lib/player-polls.ts`, `lib/polls.ts`, `lib/poll-diagnostics.ts`, `lib/poll-loading.ts`, `lib/supabase-server.ts`, `components/PollsAndDecisions.tsx`) are outside the P03 source inventory and remain unchanged. `app/tournaments/page.tsx` keeps its Production poll snapshot loading and avoids the Staging synthetic Academy override. The current-account-acceptance migration and Production registration/authorization fixes remain inherited. Production bracket alignment from #129 is in the baseline and is retained.

No P03 source commit changes `package.json`, `package-lock.json`, or `.env.example`. Any release-tool dependency change must be reported separately by its owner.

## Excluded Staging packages

- P01: no `app/dashboard/showcase`, `app/admin/player-showcase`, `components/showcase`, `lib/player-showcase`, Thought editor, featured badge picker, or Showcase public-profile composition.
- P02: no `app/admin/combat-highlights`, highlight actions, `components/combat-highlights`, `lib/combat-highlights`, `workers/combat-highlights`, clip fixtures, media parser dependencies, or Combat Highlights UI.
- P04: no Official CoH3/Relic News routes, grouped public navigation, News ingestion/parser dependencies, News browser tests, or P04 operational queue.
- Other Staging-only work: no permanent Staging Academy migration or Staging synthetic Academy registration/Relic override.

Explicitly excluded migrations:

```text
20260903230000_permanent_staging_academy_uat.sql
20260909234122_player_showcase_phase_a.sql
20260910020800_player_showcase_owner_read_rls.sql
20260914004801_player_combat_highlights.sql
```

P04 does not become an indirect dependency merely because #135 follows #134 in Staging history. The only P03 source migrations are:

```text
20260919011425_match_room_phase_one.sql
20260919235836_match_room_phase_three.sql
20260920014644_match_room_production_hardening.sql
20260922054205_match_room_unread_summary.sql
```

The additional Production bootstrap/barrier is owned by the migration-safety agent and documented in the release runbook. Its order and checksum come from the final migration manifest, not from this source-only list.

## Parallel-work overlap

Read-only Git inspection found the Phase 1, Phase 2, Phase 3, hardening and unread-card source worktrees clean. Their branch heads are already merged into Staging. Open remote PRs at audit time were #122 (Clerk hosted sign-in documentation), #89 (badge historical-backfill tooling), and #82 (badge-system foundation); none was an open P03 application branch. The original checkout remains on its older local `master` head `6b37295ce9e6874cc753d902f93223566e82015d` and is not the candidate.

## Preview isolation evidence and limits

The original checkout's ignored `.env.local` was inspected in memory without printing or copying values. Its Supabase URL positively identifies Staging `zzbnneprhjicmajpjkdg`; Clerk keys classify as test keys. It contains the six established application core keys: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_CLERK_DOMAIN`, and `SUPABASE_SERVICE_ROLE_KEY`. The fresh candidate has no runtime environment file.

The separate ignored Staging UAT file contains a fixture secret and credential pairs named `STAGING_SYNTHETIC_UAT_TESTACADEMY{1..10}_{EMAIL,PASSWORD}`, `STAGING_SYNTHETIC_UAT_TESTCHALLENGE{1..10}_{EMAIL,PASSWORD}`, and `STAGING_SYNTHETIC_UAT_TESTMAIN{1..10}_{EMAIL,PASSWORD}`. No admin credential key is present. This is discovery of available test-account inputs, not evidence that an authenticated Preview flow passed. Existing permanent fixtures must not be closed, pseudonymized, or repurposed destructively.

Vercel project metadata: `ironclad-website`, project `prj_5os8tdLLkgGUSWnrxpiYj6OI6YEB`, team `team_0OLta9dgvbWgjf1Jvn7X22n0`. Connector deployment metadata confirms the Staging baseline has a READY nonproduction deployment at `https://ironclad-website-dkuga2qcg-ironclad-tournaments.vercel.app`, and the current Production deployment has the expected master SHA. These are baseline checks, not candidate Preview evidence.

The connected get-project tool failed with an argument-schema mismatch, and the cached CLI had no usable authentication. The release coordinator subsequently verified the Preview bindings through the existing authenticated Vercel UI. The candidate Next configuration guard passed in deployment `dpl_BLDdJ6i8nnQnsGGaLUnqDQAPkbuX`, which is READY at `https://ironclad-website-1pn9suto7-ironclad-tournaments.vercel.app`, on the exact candidate branch with source SHA `76d9dd3ec689ed713819f652782f771c9e9d8579` and nonproduction target. This proves the source-only deployment passed the candidate isolation guard; it does not establish the final release-tooling SHA or authenticated hosted validation.

After explicit user consent, the coordinator saved only the existing `PREVIEW_LEGAL_DOCUMENT_ORIGINS` setting for Preview on `codex/p03-production-ready`, containing the three verified effective Staging document origins recorded in `p03-preview-validation.md`. Production entries and Staging legal rows were not changed. The subsequent candidate push must produce a new READY deployment that includes this setting. Its final SHA and immutable Preview URL remain pending at this audit checkpoint and must be established independently before hosted fixture operations. Secrets were neither printed nor copied.

Existing browser fixtures start loopback Vite servers and replace authenticated boundaries with synthetic transports. They cover real components, mobile 375/390 geometry, draft preservation, unread episodes, assistance, and result/replay controls. They do not establish real hosted Clerk login, two-player persistence, administrator identity, or native push delivery. Preview evidence must distinguish these layers.

## Imported P03 source file inventory
- `.github/workflows/ci.yml`
- `app/admin/system/match-room-actions.ts`
- `app/admin/system/page.tsx`
- `app/admin/tournaments/[tournamentId]/page.tsx`
- `app/tournaments/room-actions.ts`
- `app/tournaments/room-unread-actions.ts`
- `app/tournaments/support-actions.ts`
- `components/admin/tournaments/AdminTournamentMatches.tsx`
- `components/AdminMatchManagementDialog.tsx`
- `components/AdminMatchRoomControl.tsx`
- `components/AdminMatchWorkspace.tsx`
- `components/MatchRoom.tsx`
- `components/MatchRoomAssistanceControls.tsx`
- `components/RequestAdminAssistanceButton.tsx`
- `components/tournaments/MatchRoomAttentionAction.tsx`
- `components/tournaments/useMatchRoomUnread.ts`
- `components/TournamentsExperience.tsx`
- `docs/match-room-phase-1-checkpoint.md`
- `docs/match-room-phase-1-evidence.json`
- `docs/match-room-phase-1.md`
- `docs/match-room-phase-2.md`
- `docs/match-room-phase-3.md`
- `docs/match-room-production-hardening.md`
- `docs/match-room-unread-card-indicator.md`
- `lib/admin-operations.ts`
- `lib/i18n/dictionaries/en/competition.ts`
- `lib/i18n/dictionaries/en/notifications.ts`
- `lib/i18n/dictionaries/es/competition.ts`
- `lib/i18n/dictionaries/es/notifications.ts`
- `lib/i18n/dictionaries/fr/competition.ts`
- `lib/i18n/dictionaries/fr/notifications.ts`
- `lib/i18n/dictionaries/it/competition.ts`
- `lib/i18n/dictionaries/it/notifications.ts`
- `lib/i18n/dictionaries/ko/competition.ts`
- `lib/i18n/dictionaries/ko/notifications.ts`
- `lib/i18n/dictionaries/pt-BR/competition.ts`
- `lib/i18n/dictionaries/pt-BR/notifications.ts`
- `lib/i18n/dictionaries/ru/competition.ts`
- `lib/i18n/dictionaries/ru/notifications.ts`
- `lib/i18n/dictionaries/zh-CN/competition.ts`
- `lib/i18n/dictionaries/zh-CN/notifications.ts`
- `lib/i18n/match-room-control.ts`
- `lib/i18n/match-room.ts`
- `lib/i18n/notification-copy.ts`
- `lib/match-room-assistance.ts`
- `lib/match-room-settings.ts`
- `lib/match-room-unread-events.ts`
- `lib/match-room-unread.ts`
- `lib/match-room.ts`
- `lib/notifications.ts`
- `lib/web-push/policy.ts`
- `lib/web-push/worker.ts`
- `supabase/migrations/20260919011425_match_room_phase_one.sql`
- `supabase/migrations/20260919235836_match_room_phase_three.sql`
- `supabase/migrations/20260920014644_match_room_production_hardening.sql`
- `supabase/migrations/20260922054205_match_room_unread_summary.sql`
- `tests/browser/bracket-layout/bracket.spec.ts`
- `tests/browser/bracket-layout/main.tsx`
- `tests/browser/bracket-layout/README.md`
- `tests/browser/match-result/flow.spec.ts`
- `tests/browser/match-result/main.tsx`
- `tests/browser/match-result/playwright.config.ts`
- `tests/browser/match-result/runtime.ts`
- `tests/browser/match-result/vite.config.ts`
- `tests/browser/match-room/flow.spec.ts`
- `tests/browser/match-room/index.html`
- `tests/browser/match-room/main.tsx`
- `tests/browser/match-room/playwright.config.ts`
- `tests/browser/match-room/README.md`
- `tests/browser/match-room/runtime.ts`
- `tests/browser/match-room/visibility-runtime.ts`
- `tests/browser/match-room/vite.config.ts`
- `tests/database/match-room-phase-1-concurrency.mjs`
- `tests/database/match-room-phase-1.sql`
- `tests/database/match-room-phase-3-backfill.mjs`
- `tests/database/match-room-phase-3-concurrency.mjs`
- `tests/database/match-room-phase-3.sql`
- `tests/database/match-room-production-hardening-concurrency.mjs`
- `tests/database/match-room-production-hardening.sql`
- `tests/database/match-room-unread-concurrency.mjs`
- `tests/database/match-room-unread-summary.sql`
- `tests/integration/account-legal-mutation-boundary.test.ts`
- `tests/integration/admin-operations-authorization.test.ts`
- `tests/integration/admin-operations-loader-metrics.test.ts`
- `tests/integration/admin-system-page-authorization.test.tsx`
- `tests/integration/admin-tournament-workspace-contract.test.ts`
- `tests/integration/match-admin-assistance-action.test.ts`
- `tests/integration/match-room-actions.test.ts`
- `tests/integration/match-room-migration.test.ts`
- `tests/integration/match-room-phase-3-migration.test.ts`
- `tests/integration/match-room-production-hardening-migration.test.ts`
- `tests/integration/match-room-settings.test.ts`
- `tests/integration/match-room-unread-actions.test.ts`
- `tests/integration/notification-destination-resolution.test.ts`
- `tests/integration/notification-projection-privacy.test.ts`
- `tests/integration/stage-a-notification-event-keys.test.ts`
- `tests/unit/components/AdminMatchRoomControl.test.tsx`
- `tests/unit/components/AdminMatchWorkspace.test.tsx`
- `tests/unit/components/AdminTournamentMatches.test.tsx`
- `tests/unit/components/MatchDeadlinePresentation.test.tsx`
- `tests/unit/components/MatchResultStatus.test.tsx`
- `tests/unit/components/MatchRoom.test.tsx`
- `tests/unit/components/MatchRoomAssistanceControls.test.tsx`
- `tests/unit/components/useMatchRoomUnread.test.tsx`
- `tests/unit/lib/i18n/match-room.test.ts`
- `tests/unit/lib/i18n/notification-copy.test.ts`
- `tests/unit/lib/match-room.test.ts`
- `tests/unit/lib/web-push-policy-payload.test.ts`
- `tests/unit/lib/web-push-worker.test.ts`

## Candidate Preview build guard

The release-preparation scope additionally changes `next.config.ts` and adds `lib/p03-preview-safety.ts` plus `tests/unit/lib/p03-preview-safety.test.ts`. These are candidate-safety additions, separate from the 109 imported source paths. No dependency or environment-variable name is added or changed.

The guard executes when Next loads its configuration, before application build evaluation, and only when `VERCEL_ENV=preview` and `VERCEL_GIT_COMMIT_REF=codex/p03-production-ready`. It rejects a non-Staging/ambiguous Supabase URL, missing or live-mode Clerk keys, wrong decoded Supabase public/service-role JWT project identity, Production project references in the environment, and unidentified direct database URLs. Opaque Supabase keys do not expose a project identity; the exact Staging origin remains mandatory. No environment values are printed.

This candidate Preview requires email delivery to be absent/disabled and email-worker, Resend, VAPID, Analytics access-token and Steam API credentials to be absent. Existing application behavior disables push when all VAPID fields are absent and disables analytics outside Production. Therefore real provider push delivery is not established by this Preview configuration; database/browser notification tests remain separate evidence. Future explicit isolation of provider credentials requires a reviewed guard change rather than silently inheriting Production credentials.

Original security headers and both 4,400,000-byte Next upload/request bounds remain unchanged. The helper is imported only by Next configuration in ordinary Node, so it cannot use the React `server-only` poison-package marker. It has no application imports, provider client, network access, or mutations.

Validation: 52 focused Preview-safety/existing-runtime tests passed; targeted ESLint passed; full TypeScript check (`--noEmit --incremental false`) passed; the bundled Next configuration loader accepted a synthetic isolated Staging environment and preserved upload limits. A full application build and final candidate CI remain the root release validation responsibilities.
