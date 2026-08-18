# Phase 15C publication and activation runbook

This record is limited to the final legal corpus, its four versioned PDFs, the
Terms and Privacy routes, registration presentation, and the private
`legal_documents` register. It does not authorize another roadmap feature.

## Approval record

- Approval status: **Owner-approved; not externally lawyer-certified**.
- Marco Stucchi expressly approved being publicly named as an operator, being a
  party to the Terms and PPA, and the stated operational/privacy-responsibility
  wording.
- Simone Vitiello expressly approved the same matters.
- Admins remain delegated operational personnel. Acting as an Admin does not
  make that person a separate contracting party.
- No company, partnership, ABN, registered business name, or other entity is
  asserted by the corpus.

## Immutable release set

| Kind | Version | Repository artifact | Production canonical URL | SHA-256 |
| --- | --- | --- | --- | --- |
| Rulebook | 3.0 | `public/documents-rules-ppa/ironclad-official-tournament-rulebook-v3.0.pdf` | `https://www.ironcladtournaments.com/documents-rules-ppa/ironclad-official-tournament-rulebook-v3.0.pdf` | `11a391d5b4602bab6f07381b30c4435fb1b4842be99006bdce2512b583859ab0` |
| PPA | 3.0 | `public/documents-rules-ppa/ironclad-player-participation-agreement-v3.0.pdf` | `https://www.ironcladtournaments.com/documents-rules-ppa/ironclad-player-participation-agreement-v3.0.pdf` | `a836bda5679899cb8b402465fb750b5b0aff4eb7dcf8cdb142a163cb6d8ed600` |
| Terms | 1.0 | `public/documents-rules-ppa/ironclad-terms-of-service-v1.0.pdf` | `https://www.ironcladtournaments.com/documents-rules-ppa/ironclad-terms-of-service-v1.0.pdf` | `99442282625dc7b2600475df7edc5649520d5cef64f2fcfe99f6e8e6d4d08ba1` |
| Privacy | 1.0 | `public/documents-rules-ppa/ironclad-privacy-policy-v1.0.pdf` | `https://www.ironcladtournaments.com/documents-rules-ppa/ironclad-privacy-policy-v1.0.pdf` | `cedb9cb46d2ae7bbd7328c500ca466c237afef8f11626d3095329087ec6453f0` |

The generated release set is dated **18 August 2026** and is valid for
activation only if Production activation completes on that Australia/Sydney
date. The displayed date must be the actual Production activation date and must
match across all four PDFs, `/terms`, `/privacy`, Rules cards,
`legal_documents`, and registration presentation. Never backdate. If the
release window crosses an Australia/Sydney calendar-day boundary, stop, discard
this dated release set, regenerate the artifacts, recompute hashes, and repeat
validation before activation.

Do not apply the four Staging rows until local validation, exact-head CI, and
the immutable Preview are green and same-day Production completion is
realistic. Staging document identity is immutable and each kind/version is
unique. If the Sydney date changes after Staging activation, do not carry the
old date into Production and do not delete or overwrite the Staging rows. Stop
the release and require a separately reviewed Staging rollover strategy before
regenerating or reusing those versions.

Staging does not write the Production canonical URLs into its register. Its
four `immutable_url` values must use the exact immutable Vercel Preview
deployment origin for the registered artifact head. The release helper requires
that origin with `--base-url` and byte-verifies all four Preview artifacts before
it can activate the Staging register. Production rejects every base other than
`https://www.ironcladtournaments.com` and repeats the same byte/hash checks.

## Release gates

1. Confirm the worktree is on the approved Phase 15C branch and record the exact
   PR head below. Confirm no unrelated files or migrations are included.
2. Generate and visually verify all four PDFs. Record their lowercase SHA-256
   values in this file and in the PR evidence.
3. Deploy the exact reviewed head to an immutable Vercel Preview URL. Validate
   lint, TypeScript, automated tests, build, public-route access, document-card
   links, and the complete four-document presentation on that deployment.
4. Confirm Staging is `ironclad-staging` (`zzbnneprhjicmajpjkdg`) and Production
   is `ironclad-v2` (`nsyjtqpvyxlzyujlbzos`). The Phase 15A migration must be
   present in both ledgers. Do not add or edit a migration for document data.
5. Run the legal-register command without `--apply`, using the exact immutable
   Preview origin and exact reviewed head. Review its target, deployed-byte
   hashes, aggregate protected-domain snapshot, and zero-row legal-register
   baseline; then run it with `--apply` on Staging. Do this only inside a release
   window expected to complete on the same Australia/Sydney date.
6. Run the fixed-target, rollback-only Staging registration contract. It must
   use the four already-Effective final Staging records and prove: independent
   rejection of each of the six controls; authoritative version/URL/SHA-256 and
   database-time snapshots; selector and snapshot-tamper rejection; atomic
   registration plus acceptance; blank Discord; acceptance immutability; and
   zero fixture residue. The wrapper must independently compare protected row
   counts and deterministic fixture identifiers before and after the SQL
   transaction rolls back. It exposes no Production target and the SQL rejects
   Production canonical document URLs.
   Normally the registered artifact head and reviewed tooling head are the same.
   If a validator-only repair is required after immutable Staging activation,
   the registered head must be an ancestor of the reviewed tooling head, and the
   intervening diff must be limited to the validator, its rollback-only SQL
   contract, its focused test, and this runbook. Any corpus, PDF, web,
   application migration, or other change fails closed.
7. Validate the exact PR head and its preview. Merge only that reviewed head,
   then verify the Production deployment identifies the expected merge/deploy
   commit.
