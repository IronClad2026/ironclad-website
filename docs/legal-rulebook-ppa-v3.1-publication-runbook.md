# Rulebook v3.1 and PPA v3.1 controlled publication runbook

## Scope and immutable artifacts

This operation publishes only the prospective Rulebook and PPA successors on
`2026-08-22`. It does not replace Terms v1.1, Privacy v1.2, or any historical
acceptance evidence.

| Document | Version | Immutable path | SHA-256 |
| --- | --- | --- | --- |
| Rulebook | 3.1 | `/documents-rules-ppa/ironclad-official-tournament-rulebook-v3.1.pdf` | `02bef1bfe8f1b2121f62eafd09edc448764adebbfcb54e38934c7433bf6ef0f2` |
| PPA | 3.1 | `/documents-rules-ppa/ironclad-player-participation-agreement-v3.1.pdf` | `94dcbf6ecbe0c1de4f908baeff824b8439dd81be8022712cd498e8bb2731869b` |

The publication helper also locks and verifies the exact environment baseline
before it can produce a commit:

| Document | Version | SHA-256 |
| --- | --- | --- |
| Rulebook | 3.0 | `11a391d5b4602bab6f07381b30c4435fb1b4842be99006bdce2512b583859ab0` |
| PPA | 3.0 | `a836bda5679899cb8b402465fb750b5b0aff4eb7dcf8cdb142a163cb6d8ed600` |
| Terms | 1.1 | `59d3dfa890a8e259ab8ed81e3b490589583e5d1f7ae53d9f9caa2d77078534f1` |
| Privacy | 1.2 | `aa0f7af02b69194172dd6333e1d8b7271152aad0bfdab7a935686071c784bfd6` |
| Privacy (Staging baseline only) | 1.1 | `0c2e37499f8453bdf9962b6acfc018b5307995f0b7aa6763ae6036aeb34bbb91` |

The local helper reads and hashes all seven PDFs. It makes no network or database
request. SQL output is a rollback transaction unless `--apply` is explicitly
present.

## Prerequisites

Before either environment is changed:

1. Require a clean, reviewed publication commit containing the final v3.1
   corpus and both exact v3.1 PDFs.
2. Verify the target project identity independently. Staging is
   `zzbnneprhjicmajpjkdg`; Production is `nsyjtqpvyxlzyujlbzos`.
3. Deploy the exact publication commit and verify both new immutable URLs are
   HTTP 200 with the expected hashes.
4. Confirm the exact environment baseline. Production must have seven legal
   rows (four Effective, three Superseded) with Rulebook v3.0, PPA v3.0, Terms
   v1.1, and Privacy v1.2 Effective. The known Staging rehearsal baseline has
   six legal rows (four Effective, two Superseded) with Rulebook v3.0, PPA v3.0,
   Terms v1.1, and Privacy v1.1 Effective. Production URLs must use the canonical
   origin. Staging predecessors may retain their original immutable HTTPS
   `*.vercel.app` origins, but each origin and exact versioned path must be
   re-read, fetched and hash-verified before publication.
5. Record the `registration_acceptances`, `account_legal_acceptances`, and
   `registrations` counts for independent post-run comparison.

Do not activate the database before the exact source and artifacts are served
from the origin that will be written into `immutable_url`.

## Staging rehearsal

Use the exact HTTPS `*.vercel.app` deployment origin serving the reviewed
commit. Do not use an alias that can move between deployments.

Generate the rollback rehearsal:

```powershell
node scripts/legal-successor/rulebook-ppa-v3.1-publication.mjs --environment staging --origin https://EXACT-DEPLOYMENT.vercel.app
```

Execute the generated SQL only through the existing authenticated, guarded
Staging PostgreSQL route. The final statement is `rollback;`; require all
preconditions and postconditions to run without error, then verify no database
row or evidence count changed.

After the rollback rehearsal passes, generate a fresh apply transaction:

```powershell
node scripts/legal-successor/rulebook-ppa-v3.1-publication.mjs --environment staging --origin https://EXACT-DEPLOYMENT.vercel.app --apply
```

Execute it once against the freshly re-verified Staging project. Require eight
legal rows: four Effective and four Superseded. Only Rulebook v3.0 and PPA v3.0
become Superseded; Rulebook v3.1 and PPA v3.1 become Effective; the exact Terms
v1.1 and Privacy v1.1 Staging row IDs stay Effective; all evidence and
registration counts remain unchanged.

Verify a new controlled registration resolves the v3.1 Rulebook and PPA while
existing registration evidence continues to reference its originally accepted
document IDs. Remove the controlled fixture through the existing authorized
cleanup path.

## Production publication

Production accepts only the canonical origin
`https://www.ironcladtournaments.com`. First verify the exact reviewed commit is
READY on the canonical domain and both v3.1 PDF hashes match. Re-resolve and
verify the Production project identity immediately before each database step.

Generate and execute the rollback rehearsal:

```powershell
node scripts/legal-successor/rulebook-ppa-v3.1-publication.mjs --environment production --origin https://www.ironcladtournaments.com
```

Require a clean rollback and confirm the exact seven-row baseline remains. Then
generate a fresh explicit apply transaction:

```powershell
node scripts/legal-successor/rulebook-ppa-v3.1-publication.mjs --environment production --origin https://www.ironcladtournaments.com --apply
```

Execute it once through the guarded Production PostgreSQL route. Stop on any
identity, hash, origin, row-count, date, lock, or evidence-count failure. Do not
edit the generated SQL to bypass a failed precondition.

## Post-publication proof

Require all of the following:

- the exact environment shape: Staging eight/four/four or Production
  nine/four/five for total/Effective/Superseded rows;
- exact Effective Rulebook v3.1 and PPA v3.1 URLs and hashes;
- exact Superseded Rulebook v3.0 and PPA v3.0 rows with their original UUIDs;
- exact Effective account-wide rows with their original UUIDs: Terms v1.1 and
  Privacy v1.1 in the Staging rehearsal, Terms v1.1 and Privacy v1.2 in
  Production;
- unchanged `registration_acceptances`, `account_legal_acceptances`, and
  `registrations` counts;
- existing immutable acceptance rows still reference their original document
  IDs and hashes; and
- a future registration resolves the new Effective Rulebook/PPA set without
  manufacturing Production tournament activity.

## Recovery

Before `commit;`, recovery is the transaction rollback. After a successful
commit, do not delete, rewrite, backdate, or reactivate any legal document and
do not alter acceptance evidence. A post-publication correction requires a
separately reviewed forward successor release.
