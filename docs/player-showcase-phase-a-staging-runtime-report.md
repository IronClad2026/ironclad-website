Historical preflight report: the later "NORMAL STAGING VALIDATION + DEPLOYMENT" authorization supersedes this report's independent hidden-secret inspection prerequisite. Use the established Staging configuration; Sensitive Preview entries are not a stop condition. The results below record the earlier attempt only.

**Player Showcase Phase A — Staging runtime validation**

10 September 2026. **Stopped at the environment-identity gate. No external mutation occurred.**

The brief requires positive verification of Supabase, Clerk and Vercel runtime identity before linking, migration application, deployment or external changes. Supabase project identity was verified through the connected management service. The Vercel project and existing Staging Preview were identified, but the actual Preview credential values could not be inspected sufficiently to prove their target. This is an unresolved identity, not evidence that Production credentials are present.

**1. Workspace verification**

Working path: `C:/Users/pc/Documents/IronClad/03_Website/ironclad-player-showcase-phase-a`.
Branch: `codex/player-showcase-phase-a`.
HEAD/base: `631e5ad225fdd8e702e99a3e80e57e2f62368051`.
The existing Phase A implementation remains unstaged and uncommitted. Original checkout: clean `master` at `6b37295ce9e6874cc753d902f93223566e82015d`. Existing worktrees were inventoried without editing or using their contents as implementation sources.

**2. Staging Supabase verification**

Passed for management-plane project identity: project name `ironclad-staging`, exact ref `zzbnneprhjicmajpjkdg`, status `ACTIVE_HEALTHY`, region `ap-northeast-1`. Reported PostgreSQL engine is 17, version `17.6.1.147`. The application’s Preview URL/key binding remains unverified. No SQL query or data mutation was executed; UTF8 was not independently checked.

**3. Staging Clerk verification**

Not passed. No local runtime environment file exists, no relevant process credentials are configured, and tracked runbooks do not identify the approved Clerk Development instance/domain or admin test identity. The Preview `CLERK_SECRET_KEY` and `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` entries are Sensitive; inspection could not classify their values as Development or match them to an approved instance. No Clerk credential was used.

**4. Vercel Preview verification**

Metadata verified: team `ironclad-tournaments` (`team_0OLta9dgvbWgjf1Jvn7X22n0`), project `ironclad-website` (`prj_5os8tdLLkgGUSWnrxpiYj6OI6YEB`). Existing immutable deployment `dpl_4Q71JC259ST8k4mB1XEfxfvNUwZY` is READY, nonproduction (`target: null`), for `staging` at the base commit above. It does not contain the uncommitted Phase A work.