8. Before Production register activation, verify every canonical URL returns
   the exact reviewed PDF bytes. The release command repeats this byte/hash
   gate and refuses Production activation on a mismatch.
9. Immediately before Production apply, require all of these to be zero:
   `legal_documents`, `registration_acceptances`, total `registrations`, active
   registration Tournaments, and the active registration cohort. An active
   registration Tournament has `registration_enabled = true` and status
   `registration_open` or `in_progress`; the cohort comprises registrations in
   `pending`, `manual_review`, `approved`, or `waitlisted` status.
10. Run the Production command without `--apply`; review the zero baselines,
    exact hashes, protected public-table counts, and aggregate Storage object
    counts (total and by bucket). Then run it with `--apply`. The transaction
    must add exactly four legal rows, add no acceptance or registration, leave
    active registration/cohort counts at zero, and recompare every protected
    public-table and Storage aggregate before commit.
11. Re-read both private tables, verify all six registration controls remain
    presented without creating a Production registration, and confirm
    unauthenticated direct data access remains denied. Leave the Supabase CLI
    linked to Staging.
12. Record the results below and update the external roadmap. Phase 15 remains
    open if its separate authenticated Tournament rehearsal is not complete.

Example commands (replace placeholders only after the corresponding gate):

```powershell
node scripts/phase15c/legal-document-register.mjs --target staging --base-url https://EXACT_PREVIEW_DEPLOYMENT.vercel.app --activation-date YYYY-MM-DD --expected-head PR_HEAD
node scripts/phase15c/legal-document-register.mjs --target staging --base-url https://EXACT_PREVIEW_DEPLOYMENT.vercel.app --activation-date YYYY-MM-DD --expected-head PR_HEAD --apply
node scripts/phase15c/run-staging-registration-contract.mjs --base-url https://EXACT_REGISTERED_PREVIEW_DEPLOYMENT.vercel.app --activation-date YYYY-MM-DD --expected-head PR_HEAD --registered-head REGISTERED_STAGING_ARTIFACT_HEAD
node scripts/phase15c/legal-document-register.mjs --target production --base-url https://www.ironcladtournaments.com --activation-date YYYY-MM-DD --expected-head DEPLOYED_HEAD
node scripts/phase15c/legal-document-register.mjs --target production --base-url https://www.ironcladtournaments.com --activation-date YYYY-MM-DD --expected-head DEPLOYED_HEAD --apply
```

The release helper uses fixed project refs, kinds, versions, paths, and URL
suffixes; computes the local PDF hashes; refuses a date other than the current
Australia/Sydney date; verifies the expected Git head for both environments;
verifies deployed bytes; and applies all four records transactionally with the
pinned `supabase@2.114.0 db query` CLI command. That validated command targets a
specified project through the Supabase Management API without changing the
local link. Any unexpected existing legal row fails closed.

Git-head verification is remote as well as local: the helper uses pinned Vercel
deployment inspection plus the authenticated read-only deployment metadata API
to require `gitSource.sha` to equal `--expected-head`. For Staging it also
requires `--base-url` to equal the deployment's own unique URL, rejecting an
alias. Production must resolve to a READY Production deployment, the expected
head must equal freshly fetched `origin/master`, and the same deployment ID is
rechecked immediately before activation and after database postflight.

The CLI contract was verified read-only on both configured projects: `db query`
supports `--linked`, `--project-ref`, `--file`, and the global
`--output-format json` option. The live schema audit confirmed forced RLS,
service-role read-only table access, enabled immutability/acceptance triggers,
the one-Effective-row-per-kind unique index, validated constraints, safe
`search_path`, and service-role-only registration RPC execution. The Phase 15A
migration is present in both ledgers. Before activation, both projects had zero
`legal_documents` and zero `registration_acceptances`; the read-only Production
preflight also had zero registrations, zero active registration Tournaments,
and zero active cohort rows.

## Localized-registration gate

> Before registration is enabled through a localized player journey, IronClad must provide any translated governing information required by applicable law or obtain legal confirmation that English-only acceptance is sufficient for that locale. Until then, a localized interface may be browsed, but registration for that locale must remain disabled or route through the approved English governing corpus with an appropriate notice.

Phase 15C does not implement localization. English remains the proposed
controlling version, subject to mandatory law; this record does not claim every
translation must legally be authoritative.

## External launch preparation only

Keep this item on the external launch checklist, not in the public legal corpus:

> Before live/commercial operation under the IronClad Tournaments name in Australia, confirm and complete any required ABN/business-name registration.

This check does not assert that an ABN or business-name registration currently
exists and is not a blocker to the present document-generation work.

## Rollout evidence

- Final PR head: pending
- Reviewed PR URL: pending
- Exact immutable Staging Preview origin/head:
  `https://ironclad-website-k6shidoxy-ironclad-tournaments.vercel.app` /
  `d16fe382251f458713c084b9459616f6774b8fab`
- Staging register activation timestamp: `2026-08-18 09:03:23.846017+00`
- Staging final-corpus registration contract/zero residue: pending
- Production deployment/head: pending
- Actual Production activation date: pending
- Production register activation timestamp: pending
- Post-activation `legal_documents` count: pending (must be 4)
- Post-activation Production `registration_acceptances` count: pending (must
  remain unchanged; expected 0 at Phase 15C activation)
- Canonical PDF byte/hash verification: pending
- Protected public-table and Storage aggregate non-interference: pending
- `/terms`, `/privacy`, Rules cards, Footer, and registration presentation:
  pending
- Supabase CLI final link: pending (must be `ironclad-staging`)
