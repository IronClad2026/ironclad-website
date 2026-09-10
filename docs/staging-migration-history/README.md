# Staging migration history baseline

This is source reconciliation for `ironclad-staging` (`zzbnneprhjicmajpjkdg`), based on fresh read-only ledger evidence. It records historical applications; it does not apply, repair, rename or delete any database migration. The source base is `origin/staging` at `631e5ad225fdd8e702e99a3e80e57e2f62368051`.

## Exact provenance

- [PR #108](https://github.com/IronClad2026/ironclad-website/pull/108) introduced `20260904120000_canonical_division_launch_ordering.sql` in `349c3bcbff90e59996e44081dff4688d5e63fb20`, merged to master as `6a371fc8755a50bf282e15e99d54fc411e8d988d`.
- [PR #109](https://github.com/IronClad2026/ironclad-website/pull/109) added the identical repository SQL to staging in `1feb267814ee3f457e41a382cd0826f06da6d8ad`, merged as `9238c457c98d64a6bb6603c1c760e85e25caafef`. Its body says the migration had already been applied once to Staging. The PR does not identify the exact execution command or prove which submitted SQL bytes were used.
- The Staging ledger records that original application as version `20260905013141`, name `20260904120000_canonical_division_launch_ordering`. Its SQL materially differs from the repository file. In the second reverse-EXCEPT roster check, its player-two SELECT lacks the generated-bracket filter and checks `player_one_slot` instead of `player_two_slot`.
- The separate Staging ledger entry `20260908104335`, name `staging_only_canonical_launch_parity`, guards the predecessor function definition hash, replaces the function with the canonical body, and verifies the resulting definition hash. It is a correction, not a second filename for identical historical SQL.
- [PR #124's readiness report](https://github.com/IronClad2026/ironclad-website/blob/027145f95d90d71d40a4332af1a56fca74807f2c/docs/poll-rpc-release-readiness.md#L170-L177) previously recorded the timestamp divergence. The exact archived ledger statements, rather than that abbreviated narrative, establish the original defect and later correction.
- [PR #123](https://github.com/IronClad2026/ironclad-website/pull/123), commit `6b37295ce9e6874cc753d902f93223566e82015d`, is restored as its complete reviewed application/SQL/test change. Its shared migration `20260908052210_member_rpc_current_account_acceptance.sql` is already applied in Staging. Restoring its source does not require reapplication. Existing Staging UAT support is preserved.

## Baseline mapping

| Repository migration | Expected Staging history | Classification |
| --- | --- | --- |
| `20260904120000_canonical_division_launch_ordering.sql` | Exact original `20260905013141` followed by exact corrective `20260908104335` | Historically satisfied only when both archived records match |
| `20260908052210_member_rpc_current_account_acceptance.sql` | Same shared version and name already present | Shared applied migration; source restored unchanged |

The canonical `20260904120000` file remains unchanged. Do not rename it to the Staging timestamp, substitute its corrected body into the original archive, collapse the two historical records, or mark it applied through migration repair. The archives below are not pending migrations and must remain outside `supabase/migrations`.

## Artifact integrity

[baseline.json](baseline.json) is the machine-readable inventory of versions, names, paths and pinned hashes. [20260905013141.json](20260905013141.json) and [20260908104335.json](20260908104335.json) each contain the exact ledger object `{ version, name, statements }`, with one statement. Preserve every decoded SQL character, including original whitespace and the historical defect.

Archive `statementsSha256` hashes the exact UTF-8 bytes of decoded `statements[0]`, without newline normalization or trimming. It does not hash the JSON container, so checkout line endings outside JSON string values do not affect it. Source-file SHA-256 values normalize CRLF to LF only. Function-definition hashes identify UTF-8 `pg_get_functiondef` output and are a separate integrity measure; they are not archive or source-file hashes. The manifest records the parity predecessor and resulting definition hashes separately.

## Comparison boundaries

The offline comparator accepts explicit local-source and remote-ledger snapshots. It must reject a wrong project, malformed or duplicate entries, unexpected versions or names, modified pinned source, altered archive statements, or either missing historical record. Only the exact documented exception may satisfy missing repository version `20260904120000`. Unknown differences fail closed.

`approvedPendingMigrations` starts empty. A future local-only migration needs a separately reviewed exact version/name/source-digest approval. An unknown difference must not become pending merely because its timestamp is newer. The canonical migration, historical aliases and already-applied shared member-RPC migration cannot be approved for automatic replay.

A successful inventory comparison is not a live database health check, a schema/function/ACL comparison, a SQL test result, or authorization to apply migrations or deploy. Snapshots can become stale. Future work must separately verify current schema and migration history, review the precise new migration, and obtain the required application authorization. No blanket `db push`, ledger repair or historical replay follows from this baseline.

## Local reconciliation verification

On 2026-09-10, the pure comparator accepted a fresh Staging inventory of 148 ledger records against 147 source migrations: no unknown differences, no pending migrations, and only `20260904120000` historically satisfied by the exact archived pair. All 18 freshly recovered member-RPC ledger statements matched the reviewed PR #123 source in order, with only statement-separator whitespace differences. Ordinary shared records in the offline comparator are checked by version/name; this is not a general SQL-content comparison.

Local validation used synthetic CI credentials and loopback-only Supabase configuration: 146 unit files / 1,555 tests and 167 integration files / 1,599 tests passed. The integration count includes 32 baseline cases and the restored member-RPC/inventory/UAT contracts. After correcting two TypeScript Set declarations, all 32 baseline cases, targeted lint, strict TypeScript and the production build passed. Full lint had zero errors and one inherited `DeleteAccountSection.tsx:37` warning. No dependency or environment contract changed.

No migration, SQL fixture, hosted member mutation or browser authentication flow was executed. Browser suites were not rerun because this reconciliation changes no components, routes or styles; the existing gate component and action-handoff tests ran locally. These checks do not replace eventual authorized hosted validation. No deployment or migration application is authorized by this document.
