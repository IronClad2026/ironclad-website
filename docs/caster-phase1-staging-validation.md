# Official Caster Programme Phase 1 validation

Phase 1 establishes invitations and private drafts. The only new database authority is the caster invitation and own-application boundary. A claim creates a draft. Approval, publishing and tournament assignments are later phases.

## Canonical Staging integration

1. Reconfirm the remote source SHA, protected canonical Staging deployment, Supabase project and effective Clerk Development instance. The reviewed base is `4ffed88cb353cc9864e4f329d76338b10c0832eb`. Save the immutable deployment ID and source SHA for recovery.
2. Confirm `TRANSACTIONAL_EMAIL_MODE=disabled` for the `staging` branch and verify that the database denies `EXECUTE` on `public.claim_web_push_notifications(integer)` to `service_role`, `anon` and `authenticated`. Preserve the shared VAPID settings and recheck the grants after validation. Use Clerk Development Test Mode with synthetic addresses. Verify the effective Supabase and Clerk connections before feature activation.
3. Confirm the exact hosted definitions and grants for Patch 2 account closure, staff authority, the legal acceptance transaction and the competitive notice. Compare the migration ledger and capture a recovery reference. Register one migration owner and apply only the reviewed `20261126094926_caster_phase1_invitations.sql` file. Record the actual migration receipt and SQL fingerprint, then verify grants and RLS before enabling the feature.
4. Integrate the reviewed candidate through CI and verify the protected deployment with the programme disabled. The runtime pins the canonical HTTPS alias, Vercel project and Git ref. Scope `CASTER_CONTINUATION_KEY` to Preview / `staging` as a secret containing 32 random bytes encoded as unpadded base64url. Enable `CASTER_HOSTED_ISOLATION_VERIFIED` and `CASTER_PROGRAM_ENABLED` only after the hosted isolation and deployment checks pass.
5. Exercise new, existing, verified-player, closed and staff synthetic identities. Confirm actual legal acceptance writes the existing receipt and returns to the selected claim account. Confirm a caster-only account can claim, leave, sign back in and resume without the competitive notice. Enter competitive onboarding from that account and test the original notice, return path and existing restrictions. Capture only synthetic, redacted screenshots and test records.
6. Rehearse disabling the feature and returning to the prior build while retaining private drafts and audit data. Re-enabling with the same continuation key can honour unexpired continuations. Rotating that key invalidates all prepared continuations and leaves original unclaimed invitations recoverable.

Use the Caster source branch for GitHub review and CI. Its Vercel automatic deployments are disabled. Reuse the existing Staging Supabase and Clerk bindings. Verify the Clerk identity through the authenticated instance and domains endpoints, and verify the database identity and privileges with a bounded read. Verify `PREVIEW_LEGAL_DOCUMENT_ORIGINS` against the effective immutable legal document origins. The app must accept the current versions without document changes. Confirm that the synthetic administrator has both the established Clerk staff projection and the database grant.

The Phase 1 proxy exception covers the invitation and dedicated caster continuation only. Phase 3 must decide how signed-in visitors who lack a competitive receipt may reach `/casters` and individual public profiles. The Phase 1 release does not resolve the Ready budget dependency or Production migration divergence.

## Synthetic messenger compatibility procedure

1. On an approved protected test target, issue synthetic invitations only for approved test identities. Do not put real invitation credentials in recordings. Use a token-free canonical URL when checking crawler behaviour on a separately authorised crawler-accessible target.
2. On Discord desktop, web, iOS and Android, and WhatsApp web, iOS and Android, exercise the message link, preview-card interaction, copied link and system browser handoff separately. Record whether the original fragment survives each path. Record preview rendering independently from successful click-through.
3. Assert that GET, HEAD, preview fetching, preparation, registration and email verification leave the audit unchanged. Confirm explicit authenticated POST alone creates the draft and records the claim. Exercise both the pasted canonical link and full-strength recovery value.
4. Verify the configured Clerk email verification method on each browser. Preserve device protection. Test leaving the originating session, reopening the original invitation on an authorised verified account and resuming a claimed application without the original secret.

## Local database validation

Run `node --require ./scripts/patch2/block-remote-network.cjs ./tests/database/caster-phase1-invitations.mjs` with an OS-only environment. The harness starts its own disposable PostgreSQL instance and uses `CASTER_PHASE1_PG_BIN` and `CASTER_PHASE1_PG_DRIVER` if the bundled workspace tools are unavailable. It checks full checked-in migration replay, access grants, legal and account boundaries, concurrency and throttling. Keep fixture and hosted results distinct.

Use `http://localhost:<port>` as the app origin for authenticated Next.js development smoke tests. The Clerk SDK generates a same-host internal rewrite. Keep the database and any provider fixtures on loopback and block external traffic during the fixture run.
