# Account legal gate stability runbook

This runbook covers reusable account-wide Terms acceptance and Privacy
acknowledgement transitions. It does not change registration agreements,
Tournament Rules, publication review, or the immutable evidence model.

## Release contract

`content/legal-successor-release.json` is the latest Final transition record.
It remains schema version 1 and must contain:

- `predecessorDocuments`: exactly two full identities, one `terms` and one
  `privacy`;
- `documents`: one or two changed successor identities with unique kinds; and
- for every identity, the exact `kind`, `version`, `filename`, `publicPath`,
  and lowercase SHA-256 hash.

Each changed successor must use a new version, immutable path, and content
hash. Overlay `documents` on `predecessorDocuments` by kind to derive the full
successor pair. The bundled legal corpus and immutable public artifacts must
match that derived successor. Draft sources, draft PDFs, and non-Final release
data have zero runtime effect.

The application accepts only an exact database Effective pair matching either
the manifest predecessor or the derived successor. Version, trusted-origin
URL, path, and hash must all agree. Unknown, mixed, incomplete, duplicate, or
misaligned pairs fail closed.

Acceptance evidence remains exact to the Effective Terms and Privacy document
IDs. Old evidence never satisfies a successor pair. URLs, hashes, database
timestamps, document rows, historical artifacts, and existing acceptance rows
remain immutable.

The forward migration that makes
`accept_current_account_legal_documents` version-generic is a one-time
compatibility migration. The RPC still requires service-role execution, exact
current Effective document IDs, both affirmative controls, and database-owned
document facts. Do not replace or amend it for each legal release.

## No-lockout publication sequence

1. Prepare the reviewed successor source, immutable PDF, exact hash, updated
   bundled corpus, and latest Final transition manifest. Preserve every prior
   artifact and evidence row.
2. Validate the manifest's complete predecessor pair, its one or two unique
   changes, the derived successor corpus, PDF bytes and hashes, and all
   publication and legal-gate tests. Validate the exact Preview deployment.
3. Deploy the compatible application, bundled successor corpus, artifacts, and
   manifest while the database predecessor pair remains Effective. Verify that
   the predecessor pair is accepted exactly and existing predecessor evidence
   remains satisfied.
4. Only after that deployment is healthy, atomically supersede the changed
   Effective database document or documents and activate the exact successor
   rows. Unchanged document kinds remain untouched.
5. Verify that an existing account is now required to accept/acknowledge the
   exact successor IDs, that predecessor evidence is insufficient, that the
   acceptance action records the database-owned successor facts, and that the
   subsequent gate is satisfied.

Stop before activation for any manifest, artifact, Preview, origin, hash,
database identity, or test mismatch. After activation, correct mistakes with a
new forward successor; never rewrite a published document or acceptance row.

## Future transitions

A future Privacy v1.3, Terms v1.2, or combined Terms/Privacy transition updates
the reviewed source, immutable artifacts, publication data, bundled corpus,
and latest Final manifest. Set `predecessorDocuments` to the exact then-current
Effective Terms/Privacy pair and place only the changed kind or kinds in
`documents`. No application gate branch or RPC replacement is required.

## Preview origin boundary

Production always trusts only `https://www.ironcladtournaments.com`.
`PREVIEW_LEGAL_DOCUMENT_ORIGIN` is accepted only when `VERCEL_ENV=preview` and
must be the exact HTTPS origin for one `*.vercel.app` hostname, with no
credentials, port, path, trailing slash, query, or fragment. Preview database
document URLs must equal that configured origin plus the exact manifest path.
The Preview setting cannot weaken Production origin validation.
