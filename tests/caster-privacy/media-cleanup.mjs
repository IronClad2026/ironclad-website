import assert from "node:assert/strict";
import { test } from "node:test";
import { runCasterMediaCleanup } from "../../scripts/caster-privacy/media-cleanup.mjs";

const application = "10000000-0000-4000-8000-000000000001";
const media = "10000000-0000-4000-8000-000000000002";
const other = "10000000-0000-4000-8000-000000000003";
const operator = "user_SyntheticPrivacyOperator";
const path = `${application}/${media}.webp`;

function fixture({ claim = { status: "ok", assets: [{ id: media, path }] }, storageError, finish } = {}) {
  const calls = [];
  return { calls, client: {
    async rpc(name, args) {
      calls.push([name, args]);
      return { data: name === "caster_privacy_media_claim" ? claim : finish ?? { status: "ok" } };
    },
    storage: { from(bucket) {
      return { async remove(paths) {
        calls.push([bucket, paths]);
        return { error: storageError };
      } };
    } },
  } };
}

test("only deletes claimed canonical paths in the private bucket then finalizes the database record", async () => {
  const { client, calls } = fixture();
  assert.deepEqual(await runCasterMediaCleanup(client, operator, [media]), { finalized: 1, alreadyFinalized: 0 });
  assert.deepEqual(calls, [
    ["caster_privacy_media_claim", { p_actor: operator, p_media_ids: [media] }],
    ["caster-application-media", [path]],
    ["caster_privacy_media_finish", { p_actor: operator, p_media_id: media }],
  ]);
});

test("a disabled or blocked database claim cannot call Storage", async () => {
  for (const status of ["disabled", "blocked", "invalid"]) {
    const { client, calls } = fixture({ claim: { status, assets: [{ id: media, path }] } });
    await assert.rejects(runCasterMediaCleanup(client, operator, [media]), /denied, disabled or unavailable/);
    assert.equal(calls.length, 1);
  }
});

test("rejects an unexpected claim batch before any Storage call", async () => {
  for (const asset of [{ id: other, path }, { id: media, path: "../../unexpected.webp" }, { id: media, path: `${application}/${other}.webp` }]) {
    const { client, calls } = fixture({ claim: { status: "ok", assets: [asset] } });
    await assert.rejects(runCasterMediaCleanup(client, operator, [media]), /Unexpected claimed media metadata/);
    assert.equal(calls.length, 1);
  }
});

test("does not finalise after a failed storage request, and can retry an already-finalized asset", async () => {
  const failure = fixture({ storageError: new Error("Synthetic Storage failure") });
  await assert.rejects(runCasterMediaCleanup(failure.client, operator, [media]), /can be retried/);
  assert.equal(failure.calls.length, 2);
  const completed = fixture({ claim: { status: "ok", assets: [] } });
  assert.deepEqual(await runCasterMediaCleanup(completed.client, operator, [media]), { finalized: 0, alreadyFinalized: 1 });
  assert.equal(completed.calls.length, 1);
});
