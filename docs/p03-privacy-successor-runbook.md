# P03 Privacy v1.3 successor preparation

Status: **REVIEW DRAFT - NOT EFFECTIVE**. The owner approved the P03 retention decision on 23 September 2026. This package prepares its implementation and wording; it does not publish a new policy or alter any acceptance record.

## Minimal document change

Only Privacy Policy v1.3 succeeds Privacy v1.2. Terms v1.1 already covers private User Content, the operational licence for tournament administration, integrity and dispute resolution (section 12), and the versioned Privacy Policy/rights process (section 21). Rulebook and PPA also remain unchanged. No new optional-purpose consent is invented.

Source: `content/legal-privacy-successor-v1.3.json` uses the existing anchored successor-operation format. `docs/legal-drafts/p03-privacy-v1.3/` contains the complete derived review corpus, review PDF and checksum manifest. `content/legal-corpus.json`, `content/legal-successor-release.json`, current public PDFs and database Effective rows are unchanged. Draft files are outside `public/` and have no runtime effect.

The PDF and each running-page footer identify it as not effective, with effective date TBD. All 17 pages were rendered and visually inspected. The controlling current English policy remains Privacy v1.2. Existing eight-locale legal pages are unaffected.

## Approved retention and existing authority

Routine messages expire **40 days after authoritative current Tournament closure**, never 40 days after an individual Match. A legitimate reopen invalidates stale closure eligibility. Missing trustworthy closure evidence stops cleanup for the affected room; operators must resolve the authority gap without inventing a timestamp.

The existing published Privacy v1.2 section 18 supplies the longer periods:

- Support, complaint and privacy-request cases: 24 months after case closure. Formal Admin Assistance and externally recorded support/safety investigations use the relevant case authority.
- Raw replay, dispute, no-show and supplemental integrity material: 24 months after the result becomes final. P03 does not change replay retention or delete replay objects.
- An active legal, security or integrity hold suspends deletion only for affected information. Holds must be reviewed and ended when no longer justified. After release, ordinary eligibility resumes; already overdue deletion is due within the existing 30-day limit.
- Backups under IronClad control: maximum rolling 90 days, no ordinary access to expired copies, and reapply completed deletion/pseudonymisation after restoration.

These periods are taken from the existing policy, not newly selected durations. Room case association is based only on authoritative system records and scoped operator case references. No message-text classifier is used.

## Access, account closure and privacy requests

The draft explicitly describes the two authorized room participants and authorized tournament administrators as transcript readers within current authority. Public and unrelated viewers cannot read the transcript or another participant's read state. A completed room can be read-only; reset/reassignment and account closure revoke authority as implemented.

Account closure prevents future access/messages and removes directly account-linked private read/notification attribution through the existing closure architecture. It does not label retained free text anonymous and does not defeat a valid temporary case/hold requirement. Minimal retained competitive provenance is distinguished from private communication.

The existing contact/process in Privacy section 20 remains the entry point. Verify the requester proportionately, identify their own retained rooms using current or historical player provenance, scope the operator export, and review third-party information before any delivery. Apply authorized redaction/deletion through the new bounded privacy maintenance command, subject to valid holds. No export is automatically emailed or published.

See the P03 privacy maintenance operator documentation for the exact SQL authority, limits, tombstones, counts-only auditing, case/hold lifecycle and export/redaction commands. Do not interpret the legal draft as implementation evidence; the release gate separately verifies the migration/package and operational artifacts.

## Reproducible review preparation

From the candidate checkout:

```powershell
node scripts/legal-successor/prepare-p03-privacy.mjs --python <approved-python-executable>
```

This regenerates only the separate review directory. The generator refuses public/content output directories. Anchors fail closed if the effective predecessor wording changes. Existing document and PDF identities remain immutable.

## Future controlled publication

Publication is a forward legal-document transition, distinct from installing P03 schema. Match Room stays OFF until the successor is effective. The actual publication date is release-day input; no effective date has been selected today. All content and transition machinery are prepared now. The date-bound candidate must pass its own source gate before the single Production approval.

