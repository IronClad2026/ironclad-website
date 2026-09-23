# P03 hosted Preview validation

The disposable Staging fixture and dedicated Clerk Development administrator passed **all 14 preliminary hosted cases** on 2026-09-23. Coverage includes TBD and completed matches, a current match with a valid deadline, real admin transcript/assistance behavior, messaging and unread isolation, public/unrelated privacy boundaries, client-only result/replay draft controls, and 375/390 viewports. Three synthetic messages were retained, assistance ended resolved, and every competition invariant recheck passed.

That preliminary run used the existing `97bee422` Preview while final retention/legal preparation continued. Its ignored report is `test-results/p03-preview-preliminary-new-fixture-97bee422.json`. Final release evidence must rerun the committed harness against the completed candidate's exact immutable Preview. The final report and draft PR record that full SHA and deployment identity; preliminary evidence cannot substitute for it.

## Current fixture and administrator

The user explicitly authorized exactly one Development admin and minimum new synthetic Staging fixture state. The fixed admin external ID is `ironclad:p03-preview-admin:v1`. Its backend contract, actual password/test-code login and fresh `metadata.role=admin` session claim were verified. The account acknowledged effective Terms 1.1 and Privacy 1.2 through the real Preview form and saved its synthetic profile through the ordinary profile UI. No legal acceptance or profile row was copied or inserted through a bypass.

Generated credentials exist only in an ignored file with protected inheritance and one current-user-only access rule. The ignored `test-results/p03-admin-lifecycle.json` records onboarding, exact legal document IDs/hashes and eventual cleanup state without passwords. The validation harness does not create identities, profiles or legal acceptance.

The reviewed creator completed 24 journaled, existing-authority RPCs for **P03 Preview Validation 20260923-p03-ready**. It used only the eight existing TestMain1–8 identities and preserved older fixtures. The receipt is `p03-artifacts/fixture-20260923-p03-ready.json`:

- Tournament: `48c83ecd-ed3c-4a80-9830-fe5d6e035405`.
- Current Main1/Main3 match: `948d4324-1b0e-4e59-b081-814d6fd8866c`.
- One-player/TBD match: `404461c6-58f2-4222-ae7c-42ac4d9a0cd2`.
- Completed comparison: `499bc4dc-e926-4d28-9c58-375937f8c074`.
- Empty final: `29f7e1ce-1079-4381-b55f-4f189be1e86e`.

The creator checked roster provenance, identity ownership, active admin/current legal prerequisites, absent push subscriptions and test-only notification recipients. It did not resolve or manufacture any room. Each hosted run independently rechecks the strict receipt, live tournament/bracket ownership, roster and four match contexts.

## Worker isolation

The explicitly authorized read-only Vault check returned only hostname `ironclad-website-git-staging-ironclad-tournaments.vercel.app` and whether its path equals `/api/internal/transactional-email` (true). No complete protected URL, query parameters or credentials were exposed.

The alias resolved to READY staging deployment `dpl_33YYjAPkNyJDR3XVLfXnTSDRMvw5`. A fresh Vercel UI observation confirmed `TRANSACTIONAL_EMAIL_MODE=disabled` for Preview/staging. A 15-minute proof bounded fixture creation; subsequent fixture/cleanup operations require freshly verified actual-worker evidence. No shared environment setting changed. The candidate build guard separately enforces Staging Supabase, Clerk test mode and disabled outbound providers.

## Exact target and runner inputs

Save read-only Vercel `get_deployment` metadata into ignored local evidence. The accepted object contains `url`, `readyState`, `target`, and `meta.githubCommitSha` / `meta.githubCommitRef`, optionally nested under `deployment`. It must identify a READY immutable `ironclad-website-<deployment>-ironclad-tournaments.vercel.app` Preview for `codex/p03-production-ready`. Its full SHA must equal local `HEAD` and `P03_CANDIDATE_SHA`.

Set these harness-only process variables; never put credential values in commands or logs:

- `P03_PREVIEW_DEPLOYMENT`: exact Vercel metadata JSON path.
- `P03_CANDIDATE_SHA`: full expected candidate SHA.
- `P03_ALLOW_FIXTURE_COMMUNICATION`: the same SHA, after target, Staging identity and legal-origin verification. This permits bounded fixture communication, including room resolution/read acknowledgements.
- `P03_FIXTURE_FILE`: the current ignored disposable-fixture receipt. The strict parser rejects arbitrary match-ID overrides; live scope is rechecked before operations.
- `P03_ADMIN_CREDENTIALS_FILE`: protected ignored dotenv with `P03_ADMIN_EMAIL` and `P03_ADMIN_PASSWORD` for the exact approved existing Development admin.
- `P03_STAGING_ENV_DIR`: optional existing Staging environment directory, default sibling `ironclad-website`. Existing environment files are loaded only into memory.
- `P03_PREVIEW_ACCESS_URL_FILE`: protected ignored JSON with `previewUrl`, `url`, `issuedAt`, and `expiresAt` from the Vercel temporary-access tool. The exact-deployment link must expire within 23 hours; its URL and resulting memory-only cookies never enter reports or Git.
- `P03_VERCEL_BYPASS_SECRET`: optional in-memory Preview-only automation credential, attached only to the exact validated Preview origin.