Preview variables were inspected through read-only Vercel API calls using the repository-documented CLI version 59.1.4 and team scope. All six core entries below are Preview-only, without a Phase A-specific branch override, and marked Sensitive:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`

A read-only inspection requesting decryptable values still yielded no verifiable target or key classification. No values were printed, written into this worktree, or used to authenticate to Clerk/Supabase. Preview scope alone does not prove Staging credential identity. There is no local `.vercel/project.json`, `supabase/.temp/project-ref`, or `.env.local`; the only local environment file is tracked `.env.example`. No hard-linked runtime file was created or used.

**5. Migration-history status**

Not inspected: the prerequisite environment identity gate did not pass. No claim is made that Phase A is the sole pending migration, that Staging history matches local files, or that no newer conflict exists.

**6. Migration review result**

The existing migration and local test approach were reviewed read-only. Review against the actual Staging schema is not complete. Required later checks remain: player/award keys, composite ownership uniqueness, column-targeted ON DELETE SET NULL, role grants and RLS, fixed search paths, JWT ownership, public allowlist, legal prerequisites, preserved closure entrypoint body, moderation and revision locks. The migration file is unchanged.

**7. Migration application result**

Not applied. `20260909234122_player_showcase_phase_a.sql` remains a local untracked migration file. No apply, repair, force or migration-ledger mutation occurred.

**8. Tables/views/functions/RLS verification**

Live verification not run. Existing local implementation checks from the previous task are not treated as Staging proof.

**9. SQL test results**

Not run. The prepared `tests/database/player-showcase-phase-a.sql` is intentionally guarded for a disposable local database. It changes fixture legal documents, award data and fabricated history within that local test transaction. Its guards must remain intact; it must not simply be redirected to Staging.

A separate reviewed Staging contract should follow the existing fixed-target, rollback-only, pre/post residue-check pattern in `scripts/phase15c/run-staging-registration-contract.mjs`, using existing effective legal IDs and scoped verified test identities. No such adaptation was implemented after the stop condition.

**10. Concurrency/race results**

Not run. The prepared race harness clones a local database and commits disposable fixture operations. It was not repointed to Staging. Actual account-closure races require a separately approved disposable context; permanent UAT players must not become closure targets.

**11. Real authenticated runtime results**

Not run. No Clerk sign-in, Server Action mutation, real Showcase editor save or authenticated application test occurred.

**12. Public privacy results**

Not run against Staging. No public-profile visibility was toggled. Existing local test results do not establish live privacy behavior.

**13. Badge ownership results**

Not run against Staging. No earned award, reveal state, evaluator, badge notification or featured preference was changed.

**14. Account closure results**

Not run. No Clerk account, permanent UAT player, historical player or production account was deleted or pseudonymized. The tracked policy identifies permanent `TestAcademy1–10`, `TestChallenge1–10` and `TestMain1–10` as non-cleanup targets.

**15. Feature-flag results**

No live flag read/write or activation test occurred. The migration’s default OFF behavior remains a local implementation fact, not a verified live state. No platform setting was changed.

**16. Preview deployment URL**

No Phase A Preview was created. The existing base-only Staging Preview identified during metadata inspection is:

[Existing Staging base Preview](https://ironclad-website-dfljkthy3-ironclad-tournaments.vercel.app)

This URL must not be mistaken for a Phase A runtime validation result.

**17. Desktop visual QA**

Not performed against an actual Phase A Staging deployment. Previous synthetic local screenshots are not live Staging evidence.

**18. Mobile visual QA**

Not performed against an actual Phase A Staging deployment. No new claim about real 320px, 390px or landscape behavior is made.

**19. Fixes made during runtime validation**

No application, migration, test or environment changes. This report is the only file added in this runtime-validation turn.

**20. Tests rerun and results**

No application or SQL tests rerun: the stop condition occurred during configuration preflight. Read-only verification commands/tools succeeded for worktree identity, original-master cleanliness, Supabase project metadata, Vercel team/project/deployment metadata and Preview variable scope. Credential classification returned unavailable/redacted for all six required Preview entries. CLI help returned its usage with exit code 1; this was not a deployment or test failure.

The earlier 3,188 local tests and 37 synthetic browser checks belong to the implementation report and are not counted as real Staging validation.

**21. Competition regression result**

Not exercised against Staging. Registration, ELO, brackets, matches, replay evidence, leaderboards, badge authority and account privacy were not mutated. No regression pass is claimed.

**22. Remaining limitations and required information**

To resume under the existing authorization, provide an approved secure source for independently verifiable Staging runtime configuration in this worktree, plus the approved Clerk Development instance identifier/domain and test-account access. Do not paste secrets into chat. The six sensitive Preview entries cannot currently establish environment identity through the available metadata API.

The tracked workflow verifies an exact immutable READY Preview and exact Git SHA; it does not document a generic credential bootstrap for this fresh worktree. Fixture CLI loading of `.env.staging-uat.local` does not configure ordinary Next.js runtime, and test-key prefixes alone do not identify the approved Clerk instance. The existing legal-origin Preview allowlist must also be reconciled for a future Phase A deployment without changing the effective legal corpus.

Once identity is positively verified, resume with live migration-history/schema comparison and stop again on divergence before any migration. Preserve original local test guards and use an appropriately isolated context for destructive fixture/closure/FK-deletion tests.

**23. Git status/diff**

No existing file changed during this runtime-validation turn. All 21 modified tracked files and 33 previously added implementation files remain intact and unstaged. This report adds one new untracked file, giving 34 new files overall. No commit, push, merge, branch change, PR or reset occurred.

**24. Production untouched**

Production master remains clean and unchanged. No Production Supabase or Clerk credentials were used. Vercel access was read-only project/deployment/environment metadata inspection; no Production or Preview deployment/configuration was mutated. No external migration, feature activation, data mutation, environment copy/link, account operation or Phase B work occurred. Work stopped at the explicit environment-identity safety gate.
