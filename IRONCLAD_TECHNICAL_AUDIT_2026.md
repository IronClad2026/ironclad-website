# IronClad Technical Audit 2026

Audit date: 2026-07-21, Europe/Rome environment context.

Scope: read-only inspection of the current local repository, plus the requested validation commands. I did not run migrations, commit, push, install packages, or inspect secret values. The only intentional file write from this audit is this report.

Important limitation: local migrations are present, but there is no safe evidence in the repository that confirms which migrations are applied to the remote Supabase project. Any database conclusion below distinguishes "present locally" from "confirmed remotely"; remote application is not confirmed.

## 1. Repository Status

- Current branch: `preview/full-website` from `git status --short --branch`.
- Latest commit: `0abbcd206aaa15edc0cebc040d5a1223a0697511`, message `Restyle Tournaments page to match IronClad design`, author `BRUTAL`, dated 2026-07-13 13:14:59 +0200. Changed files in that commit are `app/tournaments/page.tsx`, `components/TournamentCard.tsx`, and `components/TournamentsExperience.tsx`.
- Uncommitted changes before saving this report: staged `docs/IRONCLAD_CURRENT_STATE_AUDIT.md`. It was already staged before this audit file was created.
- Untracked files before saving this report: none.
- Current branch upstream: no upstream configured for `preview/full-website`. `git rev-parse --abbrev-ref --symbolic-full-name @{u}` failed with "no upstream configured".
- Ahead/behind: because no branch upstream exists, only a comparison with `origin/master` was possible. `git rev-list --left-right --count origin/master...HEAD` returned `0 22`, meaning this branch is 22 commits ahead of `origin/master` and 0 behind it.
- Local branches visible: `feature/about-images`, `feature/dashboard-redesign`, `feature/global-smoke-effect`, `feature/home-redesign`, `feature/navbar-active-state`, `feature/player-detail-redesign`, `feature/players-redesign`, `feature/profile-redesign`, `feature/rankings-redesign`, `feature/rules-images`, `feature/sticky-navbar`, `feature/tournaments-redesign`, `master`, `preview/full-website`, and `update-rules-page`.
- Remote branches visible: `origin/master`, `origin/feature/elo-checker-registration-verification`, and `origin/feature/leaderboard-ranking-planning`.
- Visible unfinished or parallel feature work: the staged `docs/IRONCLAD_CURRENT_STATE_AUDIT.md` and the remote feature branches for ELO verification and leaderboard planning indicate prior or ongoing work outside the current branch. Several local redesign branches also exist. No source file was modified for this audit.

## 2. Technology And Architecture

Framework and package versions:

| Area | Evidence |
|---|---|
| Next.js | `next@16.2.6` from `npm ls --depth=0`; `package.json:19` pins `next` to `16.2.6`. |
| React | `react@19.2.4`, `react-dom@19.2.4` from `npm ls --depth=0`; `package.json:20-21`. |
| TypeScript | `typescript@5.9.3` from `npm ls --depth=0`; `package.json:31` declares `^5`. |
| Clerk | `@clerk/nextjs@7.3.7` from `npm ls --depth=0`; `package.json:12`. |
| Supabase | `@supabase/supabase-js@2.106.1` from `npm ls --depth=0`; `package.json:14`. |
| Styling | Tailwind CSS 4 via `tailwindcss@4.3.0` and `@tailwindcss/postcss@4.3.0`; package evidence in `package.json:23-31`. |
| Motion/UI | `framer-motion@12.38.0`, `gsap@3.15.0`, `@gsap/react@2.1.2`, `lenis@1.3.25`, `lucide-react@1.16.0` from `npm ls --depth=0`. |

Configuration:

- Scripts are only `dev`, `build`, `start`, and `lint` in `package.json:5-9`; there is no test script.
- `next.config.ts:4-6` enables `experimental.serverActions.bodySizeLimit = "22mb"`.
- `app/layout.tsx:18-30` wraps the app in `ClerkProvider`; `app/layout.tsx:19` hard-codes `<html lang="en">`.
- `lib/supabase-config.ts:1-25` reads `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- `lib/supabase-admin.ts:1-21` is server-only and creates a service-role Supabase client using `SUPABASE_SERVICE_ROLE_KEY` with session persistence disabled.
- `.env.example:2-10` lists Clerk and Supabase variable names. I did not read `.env.local` values.

Application route map:

| Route | File | Access based on current code |
|---|---|---|
| `/` | `app/page.tsx` | Public by `middleware.ts:3-11`; uses `HomeAccountSection` at `app/page.tsx:56`. |
| `/about` | `app/about/page.tsx` | Public by `middleware.ts:3-11`. |
| `/rules` | `app/rules/page.tsx` | Public by `middleware.ts:3-11`. |
| `/rankings` | `app/rankings/page.tsx` | Public by `middleware.ts:3-11`; loads leaderboard data. |
| `/tournaments` | `app/tournaments/page.tsx` | Public by `middleware.ts:3-11`; personal result details only load when `auth()` returns a user at `app/tournaments/page.tsx:18-25` and `app/tournaments/page.tsx:249-259`. |
| `/dashboard` | `app/dashboard/page.tsx` | Authenticated/player route; redirects unauthenticated users at `app/dashboard/page.tsx:52-56`. |
| `/profile` | `app/profile/page.tsx` | Authenticated/player route; redirects unauthenticated users at `app/profile/page.tsx:12-15`. |
| `/players` | `app/players/page.tsx` | Implemented as a public directory, but currently protected by middleware because `/players(.*)` is absent from `middleware.ts:3-11`. |
| `/players/[playerId]` | `app/players/[playerId]/page.tsx` | Implemented as a public profile route, but currently protected by middleware. |
| `/players/[playerId]/avatar` | `app/players/[playerId]/avatar/route.ts` | Implemented with public-profile logic in the route handler, but currently protected by middleware because `/players(.*)` is absent from the public matcher. |
| `/admin` | `app/admin/page.tsx` | Admin-only by page guard using Clerk `metadata.role` at `app/admin/page.tsx:847-852`. |
| `/admin/tournaments` | `app/admin/tournaments/page.tsx` | Admin-only by page guard at `app/admin/tournaments/page.tsx:147-150`. |
| `/sign-in/[[...sign-in]]` | `app/sign-in/[[...sign-in]]/page.tsx` | Public by `middleware.ts:3-11`. |
| `/sign-up/[[...sign-up]]` | `app/sign-up/[[...sign-up]]/page.tsx` | Public by `middleware.ts:3-11`. |
| `POST /api/elo-verification/verify` | `app/api/elo-verification/verify/route.ts` | Authenticated by route handler at `app/api/elo-verification/verify/route.ts:20-31` and also protected by middleware. |

Authentication and authorization:

- Clerk is the identity provider. `middleware.ts:1-15` uses `clerkMiddleware`, `createRouteMatcher`, and `auth.protect()` for non-public routes.
- Admin authorization is not a database role. It is read from Clerk session claims, usually `sessionClaims.metadata.role === "admin"`, for example `app/admin/page.tsx:375-378`, `app/admin/tournaments/actions.ts:166-170`, and `lib/leaderboard/admin.ts:400-404`.
- Player-scoped Supabase access uses Clerk tokens through `createAuthenticatedSupabaseClient()` in `lib/supabase-server.ts:8-13` and browser access uses `createAuthenticatedBrowserSupabaseClient()` in `lib/supabase-browser.ts:7-12`.
- Many server actions and server pages use the service-role client from `lib/supabase-admin.ts:6-21`, then enforce access in application code. Examples include public tournament loading in `app/tournaments/page.tsx:25`, registration admin actions in `app/admin/page.tsx:432`, and match mutations in `app/tournaments/match-actions.ts:75`.

Middleware or proxy:

- The project uses `middleware.ts`, not `proxy.ts`. Local Next 16 docs state that starting with Next.js 16, Middleware is now called Proxy (`node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md:15`) and the `middleware` file convention is deprecated (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md:11`).
- `npm run build` succeeded but emitted: `The "middleware" file convention is deprecated. Please use "proxy" instead.`
- The public route matcher is `middleware.ts:3-11`; it omits `/players(.*)`, so the public player directory and profiles are not anonymously reachable.

API routes, server actions, and background jobs:

- API route: `app/api/elo-verification/verify/route.ts:20` exports `POST`.
- Avatar route: `app/players/[playerId]/avatar/route.ts:34` exports `GET`.
- Tournament registration action: `submitTournamentRegistration` in `app/tournaments/actions.ts:63`.
- Match actions: `submitMatchResult`, `submitNoShowReport`, `confirmMatchResultReportGroup`, `disputeMatchResultReportGroup`, `reviewMatchResultReportGroup`, `saveAdminMatchResult`, `editAdminMatchParticipants`, and `resetAdminMatch` in `app/tournaments/match-actions.ts:32-679`.
- Admin tournament actions: banner upload, save, generate bracket, save assignments, delete, and cleanup retry in `app/admin/tournaments/actions.ts:62-604`.
- Admin registration actions are inline in `app/admin/page.tsx:372-839`.
- Notification actions are in `app/notifications/actions.ts:19-116`.
- Dashboard actions are in `app/dashboard/actions.ts:35-326`.
- Profile save/delete actions are in `app/profile/actions.ts:41` and `app/profile/delete-account-action.ts:14`.
- Leaderboard admin actions are in `app/admin/leaderboard-actions.ts:29-60` and `lib/leaderboard/admin.ts:68-290`.
- Background job present locally: `auto_approve_expired_match_result_groups` is defined in `supabase/migrations/20260613105000_match_result_confirmation_groups.sql:838-893`. The same migration attempts to enable `pg_cron` and schedule it every minute at `supabase/migrations/20260613105000_match_result_confirmation_groups.sql:978-1004`, but remote scheduling is not confirmed.

External services and integrations:

- Clerk: authentication and user deletion via `@clerk/nextjs/server`; see `app/profile/delete-account-action.ts:4` and `app/profile/delete-account-action.ts:104-105`.
- Supabase: database and storage. Service-role setup is `lib/supabase-admin.ts:6-21`; storage buckets include `player-avatars`, `match-proofs`, and `tournament-banners`.
- CoH3Stats: ELO verification fetches `https://coh3stats.com/api/playerExport` at `lib/elo-verification/coh3stats.ts:444` and `https://storage.coh3stats.com/leaderboards/...` at `lib/elo-verification/coh3stats.ts:754`.
- Battlefy: tournaments store/display a `battlefy_url`; see `app/admin/tournaments/page.tsx:607` and `components/TournamentsExperience.tsx:602`.
- Static rulebooks: `app/rules/page.tsx:30-31` links `/documents-rules-ppa/1v1 rulebook.pdf` and `/documents-rules-ppa/4v4 rulebook.pdf`.
- No email, payment, subscription, payout, or AI provider integration was found in `app`, `components`, `lib`, `supabase`, `.env.example`, or `package.json`.

