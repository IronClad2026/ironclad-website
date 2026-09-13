# Player Showcase Phase A — Staging validation, 10 September 2026

The owner-read defect is corrected and all 50 strict Staging runtime assertions pass. The feature remains OFF pending Preview setup and browser validation.

## Source and deployment baseline

- PR #125 was verified open, mergeable, CI green, targeting `staging`, at reviewed head `c4b04fe6c48d35b2c5e98c0a511ed2757b5936bc`, then merged.
- New Staging head: `bfc3de41f3f986cbc4cff1f02f6dca2d62a60643`.
- Showcase worktree: `ironclad-player-showcase-phase-a`; branch `codex/player-showcase-phase-a`.
- Showcase began clean at `48872763cd79a89d681fa665e8ef72fc47458643`.
- Refresh merge: `e8519f368f30a4ed173d49d5f5b208de52cda0b7`.
- One straightforward inventory-test conflict retained both the shared member-RPC migration and Showcase, preserving the historical baseline.
- The original Showcase migration source is unchanged.

## Exact migration application

Staging project: `ironclad-staging` / `zzbnneprhjicmajpjkdg`.

Applied version/name: `20260909234122_player_showcase_phase_a`.

Exact LF UTF-8 source SHA-256:

`1475d6bb94a7dee20e17d7c0cb4cc5f2b80b1163fe3f9e1520cd2b1e71885b6e`

The unchanged strict comparator first accepted exactly this one approved pending migration. After application it reports no issues and no pending migrations, with the canonical division migration satisfied by the two checksum-pinned historical records. The shared member-RPC migration remains satisfied.

The management migration helper cannot accept an exact version, and generic CLI planning rejects the known historical aliases. The operational wrapper therefore preserved the original migration transaction, inserted preflight checks after its timeouts, and inserted a single NEW ledger row plus postflight checks before COMMIT. Its ledger statement contains the complete original approved source. No historical row was updated, deleted, repaired or replayed.

The wrapper locked the ledger and pinned its 148 original rows using version-ordered `jsonb_agg(to_jsonb(m))` UTF-8 SHA-256:

`86d032ff2d6bb18210713ef8d35304f52d4464d4fbbc471fa4a87146bf961891`

The first attempt failed the stored-source checksum because JavaScript replacement-string processing altered dollar quoting in the ledger literal. The exception rolled back the entire transaction. Independent reads confirmed 148 unchanged ledger rows, no Showcase objects and no feature setting. After fixing the wrapper's literal preservation, application succeeded. The ledger now contains 149 rows; the prior 148-row fingerprint is unchanged.

Postconditions verified before COMMIT and independently afterward include forced RLS, the owned-award FK, revision trigger/check constraints, restricted RPC/table/column privileges, safe function ownership/search paths, four-column public view, preserved prior closure body and initial feature flag OFF. Closure was not invoked on an existing account.

## Refreshed local gates before runtime fixes

- Unit: 149 files, 1,622 tests passed.
- Integration: 172 files, 1,662 tests passed.
- Lint: zero errors; one existing `DeleteAccountSection.tsx:37` warning.
- TypeScript: passed.
- Production-mode local build: passed with synthetic local CI environment values.
- Showcase fixture browser: 16 passed.
- Dashboard fixture browser: 21 passed.

These 37 browser checks use isolated local fixtures. They are not evidence of real Preview authentication or live browser persistence.

## Staging runtime finding

The strict rollback-only contract in `tests/database/player-showcase-staging-contract.sql` failed the owner raw-read assertion with SQLSTATE 42501: the Showcase RLS policy references `players.account_closed_at`, which authenticated users cannot read.

The editor loader and save-action context independently use the same ungranted private column as a filter. Public-view and service-role moderation reads do not have this caller-permission defect.

A diagnostic execution reproduced both affected raw-read cases and passed the other 48 checks, including Thought creation/edit/clear/empty/160 Unicode code points/invalid input, genuinely owned badge selection/change/removal/foreign-award rejection, public/private visibility, moderation hold/restore, revision conflicts and feature-off clearing. This used simulated JWT database roles, not real Clerk browser sessions. Every diagnostic mutation rolled back.

Before/after full-row fingerprints for 27 protected tables were identical, including players, profiles, legal records, registrations, tournaments/brackets/matches/results/replay evidence, leaderboards, badge awards/reveals, notifications and push subscriptions.

## Approved forward correction applied to Staging

The proposed forward correction is stored outside executable migration directories in `player-showcase-phase-a-owner-rls-proposal.sql`. It changes only the owner SELECT policy to derive the active owner UUID through the existing authenticated-only SECURITY DEFINER RPC. It exposes no private player column and adds no grants.

The proposal pins the existing function definitions and postgres BYPASSRLS prerequisite. See PostgreSQL's [row-security documentation](https://www.postgresql.org/docs/17/ddl-rowsecurity.html) for caller privileges and definer-function access.

The user explicitly approved one additional normal, production-safe forward migration, currently applied only to Staging. The original migration remains immutable. The proposal file preserves the reviewed pre-approval SQL as evidence and is not an executable migration input.

Production/master remains untouched at `6b37295ce9e6874cc753d902f93223566e82015d`. No Phase B work has begun.

Applied correction: `20260910020800_player_showcase_owner_read_rls.sql`, SHA-256 `78387a72713365898ce977159d2a0574bdfb68fe06bcea0e81fc9f814ff64319`. It changes only the owner SELECT policy, with no grants or unrelated schema changes. Its Staging deployment wrapper preserved the previous 149-row ledger fingerprint `a1e273af6775e687e3767dd0734b09a8dc0ef1454ee51eeb38e7f221ce7d1719`; there are now 150 ledger rows.

After correction, the strict original 50-assertion rollback-only Staging suite passed without bypasses. Owner reads work, another owner cannot see the row, anonymous raw reads and owner RPC calls are rejected, moderator attribution remains private, and authenticated access to players.account_closed_at remains false. The feature remained OFF and no Showcase rows remained after rollback. All 27 protected-table fingerprints remain unchanged. Post-application baseline comparison reports 149 local migration files, 150 live records, no issues and no pending migrations.

Application fixes use get_my_player_showcase for authoritative active-owner resolution, followed by player reads scoped to both Clerk identity and the returned player UUID. They do not filter private account_closed_at. Strict DTO validation and malformed/mismatched-identity regression cases were added. All 66 focused application/security tests, targeted lint and TypeScript passed. The corrected application build and all 1,622 unit tests also passed. The full integration suite and all 37 local browser checks passed before this narrow fix; final broad regression has not yet been repeated, per the user's usage-priority instruction.

Pending: normal Git/Vercel Preview; real Clerk-authenticated dashboard/save persistence and admin flow; closed-account and simultaneous-session runtime coverage; Preview desktop/mobile visual QA; Staging-only feature enablement after readiness checks; final regression/report. Production/master remains unchanged. Usage cap: stop safely around 2% remaining and preserve a precise continuation handoff.
