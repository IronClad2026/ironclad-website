# Poll / member-RPC release readiness: read-only baseline

Audit: 8 September 2026, initially approximately 05:14–05:28 UTC, with preview
branch-scope metadata rechecked during documentation handoff. This is
pre-release evidence, not completed browser/SQL validation or a Production
release. Source baseline: `112cad6fac88bead5f2e7444c9ee583a1c1032f0`.
Revalidate mutable facts immediately before using them as release gates.

## Verified environment mapping

| Surface | Verified target |
| --- | --- |
| Vercel project/team | `prj_5os8tdLLkgGUSWnrxpiYj6OI6YEB` / `team_0OLta9dgvbWgjf1Jvn7X22n0` |
| Existing staging alias | `https://ironclad-website-git-staging-ironclad-tournaments.vercel.app` |
| Staging artifact | `dpl_4Q71JC259ST8k4mB1XEfxfvNUwZY`, READY, preview, Git branch `staging` |
| Immutable staging URL | `https://ironclad-website-dfljkthy3-ironclad-tournaments.vercel.app` |
| Staging source | `631e5ad225fdd8e702e99a3e80e57e2f62368051` |
| Staging Supabase | `ironclad-staging`, `zzbnneprhjicmajpjkdg` |
| Production artifact | `dpl_56ByS2SAVnXGD3SAbHyhhYv3YHap`, READY, production, source `112cad6fac88bead5f2e7444c9ee583a1c1032f0` |
| Production Supabase | `ironclad-v2`, `nsyjtqpvyxlzyujlbzos` |

Staging HTML fetched using existing authenticated Vercel CLI protection
handling contains Clerk test-key markers, no live-key marker, and public issuer
`guided-goshawk-34.clerk.accounts.dev`. Public chunk
`/_next/static/immutable/chunks/21xxk_wthg_79.js` contains the staging Supabase
hostname and no Production reference. No key or page payload was saved. This
establishes compiled public targeting, not independent inspection of all
sensitive server-side environment values.

The local `.env.local` is staging-targeted. In-memory
`loadFixtureEnvironment` / `validateRuntimeGuards` from
`scripts/lib/staging-synthetic-uat.mjs` pass for all 30 existing synthetic
aliases. Guards check the exact staging URL, service-role JWT project/role and
expiry, test Clerk key classes, official synthetic email contract and
credential/fixture-secret shape. No values were printed or copied. A read-only
Clerk lookup for existing alias `TestAcademy1`, using the repository's exact
synthetic external-ID contract and limit 2, returned one matching user;
`validateClerkFixtureUser` passed. No password verification or sign-in ran.
Pre-existing synthetic users are not task-owned records to reset or delete.

## New task preview: same core targets, different branch configuration

The project is GitHub-linked with production branch **master**. Actual Git
preview deployments corroborate automatic builds for non-production branches.
No configuration has been changed to prepare `codex/poll-reliability-release`.
The following existing PREVIEW entries have `gitBranch=null`:

