import assert from "node:assert/strict";
import { relationAclSql } from "./fingerprint.mjs";

// Read-only PostgreSQL execution of the exact relation fingerprint expression.
// ACL literals use only local synthetic roles created by baseline reproduction.
export const relationAclRegressionSql = `with owners as (
 select 'postgres'::regrole::oid primary_owner,'authenticated'::regrole::oid other_owner
), samples(name,relacl,relowner) as (
 select 'implicit',null::aclitem[],primary_owner from owners
 union all select 'explicit',acldefault('r',primary_owner),primary_owner from owners
 union all select 'role_grant',acldefault('r',primary_owner)||array['anon=r/postgres'::aclitem],primary_owner from owners
 union all select 'other_grantee',acldefault('r',primary_owner)||array['authenticated=r/postgres'::aclitem],primary_owner from owners
 union all select 'other_grantor',acldefault('r',primary_owner)||array['anon=r/authenticated'::aclitem],primary_owner from owners
 union all select 'grant_option',acldefault('r',primary_owner)||array['anon=r*/postgres'::aclitem],primary_owner from owners
 union all select 'removed_maintain',array['postgres=arwdDxt/postgres'::aclitem],primary_owner from owners
 union all select 'explicit_empty',array[]::aclitem[],primary_owner from owners
 union all select 'other_owner',null::aclitem[],other_owner from owners
 union all select 'public_grant',acldefault('r',primary_owner)||array['=r/postgres'::aclitem],primary_owner from owners
 union all select 'reordered_grant',array['anon=r/postgres'::aclitem]||acldefault('r',primary_owner),primary_owner from owners
), facts as (
 select c.name,jsonb_build_object('owner',pg_get_userbyid(c.relowner),'acl',${relationAclSql}) fact from samples c
)
select name,fact,encode(sha256(convert_to(fact::text,'UTF8')),'hex') sha256 from facts order by name;`;

export async function checkRelationAclFingerprints(client) {
  const result = await client.query(relationAclRegressionSql);
  const samples = Object.fromEntries(result.rows.map(row => [row.name, row]));
  assert.equal(Object.keys(samples).length, 11);
  assert.deepEqual(samples.implicit.fact, samples.explicit.fact, "Implicit and explicit owner default ACL must match");
  assert.equal(samples.implicit.sha256, samples.explicit.sha256);
  assert.deepEqual(samples.role_grant.fact, samples.reordered_grant.fact, "ACL entry order has no meaning");
  const owner = (await client.query("select array_agg(privilege_type order by privilege_type) privileges from aclexplode(acldefault('r','postgres'::regrole::oid))")).rows[0].privileges;
  assert.deepEqual(owner, ["DELETE", "INSERT", "MAINTAIN", "REFERENCES", "SELECT", "TRIGGER", "TRUNCATE", "UPDATE"], "PostgreSQL 17 owner default includes MAINTAIN");
  for (const [before, after] of [
    ["role_grant", "implicit"], ["role_grant", "other_grantee"], ["role_grant", "other_grantor"],
    ["role_grant", "grant_option"], ["implicit", "removed_maintain"], ["implicit", "explicit_empty"],
    ["implicit", "other_owner"], ["implicit", "public_grant"],
  ]) assert.notEqual(samples[before].sha256, samples[after].sha256, `ACL drift must remain visible: ${before} -> ${after}`);
  return "Effective relation ACL round-trip: owner defaults equivalent; role, grantor, grant option, MAINTAIN, explicit empty ACL and ownership drift remain distinct";
}
