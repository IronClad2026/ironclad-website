import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";

const [environment, receiptPath, outputPath] = process.argv.slice(2);
const targets = {
  staging: "zzbnneprhjicmajpjkdg",
  production: "nsyjtqpvyxlzyujlbzos",
};
assert.ok(Object.hasOwn(targets, environment) && receiptPath && outputPath,
  "Use: node scripts/patch2/prepare-staff-grants.mjs staging|production private-roster.json private-plan.sql");
assert.ok(receiptPath !== outputPath && outputPath.endsWith(".sql"), "Output must be a separate SQL plan.");
const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
assert.equal(receipt.projectRef, targets[environment], "Roster receipt belongs to a different Supabase project.");
assert.ok(Array.isArray(receipt.grants) && Array.isArray(receipt.revocations), "Expected exact grant and revocation lists.");
const all = [...receipt.grants, ...receipt.revocations];
assert.ok(all.length > 0 && all.length <= 50, "Review at most 50 staff identities per plan.");
const seen = new Set();
const now = Date.now();
for (const row of all) {
  assert.ok(/^[a-f0-9]{64}$/.test(row.subjectDigest) && !seen.has(row.subjectDigest),
    "Every explicitly reviewed digest must be a distinct SHA-256 digest.");
  assert.ok(/^[-a-zA-Z0-9._:]{3,100}$/.test(row.verificationReference),
    "Use only an operator-controlled verification reference, with no names or credentials.");
  seen.add(row.subjectDigest);
}
for (const row of receipt.grants) {
  assert.equal(row.operatorConfirmed, true, "Operator staff confirmation is required for every grant.");
  assert.equal(row.currentClerkAdmin, true, "Current role must be verified in the matching Clerk instance.");
  assert.equal(row.ownershipVerified, true, "Verify current identity ownership independently.");
  assert.equal(row.closureEvidenceChecked, true, "Review trusted closure evidence before granting.");
  const verifiedAt = Date.parse(row.providerCheckedAt);
  assert.ok(Number.isFinite(verifiedAt) && verifiedAt <= now && now - verifiedAt < 86_400_000,
    "Require a fresh provider check within 24 hours of preparing the plan.");
}
for (const row of receipt.revocations) {
  assert.equal(row.operatorConfirmed, true, "Operator confirmation is required for every revocation.");
}
const tuples = rows => rows.map(row =>
  `(decode('${row.subjectDigest}', 'hex'), '${row.verificationReference}')`).join(",\n    ");
const block = `-- REVIEW ONLY. This file does not execute itself.
-- Use only in the Supabase SQL editor after independently verifying project:
-- ${environment} ${targets[environment]}
-- Each digest is an exact reviewed Clerk subject; never paste raw identities.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '10s';
do $plan$
begin
  if session_user <> 'postgres' then
    raise exception 'Only the database operator can apply a reviewed staff plan';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('ironclad:match-room-account-closure', 0));
${receipt.grants.length ? `  if exists (
    select from (values
    ${tuples(receipt.grants)}
    ) as candidate(subject_digest, verification_reference)
    join ironclad_private.patch2_closed_accounts using (subject_digest)
  ) then
    raise exception 'A reviewed grant is blocked by a durable closure marker';
  end if;
  if exists (
    select from (values
    ${tuples(receipt.grants)}
    ) as candidate(subject_digest, verification_reference)
    join public.players player
      on sha256(convert_to(player.clerk_user_id, 'UTF8')) = candidate.subject_digest
    where player.account_closed_at is not null
  ) then
    raise exception 'A reviewed grant is blocked by a retained closed Player';
  end if;
  insert into ironclad_private.patch2_staff_authorizations
    (subject_digest, verification_reference)
  values
    ${tuples(receipt.grants)}
  on conflict (subject_digest) do update set verified_at=clock_timestamp(),
    verification_reference=excluded.verification_reference, revoked_at=null;
` : ""}${receipt.revocations.length ? `  update ironclad_private.patch2_staff_authorizations existing
  set revoked_at=clock_timestamp()
  from (values
    ${tuples(receipt.revocations)}
  ) as reviewed(subject_digest, verification_reference)
  where existing.subject_digest=reviewed.subject_digest and existing.revoked_at is null;
` : ""}end;
$plan$;
commit;
`;
await writeFile(outputPath, block, { flag: "wx", mode: 0o600 });
console.log(JSON.stringify({ environment, projectRef: receipt.projectRef, grantCount: receipt.grants.length,
  revocationCount: receipt.revocations.length, executed: false }));
