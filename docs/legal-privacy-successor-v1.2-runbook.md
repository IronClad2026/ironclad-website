# Privacy Policy v1.2 controlled publication runbook

## Finalized source state

Privacy Policy v1.2 was finalized for the actual Australia/Sydney publication
date `2026-08-22` (`22 August 2026`). The repository now contains:

- reviewed operation source: `content/legal-privacy-successor-v1.2.json`;
- final runtime corpus: `content/legal-corpus.json`;
- final one-document release: `content/legal-successor-release.json`;
- final immutable PDF: `public/documents-rules-ppa/ironclad-privacy-policy-v1.2.pdf`;
- final PDF SHA-256:
  `aa0f7af02b69194172dd6333e1d8b7271152aad0bfdab7a935686071c784bfd6`;
- bounded finalizer: `scripts/legal-successor/finalize-privacy-v1.2.mjs`; and
- rollback-default database publication helper:
  `scripts/legal-successor/privacy-document-successor-v1.2.mjs`.

The stale review-candidate manifest was removed because it described a `TBD`,
non-effective artifact with different PDF bytes. Git history preserves that
review evidence. The reviewed operation source remains unchanged as provenance.

## Finalization contract

The one-shot command was:

```powershell
node scripts/legal-successor/finalize-privacy-v1.2.mjs --activation-date 2026-08-22
```

It requires a clean worktree, the current Sydney calendar date, the exact
Terms v1.1 / Privacy v1.1 predecessor corpus and release, all six locked
historical PDF hashes, and an exact review-source/candidate/PDF match. It applies
only the approved Privacy operations, preserves Rulebook v3.0, PPA v3.0 and
Terms v1.1, generates only Privacy v1.2, verifies the final PDF envelope and
hash, replaces the runtime corpus and release, and removes the stale candidate.
On failure it restores every changed byte.

## Required artifact verification

Render and inspect every page of the final PDF:

```powershell
pdftoppm -png public/documents-rules-ppa/ironclad-privacy-policy-v1.2.pdf tmp/pdfs/privacy-v1.2-final/page
pdfinfo public/documents-rules-ppa/ironclad-privacy-policy-v1.2.pdf
pdftotext -layout public/documents-rules-ppa/ironclad-privacy-policy-v1.2.pdf tmp/pdfs/privacy-v1.2-final/privacy-v1.2.txt
```

Require:

- every date presentation says `22 August 2026`;
- no `REVIEW DRAFT - NOT EFFECTIVE`, `TBD` or publication token remains;
- the cover, metadata, footer, page numbers, contents, headings, bullets and
  retention table are readable;
- there is no clipping, overlap, missing text or broken glyph;
- the approved Push, subscription, badge, payload, retention, cleanup,
  account-closure and user-control disclosures remain present; and
- the PDF hash equals the final release manifest.

## No-lockout Production order

The Production compatibility migration and application layer already support
both Terms v1.1 / Privacy v1.1 and Terms v1.1 / Privacy v1.2. The remaining
order is mandatory:

1. deploy the exact finalized corpus, release manifest and PDF while the
   Production database remains on Terms v1.1 / Privacy v1.1;
2. verify that exact Production source, canonical Privacy URL and signed-in
   1.1/1.1 gate remain healthy;
3. generate rollback SQL and validate the exact predecessor register:

   ```powershell
   node scripts/legal-successor/privacy-document-successor-v1.2.mjs --activation-date 2026-08-22
   ```

4. only after the deployed-source verification, explicitly generate the apply
   transaction with `--apply` and execute it against the freshly resolved
   Production project;
5. verify exactly one Effective Terms v1.1 row, one Effective Privacy v1.2 row,
   unchanged historical evidence counts, and the new account acknowledgement
   flow.

Do not activate the database before the finalized source is deployed. The old
application intentionally fails closed if it observes the new database pair.

## Recovery

Before database activation, recovery is a normal source rollback to the last
Production deployment while the database remains on Privacy v1.1. After
activation, do not delete, rewrite or backdate legal documents or acceptance
evidence. Any recovery must be a separately reviewed forward legal release.
