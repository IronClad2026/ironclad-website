# Terms and Privacy v1.1 controlled successor runbook

This runbook is limited to publishing Terms of Service v1.1 and Privacy Policy
v1.1. Rulebook v3.0 and PPA v3.0 remain Effective and immutable. The Phase 15C
initial-publication tooling and all four historical PDFs remain unchanged.

## Review-Draft state

Before the controlled publication window:

- `content/legal-successors-v1.1.json` is the exact Review-Draft amendment
  source;
- `content/legal-corpus.json` still identifies Terms v1.0 and Privacy v1.0 as
  Effective;
- no v1.1 PDF, final release manifest, hash or Effective date exists;
- Vercel Web Analytics remains disabled; and
- no Production legal row is changed.

This is intentional. An immutable v1.1 PDF cannot truthfully display its actual
Production publication date before that date is known. Do not guess, backdate
or publish a Review Draft as Effective.

## Locked release set

The successor finalizer may change only the current Terms and Privacy source and
create these two new artifacts:

- `public/documents-rules-ppa/ironclad-terms-of-service-v1.1.pdf`
- `public/documents-rules-ppa/ironclad-privacy-policy-v1.1.pdf`

It must preserve the exact existing Rulebook v3.0, PPA v3.0, Terms v1.0 and
Privacy v1.0 PDF bytes. The finalizer writes the computed successor SHA-256
values and date to `content/legal-successor-release.json`; no hash is recorded
before generation.

## Finalize on the actual Sydney publication date

1. Start only with a clean, reviewed feature worktree and a realistic
   same-Australia/Sydney-day Production window.
2. Confirm the intended date is the current date in `Australia/Sydney`.
3. Run the deterministic finalizer with that explicit date:

   ```powershell
   node scripts/legal-successor/finalize-v1.1.mjs --activation-date YYYY-MM-DD
   ```

4. Review the complete source diff. Render every page of both generated PDFs
   and check text, headings, tables, page breaks, metadata date and absence of
   raw template tokens. Recompute each SHA-256 and require an exact manifest
   match.
5. Run focused legal/acceptance tests, localization tests, ESLint, strict
   TypeScript, the full suite, Production build and `git diff --check`.
6. Commit and push the finalized candidate, wait for exact-head CI and the
   immutable Vercel Preview to be Ready, and record the exact head and Preview
   origin.

The finalizer fails unless the asserted date is the current Sydney date, the
worktree is clean before finalization, the four historical PDF hashes are
exact, no v1.1 target or final manifest already exists, and the selected Terms
and Privacy dates match. It generates only Terms and Privacy.

If the Sydney date changes before Production activation, stop. Do not activate
the stale candidate. Revert the unactivated finalization commit on the feature
branch, return to the reviewed undated source state, rerun the finalizer with
the new current date, then repeat PDF review, hashes, tests, CI and Preview.

## Staging rollback validation

The successor helper deliberately does not persist legal-document changes in
Staging. It executes the complete supersession transaction and rolls it back,
then compares protected counts and rows before and after to prove zero residue:

```powershell
node scripts/legal-successor/legal-document-successor.mjs --target staging --base-url https://EXACT_PREVIEW_DEPLOYMENT.vercel.app --activation-date YYYY-MM-DD --expected-head EXACT_PR_HEAD --rollback-validate
```

The command fixes the Staging project identity, requires an immutable Ready
Preview for the exact head, verifies the two deployed PDF byte hashes, requires
the account-acceptance schema, proves the intended six-row legal register shape
inside one transaction, preserves registration and acceptance counts, and
requires rollback to leave no residue. It cannot apply to Staging.

## Production activation

After owner authorization, exact-head review, squash merge and the Ready
Production deployment from the resulting `master`, run a dry run first:

```powershell
node scripts/legal-successor/legal-document-successor.mjs --target production --base-url https://www.ironcladtournaments.com --activation-date YYYY-MM-DD --expected-head EXACT_MASTER_HEAD
```

Review the fixed Production target, exact head, current Sydney date, deployment
ID, canonical PDF hashes, predecessor rows and proposed transaction. Then apply
the same exact release:

```powershell
node scripts/legal-successor/legal-document-successor.mjs --target production --base-url https://www.ironcladtournaments.com --activation-date YYYY-MM-DD --expected-head EXACT_MASTER_HEAD --apply
```

The apply is one database transaction. It locks the current register,
supersedes only Effective Terms v1.0 and Privacy v1.0, inserts exactly one
Effective Terms v1.1 and Privacy v1.1, preserves Rulebook v3.0 and PPA v3.0 as
Effective, preserves all historical rows and acceptance evidence, and commits
only if every postcondition passes. It does not delete any old document or
acceptance row.

If the transaction fails, it rolls back. Do not retry after the Sydney date
changes. If the new Production source is already serving but activation cannot
complete, restore the prior approved Production deployment; do not leave the
web corpus and database register on different current versions.

## Post-activation checks

- Re-read the private legal register: exactly six total rows, four Effective
  rows and two superseded rows.
- Confirm Rulebook v3.0 and PPA v3.0 are unchanged and Effective.
- Confirm Terms v1.0 and Privacy v1.0 are preserved and superseded.
- Confirm Terms v1.1 and Privacy v1.1 are the only Effective successors and
  their URLs/hashes match the deployed bytes.
- Confirm prior registration acceptances and new account-wide acceptance rows
  are unchanged by publication.
- Confirm a signed-in user without v1.1 evidence receives the legal-update gate
  and can continue after accepting Terms v1.1 and acknowledging Privacy v1.1.
- Confirm analytics consent remains separate and optional and Vercel Web
  Analytics remains disabled until PR B2.
- Perform no Production fixture or registration, Tournament, Match, Player,
  Poll, Storage or legal-evidence mutation beyond the fixed successor
  transaction and a user's own tested acceptance if separately authorized.
