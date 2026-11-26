# Official Caster Programme Phase 1 validation

Phase 1 establishes invitations and private drafts. The only new database authority is the caster invitation and own-application boundary. A claim creates a draft. Approval, publishing and tournament assignments are later phases.

## Staging integration proposal

1. Obtain separate approval for the migration and integration target. Reconfirm the source SHA, Staging project and effective Clerk Development instance. The reviewed base is `4ffed88cb353cc9864e4f329d76338b10c0832eb`. Use the protected Staging alias for canonical integration.
2. Verify that `TRANSACTIONAL_EMAIL_MODE=disabled`, Web Push credentials are absent, and creating synthetic accounts or sending Clerk verification codes is restricted to approved test inboxes. Confirm the exact Supabase project and credentials in the effective deployment. The branch-level variable inventory alone is insufficient.
3. Confirm the exact hosted definitions and grants for Patch 2 account closure, staff authority, the legal acceptance transaction and the competitive notice. Compare the migration ledger and capture a recovery reference. Register one migration owner and apply only the reviewed `20261126094926_caster_phase1_invitations.sql` file. Record the actual migration receipt and SQL fingerprint, then verify grants and RLS before enabling the feature.
4. Use the exact candidate and approved origin. Set `CASTER_PROGRAM_ENABLED`, `CASTER_PROGRAM_ORIGIN` and `CASTER_HOSTED_ISOLATION_VERIFIED` only after isolation is verified. Supply `CASTER_CONTINUATION_KEY` as a secret containing 32 random bytes, encoded as unpadded base64url. Protect the feature preview. Keep Production bindings separate.
5. Exercise new, existing, verified-player, closed and staff synthetic identities. Confirm actual legal acceptance writes the existing receipt and returns to the selected claim account. Confirm a caster-only account can claim, leave, sign back in and resume without the competitive notice. Enter competitive onboarding from that account and test the original notice, return path and existing restrictions. Capture only synthetic, redacted screenshots and test records.
6. Rehearse disabling the feature and returning to the prior build while retaining private drafts and audit data. Re-enabling with the same continuation key can honour unexpired continuations. Rotating that key invalidates all prepared continuations and leaves original unclaimed invitations recoverable.

The Phase 1 proxy exception covers the invitation and dedicated caster continuation only. Phase 3 must decide how signed-in visitors who lack a competitive receipt may reach `/casters` and individual public profiles. The Phase 1 release does not resolve the Ready budget dependency or Production migration divergence.

## Synthetic messenger compatibility procedure

1. On an approved protected test target, issue synthetic invitations only for approved test identities. Do not put real invitation credentials in recordings. Use a token-free canonical URL when checking crawler behaviour on a separately authorised crawler-accessible target.
2. On Discord desktop, web, iOS and Android, and WhatsApp web, iOS and Android, exercise the message link, preview-card interaction, copied link and system browser handoff separately. Record whether the original fragment survives each path. Record preview rendering independently from successful click-through.
3. Assert that GET, HEAD, preview fetching, preparation, registration and email verification leave the audit unchanged. Confirm explicit authenticated POST alone creates the draft and records the claim. Exercise both the pasted canonical link and full-strength recovery value.
4. Verify the configured Clerk email verification method on each browser. Preserve device protection. Test leaving the originating session, reopening the original invitation on an authorised verified account and resuming a claimed application without the original secret.

## Local database validation

Run `node --require ./scripts/patch2/block-remote-network.cjs ./tests/database/caster-phase1-invitations.mjs` with an OS-only environment. The harness starts its own disposable PostgreSQL instance and uses `CASTER_PHASE1_PG_BIN` and `CASTER_PHASE1_PG_DRIVER` if the bundled workspace tools are unavailable. It checks full checked-in migration replay, access grants, legal and account boundaries, concurrency and throttling. Keep fixture and hosted results distinct.

Use `http://localhost:<port>` as the app origin for authenticated Next.js development smoke tests. The Clerk SDK generates a same-host internal rewrite. Keep the database and any provider fixtures on loopback and block external traffic during the fixture run.
