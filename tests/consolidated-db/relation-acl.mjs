import assert from "node:assert/strict";
import { test } from "node:test";
import { relationAclSql, schemaObjectsSql } from "../../scripts/consolidated-db/fingerprint.mjs";
import { relationAclRegressionSql, checkRelationAclFingerprints } from "../../scripts/consolidated-db/relation-acl-regression.mjs";
import { boundedSchemaDiff } from "../../scripts/consolidated-db/schema-diagnostics.mjs";

test("only table-like relation null ACLs use the owner-specific PostgreSQL default", () => {
  assert.equal(relationAclSql, "array(select x::text from unnest(coalesce(c.relacl,acldefault('r',c.relowner))) x order by x::text)");
  assert.equal(schemaObjectsSql.split("acldefault(").length - 1, 1);
  assert(schemaObjectsSql.includes("'owner',pg_get_userbyid(c.relowner),'acl'," + relationAclSql));
  assert(schemaObjectsSql.includes("c.relkind in ('r','p','v')"));
  assert(schemaObjectsSql.includes("case when p.proacl is null then null"));
  assert(schemaObjectsSql.includes("case when a.attacl is null then null"));
});

test("explicit permission, grantor, grant option and owner changes stay visible in schema diagnostics", () => {
  const relation = fact => [{ category: "relations", name: "public.synthetic", fact }];
  const original = { owner: "postgres", acl: ["anon=r/postgres", "postgres=arwdDxtm/postgres"] };
  for (const changed of [
    { owner: "postgres", acl: ["postgres=arwdDxtm/postgres"] },
    { owner: "postgres", acl: ["authenticated=r/postgres", "postgres=arwdDxtm/postgres"] },
    { owner: "postgres", acl: ["anon=r/authenticated", "postgres=arwdDxtm/postgres"] },
    { owner: "postgres", acl: ["anon=r*/postgres", "postgres=arwdDxtm/postgres"] },
    { owner: "postgres", acl: ["anon=r/postgres", "postgres=arwdDxt/postgres"] },
    { owner: "authenticated", acl: original.acl },
    { owner: "postgres", acl: [] },
  ]) assert.equal(boundedSchemaDiff(relation(original), relation(changed)).changedObjects, 1);
});

test("SQL regression is read-only and executes the production fingerprint expression", async () => {
  assert(relationAclRegressionSql.includes(relationAclSql));
  assert(!/\b(?:create|alter|drop|insert|update|delete|grant|revoke)\s+(?:table|role|into|from|on)\b/i.test(relationAclRegressionSql));
  // Prove regression assertions themselves reject a removed grant/option.
  const expected = ["DELETE", "INSERT", "MAINTAIN", "REFERENCES", "SELECT", "TRIGGER", "TRUNCATE", "UPDATE"];
  const names = ["implicit", "explicit", "role_grant", "other_grantee", "other_grantor", "grant_option", "removed_maintain", "explicit_empty", "other_owner", "public_grant", "reordered_grant"];
  const rows = names.map((name, index) => ({ name, fact: { owner: "postgres", acl: [name] }, sha256: String(index) }));
  rows[1] = { ...rows[0], name: "explicit" };
  rows[10] = { ...rows[2], name: "reordered_grant" };
  const client = { query: async sql => sql === relationAclRegressionSql ? { rows } : { rows: [{ privileges: expected }] } };
  await assert.doesNotReject(() => checkRelationAclFingerprints(client));
  const failed = rows.map(row => row.name === "grant_option" ? { ...row, sha256: rows[2].sha256 } : row);
  await assert.rejects(() => checkRelationAclFingerprints({ query: async sql => sql === relationAclRegressionSql ? { rows: failed } : { rows: [{ privileges: expected }] } }), /grant_option/);
});
