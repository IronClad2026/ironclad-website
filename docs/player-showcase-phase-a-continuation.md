# Player Showcase Phase A continuation checkpoint

Recorded 2026-09-10. Read this before resuming. No migration or Git operation is in progress.

## Exact current state

- Worktree: C:\Users\pc\Documents\IronClad\03_Website\ironclad-player-showcase-phase-a
- Branch: codex/player-showcase-phase-a
- Validated implementation commit: 654c2b22b51a143c4fcec8a0ad29015bcf084537
- Refresh merge: e8519f368f30a4ed173d49d5f5b208de52cda0b7
- origin/staging: bfc3de41f3f986cbc4cff1f02f6dca2d62a60643 (PR125 merged).
- Original master worktree and origin/master: 6b37295ce9e6874cc753d902f93223566e82015d; untouched and original worktree clean.
- Feature flag player_showcase: OFF in Staging.
- Showcase rows after runtime rollback: zero.
- No Showcase Preview or Showcase PR created in this session. Push was blocked before execution.
- Public origin: https://github.com/IronClad2026/ironclad-website.git. GitHub verified public and current viewer ADMIN. Vercel Git Production branch verified master.
- Vercel project prj_5os8tdLLkgGUSWnrxpiYj6OI6YEB; team team_0OLta9dgvbWgjf1Jvn7X22n0 / ironclad-tournaments.

## Applied ONLY to Staging zzbnneprhjicmajpjkdg

1. 20260909234122_player_showcase_phase_a
   SHA-256 1475d6bb94a7dee20e17d7c0cb4cc5f2b80b1163fe3f9e1520cd2b1e71885b6e
2. 20260910020800_player_showcase_owner_read_rls
   SHA-256 78387a72713365898ce977159d2a0574bdfb68fe06bcea0e81fc9f814ff64319

The second is a normal shared forward correction, currently applied only to Staging. User explicitly approved it after the first runtime test found an owner RLS private-column permission error. Both SQL files are immutable now. Their final blank lines are included in the exact source digests; do not trim/reformat them.

150 live ledger records /149 source migration files: strict comparator passes with no pending or unknown differences. The two known historical aliases remain byte-identical, and the member-RPC migration remains satisfied. Neither historical SQL was replayed; no repair/update/delete of existing ledger rows occurred.

Deployment used each exact SQL file's original transaction with guarded preflight and a single new ledger INSERT before COMMIT, because MCP migration helper cannot specify version and generic CLI rejects intentional historical aliases. First original-migration attempt failed a wrapper checksum and rolled back completely before successful corrected retry. See staging-validation.md for evidence.

## Completed checks

- After Staging refresh: full unit149files/1622tests and integration172files/1662tests passed.
- Lint zeroerrors, oneexisting warning DeleteAccountSection.tsx:37; TypeScript/build passed.
- Local fixture browser37passed: Showcase16/dashboard21.
- After narrow app correction: full unit1622passed again; buildpassed again.
- Focused owner/action/projection/moderation66tests passed; targeted lint and TypeScript passed.
- Focused exactapproval/inventory21tests passed.
- Actual Staging strict rollback-only contract50assertions passed after RLS correction, without bypasses.
- Covers owner/cross-player/anonymous restrictions, no private player column access, Thought create/edit/clear/empty/160Unicode/invalid, owned badges/change/remove/foreign rejection, public/private gates, moderationhold/restore, stale revisions, feature-off clearing.
- Simulated JWT database roles were used for SQL testing, not real Clerk browser sessions.
- All27protectedtable full-row fingerprints unchanged before/after: identity/legal/competition/results/replays/leaderboards/awards/reveals/notifications included.
- Closed-account predicate/closure preservation verified in catalog/source; no actual account closure or simultaneous-session race run in this live session.

## Immediate next action and remaining work

Automatic approval review rejected the feature-branch push twice. First it questioned remote ownership; read-only checks proved publicrepo/adminaccess/samePR125repo. It then specifically required user authorization for publishing this source payload to that public destination. An async question is pending asking to authorize commit654c2b2 plus branch history to the exact publicrepo on codex/player-showcase-phase-a. Do not work around the rejection.

1. Obtain/check that explicit publication approval. If received, push only codex/player-showcase-phase-a through normal Git workflow; never master.
2. Observe the Vercel Git Preview for the pushed exact implementation SHA. Confirm target is Preview/nonproduction and Staging Supabase routing. No secret/env copying is needed; existing Preview Sensitive settings are expected.
3. Once Preview is ready, enable player_showcase ONLY on Staging (the security/runtimechecks above passed); keep historical/private/competition/badge authority unchanged.
4. Use normal existing Staging accounts for real Clerk browser dashboard/editor/save/reload/badge/moderation/privacy checks. Request interactive sign-in if needed; never ask for passwords/tokens in chat. Do not close/pseudonymize existing users or permanentUATfixtures merely to test.
5. Actual Preview visual QA:1440desktop,2560ultrawide,320mobile,390mobile,844x390landscape; content/no-content,badge/no-badge,longname,Unicode/locales,interaction. Local37fixturechecks are not proof of livePreview.
6. Complete safe closed-account/concurrency coverage where possible and final relevant regression. Full integration/lint/browser were not rerun after the narrowfix because focusedchecks passed and user prioritized usage. Rerun finalbroad gates nextsession ifneeded.
7. Return finalPhaseAStagingreport. No Production deployment/mastermerge; no PhaseB/CombatHighlights.

## Safety and runtime notes

- Root is the nominated migration owner. No additional migration is currently needed or approved.
- Keep existing feature source, exactapproval JSON, historicalbaseline/comparator and docs intact.
- Strict runtimeSQL tests/database/player-showcase-staging-contract.sql requires flagOFF and fresh noShowcase rows for its two existing actors. Do not blindly rerun after realQA writes or flagenable; preserve userstate and reviewguards.
- Normal local gates use only syntheticCIprocess env values; no .env.local was added.
- npm dependencies unchanged. Playwright/Chromium already installed; agent-browserCLI unavailable.
- CUA Chrome extension browser supports authenticated tasktabs and viewport capability set/reset without copying cookies/profiles. BrowserIDs are session-specific; use fresh inventory.
- Local127.0.0.1:3193Showcase and3187dashboard fixture servers were stopped.
- GitHubCLI: C:\Program Files\GitHub CLI\gh.exe.
- Vercel cachedCLI: C:\Users\pc\AppData\Local\npm-cache\_npx\3798e05794f47697\node_modules\vercel\dist\index.js.
- Use tools.get_usage_limits and stop all furtherwork near2%remaining after safely finishingatomicoperations. Lastreading was5%remaining. No usage-reset credits available.