These inputs add no application environment variables or dependencies.

```powershell
node node_modules/playwright/cli.js test --config tests/preview/p03/playwright.config.ts
```

The standard Playwright JSON report defaults to `test-results/p03-preview-report.json`. Native `config.metadata` binds `candidateSha`, `previewUrl` and `supabaseProjectRef`; Playwright may add `actualWorkers`. Use a separate ignored output filename for preliminary runs. Discovery with `--list --reporter=list` performs no hosted operations and is not release evidence.

The required tags are `[p03:login]`, `[p03:bracket]`, `[p03:completed-match]`, `[p03:current-match]`, `[p03:one-player-tbd]`, `[p03:match-room]`, `[p03:unread-card]`, `[p03:send-read]`, `[p03:notification]`, `[p03:assistance]`, `[p03:result-replay]`, `[p03:admin-workspace]`, `[p03:mobile-375]`, and `[p03:mobile-390]`. The gate requires all 14 to pass, with no skipped, flaky or unexpected results. Missing prerequisites fail closed.

## Coverage and mutation boundaries

The suite may send three uniquely identified fixture messages, advance private read cursors and exercise request/resolve/reopen/resolve assistance after genuine admin authentication. Existing unresolved assistance blocks the case. Test messages remain; transcripts are not deleted to conceal testing.

The Match Room case also checks an anonymous browser and unrelated synthetic participant: neither can see private room UI, a composer or unread state. Sender attention is checked after each send. The send/read case clears recipient attention; the subsequent notification case proves a later message restores it and routes to the exact room. Admin coverage includes visible retained transcript and requested assistance state.

Completed/TBD/assistance checks use authenticated UI projections, not direct REST reads of protected communication tables. Existing historical rooms may be read-only: completed UI must have no writable composer or Send control, and official scores, winner and assignments must remain unchanged. The isolated SQL rehearsal separately proves that historical/TBD viewing cannot manufacture writable rooms.

The suite never submits, confirms or disputes results, uploads replay bytes, rolls dice, changes deadlines, changes competition/registration state, closes accounts, changes settings/schema or repairs fixture drift. Replay testing uses only a client-side draft. Every case, including failures, compares the fixture's competition snapshots. A mismatch or failed recheck writes a candidate-specific ignored STOP marker and prevents subsequent fixture operations.

Trace, video, screenshots and authenticated DOM snapshots are disabled. Errors are sanitized and contexts close before reporting failure. Session state stays in memory. Network requests are restricted to the exact Preview, verified Clerk Development frontend, bounded public CDN/challenge resources and GETs to the exact Staging Supabase host. The service credential remains in Node and is limited to bounded permitted reads and the existing read-only provenance RPC. Never enable HTML/trace/screenshot reporters.

Clerk's documented reserved test-email code completes a genuinely prepared verification challenge; no OTP email is sent. The runner accepts auto-submit form unmount only after the expected user's actual session exists and still checks identity/role claims. See [Clerk test emails](https://clerk.com/docs/guides/development/testing/test-emails-and-phones).

Dashboard notification verification uses the badge overlay's client-only **Not now** dismissal and expands the complete notification list; it never acknowledges a badge to clear the overlay. Chromium viewport checks do not establish native mobile keyboard behavior or real-provider push delivery.

## Effective legal origins

The effective Staging register remains separate from the prepared, inactive legal successor. Its four documents use these exact origins:

- Terms 1.1: `https://ironclad-website-o0575x5sw-ironclad-tournaments.vercel.app`.
- Privacy 1.2: `https://ironclad-website-8qjupto5h-ironclad-tournaments.vercel.app`.
- PPA and Rulebook 3.1: `https://ironclad-website-jlu0oxb49-ironclad-tournaments.vercel.app`.

After explicit user consent, the coordinator saved the existing `PREVIEW_LEGAL_DOCUMENT_ORIGINS` setting for Preview on `codex/p03-production-ready` only. Each run checks the register. Do not replace immutable document origins with a new deployment origin, alter legal rows, copy acceptance or bypass trust validation.

## Legacy fallback and cleanup

Without `P03_FIXTURE_FILE`, the harness retains its explicitly reviewed legacy TestChallenge1/TestChallenge3 pairing in tournament `b1230000-2026-4908-8000-000000001101`. That older event has expired deadlines and no one-player/TBD context; it is diagnostic fallback only and cannot complete the required 14-case release report.

The sole Development admin is retained for the final committed verification and the future actual-date Privacy publication candidate's hosted rerun. Its credentials remain private and it has no Production permissions. Reassess or retire this identity by **2026-10-07** (14 days after creation); retention beyond that date requires an explicit new purpose/deadline decision. No cleanup has occurred.

The coordinator must explicitly signal evidence readiness before cleanup. Refresh actual-worker proof, void **only the receipt tournament** through the existing authority when a future fresh fixture can be created, and preserve audit history. The release-date rerun may need a new valid-deadline synthetic event. Close only the dedicated admin through the normal account-closure flow after the coordinator's final lifecycle decision; record actual outcomes and credential cleanup in the ignored receipt. Never remove older fixtures or other synthetic actors, and never claim cleanup before it succeeds.
