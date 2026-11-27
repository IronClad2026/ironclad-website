# Caster Studio and Tournament Media rollout

Canonical Staging recovery point is `bda97a68f7684ea82a0b954f5cc0f7fa3de9f29a`, with protected deployment `dpl_JE71ec6AZCdCViNcJP4YoNg4gH8V` on Supabase Staging `zzbnneprhjicmajpjkdg`. Verify the current alias and ledger before each hosted step. Production remains outside Staging authorisation.

## Database change

`20261127052305_caster_tournament_media.sql` adds a protected ownership and publication relationship to the canonical Tournament Media record, plus private versioned audit rows. It adds one default-false marker and a constraint to `tournament_media`. Caster-managed rows stay unpublished to legacy direct readers. Their public state is read through the same visibility rule for the caster portfolio and Tournament Media. The ordinary Tournament Media workflow keeps its own rows and permission checks.

The migration moves the legacy writer to the private schema and retires scheduling execution grants. It exposes a verified-history correction operation and completed-history readers. All previous assignment, invitation, application, profile and audit data remain in place. The migration performs no record deletion, bulk update or historical backfill. A short transaction lock timeout prevents prolonged interference with tournament activity. Record the actual receipt and verify service-only grants, denied browser access, the legacy marker default and the canonical publication constraint after application.

Apply the exact reviewed file only after isolated replay and exact-head CI. Deploy the reviewed Staging source, then publish one clearly labelled synthetic video from a caster without assignments. Check both public projections by the same media ID, private or mismatched scope denial, and suppression after moderation or closure.

## Recovery

Keep the additive schema and all history if deployment is interrupted. The prior application will continue showing standard Tournament Media and its current caster profile. The configuration that enabled routine scheduling remains retired at the database boundary. Legacy verified tournament panels must use the new wrapper to recover their display. Prefer deploying the updated application with the existing caster feature flag off while diagnosing a feature incident. Caster videos then stay absent from both public projections and the legacy presenter. Do not re-enable retired privileges or reverse the data migration to recover the application.

## Privacy review for the combined release

Proposed addition to the existing draft Caster Programme notice follows.

> When you publish a tournament video, IronClad shows the video title, optional description, recording link, and associated tournament, division or match on your caster profile and in Tournament Media. You can unpublish your own recording from both places. Authorised staff can hide or correct a recording and retain the necessary action record. An official caster’s own publication is separate from administrator-verified coverage.

Add the equivalent description to the proposed Privacy Policy 1.4 Caster processing and public profile clauses. Extend the draft retention schedule to include the private publication relationship, moderation reasons and competition snapshot. Reuse the existing audit and historical-integrity purposes, with the periods and former-caster attribution subject to approval. Profile hide, suspension and account closure suppress current authored media in both public locations. The feature retains historical snapshots, so scheduled minimisation or erasure of those snapshots still needs specific implementation and approval. This proposal changes no effective legal documents or retention timers.
