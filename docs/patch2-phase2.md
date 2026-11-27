# Patch 2 Phase 2 — local review handoff

No push, deployment, provisioning, hosted write test or remote migration has been
performed. Phase 1 was independently reviewed and checkpointed locally as
`b86cb0d` on `feature/patch2-tournament-registration-separation`. Phase 2 is the
separate local checkpoint after that commit. Unrelated worktrees remain
untouched. Root owns this batch's migration; presentation, service/tests and
environment evidence were delegated with separate file ownership.

## Behaviour

Open a tournament, then Notifications. Counts, all/unread filter, 25-row pages,
selected detail and every action use that tournament on the server. The read RPC
uses one SQL snapshot for complete counts/page/detail. Mark selected means only
checked records; Mark all covers the selected tournament's entire active inbox
across pages and filters. Selection resets when changing tournament, filter,
page or authoritative snapshot. Mutations return a fresh scoped page without a
whole-site refresh, protecting other open forms and upload drafts.

This is explicitly a shared team inbox. Read and removal affect every admin.
No per-admin receipt table was added. Individual and selected removals set
`in_app_hidden_at`, for both event-key and legacy notifications. They do not
delete notification rows or modify registration/waitlist/match/assistance state.
The existing delivery worker already recognises this visibility field; the
phase adds no new outbound delivery or notification producer.

`/admin/notifications` chooses a tournament or opens separate Platform and
Unassigned legacy inboxes. A null tournament is never assumed to mean platform.
Only an explicit trusted `metadata.adminInboxScope = 'platform'` marker qualifies
for that inbox; no current producer or old record is reclassified automatically.
Unmarked null associations stay unassigned. Mark-all is deliberately available
only for a selected tournament. One/selected actions on the other inboxes still
require their explicit context and complete target validation.

The former admin action entry points fail closed with guidance, including on an
already-open old page. Direct authenticated database updates to admin rows are
also rejected. The migration additionally rejects raw service-role admin
read/hide/delete writes from older deployed helpers, even with the inbox off.
Its SECURITY INVOKER guard preserves postgres-owned trusted authorities,
including authenticated modern assistance resolution and privacy/retention.
Unrelated email/push-state updates remain permitted. Scoped service-only RPCs
perform the new inbox mutations. The player
inbox remains separate and excludes admin-role records even if a malformed row
also contains that player's recipient ID. Historical notification click links
remain authenticated resolvers; they do not mutate or infer missing context.

## Legacy assistance, without a second support system

Modern room assistance retains its existing independent authority and workflow.
Pre-room assistance previously used notification visibility as queue state.
The new `assistance_requests` table supplies durable identity and explicit
Open / In progress / Resolved status for those legacy records. A unique original
notification reference prevents duplicate cases. Future private assistance can
extend this same table; no conversation/message system was introduced here.

Backfill uses only stored notification tournament associations and original
request timestamps. Canonical room events must match an actual room and match;
old room hints must additionally match a room participant and the existing
assistance state's exact original notification reference before exclusion.
An old-writer request after a room request was resolved is therefore retained.
Unknown UUID hints, contradictory matches or ambiguous historical duplicates stay in
legacy review. This avoids duplicates for verified canonical records and keeps
ambiguous legacy notices reviewable instead of silently losing them.
Existing hidden legacy rows
are queued for review with “prior resolution unknown”; hiding is not fabricated
evidence of resolution. Previously physically deleted notifications cannot be
recovered, and no history is invented. A capture trigger covers new old-writer
requests; dismissal defensively captures before hiding.

The legacy queue remains available independently of the inbox feature switch.
Explicit status changes require admin authorization, legal acceptance, the
actual tournament/unassigned context and the expected version. A simultaneous
edit reports a conflict. They never invoke room-resolution, pause, deadlines,
results, brackets, chat or replay functions. Status attribution uses a stable
player UUID when available, preserving existing account-closure pseudonymization
without storing a new raw Clerk identifier. Original notification content is
read in place rather than copied into another retention store.

## Prepared migration — NOT applied remotely

`supabase/migrations/20261101230355_patch2_admin_inbox_legacy_assistance.sql`

- Adds `assistance_requests`, its scoped queue index, RLS and service-role grants.
- Backfills retained pre-room requests and captures future legacy notices.
- Adds a partial index for active admin tournament inbox pagination.
- Adds service-only scoped inbox snapshot and atomic mutation functions, legacy
  queue read and compare-and-set status functions, and private classification
  helpers with a safe search path.
