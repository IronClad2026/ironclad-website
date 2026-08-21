# Privacy Policy v1.2 review-draft preparation runbook

## Status and boundary

This repository contains a prepared Privacy Policy v1.2 artifact labeled:

`REVIEW DRAFT - NOT EFFECTIVE`

Its effective date is `TBD`. It is not the runtime Privacy Policy, does not change the legal release pair, does not create or update a `legal_documents` row, and does not change any acceptance requirement.

The current effective pair remains:

- Terms of Service v1.1
- Privacy Policy v1.1

Do not describe Privacy v1.2 as published, final or effective until the owner separately authorizes the controlled Production activation described below.

## Prepared files

- Review source: `content/legal-privacy-successor-v1.2.json`
- Deterministic draft finalizer: `scripts/legal-successor/finalize-privacy-v1.2.mjs`
- Non-runtime release candidate: `content/legal-privacy-successor-v1.2-release-candidate.json`
- Immutable review PDF: `public/documents-rules-ppa/ironclad-privacy-policy-v1.2.pdf`
- Future publication contract: `scripts/legal-successor/privacy-document-successor-v1.2.mjs`

The effective runtime files remain `content/legal-corpus.json` and `content/legal-successor-release.json`. The review-draft finalizer reads and verifies them but never writes them.

## Draft generation

From the repository root, with the existing legal PDF Python toolchain available:

```powershell
node scripts/legal-successor/finalize-privacy-v1.2.mjs
```

The command accepts no date and no activation option. It:

1. requires the current Effective Rulebook v3.0, PPA v3.0, Terms v1.1 and Privacy v1.1 corpus;
2. requires the current Final Terms v1.1 and Privacy v1.1 runtime release;
3. verifies every already-published legal PDF against its locked SHA-256 hash;
4. applies the v1.2 operations to a temporary corpus only;
5. generates only the Privacy v1.2 PDF through `--review-draft` mode;
6. writes the PDF and non-runtime candidate once, or verifies byte identity on a repeated run; and
7. verifies that the runtime corpus and runtime release bytes did not change.

It refuses to overwrite a different PDF or candidate manifest.

## Required draft verification

Run the focused tests:

```powershell
npx vitest run tests/unit/legal-privacy-successor-v1.2-contract.test.ts tests/integration/legal-privacy-successor-v1.2-publication.test.ts tests/integration/legal-publication-contract.test.ts
```

Render and inspect every PDF page:

```powershell
pdftoppm -png public/documents-rules-ppa/ironclad-privacy-policy-v1.2.pdf tmp/pdfs/privacy-v1.2-review/page
pdfinfo public/documents-rules-ppa/ironclad-privacy-policy-v1.2.pdf
pdftotext -layout public/documents-rules-ppa/ironclad-privacy-policy-v1.2.pdf tmp/pdfs/privacy-v1.2-review/privacy-v1.2.txt
```

The final review must confirm:

- the cover, metadata and every non-cover footer say `REVIEW DRAFT - NOT EFFECTIVE`;
- every effective-date presentation says `TBD`;
- no old v1.1 effective date is presented as the v1.2 effective date;
- page numbers, contents, headings, bullets and the retention table are readable;
- there is no clipped, overlapping or missing text;
- the disclosure covers deliberate opt-in, endpoint and key material, multiple subscriptions, badge semantics, conservative lock-screen payloads, provider routing, international processing, retention, invalid-endpoint cleanup, account closure and user controls;
- no Push endpoint, key or other real personal information appears in the artifact; and
- the candidate hash and size match the PDF bytes.

## Runtime non-activation gate

Before merging any preparation-only change, verify all of the following:

- `content/legal-corpus.json` still contains Effective Terms v1.1 and Privacy v1.1;
- `content/legal-successor-release.json` still contains only Final Terms v1.1 and Privacy v1.1;
- the runtime legal gate and locale legal links remain unchanged;
- no Supabase migration or `legal_documents` mutation was added;
- no Vercel, Clerk or Supabase setting was changed; and
- no real PushSubscription data is stored while Privacy v1.2 is only a review draft.

## Future controlled Production activation

Activation is a separate owner-authorized operation. Do not reuse the review PDF as an Effective artifact. The future release must:

1. complete owner and, where required, legal review of the text;
2. choose the actual Australia/Sydney Production effective date on the authorized release day;
3. build a final Privacy v1.2 corpus with status `Effective` and that exact date;
4. generate and visually verify a fresh immutable PDF with no review-draft markers;
5. create a final one-document Privacy v1.2 release manifest with the fresh SHA-256 hash;
6. update the runtime corpus and legal release under one reviewed source change;
7. deploy and verify the exact Production source and immutable PDF before database activation;
8. run a rollback-only database validation against the exact predecessor register;
9. decide and verify the required account-wide Terms acceptance and Privacy acknowledgement behavior for the v1.1/v1.2 pair;
10. activate exactly one Privacy v1.2 `legal_documents` row in one transaction;
11. supersede exactly the Effective Privacy v1.1 row while preserving Effective Terms v1.1, Rulebook v3.0 and PPA v3.0; and
12. verify Production legal links, account gating and acceptance evidence.

The future SQL contract in `privacy-document-successor-v1.2.mjs` is rollback-only by default. It expects six predecessor rows, four Effective rows and two superseded rows; locks and verifies the four exact current Effective artifacts; preserves registration and account-acceptance counts; and expects seven rows, four Effective rows and three superseded rows after an explicitly authorized apply. The preparation validator does not connect to Supabase or execute that SQL.

## Rollback and recovery

Before activation, rollback means removing the review candidate from the candidate branch. It has no runtime or database effect. Preserve every v1.0 and v1.1 artifact.

After a future activation, do not delete or rewrite immutable legal artifacts or acceptance evidence. Recovery requires a separately reviewed forward legal release and database transaction appropriate to the actual Production state.
