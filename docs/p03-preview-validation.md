# P03 hosted Preview validation

This harness tests the actual master-based candidate, Clerk Development login and the existing reserved Staging Match Room pairing. It never points at Production. Component fixture tests remain separate; they cannot supply this report.

## Exact target and artifacts

Save the read-only Vercel `get_deployment` metadata for the READY candidate into an ignored local evidence file. The accepted object contains `url`, `readyState`, `target`, and `meta.githubCommitSha` / `meta.githubCommitRef` (or is nested under `deployment`). The target must be a unique `ironclad-website-<deployment>-ironclad-tournaments.vercel.app` Preview for `codex/p03-production-ready`. Its full SHA must equal local `HEAD` and `P03_CANDIDATE_SHA`.

Set these harness-only process variables, without placing secret values in terminal commands or logs:

- `P03_PREVIEW_DEPLOYMENT`: path to that exact Vercel metadata JSON.
- `P03_CANDIDATE_SHA`: full expected candidate SHA.
- `P03_ALLOW_FIXTURE_COMMUNICATION`: the same SHA, only after the operator has verified the candidate Preview, Staging identity and effective legal-origin configuration. This authorizes bounded communication operations in the reserved fixture, including automatic room resolution/read acknowledgements.
- `P03_STAGING_ENV_DIR`: optional directory containing the existing `.env.local` and `.env.staging-uat.local`; defaults to sibling `ironclad-website`. Files are read into memory and never copied.
- `P03_ADMIN_CREDENTIALS_FILE`: optional protected, ignored file containing `P03_ADMIN_EMAIL` and `P03_ADMIN_PASSWORD` for an already-existing approved Clerk test administrator. No user, role, password or metadata is provisioned/changed. Missing admin identity is a failed blocker.
- `P03_VERCEL_BYPASS_SECRET`: optional in-memory automation bypass credential for this Preview only. It is attached only to requests to the exact validated Preview origin.

These are test-runner inputs, not new application environment variables. No dependency is added.

```powershell
node node_modules/playwright/cli.js test --config tests/preview/p03/playwright.config.ts
```

The standard Playwright JSON report is `test-results/p03-preview-report.json`. Metadata is exactly `{candidateSha, previewUrl, supabaseProjectRef}`. Fourteen cases use the release-gate titles `[p03:login]`, `[p03:bracket]`, `[p03:completed-match]`, `[p03:current-match]`, `[p03:one-player-tbd]`, `[p03:match-room]`, `[p03:unread-card]`, `[p03:send-read]`, `[p03:notification]`, `[p03:assistance]`, `[p03:result-replay]`, `[p03:admin-workspace]`, `[p03:mobile-375]`, and `[p03:mobile-390]`. The gate requires all of them to pass. Missing fixtures/admin access are failures, never fabricated passes. `--list --reporter=list` checks discovery without executing hosted operations or producing release evidence.

Trace, video and screenshots are disabled. Session state remains in memory. Playwright's private DOM copy prompt is disabled, contexts are closed before ordinary errors are reported, and application/browser errors are replaced by static failure messages. Do not enable trace/HTML/screenshot reporters on this credential-bearing harness. Browser traffic is restricted to the exact Preview, verified Clerk Development frontend, bounded public CDN/challenge resources, and GET requests to the exact Staging Supabase host. The service-role credential is used only from Node for explicit bounded GETs and the existing read-only fixture-provenance RPC; it is never sent to a browser.

## Reserved fixture and mutation limits

Read-only discovery on 2026-09-23 identified:

- Active synthetic tournament: `b1230000-2026-4908-8000-000000001101`.
- Current synthetic pairing: `528069ef-3ba1-4451-a5ac-c54d6b8b5d62`, TestChallenge1 versus TestChallenge3.
- Existing room: `fda46bde-024c-4fdf-844e-a622a8ef1f87`.
- Historical completed synthetic match: `96c9d208-9d73-43e7-9d39-6e0500994b7c` in tournament `38235d4b-eba7-4ff8-9ee4-11ba085fa5de`.

Fixture IDs are pinned to this reviewed set rather than configurable arbitrary live matches. A replacement requires read-only provenance verification and a reviewed harness update. Each run rechecks fixture provenance, registration ownership, exact pairing and its bounded competition facts. The harness may send three uniquely identified synthetic validation messages, advance the two test users' private room read cursors, and exercise the fixture assistance request/resolve lifecycle only after a real admin test identity has authenticated. Existing unresolved assistance is preserved and blocks the assistance test. Test messages are retained; the harness never deletes transcripts or rewrites evidence.

It never submits, confirms or disputes results, uploads replay bytes, rolls dice, changes deadlines, changes tournament/registration state, closes accounts, alters settings/schema, or repairs a changed fixture. Result/replay controls are inspected through a client-only score draft; no result is submitted. Competition facts are compared after each case; differences fail the test with STOP semantics.

The active fixture's four two-player matches were `in_progress`, with deadlines dated 2026-09-16. The result/replay case verifies that expired-deadline submission controls are absent, then reports BLOCKED because an editable score/replay draft cannot be tested. Tests do not override overdue lifecycle behavior. Its three future matches currently have zero confirmed players. **There is no one-player/TBD fixture in this approved event.** The one-player test therefore fails until a suitable authorized fixture exists; a zero-player final is not accepted as equivalent. No fixture is manufactured or competition result changed to force coverage.

Read-only Clerk checks verified that TestChallenge1 and TestChallenge3 are active password-enabled synthetic identities with `role=player`. The existing synthetic provisioning contract only creates players and is not an admin provisioning path. No verified admin test credential was available at authoring time. The admin and assistance cases remain blocked until that identity is supplied securely. Merely signing in as a player or viewing a public admin link cannot satisfy them.

## Effective Staging legal origins

The live Staging legal register was inspected read-only. Effective origins are:

- Terms 1.1: `https://ironclad-website-o0575x5sw-ironclad-tournaments.vercel.app`.
- Privacy 1.2: `https://ironclad-website-8qjupto5h-ironclad-tournaments.vercel.app`.
- PPA and Rulebook 3.1: `https://ironclad-website-jlu0oxb49-ironclad-tournaments.vercel.app`.

The candidate Preview needs these exact three origins in its existing Preview legal allowlist. A new deployment's own origin is not a replacement for the immutable registered documents. Do not change legal rows, copy agreement acceptance, or bypass trust validation. After explicit user consent, the release coordinator saved `PREVIEW_LEGAL_DOCUMENT_ORIGINS` for Preview on `codex/p03-production-ready` only. The next candidate push must build a new deployment incorporating it. No authenticated fixture tests run until that exact READY deployment and SHA are independently verified; the earlier source-only deployment is not final evidence.

## Validation status

The harness is newly authored and requires an actual run on the final candidate. Static lint/type/discovery results are recorded by the parent release task. Do not describe the report as green until all fourteen real hosted cases pass. Native mobile keyboard behavior and real provider web-push delivery remain outside Chromium viewport checks; the candidate build guard intentionally disables outbound provider credentials.