High-level application and data flow:

1. A user signs in with Clerk and completes the player profile in `/profile`; completeness rules are in `lib/player-profile.ts:37-65`.
2. `/tournaments` loads public tournament, bracket, registration, generated bracket, match, and standings data via the service-role Supabase client at `app/tournaments/page.tsx:33-51`.
3. A signed-in player registers via `submitTournamentRegistration` in `app/tournaments/actions.ts:63-435`; it checks profile completeness, bracket ELO eligibility, waitlist capacity, and optional CoH3Stats ELO verification.
4. Admins review registrations in `/admin`, using inline server actions at `app/admin/page.tsx:372-839`.
5. Admins create/edit/delete tournaments and generate brackets from `/admin/tournaments`; server actions are in `app/admin/tournaments/actions.ts`.
6. Brackets are generated as empty or assigned match structures in SQL RPCs, then populated manually through `components/AdminBracketPopulation.tsx`.
7. Players submit `.rec` replay proof for match results through `app/tournaments/match-actions.ts:32-225`; opponents confirm or dispute report groups, and admins can finalize disputed or direct results.
8. SQL triggers complete tournaments when matches finish; leaderboards are recalculated manually from admin controls, not automatically on tournament completion.

## 3. Database Audit

Tables and views present in local migrations:

| Object | Purpose and evidence |
|---|---|
| `profiles` | Legacy identity table retained by comment in `supabase/migrations/20260611080000_base_schema.sql:16-23`. Appears obsolete compared with `players`. |
| `players` | Clerk-linked player profile table with display/IGN/Discord/Steam/CoH3/current ELO/avatar/profile fields in `supabase/migrations/20260611080000_base_schema.sql:25-55`; public flags added in `20260613128000_public_player_profiles.sql:4-12`; `coh3_profile_id` added in `20260629090000_coh3_profile_ownership.sql:4-26`. |
| `tournaments` | Tournament metadata/status/format/rule/prize/date fields. Base create is `supabase/migrations/20260611080000_base_schema.sql:57-66`; expanded admin schema is `supabase/migrations/20260611090000_admin_tournament_creation.sql:7-49`. |
| `tournament_brackets` | Brackets per tournament with `name`, `elo_rules`, `max_players`; base create at `supabase/migrations/20260611080000_base_schema.sql:69-79`; Academy allowed later at `supabase/migrations/20260702090000_allow_academy_tournament_brackets.sql:1-7`. |
| `registrations` | Player tournament registrations with snapshot profile fields, `registration_status`, `elo_status`, submitted ELO, and later verification metadata; base table at `supabase/migrations/20260611080000_base_schema.sql:81-112`; verification columns at `supabase/migrations/20260627110000_registration_elo_verification_results.sql:1-10` and `20260628090000_add_missing_elo_identity_columns.sql:4-6`. |
| `generated_brackets` | Generated bracket structures per tournament bracket, with format/slot count/lock fields; created at `supabase/migrations/20260611092000_live_tournament_brackets.sql:3-14`; lock handling at `20260612104000_bracket_safety_and_round_robin_ranks.sql:1-14`. |
| `bracket_rounds` | Round records for generated brackets; created at `supabase/migrations/20260611092000_live_tournament_brackets.sql:16-23`. |
| `tournament_matches` | Matches linked to generated brackets and rounds, with participant registration IDs, scores, status, scheduled time, and official result fields; created at `supabase/migrations/20260611092000_live_tournament_brackets.sql:26-46` and expanded by match-result migrations. |
| `tournament_standings` | Round-robin standings per generated bracket; created at `supabase/migrations/20260611092000_live_tournament_brackets.sql:49-61`. |
| `match_result_submissions` | Legacy and per-game match result/replay submissions; created at `supabase/migrations/20260611102000_match_results_and_progression.sql:17-69` and expanded by later replay/report migrations. |
| `match_result_report_groups` | Current confirmation/dispute/no-show workflow grouping result reports; created at `supabase/migrations/20260613105000_match_result_confirmation_groups.sql:3-34`; no-show fields added in `supabase/migrations/20260624100000_match_no_show_reports.sql:3-80`. |
| `player_notification_dismissals` | Legacy dismissal table for match result notifications; created at `supabase/migrations/20260612103000_player_notification_dismissals.sql:3-17`. |
| `player_report_group_notification_dismissals` | Legacy dismissal table for report-group notifications; created at `supabase/migrations/20260613109000_match_result_confirmation_submission_flow.sql:3-21`. |
| `tournament_deletion_jobs` | Tracks storage cleanup after tournament deletion; created at `supabase/migrations/20260612100000_tournament_deletion_system.sql:3-18`. |
| `notifications` | Current in-app notifications with player/admin recipients, metadata, and read state; created at `supabase/migrations/20260613127000_platform_notifications.sql:1-23`. |
| `leaderboard_seasons` | Fixed calendar seasons; created at `supabase/migrations/20260624090000_leaderboard_foundation.sql:3-30`. |
| `leaderboard_point_events` | Raw point events for leaderboard recalculation; created at `supabase/migrations/20260624090000_leaderboard_foundation.sql:42-77`. |
| `leaderboard_player_season_stats` | Cached per-season leaderboard totals; created at `supabase/migrations/20260624090000_leaderboard_foundation.sql:90-132`. |
| `leaderboard_player_all_time_stats` | Cached all-time totals; created at `supabase/migrations/20260624090000_leaderboard_foundation.sql:149-183`. |
| `leaderboard_season_champions` | Season champion records; created at `supabase/migrations/20260624090000_leaderboard_foundation.sql:197-213`. |
| `leaderboard_recalculation_runs` | Admin audit trail for leaderboard recalculations; created at `supabase/migrations/20260624090000_leaderboard_foundation.sql:218-230`. |
| `platform_settings` | Feature settings including ELO verification and support link; created at `supabase/migrations/20260627100000_platform_settings_elo_verification.sql:3-11`. |
| `public_player_profiles` view | Public-safe player directory/profile view; created at `supabase/migrations/20260613128000_public_player_profiles.sql:17-38` and replaced with avatar presence at `supabase/migrations/20260613129000_public_player_profile_avatar_presence.sql:5-27`. |
| `leaderboard_current_season` view | Public current season view at `supabase/migrations/20260624090000_leaderboard_foundation.sql:359-373`. |
| `leaderboard_public_season_standings` view | Public season leaderboard view at `supabase/migrations/20260624090000_leaderboard_foundation.sql:378-419`. |
| `leaderboard_public_all_time_standings` view | Public all-time leaderboard view at `supabase/migrations/20260624090000_leaderboard_foundation.sql:421-452`. |

Storage buckets present locally:

- `player-avatars`: base schema creates bucket and per-user policies at `supabase/migrations/20260611080000_base_schema.sql:229-293`; upload limit increased by `supabase/migrations/20260625100000_increase_player_avatar_upload_limit.sql`.
- `match-proofs`: used by result submissions in `app/tournaments/match-actions.ts:28`, with signed URL access on tournament pages at `app/tournaments/page.tsx:703-803`.
- `tournament-banners`: configured in `supabase/migrations/20260612095000_tournament_banner_storage.sql`; upload handling is in `app/admin/tournaments/actions.ts:62-112`.

Important relationships:

- `players.clerk_user_id` is the application identity key; app pages query it at `app/dashboard/page.tsx:66`, `app/profile/page.tsx:24`, and `app/tournaments/actions.ts:183`.
- `registrations` ties tournament, bracket, profile, and Clerk user identity together. `canonicalize_registration_identity` overwrites registration snapshot fields from `players` in `supabase/migrations/20260611100000_registrations_profile_players_fk.sql:38-99`, later expanded in ELO migrations.
- `generated_brackets`, `bracket_rounds`, `tournament_matches`, and `tournament_standings` model generated competition state; public read policies are at `supabase/migrations/20260611092000_live_tournament_brackets.sql:330-353`.
- `match_result_report_groups` links reports to matches, tournaments, submitted-by registrations, opponent registrations, and no-show registrations; creation/validation is in `supabase/migrations/20260613105000_match_result_confirmation_groups.sql:115-204` and `20260624100000_match_no_show_reports.sql:83-206`.
- Leaderboard events reference seasons, tournaments, brackets, matches, and players; table definitions are at `supabase/migrations/20260624090000_leaderboard_foundation.sql:42-77`.

Row-level security and grants:

- RLS is enabled for `profiles`, `players`, and `registrations` in `supabase/migrations/20260611080000_base_schema.sql:133-135`.
- Player profile policies restrict authenticated users to their own rows at `supabase/migrations/20260611080000_base_schema.sql:154-184`.
- Registration policies are initially player-owned at `supabase/migrations/20260611080000_base_schema.sql:187-200` and later replaced by stronger identity/integrity policies, for example `supabase/migrations/20260627110000_registration_elo_verification_results.sql:369-407`.
- Tournaments and tournament brackets are public-readable at `supabase/migrations/20260611090000_admin_tournament_creation.sql:198-214`.
- Generated brackets, rounds, matches, and standings are public-readable at `supabase/migrations/20260611092000_live_tournament_brackets.sql:330-353`.
- Match result submissions are only selectable by participants in `supabase/migrations/20260611102000_match_results_and_progression.sql:73-87`.
- Match result report groups are participant-readable in `supabase/migrations/20260613105000_match_result_confirmation_groups.sql:217-240`.
- Notifications enforce player/admin read scopes and only allow read-state mutation for clients in `supabase/migrations/20260613127000_platform_notifications.sql:64-176`.
- Leaderboard raw tables have public read on cached stats/champions and admin manage policies at `supabase/migrations/20260624090000_leaderboard_foundation.sql:245-356`; public views are granted to anon/authenticated at `supabase/migrations/20260624090000_leaderboard_foundation.sql:458-460`.
- `platform_settings` is public-readable and admin-updatable at `supabase/migrations/20260627100000_platform_settings_elo_verification.sql:20-40`.
- Service role is granted broad schema privileges in `supabase/migrations/20260613093000_service_role_api_grants.sql:5-8`.

Database functions, triggers, and jobs:

- Common `updated_at` trigger function appears in `supabase/migrations/20260611080000_base_schema.sql:5-13` and is applied to several tables.
- Tournament saving is implemented by `save_tournament`, first defined in `supabase/migrations/20260611090000_admin_tournament_creation.sql:216` and replaced by later migrations.
- Registration availability is enforced by `enforce_tournament_registration_availability`, with the latest local version in `supabase/migrations/20260613126000_waitlist_promotion_open_and_rejected_lock_guards.sql:3-274`.
- Registration identity canonicalization is implemented by `canonicalize_registration_identity`, for example `supabase/migrations/20260627110000_registration_elo_verification_results.sql:118-186`.
- Bracket ELO validation uses `is_elo_eligible` and `validate_tournament_bracket_elo_rules` in `supabase/migrations/20260612110000_review_integrity_fixes.sql:7-193`.
- Bracket generation is `generate_tournament_bracket`; the current lineage includes count-based single-elimination or round-robin generation at `supabase/migrations/20260612104000_bracket_safety_and_round_robin_ranks.sql:149-316`.
- Manual bracket assignment is `save_bracket_assignments`, with lifecycle status update in `supabase/migrations/20260613116000_lifecycle_assignment_lock_and_multi_bracket_ready.sql:83-286`.
- Bracket regeneration safety is checked by `is_tournament_bracket_regeneration_safe` in `supabase/migrations/20260612104000_bracket_safety_and_round_robin_ranks.sql:96-145`.
- Match report flow functions include `submit_match_series_result_report`, `finalize_match_result_report_group`, `confirm_match_result_report_group`, `dispute_match_result_report_group`, and `admin_finalize_match_result_report_group` in `supabase/migrations/20260613105000_match_result_confirmation_groups.sql:243-970`, later modified by no-show migration.
- No-show support is in `submit_match_no_show_report` at `supabase/migrations/20260624100000_match_no_show_reports.sql:324-525`.
- Tournament lifecycle completion is in `complete_tournament_if_competition_finished` and trigger `tournament_matches_complete_tournament` at `supabase/migrations/20260613115000_tournament_lifecycle_automation.sql:201-304`, then recompute behavior is adjusted at `supabase/migrations/20260613118000_lifecycle_recomputes_after_match_reset.sql:3-170`.
- Leaderboard recalc functions are in `supabase/migrations/20260624091000_leaderboard_calculation_functions.sql:3-1043`, with later fixes in `20260624094000_fix_leaderboard_season_error_reporting.sql`.
- CoH3 profile ownership functions are in `supabase/migrations/20260629090000_coh3_profile_ownership.sql:28-130` and `submit_verified_player_registration` is replaced at `supabase/migrations/20260629090000_coh3_profile_ownership.sql:144-309`.

Migration order:

1. `20260611080000_base_schema.sql`
2. `20260611090000_admin_tournament_creation.sql`
3. `20260611091000_fix_tournament_persistence_and_availability.sql`
4. `20260611092000_live_tournament_brackets.sql`
5. `20260611093000_status_source_of_truth.sql`
6. `20260611094000_empty_bracket_structures.sql`
7. `20260611095000_approved_count_bracket_format.sql`
8. `20260611100000_registrations_profile_players_fk.sql`
9. `20260611101000_manual_bracket_population.sql`
10. `20260611102000_match_results_and_progression.sql`
11. `20260611103000_result_review_workflow.sql`
12. `20260612090000_match_proof_audit_and_official_results.sql`
13. `20260612091000_match_submission_numbering_and_reporting.sql`
14. `20260612092000_optional_tournament_dates.sql`
15. `20260612093000_pending_results_are_per_match.sql`
16. `20260612094000_repair_bracket_match_synchronization.sql`
17. `20260612095000_tournament_banner_storage.sql`
18. `20260612100000_tournament_deletion_system.sql`
19. `20260612101000_game_level_match_reporting.sql`
20. `20260612102000_grand_final_series_format.sql`
21. `20260612103000_player_notification_dismissals.sql`
22. `20260612104000_bracket_safety_and_round_robin_ranks.sql`
23. `20260612105000_tournament_edit_guards.sql`
24. `20260612110000_review_integrity_fixes.sql`
25. `20260613090000_registration_elo_status_transitions.sql`
26. `20260613091000_tournament_bracket_roster_guards.sql`
27. `20260613092000_registration_status_capacity_guard.sql`
28. `20260613093000_service_role_api_grants.sql`
29. `20260613094000_tournament_format_and_round_robin_repair_safety.sql`
30. `20260613095000_registration_opening_time_guard.sql`
31. `20260613100000_registration_security_guards.sql`
32. `20260613101000_registration_identity_integrity.sql`
33. `20260613102000_tournament_phase_one_settings_waitlist.sql`
34. `20260613103000_waitlist_fifo_guard.sql`
35. `20260613104000_grand_final_start_date_backfill.sql`
36. `20260613105000_match_result_confirmation_groups.sql`
37. `20260613106000_match_result_group_replay_guard.sql`
38. `20260613107000_legacy_review_ignores_report_groups.sql`
39. `20260613108000_deletion_tracks_report_group_replays.sql`
40. `20260613109000_match_result_confirmation_submission_flow.sql`
41. `20260613110000_match_result_replay_count_enforcement.sql`
42. `20260613111000_replay_hash_and_finalization_guards.sql`
43. `20260613112000_grandfather_legacy_report_group_replays.sql`
44. `20260613113000_admin_direct_match_management.sql`
45. `20260613114000_round_robin_reset_recalculates_standings.sql`
46. `20260613115000_tournament_lifecycle_automation.sql`
47. `20260613116000_lifecycle_assignment_lock_and_multi_bracket_ready.sql`
48. `20260613117000_lifecycle_requires_all_active_brackets.sql`
49. `20260613118000_lifecycle_recomputes_after_match_reset.sql`
50. `20260613119000_waitlist_promotion_pre_bracket_lock.sql`
51. `20260613120000_waitlist_promotion_lock_corrections.sql`
52. `20260613121000_waitlist_roster_lock_uses_competition_state.sql`
53. `20260613122000_waitlist_roster_lock_review_fixes.sql`
54. `20260613123000_waitlist_admin_insert_pre_lock_bypass.sql`
55. `20260613124000_waitlist_admin_insert_close_window_fifo.sql`
56. `20260613125000_waitlist_admin_update_bypass_open_window.sql`
57. `20260613126000_waitlist_promotion_open_and_rejected_lock_guards.sql`
58. `20260613127000_platform_notifications.sql`
59. `20260613128000_public_player_profiles.sql`
60. `20260613129000_public_player_profile_avatar_presence.sql`
61. `20260624090000_leaderboard_foundation.sql`
62. `20260624091000_leaderboard_calculation_functions.sql`
63. `20260624092000_fix_leaderboard_uuid_min.sql`
64. `20260624093000_fix_leaderboard_all_time_delete_where.sql`
65. `20260624094000_fix_leaderboard_season_error_reporting.sql`
66. `20260624100000_match_no_show_reports.sql`
67. `20260625100000_increase_player_avatar_upload_limit.sql`
68. `20260627100000_platform_settings_elo_verification.sql`
69. `20260627110000_registration_elo_verification_results.sql`
70. `20260628090000_add_missing_elo_identity_columns.sql`
71. `20260629090000_coh3_profile_ownership.sql`
72. `20260702090000_allow_academy_tournament_brackets.sql`
73. `20260702100000_leaderboard_academy_rewards.sql`

Migration inconsistencies and obsolete areas:

- Early bracket logic uses the old 1300 split: `supabase/migrations/20260611092000_live_tournament_brackets.sql:116-120` and `supabase/migrations/20260611092000_live_tournament_brackets.sql:196-198`. Later migrations replace this, but a partially applied remote chain would be dangerous.
- Early leaderboard constraints only allow `main`, `challenge`, and `overall` at `supabase/migrations/20260624090000_leaderboard_foundation.sql:61-62`, `114-115`, `168-169`, and `209-210`. `20260702100000_leaderboard_academy_rewards.sql:1-27` widens them locally.
- `20260702100000_leaderboard_academy_rewards.sql:29-210` rewrites function bodies with text replacement. That is brittle and requires exact prior function text.
- `add_leaderboard_admin_adjustment` still rejects Academy because it checks `p_bracket_type not in ('main', 'challenge', 'overall')` at `supabase/migrations/20260624091000_leaderboard_calculation_functions.sql:961`; the Academy migration does not patch this function.
- App tournament save intentionally writes `p_registration_close_at: null`, `p_start_date: null`, and `p_end_date: null` at `app/admin/tournaments/actions.ts:258-261`, even though the database has those fields and the registration guard checks close dates at `supabase/migrations/20260613126000_waitlist_promotion_open_and_rejected_lock_guards.sql:90-102`.
- `profiles` is explicitly legacy in `supabase/migrations/20260611080000_base_schema.sql:16-23`.
- Static homepage tournament data is still used by `app/page.tsx:3` and `app/page.tsx:274`, but it is separate from database tournaments in `data/currentTournaments.ts:20-38`.
- Legacy notification dismissal tables remain alongside the newer `notifications` table.
- Remote migration application cannot be determined safely from the repository.

## 4. Feature Implementation Matrix

