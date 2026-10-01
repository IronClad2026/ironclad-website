import assert from "node:assert/strict";
import { test } from "node:test";
import { assertHostedContext, assertNodeRuntimeState, boundedSyntheticDiagnostic, formatSchemaDiagnostic, readBoundedRehearsalReceipt,
  rehearsalReceiptPath, maxRehearsalReceiptBytes, startup, image, nodeImage } from "../../scripts/consolidated-db/hosted-runtime.mjs";
import { boundedSchemaDiff } from "../../scripts/consolidated-db/schema-diagnostics.mjs";

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

test("synthetic startup diagnostics are bounded and redact tokens, URLs and credentials", () => {
  const secret = "synthetic-sensitive-value";
  const output = boundedSyntheticDiagnostic(`loader GLIBC_2.28 missing\nAuthorization: Bearer ${secret}\npassword=${secret}\nhttps://example.invalid?token=${secret}\nsk_live_syntheticfakevalue\n${"a".repeat(20)}.${"b".repeat(20)}.${"c".repeat(20)}`);
  assert(output.includes("GLIBC_2.28 missing"));
  assert(!output.includes(secret)); assert(!output.includes("sk_live_")); assert(!output.includes("https://"));
  assert(!output.includes("a".repeat(20)));
  assert.equal(boundedSyntheticDiagnostic("x".repeat(10000)).length, 4096);
  assert(!boundedSyntheticDiagnostic("\u001b[31mloader").includes("\u001b"));
});

const expectedNode = {
  imageId: "sha256:synthetic-node-image", databaseName: "consolidated-source-synthetic", databaseId: "synthetic-database-id",
  repository: "/isolated/candidate", clientModules: "/isolated/temporary/consolidated-pg-client/node_modules",
};
const nodeState = () => ({
  Image: expectedNode.imageId,
  Config: { Image: nodeImage, User: "node" },
  HostConfig: {
    NetworkMode: `container:${expectedNode.databaseName}`, PortBindings: {}, ReadonlyRootfs: true,
    CapDrop: ["ALL"], SecurityOpt: ["no-new-privileges"], Tmpfs: { "/tmp": "rw,noexec,nosuid,size=64m,mode=1777" },
  },
  Mounts: [
    { Type: "bind", Source: expectedNode.repository, Destination: "/work", RW: false },
    { Type: "bind", Source: expectedNode.clientModules, Destination: "/client/node_modules", RW: false },
  ],
});

test("Node runtime accepts only its exact database namespace and official pinned image", () => {
  assert.equal(nodeImage, "node:22.12.0-bookworm-slim");
  assert.doesNotThrow(() => assertNodeRuntimeState(nodeState(), expectedNode));
  const resolvedId = nodeState(); resolvedId.HostConfig.NetworkMode = `container:${expectedNode.databaseId}`;
  assert.doesNotThrow(() => assertNodeRuntimeState(resolvedId, expectedNode));
  for (const mode of ["host", "bridge", "none", "container:another-database", "consolidated-ci-synthetic"]) {
    const state = nodeState(); state.HostConfig.NetworkMode = mode;
    assert.throws(() => assertNodeRuntimeState(state, expectedNode), `Network ${mode} must stop`);
  }
  const wrongDigest = nodeState(); wrongDigest.Image = "sha256:other-image";
  assert.throws(() => assertNodeRuntimeState(wrongDigest, expectedNode));
  const wrongTag = nodeState(); wrongTag.Config.Image = "node:latest";
  assert.throws(() => assertNodeRuntimeState(wrongTag, expectedNode));
  const published = nodeState(); published.HostConfig.PortBindings = { "56623/tcp": [{ HostPort: "56623" }] };
  assert.throws(() => assertNodeRuntimeState(published, expectedNode));
});

test("Node runtime rejects writable or substituted host mounts and privilege escalation", () => {
  for (const change of [
    state => { state.Mounts[0].RW = true; },
    state => { state.Mounts[1].RW = true; },
    state => { state.Mounts[0].Source = "/different/repository"; },
    state => { state.Mounts[1].Source = "/different/client"; },
    state => { state.Mounts.push({ Type: "bind", Source: "/", Destination: "/host", RW: false }); },
    state => { state.Mounts.push({ Type: "volume", Destination: "/data", RW: true }); },
    state => { state.HostConfig.ReadonlyRootfs = false; },
    state => { state.Config.User = "root"; },
    state => { state.HostConfig.CapDrop = []; },
    state => { state.HostConfig.SecurityOpt = []; },
  ]) {
    const state = nodeState(); change(state);
    assert.throws(() => assertNodeRuntimeState(state, expectedNode));
  }
});

