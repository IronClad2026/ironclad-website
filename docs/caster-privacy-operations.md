# Caster privacy release controls

The candidate keeps automatic irreversible maintenance off. It has no scheduled Caster erasure route, cron job or Storage lifecycle policy. The private Caster control defaults to false. Ready retains its reviewed scheduled entry points, with a separate default-false control that prevents routine removal of usage and suggestions. Existing Ready withdrawal and account-closure protections remain active. Privacy Policy 1.4 and the programme notice are review artifacts. The effective corpus and existing acceptance receipts stay on their current versions until a separate publication decision.

## What the migration changes

- Adds private retention eligibility, case holds, minimum operation receipts, media retirement tracking and retired-slug protection. Existing media first observed unreferenced starts a conservative 30-day clock at migration. Installing the migration changes no existing user or tournament records.
- Adds a read-only tournament projection for administrator-verified former coverage. The projection uses public competition context and date, a neutral scope key and a localised Former Caster label. It omits the former profile, identifying links, recording, avatar and original assignment identifier. Closed caster profiles and self-published videos remain unavailable. Hiding or suspending an active account continues to withdraw its current promotion.
- Adds separately gated owner-only database disposal and a Storage workflow. Database disposal requires the exact reviewed category, record and eligibility date. It checks the current database clock and active holds again under the authority lock. It can minimise private content or personal identifiers, retire replaced profile material and remove only eligible caster-owned media rows.

## Before any approved irreversible operation

1. Verify the exact Supabase project, application and database release, privacy operator, effective policy and applicable retention holds. Confirm whether Storage object versioning is enabled and document any versions still retained by the provider. Obtain explicit authority for the specific maintenance scope and record the approving operator, time and purpose in the private operational record.
2. From the verified database operator session, inspect only `ironclad_private.caster_privacy_plan(clock_timestamp(), 100)`. This is a dry run. Review the eligible record keys, case holds and date. Keep the list and approvals out of shared logs and reports.
3. Start with a single approved category and record. Preserve the reviewed candidate date and inspect the outcome before continuing. Only a later approved operator operation may enable the private control and invoke `ironclad_private.caster_privacy_apply` on that exact record. Apply data changes via its guarded operation. Disposition failures or new holds require a new review.
4. Treat Storage deletion as a separate operation. After a later approval, prepare a private JSON file with the verified `project`, authorised `actor` and exact eligible media `ids`. Run `node scripts/caster-privacy/media-cleanup.mjs review <project> <private-batch.json>` for the non-mutating SHA-256 and count. A separately approved invocation uses `apply` with that exact SHA-256 and the existing service credentials for the verified project. The SQL control must also be enabled by the approved operator. The runner fixes the private bucket and validates every claimed path before any Storage request.

The Storage claim is the point of no return for that asset. It rechecks references and holds, then makes the asset unavailable for future references before the Storage API is called. An outstanding claim prevents insertion of an overlapping hold until the claim has been reconciled. Storage and PostgreSQL do not commit together. A failed Storage call leaves the claim for safe retry with the same batch. A failed finalisation can be retried after confirming object absence. Stop the affected batch on any conflicting hold, path, scope or provider result. [Supabase Storage deletion](https://supabase.com/docs/guides/storage/management/delete-objects)

## Backups and erasure proof

Use isolated synthetic fixtures for destructive acceptance. Test dates around each eligible cutoff, an active hold, a shared upload, public attribution and preservation of covered events. Check that the rehearsal leaves the maintenance control off and that the feature-off app can read existing tournament data.

Before later permitted live erasure, record the restricted exact batch and recovery reference. Reconcile confirmed erasure against any restored database and Storage inventory before reconnecting it. Restore operations do not reinstate former profile publication or serve previously deleted objects. Confirm what copies the provider can recover and how long they persist before making a stronger commitment. [OAIC guidance on security and disposal](https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-guidelines/chapter-11-app-11-security-of-personal-information)

## Decisions for approval

- Approve the review periods in Privacy Policy 1.4, the cases requiring holds, who can approve them, and the choice to retain neutral public credit for still-public verified coverage after closure.
- Approve the immutable Policy 1.4 PDF and Programme notice. Set the actual Australia/Sydney effective date in the separate legal successor process, preserve older public versions, and verify renewed acknowledgement before public activation. Terms, Rulebook and PPA follow their existing versions.
- Confirm the backup and Storage disposition process. Decide separately when to start Ready's scheduled retention. Leave Ready engagement off until an approved retention process can support its data. Approval of wording or release does not enable irreversible cleanup. Any activation or live batch requires explicit authorisation of that operation.