| Feature | Status | Evidence, what exists, and what is missing |
|---|---|---|
| Tournament creation | Fully implemented and apparently functional. | Admin page form exists in `app/admin/tournaments/page.tsx:406-670`; server action `saveTournament` validates/admin-checks at `app/admin/tournaments/actions.ts:162-322`; SQL RPC `save_tournament` exists. Limited to 1v1 by `app/admin/tournaments/actions.ts:32` and `app/admin/tournaments/actions.ts:816-818`. |
| Tournament editing | Fully implemented and apparently functional. | Same `saveTournament` action handles existing IDs and verifies persisted fields at `app/admin/tournaments/actions.ts:281-317`; edit guards exist in `supabase/migrations/20260612105000_tournament_edit_guards.sql`. Missing UI for registration close/start/end despite DB support. |
| Tournament deletion | Fully implemented and apparently functional. | `deleteTournament` at `app/admin/tournaments/actions.ts:491-553`; SQL `delete_tournament_data` at `supabase/migrations/20260612100000_tournament_deletion_system.sql:156-278`; cleanup retry at `app/admin/tournaments/actions.ts:556-604`. Storage cleanup can fail after DB deletion and is tracked as a job. |
| Tournament registration | Partially implemented. | Client modal and action exist at `components/TournamentsExperience.tsx:2082-2525` and `app/tournaments/actions.ts:63-435`. It checks status/open date, profile completeness, ELO rules, capacity, waitlist, and optional ELO verification. Missing persisted agreement records; app does not check `registration_close_at`, while DB does. |
| Registration approval and rejection | Fully implemented and apparently functional. | Admin status action at `app/admin/page.tsx:372-529`; statuses include pending/manual_review/approved/rejected/waitlisted at `app/admin/page.tsx:49-53`; UI actions at `components/AdminRegistrationReviewRows.tsx:339-412`; notifications at `app/admin/page.tsx:292-370`. |
| Waitlist | Partially implemented. | Waitlisted status is modeled and shown; capacity/waitlist logic in `app/tournaments/actions.ts:145-171` and `app/tournaments/actions.ts:486-525`; FIFO DB guard in `supabase/migrations/20260613126000_waitlist_promotion_open_and_rejected_lock_guards.sql:211-274`; admin next waitlist UX at `app/admin/page.tsx:923-971`. Missing player confirmation and activation workflow. |
| Manual review | Fully implemented and apparently functional. | Manual-review status in `app/admin/page.tsx:49-53`; notes required for manual review/rejection at `app/admin/page.tsx:410-420`; player notification generated at `app/admin/page.tsx:360-367`. |
| ELO verification | Partially implemented. | Optional feature flag in `lib/platform-settings.ts:5-41`; registration-time verification in `app/tournaments/actions.ts:272-280`; CoH3Stats fetch in `lib/elo-verification/coh3stats.ts:259-358`. Missing periodic sync, retries/backoff, rate-limit handling, and current requested 50-point tolerance. |
| IGN verification | Partially implemented. | Exact normalized comparison is `comparePlayerNames` in `lib/elo-verification/coh3stats.ts:222-256`, used by `lib/elo-verification/registration.ts:93-113`. Missing aliases/fuzzy matching/manual override flow beyond failing registration. |
| Manual bracket placement | Fully implemented and apparently functional. | `components/AdminBracketPopulation.tsx` provides drag/drop and select fallback; `saveBracketAssignments` action at `app/admin/tournaments/actions.ts:389-488`; SQL lifecycle-aware assignment in `supabase/migrations/20260613116000_lifecycle_assignment_lock_and_multi_bracket_ready.sql:83-286`. |
| Bracket generation | Partially implemented. | Admin action `generateTournamentBracket` at `app/admin/tournaments/actions.ts:324-387`; SQL creates empty or count-based structures at `supabase/migrations/20260612104000_bracket_safety_and_round_robin_ranks.sql:149-316`. Missing auto seeding, byes, team support, and 8-player activation. |
| 1v1 tournaments | Fully implemented and apparently functional. | Admin format validation only allows `1v1` at `app/admin/tournaments/actions.ts:32` and `app/admin/tournaments/actions.ts:816-818`; match and registration models are individual-player based. |
| 2v2 tournaments | Database/backend only. | Type allows `"2v2"` in `lib/tournaments.ts:7`, and CoH3Stats mode normalization supports `2v2` at `lib/elo-verification/coh3stats.ts:158-175`, but admin save rejects non-1v1 in `app/admin/tournaments/actions.ts:816-818`; no team/partner model exists. |
| 4v4 tournaments | Present but likely broken. | Rules page presents 4v4 rulebook/content at `app/rules/page.tsx:30-67` and `app/rules/page.tsx:163-186`; type allows `"4v4"` in `lib/tournaments.ts:7`; admin save rejects it in `app/admin/tournaments/actions.ts:816-818`; no team roster model exists. |
| Match scheduling | Partially implemented. | `tournament_matches.scheduled_at` exists at `supabase/migrations/20260611092000_live_tournament_brackets.sql:43`; UI formats match dates in `app/tournaments/match-actions.ts:1064`; no scheduling UI or update action found. |
| Match-result submission | Fully implemented and apparently functional. | `submitMatchResult` in `app/tournaments/match-actions.ts:32-225` validates participants, score, replay count, `.rec` files, duplicate hashes, storage upload, and RPC submission. No automated tests exist. |
| Result conflicts | Fully implemented and apparently functional. | Report groups with confirmation/dispute status are in `supabase/migrations/20260613105000_match_result_confirmation_groups.sql:3-34`; player confirm/dispute actions are `app/tournaments/match-actions.ts:363-440`; admin review is `app/tournaments/match-actions.ts:443-495`. |
| Admin result approval | Fully implemented and apparently functional. | Admin review/action path in `app/tournaments/match-actions.ts:443-594`; UI controls in `components/MatchResultControls.tsx:264-510`; SQL finalization at `supabase/migrations/20260613105000_match_result_confirmation_groups.sql:680-809`. |
| No-show handling | Partially implemented. | Player no-show action at `app/tournaments/match-actions.ts:227-361`; SQL no-show report workflow at `supabase/migrations/20260624100000_match_no_show_reports.sql:324-525`; leaderboard no-show suppression at `20260624100000_match_no_show_reports.sql:907-1010`. Cron job application is not remotely confirmed. |
| Tournament completion | Partially implemented. | SQL completes tournaments when all generated brackets are complete at `supabase/migrations/20260613115000_tournament_lifecycle_automation.sql:201-304`; reset recompute at `20260613118000_lifecycle_recomputes_after_match_reset.sql:3-170`. No admin completion UI or tests. |
| Tournament archiving | Not implemented. | `TournamentStatus` is only `upcoming`, `registration_open`, `in_progress`, `completed` in `lib/tournaments.ts:1-6`; no archive status/action/route found. |
| Leaderboard recalculation | Partially implemented. | Admin manual recalc functions in `lib/leaderboard/admin.ts:68-210` and actions in `app/admin/leaderboard-actions.ts:29-60`; public page says rows appear after admin recalculation at `components/LeaderboardExperience.tsx:373`. No automatic trigger after completion. |
| Season management | Partially implemented. | Season table and get-or-create function exist at `supabase/migrations/20260624090000_leaderboard_foundation.sql:3-30` and `20260624091000_leaderboard_calculation_functions.sql:24-91`; no season CRUD admin UI. |
| Player notifications | Fully implemented and apparently functional. | `notifications` table at `supabase/migrations/20260613127000_platform_notifications.sql:1-23`; load/read/delete helpers in `lib/notifications.ts:143-359`; dashboard UI in `components/DashboardNotifications.tsx`. |
| Admin notifications | Fully implemented and apparently functional. | Admin-recipient notifications are loaded by `loadAdminNotifications` in `lib/notifications.ts:186-225`; admin notification center is rendered in `app/admin/page.tsx:1514-1539`; match submissions create admin notifications at `app/tournaments/match-actions.ts:185-202`. |
| Email notifications | Not implemented. | No email provider/env/template/action code found in `app`, `components`, `lib`, `supabase`, `.env.example`, or `package.json`. |
| Public player directory | Present but likely broken. | Directory page exists at `app/players/page.tsx:1-58`; data comes from `lib/public-players.ts:53-68`; middleware omits `/players(.*)` at `middleware.ts:3-11`, so anonymous access is blocked. |
| Public player profiles | Present but likely broken. | Profile route exists at `app/players/[playerId]/page.tsx:1-56`; header/stats components exist. Middleware blocks anonymous access; stats component contains placeholder copy at `components/PublicPlayerStats.tsx:62-72`; no public-profile opt-in UI found. |
| Match history | Partially implemented. | Dashboard match history is loaded by `lib/player-dashboard.ts:215-945` and rendered by `components/DashboardMatchHistory.tsx`; public profile match history is placeholder only in `components/PublicPlayerStats.tsx:62-72`. |
| Champion history | Partially implemented. | Public champion archive in `components/LeaderboardExperience.tsx:564-622`; dashboard champion component in `components/DashboardChampionHistory.tsx:15-159`; depends on manual leaderboard recalculation. |
| Player earnings history | Not implemented. | Payment/prize ledger tables or UI are absent; only text `prize_pool` exists. |
| Prize payments | Not implemented. | Search found only tournament `prize_pool` text fields, for example `app/admin/tournaments/page.tsx:593-595` and `lib/tournaments.ts:331`; no payout/ledger/provider code. |
| Subscriptions | Not implemented. | No subscription or billing provider code/env vars found. |
| Premium feature entitlement | Not implemented. | No premium/entitlement model or middleware found. |
| Multiple-language support | Not implemented. | `app/layout.tsx:19` hard-codes English; no i18n package in `package.json`; hard-coded `Intl.DateTimeFormat("en")` and `en-AU` appear in `lib/tournaments.ts:299-303`, `components/LeaderboardExperience.tsx:801-809`, and other components. |
| Mobile responsiveness | Partially implemented. | Responsive classes exist, but high-risk wide/touch layouts remain: tournaments bracket grid at `components/TournamentsExperience.tsx:1609-1634`, leaderboard table `min-w-[1040px]` at `components/LeaderboardExperience.tsx:381-382`, admin table `min-w-[1220px]` at `app/admin/page.tsx:1457-1458`, drag/drop bracket placement at `components/AdminBracketPopulation.tsx:362-488`. |
| Replay library | Partially implemented. | Replay proof storage and signed download links exist at `app/tournaments/match-actions.ts:143-170`, `app/tournaments/page.tsx:703-803`, and `components/DashboardMatchHistory.tsx:189`. There is no standalone replay archive/search/library route. |
| Player highlight clips | Not implemented. | No clip/video model, storage flow, or route found. |
| User AI assistant | Not implemented. | No OpenAI/LLM/assistant code or env vars found. |
| Admin AI assistant | Not implemented. | No OpenAI/LLM/assistant code or env vars found. |

## 5. ELO Verification Audit

- CoH3Stats profile URL storage:
  - `players.coh3_player_card_url` is defined in `supabase/migrations/20260611080000_base_schema.sql:32`.
  - `registrations.coh3_player_card_url` is defined in `supabase/migrations/20260611080000_base_schema.sql:89`.
  - `players.coh3_profile_id` is added and uniquely indexed in `supabase/migrations/20260629090000_coh3_profile_ownership.sql:4-26`.
  - Profile save writes `coh3_player_card_url` at `app/profile/actions.ts:412`.
  - Registration can update the player URL/profile ID at `app/tournaments/actions.ts:291-305`.

- CoH3Stats data fetch:
  - `verifyCoh3StatsElo` is server-only and exported from `lib/elo-verification/coh3stats.ts:258-358`.
  - It first tries the CoH3Stats player export endpoint at `lib/elo-verification/coh3stats.ts:427-456`.
  - It falls back to storage leaderboard data in `lib/elo-verification/coh3stats.ts:459-543`.
  - The storage URL is built at `lib/elo-verification/coh3stats.ts:754`.

- Server-side versus client-side:
  - Verification logic lives in server-only files: `lib/elo-verification/coh3stats.ts:1`, `lib/elo-verification/registration.ts:1`.
  - Registration calls it from a server action at `app/tournaments/actions.ts:272-280`.
  - The API verifier route also calls it server-side at `app/api/elo-verification/verify/route.ts:111-123`.

- IGN comparison:
  - `comparePlayerNames` normalizes whitespace/case and requires equality at `lib/elo-verification/coh3stats.ts:222-256`.
  - Registration fails on mismatch at `lib/elo-verification/registration.ts:93-113`.