- `NEXT_PUBLIC_SUPABASE_URL`;
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`;
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`;
- `SUPABASE_SERVICE_ROLE_KEY`;
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`;
- `CLERK_SECRET_KEY`.

There are no staging-only overrides for those six core entries and no
task-branch overrides at the audit snapshot. Therefore a Git preview of the
new task branch inherits the same core configuration as the verified staging
artifact. Recheck the actual candidate's compiled host/issuer after deployment;
metadata is not a substitute for end-to-end server/member validation.

These other keys are **staging-branch scoped**, not generic PREVIEW:

- `STEAM_WEB_API_KEY`, `STEAM_OPENID_ORIGIN`;
- `RESEND_API_KEY`, `TRANSACTIONAL_EMAIL_FROM`,
  `TRANSACTIONAL_EMAIL_REPLY_TO`, `TRANSACTIONAL_EMAIL_APP_ORIGIN`,
  `TRANSACTIONAL_EMAIL_MODE`, `TRANSACTIONAL_EMAIL_ALLOWED_CLERK_USER_IDS`,
  `TRANSACTIONAL_EMAIL_WORKER_SECRET`;
- `WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY`,
  `WEB_PUSH_VAPID_SUBJECT`;
- `PREVIEW_LEGAL_DOCUMENT_ORIGIN`, `PREVIEW_LEGAL_DOCUMENT_ORIGINS`;
- `STAGING_SYNTHETIC_UAT_FIXTURE_SECRET`.

Other unrelated branches have some explicit overrides; none apply merely
because this task is a preview. Do not copy their configuration or assume the
new branch gets the staging fixture secret/legal-origin allowlist.

Consequences: the task preview has no configured email delivery API/worker
credentials; missing email configuration fails closed, but is not an explicit
`disabled` setting. No VAPID configuration means the push configuration loader
returns disabled. Missing legal-preview origin settings may affect staging
acceptance-document URLs; the follow-up below confirms that incompatibility.
The owner has not authorized hosted configuration
changes to make such a check pass. Poll recovery can still be tested against
the unchanged staging database using the verified core preview environment.

### Confirmed generic-preview legal gate and deployment constraint

A SELECT of public effective document metadata confirmed staging Terms 1.1
and Privacy 1.2 have the exact successor versions/paths/hashes in the bundled
manifest, but use these immutable preview origins respectively:

- `https://ironclad-website-o0575x5sw-ironclad-tournaments.vercel.app`;
- `https://ironclad-website-8qjupto5h-ironclad-tournaments.vercel.app`.

`lib/account-legal-acceptance.ts` permits only the canonical Production legal
origin when both preview-origin variables are absent. Therefore generic task
preview rejects the current staging effective pair as unavailable even for a
user with valid acceptance. This is an environment compatibility gate, not
permission to change legal records or weaken origin validation.