test("Node scratch stays bounded and non-executable without extra mounts", () => {
  const includedTmpfs = nodeState(); includedTmpfs.Mounts.push({ Type: "tmpfs", Destination: "/tmp", RW: true });
  assert.doesNotThrow(() => assertNodeRuntimeState(includedTmpfs, expectedNode));
  for (const option of ["noexec", "nosuid", "size=64m", "mode=1777"]) {
    const state = nodeState(); state.HostConfig.Tmpfs["/tmp"] = state.HostConfig.Tmpfs["/tmp"].split(",").filter(value => value !== option).join(",");
    assert.throws(() => assertNodeRuntimeState(state, expectedNode));
  }
  const extra = nodeState(); extra.HostConfig.Tmpfs["/other"] = "rw,noexec,nosuid,size=64m";
  assert.throws(() => assertNodeRuntimeState(extra, expectedNode));
  const wrongScratch = nodeState(); wrongScratch.Mounts.push({ Type: "tmpfs", Destination: "/other", RW: true });
  assert.throws(() => assertNodeRuntimeState(wrongScratch, expectedNode));
});

test("schema mismatch logs retain exact safe CHECK differences without bodies or row data", () => {
  const before = [
    { category: "constraints", name: "public.synthetic.check", fact: { definition: "CHECK (a AND (b AND c))", valid: true } },
    { category: "functions", name: "public.synthetic()", fact: { body: "select 'synthetic-secret-body'" } },
  ];
  const after = structuredClone(before); after[0].fact.definition = "CHECK (a AND b AND c)";
  after[1].fact.body = "select 'changed-synthetic-secret-body'";
  const output = formatSchemaDiagnostic(boundedSchemaDiff(before, after, 24), "before-consolidated-application-schema-mismatch");
  const parsed = JSON.parse(output);
  assert.equal(parsed.changedObjects, 2); assert.equal(parsed.syntheticOnly, true);
  assert(output.includes("CHECK (a AND (b AND c))")); assert(output.includes("CHECK (a AND b AND c)"));
  assert(!output.includes("synthetic-secret-body")); assert(!output.includes("select '"));
  assert.match(parsed.changes[1].fields[0].sourceSha256, /^[a-f0-9]{64}$/);
});

test("large schema diagnostics remain valid JSON below 16KiB and preserve hashes", () => {
  const before = Array.from({ length: 40 }, (_, i) => ({ category: "constraints", name: `public.synthetic.check_${i}`,
    fact: { definition: "CHECK (" + "x ".repeat(3000) + ")", valid: true } }));
  const after = structuredClone(before); for (const object of after) object.fact.definition += " ";
  const output = formatSchemaDiagnostic(boundedSchemaDiff(before, after, 24), "after-consolidated-application-schema-mismatch");
  const parsed = JSON.parse(output);
  assert(Buffer.byteLength(output) <= 16384); assert.equal(parsed.changedObjects, 40); assert.equal(parsed.truncated, true);
  assert(parsed.changes.length > 0); assert.match(parsed.changes[0].fields[0].sourceSha256, /^[a-f0-9]{64}$/);
  assert(!output.includes("x ".repeat(1000)));
});

test("receipt retrieval reads only the fixed synthetic path and accepts a normal aggregate JSON", () => {
  const bytes = Buffer.from(JSON.stringify({ status: "PASS", providerMode: "actual-supabase", candidateLedgerEntries: 159 }));
  const calls = [];
  const filesystem = {
    statSync: file => { calls.push(["stat", file]); return { isFile: () => true, size: bytes.length }; },
    readFileSync: file => { calls.push(["read", file]); return bytes; },
  };
  assert.deepEqual(readBoundedRehearsalReceipt(filesystem), { status: "PASS", providerMode: "actual-supabase", candidateLedgerEntries: 159 });
  assert.deepEqual(calls, [["stat", "/tmp/consolidated-db-rehearsal.json"], ["read", "/tmp/consolidated-db-rehearsal.json"]]);
  assert.equal(rehearsalReceiptPath, "/tmp/consolidated-db-rehearsal.json");
  assert.equal(maxRehearsalReceiptBytes, 1024 * 1024);
});

test("receipt retrieval rejects oversized and nonregular files before reading their bytes", () => {
  for (const [regular, size] of [[true, maxRehearsalReceiptBytes + 1], [false, 10], [true, 0], [true, -1], [true, 10.5]]) {
    let reads = 0;
    assert.throws(() => readBoundedRehearsalReceipt({ statSync: () => ({ isFile: () => regular, size }),
      readFileSync: () => { reads++; return Buffer.from("{}"); } }), /at most 1MiB/);
    assert.equal(reads, 0);
  }
});

test("receipt retrieval rejects changed size, invalid JSON and nonobject receipts", () => {
  for (const body of ["invalid-json", "null", "[]", "true"]) {
    const bytes = Buffer.from(body);
    assert.throws(() => readBoundedRehearsalReceipt({ statSync: () => ({ isFile: () => true, size: bytes.length }), readFileSync: () => bytes }));
  }
  assert.throws(() => readBoundedRehearsalReceipt({ statSync: () => ({ isFile: () => true, size: 2 }), readFileSync: () => Buffer.from('{"changed":true}') }), /changed during/);
});