- ELO comparison and allowed discrepancy:
  - Active comparison is `compareEnteredEloWithCoh3StatsElo` at `lib/elo-verification/coh3stats.ts:202-220`.
  - Active tolerance is `ELO_AUTO_VERIFY_TOLERANCE = 75` at `lib/elo-verification/coh3stats.ts:95`, applied at `lib/elo-verification/coh3stats.ts:217-218`.
  - An older unused helper, `compareClaimedEloWithVerifiedElo`, uses `difference <= 50` and `difference <= 100` at `lib/elo-verification/coh3stats.ts:177-200`. `rg` found only its definition, not any caller.
  - Other `50` references, such as `auto_approve_expired_match_result_groups(50)` in `supabase/migrations/20260613105000_match_result_confirmation_groups.sql:987` and `1004`, are batch sizes, not ELO thresholds.

- When verification occurs:
  - It occurs during registration when the platform setting is enabled: `app/tournaments/actions.ts:205-225` loads settings/support link; `app/tournaments/actions.ts:272-280` verifies.
  - The API route can verify on demand at `app/api/elo-verification/verify/route.ts:20-123`.
  - No periodic sync, cron, or scheduled ELO refresh was found.

- Stored verification values:
  - Registration snapshots include `submitted_elo`, `elo_status`, and CoH3 URL at `app/tournaments/actions.ts:345-363`.
  - Verified results are written after RPC insert at `app/tournaments/actions.ts:618-647`: `elo_status`, `elo_verified_elo`, `elo_difference`, faction, mode, checked time, source, payload, verified player name, and identity status.
  - Database verification columns and comments are in `supabase/migrations/20260627110000_registration_elo_verification_results.sql:1-10` and `412-432`.

- Caching, retries, timeouts, and rate limits:
  - Fetches use `cache: "no-store"` and `AbortSignal.timeout(timeoutMs)` at `lib/elo-verification/coh3stats.ts:560-561` and `602-603`.
  - Default timeout is 10 seconds at `lib/elo-verification/coh3stats.ts:90-95`.
  - Fallback tries up to four candidate leaderboard days at `lib/elo-verification/coh3stats.ts:757-775`.
  - No retry with backoff, rate-limit handling, request queue, or persisted cache was found.

- Failure handling:
  - Invalid URL fails before external fetch at `lib/elo-verification/registration.ts:57-65`.
  - External failure returns support-message errors at `lib/elo-verification/registration.ts:83-90`.
  - Name mismatch and ELO mismatch return failure messages at `lib/elo-verification/registration.ts:93-133`.
  - If metadata update fails after `submit_verified_player_registration`, the registration may already exist but app returns an error at `app/tournaments/actions.ts:649-660`.

- Later ELO changes:
  - Future eligibility uses `players.current_elo` at registration time (`app/tournaments/actions.ts:263-270`).
  - Existing registrations store `submitted_elo` and verified snapshots; no code periodically refreshes or revalidates existing registrations.
  - Later edits to `players.current_elo` can affect future tournament eligibility but should not alter existing registrations unless admin actions or DB guards use current profile data.

- Security and reliability risks:
  - The active threshold is 75, not the requested future 50.
  - Exact IGN matching can false-negative legitimate profile name formatting changes.
  - External CoH3Stats downtime blocks verified registration because there is no cache or retry/backoff.
  - Registration creation and verification metadata update are not a single app-visible transaction in `app/tournaments/actions.ts:586-647`.
  - The app has no audit table for verification attempts outside registration row metadata.

## 6. Bracket And ELO-Rule Audit

Important locations from search terms `1100`, `1300`, `1400`, `1700`, `75`, `50`, `academy`, `challenge`, `main`, `elite`, `bracket_type`, `elo`, and `rating`:

- Current app bracket definitions are in `lib/tournaments.ts:20-37`: Academy `Below 1100 ELO`, Challenge `1100-1399 ELO`, Main `1400+ ELO`, displayed as `Main / Elite Bracket`.
- Public copy repeats the same ranges in `app/about/page.tsx:35-46` and `app/rules/page.tsx:115-117`, with `Main / Elite` at `app/rules/page.tsx:144`.
- Leaderboard filter labels include Academy, Challenge, and Main / Elite in `components/LeaderboardExperience.tsx:36-53` and `components/LeaderboardExperience.tsx:819-821`.
- Static homepage tournament data only includes Main / Elite and Challenge in `data/currentTournaments.ts:20-38`; it is still used by `app/page.tsx:274`.
- Profile ELO picker ranges are generic buckets in `lib/elo-options.ts:8-20`, including `900-1100`, `1100-1300`, `1300-1500`, `1500-1700`, and `1700-1900`. These are not bracket rules but may confuse users if reused as bracket filters.
- Old database bracket eligibility assumes `1300` split at `supabase/migrations/20260611092000_live_tournament_brackets.sql:116-120` and `196-198`.
- Local final bracket-name constraint allows Academy/Challenge/Main at `supabase/migrations/20260702090000_allow_academy_tournament_brackets.sql:1-7`.
- Leaderboard foundation initially restricts bracket types to `main`, `challenge`, `overall` at `supabase/migrations/20260624090000_leaderboard_foundation.sql:61-62`, `114-115`, `168-169`, and `209-210`.
- Academy leaderboard constraints and reward mapping are added locally at `supabase/migrations/20260702100000_leaderboard_academy_rewards.sql:1-27` and `56-89`.
- Old leaderboard overall filters use only `main` and `challenge` in `supabase/migrations/20260624091000_leaderboard_calculation_functions.sql:287`, `328`, `392`, `706`, `756`, `806`, and `850`; newer migration patches some function text.
- No-show leaderboard recalculation also contains old `event.bracket_type in ('main', 'challenge')` filters at `supabase/migrations/20260624100000_match_no_show_reports.sql:1110`, `1153`, and `1219`; the Academy migration attempts text replacement at `supabase/migrations/20260702100000_leaderboard_academy_rewards.sql:183-201`.
- `add_leaderboard_admin_adjustment` still rejects Academy at `supabase/migrations/20260624091000_leaderboard_calculation_functions.sql:961`.
- Active ELO verification tolerance is 75 at `lib/elo-verification/coh3stats.ts:95` and `217-218`; unused 50/100 helper is at `lib/elo-verification/coh3stats.ts:177-200`.

To support Academy 0-1099, Challenge 1100-1399, and Main / Pro 1400+:

- Confirm remote migration state first. Local migrations appear to reach Academy support, but remote state is unknown.
- Replace all `Main / Elite` labels with the desired `Main / Pro` label in `lib/tournaments.ts`, `app/about/page.tsx`, `app/rules/page.tsx`, `components/LeaderboardExperience.tsx`, and static data.
- Add or replace migration logic explicitly for final functions rather than relying on brittle `pg_get_functiondef` string replacement in `20260702100000_leaderboard_academy_rewards.sql`.
- Patch `add_leaderboard_admin_adjustment` to accept `academy`.
- Audit old migrations/functions on the live database for the 1300 split before changing app copy.
- Decide whether `lib/elo-options.ts` should align with bracket cutoffs or remain a generic profile picker.
- Add tests for `parseEloEligibilityRule` (`lib/tournaments.ts:380-465`), `isEligibleForBracket` (`lib/tournaments.ts:467-482`), registration eligibility (`app/tournaments/actions.ts:263-270`), and leaderboard reward mapping.

## 7. Tournament Lifecycle

Current statuses:

- App type: `TournamentStatus = "upcoming" | "registration_open" | "in_progress" | "completed"` in `lib/tournaments.ts:1-6`.
- Admin status form exposes Draft, Open, In Progress, and Completed at `app/admin/tournaments/page.tsx:536-544`.
- `registration_enabled` is synchronized to `status = 'registration_open'` by trigger in `supabase/migrations/20260611093000_status_source_of_truth.sql:3-24`.

Observed transitions:

- Admins can manually save any valid status through `saveTournament` (`app/admin/tournaments/actions.ts:162-322`).
- Registration opens when status is `registration_open` and `registration_open_at` is null or reached. App check is in `app/tournaments/actions.ts:121-136`; client mirror is `components/TournamentsExperience.tsx:3052-3062`.
- Registration close is enforced in the latest DB guard with `registration_close_at is null or now() <= registration_close_at` at `supabase/migrations/20260613126000_waitlist_promotion_open_and_rejected_lock_guards.sql:90-102`. The app does not check close time and admin save currently writes close time as null at `app/admin/tournaments/actions.ts:258-261`.
- Minimum-player rule exists only for generation: if approved count is less than 2, bracket generation returns null in `supabase/migrations/20260612104000_bracket_safety_and_round_robin_ranks.sql:192-205`.
- Bracket format is count-based: power-of-two approved counts use single elimination, otherwise round robin at `supabase/migrations/20260612104000_bracket_safety_and_round_robin_ranks.sql:205-207`.
- Tournaments can move to `in_progress` when generated brackets are populated by manual assignments. `save_bracket_assignments` updates tournament status at `supabase/migrations/20260613116000_lifecycle_assignment_lock_and_multi_bracket_ready.sql:249-270`, refined to require all active brackets at `supabase/migrations/20260613117000_lifecycle_requires_all_active_brackets.sql:3-52`.
- Tournaments can move to `completed` when all generated brackets complete through `complete_tournament_if_competition_finished` and trigger at `supabase/migrations/20260613115000_tournament_lifecycle_automation.sql:201-304`.
- Match reset can recompute lifecycle state through `recompute_tournament_lifecycle_status` in `supabase/migrations/20260613118000_lifecycle_recomputes_after_match_reset.sql:3-170`.

Lifecycle gaps:

- No eight-player activation workflow exists. Eight is only the default bracket capacity in `lib/tournaments.ts:18-40` and a power-of-two case in generation.
- No automatic tournament start based on registration count or start date was found. Start is effectively manual via bracket assignment/status.
- No player confirmation workflow exists after approval or waitlist promotion.
- Waitlist FIFO and capacity are real, but promotion is admin-driven and no player confirmation deadline exists.
- Result confirmation deadlines exist for match reports (`confirmation_deadline_at` in `supabase/migrations/20260613105000_match_result_confirmation_groups.sql:20`), but round deadlines or overdue match detection were not found.
- `tournament_matches.scheduled_at` exists at `supabase/migrations/20260611092000_live_tournament_brackets.sql:43`, but no scheduling UI/action was found.
- Invalid state transitions are partly blocked by SQL guards: registration availability, FIFO waitlist, roster lock, participant lock after report activity, and bracket regeneration safety.
- Bracket regeneration after results: app action `generateTournamentBracket` repairs existing generated brackets rather than blindly recreating them (`app/admin/tournaments/actions.ts:344-371`). DB safety checks inspect matches, submissions, standings, and results in `supabase/migrations/20260612104000_bracket_safety_and_round_robin_ranks.sql:96-140`. Admin approval/delete paths call `is_tournament_bracket_regeneration_safe` before changing rosters, for example `app/admin/page.tsx:456-480`.