- Removes any obsolete authenticated admin update policy and guards raw admin
  visibility updates/deletes from browser and old service-role clients. Preserves
  trusted postgres-owned functions and the existing closed raw-notification RLS
  and privilege boundary. No old player SELECT policies are restored.
- Does not replace competition authorities or change notification read/hide
  columns, delivery payloads, registrations, waitlist order or room state.

This follows prepared Phase 1 migration
`20261101220837_patch2_scoped_registration_review.sql`, which adds two scoped
wrappers around the unchanged registration review authority. Neither migration
has been applied to a remote database. A short lock timeout makes later index /
trigger installation fail safely instead of waiting indefinitely; retry in a
quiet window after reviewing database activity. Do not push the divergent
Staging migration ledger wholesale.

## Switch, rollout and rollback

`PATCH2_ADMIN_INBOX_ENABLED=true` enables the new inbox after schema and
acceptance. It defaults off and is server-only; no service or paid flag provider
is needed. Keep the Preview allowlist block intact until the evidence in
`patch2-staging-activation.md` is complete. Keep old admin actions closed even
when the new inbox is off.

Later activation order: verify exact candidate identity/storage/outbound
isolation; rehearse both new migrations and legacy fixtures in disposable/local
PostgreSQL; apply only reviewed additive migrations to authorized Staging;
release the candidate with the inbox off; verify the durable legacy queue;
enable the inbox and run scoped acceptance. Production requires its own later
approval, matching dependency review and monitored small rollout.

Rollback disables the inbox switch and keeps the durable queue plus scoped
action guards. Leave additive schema, newly submitted notifications/messages and
explicit status changes intact. Do not restore a snapshot or revert to an old
build that re-enables global mutations or visibility-dependent legacy support.
If code rollback is required, prepare a compatibility build with these guards
and the durable legacy queue retained. No destructive down migration is needed.

## Validation record

Phase 1's unchanged full suite (389 files / 4,929 tests), 40 local registration
database checks, build and browser regressions are reused. Its independent
review correction passed 29 focused tests plus TypeScript and targeted lint.
Phase 2 results and remaining acceptance limitations are recorded after the
focused verification and independent review below.

Final local evidence:

- Combined focused notification/admin/legal regression run: 50 files, 623 tests.
  Forty-nine files passed immediately. The remaining authorization fixture lacked
  the new query's `.in()` chain method; after correcting that mock, all six tests
  in that file passed. No application fix or full-suite repeat was needed.
- The additional system-route/menu check passed eight tests after updating its
  old expectation that the global admin page should render the former inbox.
- Earlier Phase 2 snapshot: 51/51 disposable PostgreSQL 17 checks passed,
  including mixed batches, lock-wait scope change, concurrent dismiss/read,
  exact counts/pages/details, canonical linkage, old writers after/concurrent
  with modern resolution, CAS conflicts, shared state and permissions.
- TypeScript and the production-mode Next build passed under the guarded inert
  environment. Full lint had zero errors; after removing the new unused local,
  only two existing `ignored` warnings in the profile rehearsal script remain.
- Independent actual-diff review found no remaining source blocker after fixes
  for hybrid recipient roles, UUID-only attribution and legacy source linkage.
- Phase 2 migration SHA-256:
  `673e376db5fc924c022b39eb1da9dd64d74775e2aa63af9ee54ed47fce7b2a51`.

The original 51-check saved report below covers the earlier SQL snapshot. The controlled
release review then found and fixed old service-role writes and authenticated
trusted-function compatibility. The final combined-migration rehearsal is
recorded in `patch2-staging-release.md`: 64/64 combined checks passed; the hash
above identifies that final SQL.

Run `node scripts/patch2/notification-db-test.mjs` for a fresh fixed-loopback
cluster on port 56733. It consumes no environment database target and stops its
own cluster in `finally`. Final saved evidence is under
`.release-local/patch2-notifications-ab57e732-8050-4f10-b2dc-abe948e53baf/report.json`.
The cluster stopped and the port was independently checked unused.

These are deliberately minimal domain fixtures with the actual migration and
prior notification mutation guard, not a complete Supabase rehearsal. Real Clerk
JWT/RLS, Storage, email/push delivery, Vercel old-build action routing and full
capacity/ELO/FIFO acceptance remain unverified. Browser result/replay/room checks
from Phase 1 are reused because those implementations are unchanged. New inbox
interaction/accessibility/state tests use jsdom; real mobile/keyboard and
already-open hosted-session acceptance remain required in isolated Staging.