The official [Vercel branch-linking guide](https://vercel.com/kb/guide/branch-variables-and-domains-not-linked-to-cli-deployments)
documents CLI metadata `githubDeployment=1` and `githubCommitRef=staging` to
select existing branch variables **and domains**. Installed CLI 59.3.0 supports
metadata flags, but its deploy implementation explicitly rejects `--skip-domain`
for non-production targets. This audit did not establish a documented CLI path
that selects the full staging environment while guaranteeing the existing
staging alias stays untouched. Do not use `--prod` as a workaround.

The [deployment API](https://vercel.com/docs/rest-api/deployments/create-a-new-deployment)
documents inheritance from an existing deployment ID, but safe combination of
that inheritance with a different candidate source and no staging alias move
was not established here. No speculative deployment was executed. Root must
resolve this gate explicitly: review use of the existing staging deploy/alias
path or seek the smallest permitted configuration decision, rather than bulk
merging staging, injecting copied credentials or rewriting legal metadata.

## Existing staging external effects: evidence and conditions

- Staging `TRANSACTIONAL_EMAIL_MODE` is **disabled**, verified by Vercel's
  per-variable detail GET. Last update `1787485457548` predates the current
  staging deployment creation `1788752872183`.
- The staging database worker URL exactly matches the staging alias plus
  `/api/internal/transactional-email`; worker/bypass credentials exist.
  The cron remains active every five minutes. This audit initiated no worker
  request and changed no configuration.
- `invoke_transactional_email_worker()` is the only public stored function
  whose body matched direct `net.http` / `http_post` / `http_get`. No
  non-internal trigger function matched those direct HTTP patterns. This
  scoped scan is not proof against every possible indirect integration.
- Staging VAPID keys/subject are configured: push is **not** asserted globally
  disabled. `public.push_subscriptions` count is zero. Browser tests must deny
  notification permission and create no subscriptions. Recheck the count/task
  identities before tests enqueue notifications.
- Auto-approval, expired-offer and matchup-deadline cron jobs run every minute.
  Isolate task records and account for these workers; do not disable jobs or
  modify partner fixtures.
- No payment keys were found in the inspected project environment inventory
  or payment integration in the scoped package/config review. This is not a
  provider-account audit.
- Clerk test mode and official synthetic-email guards are available. Clerk
  webhook configuration and browser session issuance are **not** independently
  verified. Before creating a new identity, establish that its lifecycle cannot
  invoke an unreviewed external webhook. Reusing a verified existing identity
  needs no account creation, but login may still emit session/user events.
  Inspect configured endpoint event filters before calling any login safe.

Staging mutation tests remain conditional on these facts and each tested
path's side-effect review. Administrative SQL access does not prove fixture
mutation is safe. Prefer labelled task fixtures; do not invoke general
provisioning/enrolment/cleanup scripts speculatively.

## Deployment, migration and protected-release behavior

Vercel settings: Next.js framework, default build/install commands, no root
override, protection `all_except_custom_domains`, no Vercel cron definitions.
Database cron jobs above are separate. `package.json` has `build: next build`
and no migration lifecycle script. The only workflow,
`.github/workflows/ci.yml`, runs `validate` on PRs/master pushes: Node 22.12.0,
`npm ci`, lint, TypeScript, tests and build with synthetic localhost/test-only
configuration. No repository migration automation was found. External
automation outside these inspected settings is not independently attested.

Root separately verified master ruleset `18053129`: required strict/up-to-date
`validate`, one approval, last-push approval, stale-review dismissal, resolved
conversations and squash merges. Fulfil human-only gates normally; never reuse
a previous one-time bypass. Do not merge the unrelated staging branch into
Production. Production must be built for Production, never an alias of a
staging-connected preview artifact.

Historical ledger divergence is recorded, not repaired: Production's latest
reviewed entry is `20260904120000 canonical_division_launch_ordering`; staging
has `20260905013141` named
`20260904120000_canonical_division_launch_ordering`, plus staging-only fixture
history. Root's fresh relevant function comparison matched both projects.
Only new allowlisted task migrations may run. Establish a file/history-
consistent exact execution method before application; do not broadly push
unrelated pending migrations.

## Recovery capability: no usable backup asserted

Authenticated Supabase CLI `backups list --project-ref <ref> --output json`
succeeded for both exact projects. Both responses reported:

- `pitr_enabled: false`;
- `walg_enabled: true`;
- `backups: null` (zero enumerable backups);
- `physical_backup_data: {}` (no recovery interval/details).

This does **not** establish a usable restorable backup, recovery point,
retention or zero-data-loss restoration. No backup was created/downloaded,
setting/plan changed or restore attempted. Resolve the release recovery gate
without inventing guarantees. Secure scoped pre-change definitions/ACLs support
a non-destructive forward correction; they are not a business-data backup.
Never automatically restore old acceptance bypasses or NULL-decline behavior.

## Reproducible safe checks and browser follow-through

Connected tools: Vercel get_project/list_deployments/get_deployment;
Supabase get_project/execute_sql (SELECT only)/search_docs. Cached Vercel CLI
59.3.0 and existing Supabase CLI were used after command-help discovery; neither
CLI/package was upgraded. Equivalent read-only requests:

```text
vercel api /v9/projects/prj_5os8tdLLkgGUSWnrxpiYj6OI6YEB?teamId=team_0OLta9dgvbWgjf1Jvn7X22n0 --raw
vercel api /v9/projects/prj_5os8tdLLkgGUSWnrxpiYj6OI6YEB/env?teamId=team_0OLta9dgvbWgjf1Jvn7X22n0 --raw
vercel api /v1/projects/prj_5os8tdLLkgGUSWnrxpiYj6OI6YEB/env/<resolved-email-mode-id>?teamId=team_0OLta9dgvbWgjf1Jvn7X22n0 --raw
vercel curl / --deployment https://ironclad-website-git-staging-ironclad-tournaments.vercel.app -- --silent --max-time 20
vercel curl /_next/static/immutable/chunks/21xxk_wthg_79.js --deployment https://ironclad-website-git-staging-ironclad-tournaments.vercel.app -- --silent --max-time 15
supabase backups list --project-ref nsyjtqpvyxlzyujlbzos --output json
supabase backups list --project-ref zzbnneprhjicmajpjkdg --output json
```

Capture responses privately in memory and return only allowlisted safe fields.
**Do not print raw project/env responses, HTML, Clerk users, tokens, response
headers/cookies or protected share URLs.** The deprecated `decrypt=true`
query did not return sensitive values; per-variable GET was used only for
the non-sensitive email mode. A connector preview fetch returned an SSO
redirect; CLI protection handling successfully fetched the page. Do not
disable protection or change secrets to make browser access work.

SQL checks used pg_get_functiondef for the worker, information_schema.columns,
filtered pg_proc/pg_trigger, cron job names/active/schedules, platform-setting
key names and aggregate push counts. Vault values were compared to the known
staging URL inside SQL; only categories/presence booleans were returned.

Browser procedure, **not yet executed by this audit**:

1. Use an existing authenticated Vercel browser session to pass unchanged
   preview protection. CLI HTTP access does not prove interactive browser
   authentication. If needed, use an existing approved access mechanism in
   memory; never print bypass credentials or alter hosted settings.
2. Inspect the existing Clerk test instance's webhook endpoints/event filters
   through an authenticated dashboard. The installed SDK and documented
   Backend API expose Svix app creation/deletion/auth-URL POST operations, not
   a GET endpoint inventory; none were invoked. Absence of a receiver in this
   repository is not evidence that external endpoints are absent. Both new
   user creation and existing-user login need this side-effect check.
3. Use a fresh isolated browser context with notification permission denied.
   Reverify candidate URL/SHA, compiled staging database and Clerk test issuer.
   Load only verified synthetic credentials in memory, never as literals in
   scripts/logs. Do not modify existing users' profiles/acceptances/fixtures.
4. Validate actual session/JWT claim categories privately: authenticated role,
   textual sub present, expected issuer. Exercise member reads, not service-
   role/postgres substitutes labelled as browser/user tests.
5. Execute the root's narrowly scoped task-owned synthetic test plan. Record
   assertions/timing, not raw ballots, tokens or private IDs. Cleanup only
   proven task-owned records. Production verification remains read-only.

Normal password login with the existing synthetic credentials does not require
the administrative fixture secret. Reusing such an identity minimizes new
account mutations, but never alter its existing profile, acceptance, enrollment
or unrelated ballot. Actual browser writes may affect only newly labelled
task-owned fixture rows after root verifies their scope; rolled-back SQL role
tests are not a substitute for browser identity evidence.

Remaining gates: exact candidate CI/review, browser/member-RPC tests, safe
Clerk webhook isolation for account/session operations, legal-preview compatibility, exact staging
migration/fixture-preservation evidence, recovery gate and Production release
checks. Sensitive hosted server environment values were not extracted;
application/member tests must establish the full identity path.

## Changes and skipped checks

This audit edits only this file and `docs/supabase-security-hardening.md` in
the isolated task worktree. No users, fixtures, sessions, migrations, commits,
deployments, environment variables, dependencies or hosted state changed.
The CLI may update ordinary local metadata caches. Supabase/Vercel skills
caused official-doc/help and read-only targeting checks, not implementation
or hosted changes. The changelog markdown fetch was unsupported; current
Supabase backup documentation was retrieved through documentation search.

Sandbox-denied metadata/file reads were retried with authorized read-only
escalation. An initial incorrect Clerk filter returned an unexpected count;
no user payload was printed/saved and the corrected repository-contract query
passed. A stalled read-only worktree-shell cell was cancelled; later reads
used explicit paths from the integration directory. No file operation was
interrupted; all returned shell sessions completed. A document patch failed
validation before making changes and was corrected.

No application test suite/build, browser sign-in/mutation, synthetic SQL
mutation, restore or Production smoke test ran in this audit. Root/other agents
own implementation/release validation; their work is not claimed here.
No overlapping application or migration file was edited.