## 8. Notification Audit

Current tables and components:

- `notifications` table: `supabase/migrations/20260613127000_platform_notifications.sql:1-23`.
- Legacy dismissal tables: `player_notification_dismissals` at `supabase/migrations/20260612103000_player_notification_dismissals.sql:3-17` and `player_report_group_notification_dismissals` at `supabase/migrations/20260613109000_match_result_confirmation_submission_flow.sql:3-21`.
- Notification helpers: `lib/notifications.ts:70-359`.
- Event helpers: `lib/notification-events.ts:39-224`.
- Player UI: `components/DashboardNotifications.tsx`.
- Admin UI: `components/InAppNotificationCenter.tsx` rendered by `app/admin/page.tsx:1514-1539`.

Events that create notifications:

- Registration approved/promoted/rejected/waitlisted/manual review in `app/admin/page.tsx:292-370`, created at `app/admin/page.tsx:513-522`.
- Bulk approval creates multiple notifications at `app/admin/page.tsx:803-817`.
- Player match-result submission notifies admins at `app/tournaments/match-actions.ts:185-202`.
- No-show report notifies the missing player at `app/tournaments/match-actions.ts:329-349`.
- Disputes notify admins via `notifyAdminsOfMatchDispute` in `lib/notification-events.ts:39-81`.
- No-show reporter response notifications use `notifyNoShowReporterOfResponse` in `lib/notification-events.ts:83-137`.
- Admin report-group review notifies players via `notifyPlayersOfReportGroupReview` in `lib/notification-events.ts:139-188`.
- Legacy match-result review notifications use `notifyPlayersOfLegacyMatchResultReview` in `lib/notification-events.ts:190-224`.

Behavior:

- Player notifications are scoped by `recipient_clerk_user_id` in `lib/notifications.ts:143-180`.
- Admin notifications are scoped by `recipient_role = "admin"` in `lib/notifications.ts:186-225`.
- Read/unread is represented by `read_at`; helpers mark one, selected, or all notifications read at `lib/notifications.ts:228-325`.
- Deletion is supported in helpers at `lib/notifications.ts:327-359` and exposed through `app/notifications/actions.ts:92-116`.
- RLS and a mutation guard limit client-side mutation to read state in `supabase/migrations/20260613127000_platform_notifications.sql:64-176`.
- Duplicate prevention is absent: there is no unique idempotency key on `notifications`, and `createInAppNotification`/`createInAppNotifications` insert directly at `lib/notifications.ts:81-94` and `lib/notifications.ts:133`.
- Notification preferences are not implemented. The only related preference is Discord contact visibility in `app/dashboard/actions.ts:278-326`, which is profile privacy, not notification preference.
- No email provider, templates, or email environment variables were found.

Missing operational notifications:

- Tournament created/opened/registration closing/registration closed.
- Waitlist position changes and confirmation windows.
- Bracket generated/player assigned.
- Tournament start and round deadlines.
- Match scheduled/rescheduled and overdue match reminders.
- Tournament completion, leaderboard recalculation published, champion recorded.
- Email fallback for critical admin/player actions.

## 9. Public Profiles And Privacy

- Public directory route exists at `app/players/page.tsx:1-58`; public profile route exists at `app/players/[playerId]/page.tsx:1-56`.
- Middleware currently blocks anonymous access because `/players(.*)` is not included in `middleware.ts:3-11`.
- Public data source is `public_player_profiles`; fetchers are `getPublicPlayers` and `getPublicPlayerById` in `lib/public-players.ts:53-93`.
- The public view filters to opted-in profiles with `where player.public_profile_enabled = true` at `supabase/migrations/20260613129000_public_player_profile_avatar_presence.sql:27`.
- Exposed public fields are defined in `lib/public-players.ts:35-48`: ID, display name, player name, country, region, current ELO, public flags, Discord username if enabled, avatar presence, and timestamps.
- The view deliberately returns `null::text as avatar_url` at `supabase/migrations/20260613129000_public_player_profile_avatar_presence.sql:24`; app maps avatar to a proxy route only when `has_avatar` is true at `lib/public-players.ts:107-109`.
- Discord exposure is opt-in via `discord_public_enabled`; mapper hides it unless enabled at `lib/public-players.ts:107`.
- Discord visibility toggle exists in `DiscordContactVisibilityCard` and action `updateDiscordPublicEnabled` at `app/dashboard/actions.ts:278-326`.
- No UI was found to toggle `public_profile_enabled`; only the database column/view exist.
- Avatar route checks public/private/admin access in `app/players/[playerId]/avatar/route.ts:44-82`, but middleware blocks anonymous callers before the route logic can run.
- Tournament participant lists load `clerk_user_id`, IGN, country, and current ELO at `app/tournaments/page.tsx:116-121`, but tournament components do not link participant names to `/players/[id]`.
- Potential private-data exposure is limited by the public view: Steam username, CoH3 URL, timezone, bio, and Clerk user ID are not exposed by `PUBLIC_PLAYER_PROFILE_COLUMNS` in `lib/public-players.ts:35-48`. However, public tournament pages use service-role queries and must keep application-level filters correct, especially for match submissions at `app/tournaments/page.tsx:475-590`.
- Server-side authorization for private profile pages uses authenticated Supabase and Clerk user ID filters in `app/profile/page.tsx:12-24` and `app/dashboard/page.tsx:52-76`.

## 10. Leaderboards And Rewards

Current scoring formulas:

- Tournament recalculation builds per-bracket reward rows. In the pre-Academy function, Main receives 10 participation, 5 round-passed, 5 tournament-win points, while Challenge receives 10, 2, and 3 at `supabase/migrations/20260624094000_fix_leaderboard_season_error_reporting.sql:694-710`.
- Academy migration changes the mapping to include Academy, Challenge, and Main, with Academy/Challenge using lower reward tier and Main using higher tier at `supabase/migrations/20260702100000_leaderboard_academy_rewards.sql:56-89`.
- Participation, round-passed, and tournament-win event inserts are in `supabase/migrations/20260624094000_fix_leaderboard_season_error_reporting.sql:712-851`.

Implementation:

- Public leaderboard data loads from views in `lib/leaderboard/public.ts:144-307`.
- Admin recalculation functions are in `lib/leaderboard/admin.ts:68-210`.
- Admin controls are in `components/AdminLeaderboardControls.tsx`.
- Public page explicitly says data appears after admin recalculation at `components/LeaderboardExperience.tsx:373`.

Automatic versus manual:

- Manual recalculation exists for tournament, current season, and all-time (`lib/leaderboard/admin.ts:68-210`).
- No trigger from tournament completion to leaderboard recalculation was found.

Duplicate-point and correction behavior:

- `recalculate_leaderboard_for_tournament` deletes non-admin adjustment events for the tournament before rebuilding them at `supabase/migrations/20260624094000_fix_leaderboard_season_error_reporting.sql:650-681`, which protects against duplicate tournament events.
- Admin adjustments are preserved by excluding `event_type <> 'admin_adjustment'` at `supabase/migrations/20260624094000_fix_leaderboard_season_error_reporting.sql:650-653`.
- Result correction requires rerunning recalculation manually; no automatic recalculation after match reset/result edit was found.

Season behavior:

- `leaderboard_seasons` supports two fixed calendar seasons per year by table comments at `supabase/migrations/20260624090000_leaderboard_foundation.sql:462-463`.
- `get_or_create_leaderboard_season` is in `supabase/migrations/20260624091000_leaderboard_calculation_functions.sql:24-91`.
- Historical seasons are stored in `leaderboard_seasons` and `leaderboard_season_champions`; public champion loading is in `lib/leaderboard/public.ts:264-307`.
- There is no season management UI.

Audit logs:

- Recalculation runs are stored in `leaderboard_recalculation_runs`, created at `supabase/migrations/20260624090000_leaderboard_foundation.sql:218-230` and described as admin-only audit trail at `supabase/migrations/20260624090000_leaderboard_foundation.sql:472-473`.
- Manual point adjustment SQL exists in `add_leaderboard_admin_adjustment` at `supabase/migrations/20260624091000_leaderboard_calculation_functions.sql:922-1005`, but no UI calls it. It also lacks Academy support at line 961.

Hard-coded bracket assumptions:

- Main/Challenge-only filters remain in older function bodies and are patched by later migration text replacement. The riskiest current gap is `add_leaderboard_admin_adjustment` at `supabase/migrations/20260624091000_leaderboard_calculation_functions.sql:961`.
- UI still says `Main / Elite` in `components/LeaderboardExperience.tsx:50-51` and `components/LeaderboardExperience.tsx:819-821`.
- Public leaderboard links to player profiles at `components/LeaderboardExperience.tsx:322`, `409`, and `593`; those links are blocked for anonymous users by middleware.

## 11. Payment And Subscription Code

Search terms checked: `stripe`, `paypal`, `revolut`, `payment`, `subscription`, `premium`, `checkout`, `entry_fee`, `prize`, `payout`, `transaction`, `invoice`, and `billing`.

Findings:

- No Stripe, PayPal, Revolut, checkout, billing, invoice, subscription, premium entitlement, payout, or transaction implementation was found.
- No payment provider environment variables exist in `.env.example:2-10`.
- Existing payment-adjacent code is only tournament prize text:
  - `prize_pool` column and save parameter in `supabase/migrations/20260611090000_admin_tournament_creation.sql:27-49` and `228-305`.
  - Admin form field at `app/admin/tournaments/page.tsx:593-595`.
  - Save/validate logic at `app/admin/tournaments/actions.ts:192`, `264`, and `828-829`.
  - Tournament display mapping at `lib/tournaments.ts:331` and display in `components/TournamentsExperience.tsx:645-653`, `672`, and `2351-2352`.

Classification:

- Tournament entry-fee code that should probably be removed: none found.
- Prize payout functionality: not implemented.
- Subscription functionality: not implemented.
- Unused experimental payment code: none found.
- Existing `prize_pool` should be treated as display text only, not payment or ledger functionality.

## 12. Mobile And Responsive-Design Audit

Static inspection found responsive classes in many places, but several workflows need manual device testing.

Likely mobile problems:

- Navigation: mobile menu exists in `components/Navbar.tsx:112-124`; primary risk is route access, not layout.
- Tournament pages:
  - Desktop side navigation is `hidden ... lg:block` at `components/TournamentsExperience.tsx:214-215`; mobile uses a fixed bottom menu and `w-80` panel at `components/TournamentsExperience.tsx:3034-3044`.
  - Participants table uses `min-w-[640px]` at `components/TournamentsExperience.tsx:767`, inside overflow, so horizontal scrolling is expected.
  - Bracket view uses horizontal scroll and `gridTemplateColumns: repeat(rounds.length, minmax(260px, 280px))` at `components/TournamentsExperience.tsx:1609-1634`; this is likely awkward on phones.
  - Result modals use fixed viewport sizing like `h-[78vh] w-[94vw]` at `components/TournamentsExperience.tsx:1044` and `max-h-[88vh] w-[94vw]` at `components/TournamentsExperience.tsx:1239`.
- Registration modals: modal is fixed and `max-h-[92vh]` at `components/TournamentsExperience.tsx:2289-2290`; dense agreement/form controls may need small-screen keyboard testing.
- Bracket views: connector lines use absolute positioning at `components/TournamentsExperience.tsx:1742-1751`, which can overlap in narrow scrollers.
- Player dashboard: notification and match-history dropdowns/modals use `max-h-80`, fixed overlays, and compact text at `components/DashboardNotifications.tsx:193-245`, `394-411`, and `components/DashboardMatchHistory.tsx:136-153`.
- Public player directory: filters use `xl:min-w-[780px]` at `components/PublicPlayersDirectory.tsx:86`; background uses `bg-fixed` at `components/PublicPlayersDirectory.tsx:57-60`, which can behave poorly on mobile browsers.
- Public profiles: route pages use fixed background attachment at `app/players/[playerId]/page.tsx:42-46`; exact device layout was not visually tested.
- Leaderboards: standings table is `min-w-[1040px]` at `components/LeaderboardExperience.tsx:381-382`; control group uses `lg:min-w-[720px]` at `components/LeaderboardExperience.tsx:130`.
- Admin dashboard: registration table is `min-w-[1220px]` at `app/admin/page.tsx:1457-1458`; registration modal is `max-h-[90vh] max-w-4xl` at `app/admin/page.tsx:1544-1545`; admin workflows are dense and table-heavy.
- Tournament creation/editing: form is large and card-heavy in `app/admin/tournaments/page.tsx:406-670`; delete modal uses `md:min-w-[720px]` in `components/DeleteTournamentControl.tsx:158`.
- Registration review: `AdminRegistrationReviewRows` assumes a 10-column table (`components/AdminRegistrationReviewRows.tsx:191`) and fixed context menu width (`components/AdminRegistrationReviewRows.tsx:234`).
- Match reporting: `MatchResultControls` and `PlayerMatchResultForm` contain dense controls; replay upload plus score validation should be touch-tested.
- Notifications: notification center uses modals/dropdowns with scroll regions, for example `components/DashboardNotifications.tsx:245` and `411`.
- Drag and drop: manual bracket population uses draggable elements and drop handlers at `components/AdminBracketPopulation.tsx:362-488`. A select fallback exists at `components/AdminBracketPopulation.tsx:515-528`, but the core flow should be touch-tested.

Prioritized manual device testing:

1. `/admin` registration review and bulk approval on phone/tablet.
2. `/admin/tournaments` create/edit/delete/generate/populate bracket on tablet and phone.
3. `/tournaments` bracket view, registration modal, result submission, dispute/no-show modal.
4. `/rankings` leaderboard table, filters, and player links.
5. `/players` directory filters and cards.
6. `/players/[playerId]` profile header/avatar/contact.
7. `/dashboard` notifications, match history, champion history, and Discord visibility.
8. `/profile` profile form, avatar upload, ELO picker, deletion modal.
9. Navbar and authenticated/admin menu behavior.
10. Static `/rules` PDF links and tabbed rule explorer.

## 13. Testing And Quality

- Existing test framework: none found. `package.json:5-9` has no test script, and `rg --files -g '*test*' -g '*spec*'` returned no repository test files outside dependencies.
- Unit tests: none found.
- Integration tests: none found.
- End-to-end tests: none found.
- Features currently covered by automated tests: none.
- Major untested workflows: auth role routing, profile completion, ELO verification, registration/waitlist/FIFO, admin approval/rejection, bracket generation/manual assignment, match result/replay upload, disputes/no-shows, tournament completion, leaderboard recalculation, public profile privacy, mobile layout, and destructive account/tournament deletion.
- Current lint result: `npm run lint` completed with 0 errors and 1 warning: unused `Metadata` import at `app/layout.tsx:1`.
- Current TypeScript result: `npm run build` completed TypeScript successfully.
- Current production build result: `npm run build` succeeded with Next.js 16.2.6 Turbopack. Build route output classified `/about` and `/rules` as static, most app routes as dynamic, and reported `Proxy (Middleware)`.
- Existing warnings: Next build warns that the `middleware` file convention is deprecated and should be replaced with `proxy`; lint warns about unused `Metadata`.
- Whether failures predate the audit: no lint/build failures occurred. The staged `docs/IRONCLAD_CURRENT_STATE_AUDIT.md` predated this audit.

Recommended minimum automated-test foundation before payments, subscriptions, or AI:

- Unit tests for `parseEloEligibilityRule`, `isEligibleForBracket`, CoH3 URL parsing, IGN comparison, and ELO tolerance.
- Server-action tests with mocked Clerk/Supabase for registration, admin status changes, match result submission, and notification generation.
- Migration/RPC tests against a local Supabase or disposable Postgres for registration guards, waitlist FIFO, bracket lifecycle, result finalization, no-show suppression, and leaderboard recalculation.
- Playwright end-to-end tests for public routes, auth-protected routes, admin-only routes, player registration, admin approval, bracket assignment, result submission/confirmation/dispute, and profile privacy.
- Mobile viewport Playwright screenshots for tournament bracket, admin registration table, registration modal, leaderboard, player directory, dashboard notifications, and match reporting.
- Future payment tests must include webhook signature verification, idempotency, duplicate event handling, entitlement reconciliation, and audit logs before any live provider is connected.

## 14. Security Review

Findings:

- RLS exists for core tables, but many server pages/actions use the service-role client. That is acceptable only when application-level filters are correct. Examples: public tournament page uses service-role at `app/tournaments/page.tsx:25`; public profile fetchers use service-role but read only the public view in `lib/public-players.ts:53-93`.
- Admin checks are server-side in critical actions, for example `app/admin/tournaments/actions.ts:166-170`, `app/admin/page.tsx:375-378`, `app/tournaments/match-actions.ts:1006-1010`, and `lib/leaderboard/admin.ts:400-404`.
- Admin authorization depends on Clerk session metadata, not a database admin membership table. If Clerk metadata is wrong, server actions trust it.
- Public profile routes are currently blocked by middleware, which is a product bug rather than a data exposure.
- The public player view is conservative and hides Steam, CoH3 URL, timezone, bio, and Clerk user ID (`lib/public-players.ts:35-48`), but profile opt-in has no UI.
- Notification duplicate prevention is missing. Direct inserts at `lib/notifications.ts:81-94` and `133` can create duplicates during retries/races.
- Registration ELO verification is not fully atomic from the app perspective. The RPC insert occurs at `app/tournaments/actions.ts:586-599`, then verification metadata is updated separately at `app/tournaments/actions.ts:618-647`; failure returns an error but may leave a registration.
- Registration close date mismatch: DB can block after `registration_close_at`, but app/client only check `registration_open_at` and status at `app/tournaments/actions.ts:121-136` and `components/TournamentsExperience.tsx:3052-3062`.
- Tournament save nulls `registration_close_at`, `start_date`, and `end_date` at `app/admin/tournaments/actions.ts:258-261`, which weakens lifecycle guards depending on those fields.
- Avatar upload has size and signature checks in `app/profile/actions.ts:125-167` and validation helpers at `app/profile/actions.ts:327-337`; this is positive. It logs token length, not token value, at `app/profile/actions.ts:140-156`.
- Replay upload is restricted to `.rec` and 10 MB in `app/tournaments/match-actions.ts:982-991`; duplicate replay hashes are checked at `app/tournaments/match-actions.ts:134-141`.
- Account deletion is multi-step and non-transactional across Supabase storage/database and Clerk at `app/profile/delete-account-action.ts:49-105`; partial failure paths are handled with messages, but external consistency risk remains.
- Deprecated Next 16 middleware convention is confirmed by build warning and local docs; see `middleware.ts:1-24` and `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md:11`.
- No exposed secret values were printed or inspected. Secret variable names are listed in `.env.example:2-10`; use sites are in `lib/supabase-config.ts:1-25` and `lib/supabase-admin.ts:7`.
- Payment/webhook risk: no payment code exists. Before adding payments, implement idempotent webhook processing, provider signature verification, ledger audit trails, and entitlement reconciliation.

## 15. Technical Debt And Maintainability

- Large components:
  - `components/TournamentsExperience.tsx` is about 3081 lines and mixes tournament overview, tabs, brackets, participant lists, match result modals, registration modal, and mobile panel.
  - `app/admin/page.tsx` is about 1735 lines and combines data loading, server actions, filters, registration review, notifications, and leaderboard controls.
  - `lib/elo-verification/coh3stats.ts` is about 1084 lines and combines fetchers, parsers, comparison logic, CSV parsing, and fallback strategy.
  - `app/tournaments/match-actions.ts` is about 1076 lines and contains many mutation paths.
- Duplicate/legacy workflows:
  - Legacy `match_result_submissions` and newer `match_result_report_groups` both exist; legacy review action remains at `app/tournaments/match-actions.ts:681-742`.
  - Legacy notification dismissal tables remain alongside `notifications`.
  - Static `data/currentTournaments.ts` powers homepage current tournament cards while live tournaments are DB-backed elsewhere.
- Repeated business rules:
  - Registration-open checks are duplicated in client and server and omit close time in both (`components/TournamentsExperience.tsx:3052-3062`, `app/tournaments/actions.ts:121-136`).
  - Bracket labels/ranges are hard-coded in `lib/tournaments.ts`, `app/about/page.tsx`, `app/rules/page.tsx`, and `components/LeaderboardExperience.tsx`.
  - Admin role extraction from Clerk metadata is repeated in many files.
- Hard-coded ELO assumptions:
  - Active 75-point tolerance in `lib/elo-verification/coh3stats.ts:95`.
  - Unused 50/100 helper in `lib/elo-verification/coh3stats.ts:177-200`.
  - Old 1300 split in early migration functions.
  - `Main / Elite` label appears throughout app copy.
- Deprecated APIs/patterns:
  - `middleware.ts` should be migrated to `proxy.ts` for Next 16.