1. On the chosen release date, stage final artifacts into a fresh private directory using the actual Australia/Sydney date:

   ```powershell
   node scripts/legal-successor/prepare-p03-privacy.mjs --activation-date YYYY-MM-DD --output-dir <fresh-private-publication-package> --python <approved-python-executable>
   ```

   This generates a final PDF, derived corpus and schema-version-1 Final transition manifest. The exact Terms v1.1 + Privacy v1.2 predecessor pair is archived with the review material. Only Privacy v1.3 changes; no effective database row or public deployment changes.
2. In the clean existing P03 candidate, use the mechanical local staging command:

   ```powershell
   node scripts/legal-successor/stage-p03-privacy.mjs --package-dir <fresh-private-publication-package> --expected-head <current-full-candidate-SHA>
   ```

   It requires the exact clean feature branch, unchanged legal predecessor, today's Sydney date and the deterministically approved corpus/manifest/PDF metadata. It creates only the new immutable PDF and updates the two runtime JSON files, with an ignored intent journal. It does not commit, push, deploy, connect to a database or activate legal documents. On an interrupted staging operation inspect the journal and exact files; do not blindly retry.
3. Commit those date-only publication artifacts, push the same draft candidate, and obtain green CI and exact protected Preview evidence. Historical legal tests read immutable predecessor snapshots; the current publication contract follows the strict Final transition. The readiness validator accepts only the exact predecessor or exact approved finalized successor. A mixed corpus, wrong PDF/hash/date or changed unrelated document stops. Generate a new exact-SHA release seal; no old seal or browser report transfers to a different commit. These are date-bound release-day source/evidence refreshes, not new policy design.
4. Complete the fresh backup/restore, fingerprint and quiet-window checks, run the final live gate, then STOP for the user's single later instruction: `PROCEED WITH P03 PRODUCTION RELEASE`. If the Sydney date changes, restage/revalidate before seeking that approval.
5. After that approval, follow the P03 release runbook: apply the exact atomic package, verify the competition fingerprint and deploy the already-tested compatible candidate with Match Room OFF. Verify the existing database Terms v1.1/Privacy v1.2 pair remains accepted exactly. Preserve every historical artifact and acceptance row.
6. Generate rollback-only legal activation SQL for review; this helper never opens a database connection:

   ```powershell
   node scripts/legal-successor/p03-privacy-publication.mjs --package-dir <fresh-private-publication-package> --out <new-private-rollback.sql>
   ```

   After the healthy compatible deployment and authorized release, add `--approval "PROCEED WITH P03 PRODUCTION RELEASE"` to prepare the commit transaction. Execute only through the already verified Production connection in the approved window. The package must exactly match the finalized candidate corpus, manifest and PDF. SQL enforces the current Sydney date, exact predecessor identities, 2-second locks, 60-second statements and Match Room OFF under a transaction-held setting lock. Only Privacy changes; immutable acceptance/history remains intact. Default execution is rollback. The P03 schema package itself does not activate legal documents.
7. Verify the effective successor identity/hash, changed account gate, genuine current-user acknowledgement and unchanged registration acceptance history. Enable Match Room only after these checks. A correction requires another forward successor, never a rewrite of published bytes or evidence.

The full predecessor/finalized runtime checks, seven native transaction checks and 242 passing legal assertions against an actually generated dated PDF validate the machinery. A deliberately historical-date artifact also exercises stale-date rejection. Temporary runtime substitutions were restored byte-for-byte; no public successor PDF remains. Test artifacts remain ignored and are not a release-day publication package. No legal publication or Production mutation was performed during preparation.

## Reference checks

The existing IronClad policy is the implementation authority. General cross-checks used the OAIC's [APP 11 security/retention guidance](https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-guidelines/chapter-11-app-11-security-of-personal-information) and [APP 12 access guidance](https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-guidelines/chapter-12-app-12-access-to-personal-information): do not treat pseudonymisation as automatic free-text anonymisation, retain only justified material, and review the privacy of other people before access disclosure. This does not assert that every privacy statute applies to every IronClad user.
