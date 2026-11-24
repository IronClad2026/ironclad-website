# Pro Season leaderboard hotfix

This is a release-review plan. Production activation requires separate approval.

## Baseline and allowlist

- Production alias `www.ironcladtournaments.com` resolved to Vercel deployment `dpl_7bpukSEUqCWAZWV7jt8F4YGS5LxB` at commit `ad3eb5b7aee24878252b52bb483d14adf488764c`.
- Production Supabase project `nsyjtqpvyxlzyujlbzos` had 164 applied migrations, ending with `20261027222650 public_competitive_profile_read_projections`.
- The entire forward allowlist is `20261124023744_pro_season_settled_division_eligibility.sql`. It changes database definitions and grants. The migration contains no event or leaderboard row changes.
- The checkout has older unmatched file versions `20261024173736`, `20261026181023`, and `20261027181708`. The hosted ledger has `20261024194450`, `20261026173322`, `20261026214346`, and `20261027222650` without matching checkout versions. A push from the source checkout is blocked.

## After separate activation approval

1. Reconfirm the Production alias, source commit, Supabase project, ledger and definitions of the affected views and functions. Confirm that the candidate is a direct descendant of the serving revision. Reconcile and retest if the revision, relevant schema, or winning fixture has changed.
2. Use an empty temporary release work directory linked to the verified project, with seed, roles and Vault operations excluded. Fetch the actual applied migration files from the target ledger using `supabase migration fetch`. Compare their version set to the read-only ledger export. Add only the allowlisted file from the reviewed commit and check its digest. Run `supabase db push --dry-run` with the explicit target and this work directory. Stop if the target is ambiguous, an applied version is missing locally, any other operation is planned, or the dry run fails. Keep the applied history intact.
3. Schedule a quiet window outside active final-result reporting. Verify there is no active settlement or reporting traffic. Use the reviewed transaction-managed Supabase CLI runner, which batches the SQL and the migration receipt in the same transaction. The SQL uses the existing leaderboard advisory lock, a 5-second lock timeout and a 60-second statement timeout. Treat lock contention as an aborted attempt and reschedule.
4. Confirm the migration receipt and public view grants. Check the current Production app against the database update first. Its four existing public view contracts are preserved. Deploy the exact reviewed application revision only after the new event-impact view is readable. Verify the unaffected final reporting workflow and compare the public count, standings, and event impact with the database. Use read-only checks on Production and use isolated fixtures for result-reporting mutations.

## Rollback

- **Application only.** Restore the prior Production deployment or alias. The prior application continues to use the existing four views with their unchanged columns and grants. It uses its prior latest-event card calculation.
- **Database.** Roll back the application first. Prefer a forward corrective migration when legitimate writes made since activation depend on the new qualification rule. For an eligible database rollback, use the body of `pro-season-settled-division-eligibility-rollback.sql` as a new, explicitly approved migration. Let the migration runner handle the transaction when packaging the standalone rollback SQL. Rehearse it against the current baseline, confirm a one-file dry run, and apply it in a quiet window. It restores the previous definitions and checks for a finalized Pro season that would lose valid eligibility under those definitions. Preserve all match results, ledger rows, receipts, memberships, finalization records and migration receipts.

## Carry into Staging

Rebase the small app and SQL changes onto the current Staging definitions in a dedicated integration worktree. Staging has different historical transition objects, so validate the shared eligibility against its actual schema before enabling its app change. The pinned Staging branch contains subsequent profile-read migrations `20261113010100` and `20261113035619` that replace the public season standings view. Reconcile their privacy requirements and inspect the effective definition after applying every pending migration in order. Run the same independent settlement and reporting contracts on Staging-safe fixtures, including a fresh replay, before updating the shared preview. Keep already-applied migrations and Production history intact.
