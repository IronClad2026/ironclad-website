import assert from "node:assert/strict";
import { test } from "node:test";
import { boundedSchemaDiff } from "../../scripts/consolidated-db/schema-diagnostics.mjs";

const object = (category, name, fact) => ({ category, name, fact });
test("schema diagnostic identifies exact changed constraint grouping without relaxing comparison", () => {
  const source = [object("constraints", "public.players.coherent", { valid: true, definition: "CHECK ((a AND (b AND c)))" })];
  const restored = [object("constraints", "public.players.coherent", { definition: "CHECK ((a AND b AND c))", valid: true })];
  const diff = boundedSchemaDiff(source, restored);
  assert.equal(diff.changedObjects, 1);
  assert.equal(diff.changes[0].fields[0].field, "definition");
  assert.equal(diff.changes[0].fields[0].source, source[0].fact.definition);
  assert.notEqual(diff.changes[0].sourceSha256, diff.changes[0].restoredSha256);
});
test("function bodies and policy/default expressions remain hashes only", () => {
  const secret = "synthetic-private-value";
  const source = [object("functions", "public.worker()", { body: secret }), object("columns", "public.t.key", { default: secret }),
    object("policies", "public.t.owner", { qual: secret })];
  const restored = source.map(entry => ({ ...entry, fact: Object.fromEntries(Object.keys(entry.fact).map(field => [field, "other"])) }));
  const diff = boundedSchemaDiff(source, restored);
  assert.equal(diff.changedObjects, 3);
  assert(!JSON.stringify(diff).includes(secret));
});
test("inventory order and JSON field order do not produce false diagnostics", () => {
  const source = [object("relations", "public.a", { owner: "postgres", options: null }), object("relations", "public.b", { rls: true })];
  const restored = [source[1], object("relations", "public.a", { options: null, owner: "postgres" })];
  assert.equal(boundedSchemaDiff(source, restored).changedObjects, 0);
});
test("diagnostics bound object counts and reject unknown or duplicate identities", () => {
  const source = Array.from({ length: 50 }, (_, index) => object("relations", "public.t" + index, { rls: true }));
  const diff = boundedSchemaDiff(source, []);
  assert.equal(diff.changedObjects, 50); assert.equal(diff.changes.length, 40); assert.equal(diff.truncated, true);
  assert.throws(() => boundedSchemaDiff([object("unknown", "x", {})], []));
  assert.throws(() => boundedSchemaDiff([source[0], source[0]], []));
});
