# Announcement rich-text release

The approved migration source is
`supabase/migrations/20261024173736_announcement_rich_documents.sql`.
Keep its filename and SQL unchanged. It adds a nullable versioned document and
two v2 RPCs; old publication and feed contracts remain available for rollback.

## Applied migration identity

Supabase MCP assigns a provider timestamp when applying migration SQL. Staging
records this source as `20261024174929`, named `announcement_rich_documents`.
The ledger stores one statement containing the source plus a trailing CRLF.
Direct comparison confirmed that LF normalization and trimming surrounding
whitespace makes the complete SQL identical; no statement was changed.

[The release manifest](announcement-rich-documents-release.json) separately pins
the canonical LF source hash, exact applied-statement hash, environment identity,
provider version, and resulting v2 function definitions and permissions.
Existing application records are immutable. After an authorized Production
application, append its independently verified identity and statement hash;
Production may receive a different provider timestamp.

This mapping is outside executable migrations. Do not rename or duplicate the
source to match individual provider timestamps, repair migration history, or
reapply it because the CLI reports the source version as pending. Do not run
blanket `supabase db push`: Staging and Production have divergent migration
histories, and the CLI does not interpret this mapping. Any unknown discrepancy
must stop the release until reviewed.

## Read-only verification

In the positively identified Staging project, query the exact applied identity:

```sql
select version, name, cardinality(statements) as statement_count,
  encode(sha256(convert_to(statements[1], 'UTF8')), 'hex') as statement_sha256
from supabase_migrations.schema_migrations
where version = '20261024174929' and name = 'announcement_rich_documents';
```

Require exactly one matching record, one statement, and the exact SHA-256 in the
manifest. Check the canonical source hash after CRLF-to-LF normalization, and
compare both v2 functions with the manifest: hash exact UTF-8
`pg_get_functiondef(oid)` and `proacl::text`; verify owner, security-definer mode,
and search path. A timestamp or name match alone is insufficient.

These read-only checks do not authorize a release or establish current health.
Separately verify the nullable column constraint, legacy records and RPCs,
read-state and notification counts, and the deployed application. Use the
rollback-only `tests/database/announcement-rich-documents.sql` suite against the
explicitly authorized target. If the SQL transport starts an implicit
transaction, close it before the suite's explicit repeatable-read transaction;
all synthetic fixture writes must remain inside the transaction rolled back.

Deploy the application only after the additive migration succeeds. During an
application rollback, retain the column and RPCs: old application versions read
the plain-text body through unchanged legacy projections.
