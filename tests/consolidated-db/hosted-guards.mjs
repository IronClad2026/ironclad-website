import assert from "node:assert/strict";
import { test } from "node:test";
import { assertHostedContext, startup, image } from "../../scripts/consolidated-db/hosted-runtime.mjs";

const repository = "/isolated/candidate";
const valid = {
  GITHUB_ACTIONS: "true", RUNNER_TEMP: "/isolated/temporary", GITHUB_WORKSPACE: repository,
  CONSOLIDATED_EXPECTED_SHA: "a".repeat(40),
};

test("ordinary local execution cannot start the hosted rehearsal", () => {
  for (const platform of ["win32", "darwin"]) assert.throws(() => assertHostedContext(platform, valid, repository));
  for (const field of ["GITHUB_ACTIONS", "RUNNER_TEMP", "GITHUB_WORKSPACE", "CONSOLIDATED_EXPECTED_SHA"]) {
    const env = { ...valid }; delete env[field];
    assert.throws(() => assertHostedContext("linux", env, repository), `Missing ${field} must stop`);
  }
  assert.throws(() => assertHostedContext("linux", { ...valid, GITHUB_ACTIONS: "false" }, repository));
});

test("remote Docker, wrong workspace and mutable candidate identifiers fail closed", () => {
  for (const host of ["tcp://127.0.0.1:2375", "ssh://remote", "tcp://production:2376"]) {
    assert.throws(() => assertHostedContext("linux", { ...valid, DOCKER_HOST: host }, repository));
  }
  for (const option of [{ DOCKER_TLS_VERIFY: "1" }, { DOCKER_CERT_PATH: "/credentials" }]) {
    assert.throws(() => assertHostedContext("linux", { ...valid, ...option }, repository));
  }
  assert.throws(() => assertHostedContext("linux", { ...valid, GITHUB_WORKSPACE: "/other/project" }, repository));
  for (const sha of ["HEAD", "release/candidate", "a".repeat(39), "A".repeat(40)]) {
    assert.throws(() => assertHostedContext("linux", { ...valid, CONSOLIDATED_EXPECTED_SHA: sha }, repository));
  }
  assert.doesNotThrow(() => assertHostedContext("linux", { ...valid, DOCKER_HOST: "unix:///var/run/docker.sock" }, repository));
});

test("isolated cluster cannot listen externally or execute copied cron and network queues", () => {
  assert.equal(image, "supabase/postgres:17.6.1.127");
  assert.match(startup, /listen_addresses=127\.0\.0\.1/);
  assert.match(startup, /port=56623/);
  assert.match(startup, /cron\.database_name=consolidated_rehearsal/);
  assert.match(startup, /cron\.launch_active_jobs=off/);
  assert.match(startup, /pg_net\.database_name=postgres/);
  assert(!startup.includes("listen_addresses='*'"));
  assert(!startup.includes("POSTGRES_PASSWORD"));
});