- Weak type safety:
  - Supabase rows are mostly ad hoc object types and casts in app pages/actions; no generated Supabase TypeScript schema was found.
  - Server actions use stringly typed form fields and status values in several places.
- Missing reusable services:
  - Notification idempotency.
  - Tournament lifecycle service.
  - Registration eligibility service shared by client/server/SQL.
  - Leaderboard reward policy service.
  - ELO sync/cache service.
- Regression-prone areas:
  - Migrations that replace function text.
  - Tournament registration with ELO verification and profile ownership.
  - Waitlist FIFO/roster lock.
  - Manual bracket assignment and lifecycle transition.
  - Match result/no-show/dispute finalization.
  - Leaderboard recalculation with Academy support.
  - Public profile middleware and privacy boundaries.
  - Mobile layouts for admin and bracket workflows.

## 16. Recommended Implementation Order

1. Mobile compatibility.
   - Dependency: existing pages are already feature-rich but have wide tables and drag/drop surfaces. Fixing layout first reduces rework across registration, brackets, admin review, and leaderboards.
   - Risk: visual regressions in `components/TournamentsExperience.tsx`, `app/admin/page.tsx`, and `components/AdminBracketPopulation.tsx`.

2. Three ELO brackets.
   - Dependency: confirm remote migrations, then normalize labels/ranges across `lib/tournaments.ts`, rules/about pages, leaderboard views/functions, and SQL constraints.
   - Risk: partial remote migration state could leave old 1300 split or Main/Challenge-only leaderboard logic active.

3. 50-point ELO discrepancy.
   - Dependency: centralize tolerance after tests for `lib/elo-verification/coh3stats.ts`.
   - Risk: active code uses 75, while an unused helper contains 50/100 semantics. Changing the wrong function will not affect registration.

4. Periodic ELO synchronization.
   - Dependency: build a cached/retryable CoH3Stats sync service and decide whether profile ELO or registration snapshots drive eligibility.
   - Risk: rate limits/outages and changing eligibility after registration.

5. Eight-player activation workflow.
   - Dependency: settle bracket capacity, registration close/start dates, waitlist confirmation, and admin override rules.
   - Risk: current generation only requires 2 players and uses any power-of-two count, not specifically 8.

6. Participant lists.
   - Dependency: public profile middleware/opt-in and player-profile links.
   - Risk: exposing private player data if tournament participant views bypass the public profile boundary.

7. Email notifications.
   - Dependency: stable in-app notification event taxonomy and preferences.
   - Risk: duplicate sends unless notification idempotency is added first.

8. Leaderboard automation.
   - Dependency: final bracket model and reliable tournament completion events.
   - Risk: automatic recalculation can publish wrong scores if result corrections/no-shows are not fully accounted for.

9. Rulebook updates.
   - Dependency: final bracket names, ELO thresholds, activation workflow, no-show/result policies, and payout rules.
   - Risk: static PDFs and site copy diverge.

10. Prize ledger.
   - Dependency: finalized leaderboard/champion/tournament completion model and audit logging.
   - Risk: current `prize_pool` is only text; money movement needs a ledger, statuses, approver identity, and corrections.

11. International payouts.
   - Dependency: prize ledger, identity/tax/KYC decisions, provider selection, and legal review.
   - Risk: regulatory and reconciliation complexity.

12. 2v2.
   - Dependency: team/roster model, team registration, team ELO policy, bracket generation changes, match result changes.
   - Risk: current data model is individual-player and admin save rejects non-1v1.

13. Replay archive.
   - Dependency: replay metadata model, public/private access policy, storage retention policy, and indexing.
   - Risk: current proof URLs are short-lived and tied to match reports, not a library.

14. Premium subscriptions.
   - Dependency: payment/webhook foundation, entitlement model, privacy policy, and test suite.
   - Risk: no current billing code exists; adding it before idempotency and tests would be high risk.

15. Internationalisation.
   - Dependency: route/content strategy and translation inventory.
   - Risk: hard-coded English strings and date locales are widespread.

16. User AI assistant.
   - Dependency: privacy boundaries, audit logging, rate limits, and support content source of truth.
   - Risk: may expose private tournament/profile data without a robust authorization layer.

17. Admin AI assistant.
   - Dependency: mature admin audit logs, read/write tool boundaries, permission model, and human approval for mutations.
   - Risk: highest blast radius because admin actions can affect registrations, results, leaderboards, and future payouts.

## A. Executive Summary

IronClad is a functional Next 16 App Router site with real Clerk authentication, Supabase-backed player profiles, tournament registration, admin review, manual bracket population, result reporting, disputes, no-shows, in-app notifications, public leaderboard views, and manual leaderboard recalculation. The strongest implemented area is the 1v1 tournament operations stack.

The main gaps are operational hardening: no automated tests, unknown remote migration state, public profile routes blocked by middleware, ELO verification still using a 75-point tolerance, no periodic ELO sync, incomplete three-bracket consistency in leaderboard admin adjustment logic, no eight-player activation/confirmation workflow, no email, no payments/subscriptions/payouts, and high-risk mobile/admin/bracket layouts.

## B. Launch Blockers

- Public player directory/profiles are linked and implemented but blocked for anonymous users by `middleware.ts:3-11`.
- No automated tests exist for core money-adjacent and tournament-critical workflows.
- ELO verification uses 75-point tolerance in active code, not 50.
- Remote Supabase migration state is not confirmed.
- Academy/Challenge/Main support has migration risk, especially leaderboard function text replacement and admin adjustment missing Academy.
- Registration close/start/end lifecycle fields exist in DB but are not surfaced/saved by admin UI.
- No eight-player activation or player confirmation workflow exists.
- Mobile admin, bracket, registration, and leaderboard workflows need device testing.
- Email, prize payouts, subscriptions, and AI are not implemented.
- Next 16 middleware deprecation should be addressed before further routing/security work.

## C. High-Risk Technical Issues

- Service-role client use on public and player-facing pages increases reliance on correct app-level filtering.
- Non-atomic registration plus ELO metadata update can leave inconsistent rows.
- Notification inserts lack idempotency and can duplicate on retry.
- SQL migrations include old bracket assumptions and brittle function text replacement.
- Admin authorization depends entirely on Clerk metadata.
- Bracket/lifecycle/result workflows are implemented mostly through SQL RPCs without tests.
- Static homepage tournament data duplicates live DB tournament data.
- Large multipurpose components increase regression risk.
- Public profile opt-in column exists, but no opt-in UI was found.
- Leaderboard recalculation is manual and can drift after result corrections.

## D. Quick Wins

- Add `/players(.*)` to the public route matcher after rechecking avatar route privacy.
- Migrate `middleware.ts` to Next 16 `proxy.ts`.
- Remove unused `Metadata` import from `app/layout.tsx:1`.
- Update stale ELO registration copy at `components/TournamentsExperience.tsx:2471`.
- Centralize ELO tolerance and remove or update unused `compareClaimedEloWithVerifiedElo`.
- Add a public-profile opt-in toggle next to the Discord visibility toggle.
- Link public leaderboard and tournament participants consistently to public profiles where safe.
- Add notification idempotency keys before email.
- Add registration close/start/end fields or remove DB-dependent assumptions from lifecycle.
- Add first tests around ELO parsing/comparison and bracket eligibility.

## E. Feature Status Table

| Feature | Status |
|---|---|
| Tournament creation | Fully implemented and apparently functional. |
| Tournament editing | Fully implemented and apparently functional. |
| Tournament deletion | Fully implemented and apparently functional. |
| Tournament registration | Partially implemented. |
| Registration approval and rejection | Fully implemented and apparently functional. |
| Waitlist | Partially implemented. |
| Manual review | Fully implemented and apparently functional. |
| ELO verification | Partially implemented. |
| IGN verification | Partially implemented. |
| Manual bracket placement | Fully implemented and apparently functional. |
| Bracket generation | Partially implemented. |
| 1v1 tournaments | Fully implemented and apparently functional. |
| 2v2 tournaments | Database/backend only. |
| 4v4 tournaments | Present but likely broken. |
| Match scheduling | Partially implemented. |
| Match-result submission | Fully implemented and apparently functional. |
| Result conflicts | Fully implemented and apparently functional. |
| Admin result approval | Fully implemented and apparently functional. |
| No-show handling | Partially implemented. |
| Tournament completion | Partially implemented. |
| Tournament archiving | Not implemented. |
| Leaderboard recalculation | Partially implemented. |
| Season management | Partially implemented. |
| Player notifications | Fully implemented and apparently functional. |
| Admin notifications | Fully implemented and apparently functional. |
| Email notifications | Not implemented. |
| Public player directory | Present but likely broken. |
| Public player profiles | Present but likely broken. |
| Match history | Partially implemented. |
| Champion history | Partially implemented. |
| Player earnings history | Not implemented. |
| Prize payments | Not implemented. |
| Subscriptions | Not implemented. |
| Premium feature entitlement | Not implemented. |
| Multiple-language support | Not implemented. |
| Mobile responsiveness | Partially implemented. |
| Replay library | Partially implemented. |
| Player highlight clips | Not implemented. |
| User AI assistant | Not implemented. |
| Admin AI assistant | Not implemented. |

## F. First Ten Files Or Areas For The Next Implementation Chat

1. `middleware.ts` - public route access and Next 16 proxy migration.
2. `lib/tournaments.ts` - bracket labels, ELO rule parsing, tournament card mapping.
3. `app/tournaments/actions.ts` - registration, waitlist, profile/ELO verification, close-date mismatch.
4. `lib/elo-verification/coh3stats.ts` and `lib/elo-verification/registration.ts` - active ELO tolerance, fetch reliability, IGN/ELO comparison.
5. `supabase/migrations/20260627110000_registration_elo_verification_results.sql`, `20260629090000_coh3_profile_ownership.sql`, `20260702090000_allow_academy_tournament_brackets.sql`, and `20260702100000_leaderboard_academy_rewards.sql` - final ELO/bracket database state.
6. `app/admin/tournaments/actions.ts` and `app/admin/tournaments/page.tsx` - tournament lifecycle fields, 1v1-only validation, bracket generation/deletion.
7. `app/admin/page.tsx` and `components/AdminRegistrationReviewRows.tsx` - admin registration review, waitlist promotion, mobile table risk.
8. `components/TournamentsExperience.tsx` - largest UI surface, registration modal, bracket rendering, match modals, mobile behavior.
9. `app/tournaments/match-actions.ts` plus match-result/no-show migrations - result submission, disputes, admin approval, no-show handling.
10. `lib/leaderboard/admin.ts`, `lib/leaderboard/public.ts`, and leaderboard migrations - manual recalculation, Academy support, audit runs, future automation.
