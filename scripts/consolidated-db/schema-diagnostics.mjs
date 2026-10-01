import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const stable = value => value && typeof value === "object"
  ? Array.isArray(value) ? value.map(stable) : Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]))
  : value;
const serialize = value => JSON.stringify(stable(value)) ?? "undefined";
const hash = value => createHash("sha256").update(serialize(value)).digest("hex");
const categories = new Set(["functions", "relations", "columns", "constraints", "indexes", "triggers", "policies", "views"]);
const safeFields = new Set(["acl", "owner", "kind", "rls", "forceRls", "options", "type", "notnull", "valid", "enabled", "permissive", "roles", "cmd"]);
const safeConstraint = value => typeof value === "string" && value.length <= 8192
  && !/https?:\/\/|\b(?:password|secret|token|authorization|api[-_]?key)\s*[:=]|\b(?:sk_(?:live|test)_|sb_secret_)/i.test(value);

// Catalog-only diagnostic; preserve strict capture equality elsewhere. SQL
// function bodies, policy expressions, view SQL and defaults remain hash-only.
export function boundedSchemaDiff(source, restored, limit = 40) {
  assert(Array.isArray(source) && Array.isArray(restored) && source.length < 10000 && restored.length < 10000);
  assert(Number.isInteger(limit) && limit >= 1 && limit <= 40);
  const inventory = items => {
    const entries = new Map();
    for (const object of items) {
      assert(categories.has(object.category) && typeof object.name === "string" && object.name.length < 1000);
      const key = object.category + ":" + object.name;
      assert(!entries.has(key), "Duplicate schema object identity");
      entries.set(key, object);
    }
    return entries;
  };
  const before = inventory(source), after = inventory(restored);
  const changes = [];
  for (const key of [...new Set([...before.keys(), ...after.keys()])].sort()) {
    const a = before.get(key), b = after.get(key);
    if (serialize(a) === serialize(b)) continue;
    const identity = a ?? b;
    const change = { category: identity.category, name: identity.name, sourceSha256: hash(a), restoredSha256: hash(b) };
    if (!a || !b) change.presence = a ? "removed" : "added";
    else change.fields = [...new Set([...Object.keys(a.fact), ...Object.keys(b.fact)])].sort()
      .filter(field => serialize(a.fact[field]) !== serialize(b.fact[field])).map(field => {
        const result = { field, sourceSha256: hash(a.fact[field]), restoredSha256: hash(b.fact[field]) };
        if (safeFields.has(field) || identity.category === "constraints" && field === "definition"
          && safeConstraint(a.fact[field]) && safeConstraint(b.fact[field])) {
          result.source = a.fact[field]; result.restored = b.fact[field];
        }
        return result;
      });
    changes.push(change);
  }
  return { sourceObjects: source.length, restoredObjects: restored.length, changedObjects: changes.length,
    truncated: changes.length > limit, changes: changes.slice(0, limit) };
}
