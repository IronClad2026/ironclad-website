# Patch 2 Staging activation evidence

Historical evidence for the abandoned separate-Preview workflow. The user's
established Staging workflow supersedes those restrictions; current deployment,
migration and acceptance results are in [the Staging release record](patch2-established-staging-release.md).

Controlled-release refresh: **BLOCKED**, with no push, deployment or remote
migration. The existing shared Staging worker has push enabled in all 50 latest
successful runtime summaries (latest `2026-11-01 23:55:00 UTC`). Shared
configuration changes are prohibited for this release. Candidate-local
credentials cannot isolate writes from that consumer. Email mode is now verified
disabled through the single-variable configuration getter. See
`patch2-staging-release.md` for the frozen local candidate and remaining gates.

Read-only evidence collected 2026-11-02, after Phase 1 checkpoint `b86cb0d`.
This document proposes later activation steps. It does not authorize or record a
deployment, remote migration, configuration change, hosted write test, reset,
data copy, generated share link, or authentication change.

## Exact targets and proof

| Surface | Evidence | What this establishes |
| --- | --- | --- |
| Supabase Staging | `ironclad-staging`, `zzbnneprhjicmajpjkdg`, ACTIVE_HEALTHY | Separate existing project; use `https://zzbnneprhjicmajpjkdg.supabase.co`. |
| Supabase Production | `ironclad-v2`, `nsyjtqpvyxlzyujlbzos` | Explicit forbidden test target. |
| Current Staging build | READY `dpl_75t8GGqrjXr5TvbyCYGrESMqbccP`, branch `staging`, SHA `c21a23855df61e953b89ee798a6962a3b823bd74` | A deployed Staging reference, not the Phase 1/2 candidate. |
| Current Staging addresses | `https://ironclad-website-fig87ay84-ironclad-tournaments.vercel.app` and `https://ironclad-website-git-staging-ironclad-tournaments.vercel.app` | Deployment metadata supplies the fixed URL and branch alias. |
| Phase 1/2 work branch | `feature/patch2-tournament-registration-separation` | Exact Vercel branch-filtered env metadata returned no branch-specific records. No hosted candidate exists to attest. Inherited defaults have not been established. |
| Candidate Preview guard | `lib/release-preview-safety.ts` allows only two earlier review branches | The Patch 2 branch remains blocked. Do not remove the guard or add an exception before the proof below exists. |

There is useful build evidence for the existing Staging target without reading
credential values: `git show c21a238:next.config.ts` calls
`assertRealtimeStagingEnvironment()` from `lib/p03-1-preview-safety.ts`. For
branch `staging`, that guard requires the exact Staging Supabase URL,
`pk_test_`/`sk_test_` Clerk prefixes, rejects the Production Supabase reference,
and validates project refs for JWT-shaped Supabase keys. At that commit,
`lib/supabase-config.ts` uses the validated URL for Supabase clients, including
the server admin client and Storage. The READY deployment therefore provides
source-backed build-time evidence of the Staging DB/Storage origin and Clerk
test-mode prefixes. It does not prove opaque key ownership, matching Clerk
instances, the configured third-party issuer, or the new candidate's settings.

Live catalog reads confirm separate project-local buckets. In Staging,
`match-proofs` and `player-avatars` are private; `staging-legal-documents` is a
separate public PDF bucket. No object contents, private proof paths, or signed
URLs were read. Candidate runtime upload/retrieval targeting remains a later
acceptance check.

## Worker destination: one unknown resolved

A server-side SELECT compared the configured Vault worker URL with exact known
addresses and returned booleans only. No plaintext URL, auth value, bypass
value, or credential digest was returned or stored.

| Classification | Result |
| --- | --- |
| Worker URL entry present | true |
| Equals Staging branch alias plus `/api/internal/transactional-email` | true |
| Equals current fixed Staging deployment plus that path | false |
| Equals known Production fixed deployment plus that path | false |
| Equals `https://ironclad-website.vercel.app` plus that path | false |
| Required worker auth entry present | true |
| Required Vercel bypass entry present | true |

The effective configured worker destination is therefore the existing Staging
alias. This does not attest the worker credentials or prove that its email/push
delivery settings are safe for new test writes.

Staging has an active five-minute transactional-email cron. The handler also
runs web push and badge reconciliation. Vercel `staging` env metadata includes
Resend, worker, email mode/allowlist/sender, VAPID, and highlights signing/worker
keys. The controlled-release refresh verified the non-secret email-mode Config
value is DISABLED. Sensitive entries remained unreadable. Bounded runtime
summaries prove shared push is enabled; key presence alone was not used as proof.
An email allowlist does not constrain web push.

Disabling outbound credentials only on a new Preview is insufficient when that
Preview writes into the shared Staging DB: the existing Staging-alias cron can
still consume the resulting work. Verify or disable that shared outbound
consumer through a separately authorized, coordinated change before hosted
write acceptance. Do not disable Production or unrelated deadline/waitlist
automation as a shortcut.

## Remaining proof and access limits

