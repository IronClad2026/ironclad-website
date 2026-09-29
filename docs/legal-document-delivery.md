# Legal document delivery and authority

`legal_documents.immutable_url`, document IDs, versions, SHA-256 values and all
acceptance snapshots remain the legal authority. Some historical immutable
Preview deployments are no longer available. Their disappearance does not
change the identity of the documents or invalidate an existing acceptance.

The server resolves a separate `downloadUrl` from
`content/legal-document-delivery.json` only when the document kind, exact version
and SHA-256 all match a bundled PDF. These relative paths serve the same bytes
from the current application origin, including an authenticated Preview. The
PDF manifest covers the nine historical PDFs and the two v3.2 successors. Tests
hash every bundled artifact and reject missing, mismatched or unknown identities.

Registration and account-update links use `downloadUrl`. The `url` field keeps
the stored authority URL; acceptance still submits document IDs and the database
records the authoritative identity. Existing trusted-origin checks and account
acceptance checks remain in force. An unknown document makes the legal document
set unavailable rather than substituting another version or using an unverified
download location.

This delivery repair performs no database writes, document version changes or
reacceptance reset. Future legal releases must add their reviewed PDF bytes and
exact hash to the delivery manifest alongside the existing publication process.