| Unresolved point | Exact missing evidence and next action |
| --- | --- |
| New candidate environment | Assign and review the exact branch's effective resources. Keep the Supabase URL fixed to Staging, prove publishable/service-key project binding using the existing strict guard, reject Production refs and unapproved direct DB URLs, and inspect effective inherited values. Existing `staging` settings must not be copied wholesale because they contain outbound resources. |
| Matching Clerk test instance | Build evidence proves test prefixes only. Obtain non-secret Clerk instance ID and frontend API domain from an authorized instance-metadata/Dashboard read; attest that the backend key belongs to that same test instance. Do not record either key. |
| Supabase accepted Clerk issuer | Obtain Staging's configured third-party-auth provider/domain/issuer from an authorized Supabase management/Dashboard read and compare it with that Clerk test instance. No installed Supabase tool exposes auth configuration; `get_project` returns project basics only. `auth.instances` has zero rows, so its legacy `raw_base_config` field cannot supply the missing configuration. |
| Candidate outbound suppression | Prove effective email mode is disabled, Resend/worker/VAPID/analytics/Steam outbound credentials are absent or blank, highlights are disabled, and unapproved highlights/COH3Stats resources are absent, as the candidate guard requires. Separately attest the shared Staging consumer described above. |
| Runtime Storage and identity access | After authorized deployment and resource attestation, use synthetic test identities to verify the Staging private buckets and Clerk-to-Supabase authorization. Configuration/source evidence is not an end-to-end test. |

Anonymous GET requests to both current Staging addresses returned HTTP 302 to
`https://vercel.com` with a Vercel-authentication marker; no application bundle
paths were available. The Vercel `web_fetch_vercel_url` helper was deliberately
not used because its tool contract creates or reuses a temporary share link.
No protection setting, login, auth header, or share link was created or changed.
Deployed public bundles therefore could not independently attest the frontend
Supabase/Clerk values under this read-only/no-share-link access path.

## Phase 2 database dependencies

Direct catalog/function-definition reads, without invoking application RPCs,
confirmed parity between Production and Staging for:

- `notifications.read_at` and `in_app_hidden_at`, the notification mutation,
  canonical-event-key, email-initialization, and push-initialization triggers.
- `list_match_room_assistance_requests(integer)`: service-role-only,
  `search_path=pg_catalog`, definition MD5 `af9e532fd16708e7195a6f0f2f7c87ee`.
  It lists canonical requested states independently of inbox visibility, but
  currently has no tournament argument.
- `request_match_room_assistance` and `resolve_match_room_assistance`:
  authenticated execution, with protected actor/access checks. Only the
  explicit resolution workflow changes assistance state; read/hide actions
  must not call it.
- Notification foreign keys from assistance and notification episodes use
  `ON DELETE SET NULL`; they do not cascade-delete the assistance record.

The Production baseline's legacy queue needs explicit treatment before changing inbox deletion.
Before Patch 2, `lib/admin-operations.ts` includes pre-room assistance only while its
notification has `in_app_hidden_at IS NULL`. Hiding that row therefore removes
an unanswered request from the legacy operational queue even though no modern
assistance state changes. Preserve legacy operational evidence independently
of notification visibility before enabling the new hide behavior. Modern and
legacy notices can both be hidden from the inbox while retaining their rows;
do not infer a missing tournament or resolve support implicitly.

Bounded state aggregates at audit time: Production has four requested room
assistance states and zero legacy assistance notification rows; Staging has
zero requested room states and two legacy assistance notification rows.
Staging has six admin notifications without tournament association. These are
coverage facts, not permission to migrate, hide, or reassign existing records.

## Minimal later activation and acceptance

1. Keep the candidate Preview blocked while collecting the exact missing
   identity, resource, and shared-worker attestations above. Coordinate with
   partner owners of the shared Staging alias before any configuration change.
2. Only after authorization, assign the exact candidate branch's reviewed
   environment, add its narrowly scoped guard exception, and apply only the
   reviewed additive Patch 2 migrations. Production/Staging ledgers differ;
   never wholesale-push the Production migration history into Staging.
3. Use prepared synthetic test identities and new, unlaunched test tournaments
   in existing Staging. No Production copies, resets, live identities, or live
   event roster edits. Include the same player in two tournaments, all six
   registration statuses, mixed/missing IDs, launched-roster denial, shared
   admin read/hide actions, null tournament notices, and unresolved legacy and
   modern assistance. Read/hide must preserve the operational queue and domain
record; selecting the other tournament must clear stale selections.
4. Complete real-trigger capacity, ELO, acceptance/identity, waitlist FIFO and
   offer expiry, registration-window, and launched-roster tests. The local
   PostgreSQL harness uses the actual old review function and new wrappers but
   deliberately does not load these other authorities. Its passing checks do
   not replace this gate. Also run chat, sequential reporting, replay
   upload/retrieval, confirmations/disputes, and deadline regressions without
   calling internal workers manually or forcing open-browser refreshes.
5. Record exact candidate SHA, deployment ID, applied migration versions,
   observed target identities, and acceptance results before proposing
   Production release. No activation action has been performed by this audit.

Rollback sets `PATCH2_ADMIN_INBOX_ENABLED=false`, retaining scoped action guards
and the durable legacy assistance queue. If a code rollback is needed, use a
compatibility build retaining those protections; a pre-Phase-2 build would
restore unscoped service-role actions and legacy physical deletion. Leave
additive schema and newly submitted records intact. Keep the existing review
RPC signature callable for already-open clients. Do not erase messages,
notifications, legacy evidence, or registration history to reverse UI changes.
If a Staging-only outbound change is later authorized, record its prior state
and coordinate restoration separately; never restore unverified delivery while
test work can still be consumed.

The exact prepared migrations for this proposal are
`20261101220837_patch2_scoped_registration_review.sql` and
`20261101230355_patch2_admin_inbox_legacy_assistance.sql`. Neither is remotely
applied. A final narrow catalog read confirmed both projects have the required
`players(id,clerk_user_id,account_closed_at)`,
`match_rooms(id,match_id,player_one_registration_id,player_two_registration_id)`
and `match_room_assistance(room_id,notification_id)` columns, and neither already
has `public.assistance_requests`. This verifies the new classifier/attribution
dependencies, beyond migration counts. Stage and Production registration review
authority definitions are equal; remaining fixture/ELO/legacy guards differ as
documented in `patch2-phase1.md` and still need the real-trigger acceptance gate.
