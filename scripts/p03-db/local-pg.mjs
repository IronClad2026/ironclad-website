import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";

export function localPsqlArgument() {
  assert(process.argv.length === 2 || process.argv.length === 3, "Pass only the local psql executable path");
  const executable = process.argv[2] ?? (process.env.P03_PG_BIN
    ? path.join(process.env.P03_PG_BIN, process.platform === "win32" ? "psql.exe" : "psql") : null);
  assert(executable, "Provide the local psql path or P03_PG_BIN");
  return executable;
}

// Every local rehearsal connection pins loopback and a separate cluster port.
// No inherited database URLs, PGSERVICE, PGHOSTADDR, credentials or application
// secrets can redirect this runner to a hosted resource.
export function localClient(psql, { port = 56623, database = "p03_rehearsal" } = {}) {
  assert(psql && Number.isInteger(port) && port > 1024 && port < 65536);
  assert(/^p03_[a-z0-9_]+$/.test(database));
  const processes = new Set();
  function start(sql, { db = database, interactive = false, app = "p03-local-rehearsal" } = {}) {
    assert(db === "postgres" || /^p03_[a-z0-9_]+$/.test(db));
    const child = spawn(psql, ["-X", "-w", "-qAt", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose",
      "-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-d", db], {
      windowsHide: true, stdio: ["pipe", "pipe", "pipe"],
      env: { SystemRoot: process.env.SystemRoot, PATH: process.env.PATH, TEMP: process.env.TEMP, TMP: process.env.TMP,
        PGCONNECT_TIMEOUT: "5", PGAPPNAME: app,
        PGOPTIONS: "-c lock_timeout=2000 -c statement_timeout=60000 -c idle_in_transaction_session_timeout=60000" },
    });
    const request = { child, stdout: "", stderr: "", done: null };
    processes.add(request);
    child.stdout.on("data", (data) => { request.stdout += data; });
    child.stderr.on("data", (data) => { request.stderr += data; });
    child.stdin.on("error", () => undefined);
    request.done = new Promise((resolve) => {
      const timer = setTimeout(() => child.kill(), 180000);
      child.on("error", (error) => { request.stderr += error.message; });
      child.on("close", (code) => { clearTimeout(timer); processes.delete(request); resolve({ code, stdout: request.stdout.trim(), stderr: request.stderr.trim() }); });
    });
    child.stdin.write(sql + "\n");
    if (!interactive) child.stdin.end();
    return request;
  }
  async function run(sql, options) {
    const result = await start(sql, options).done;
    assert.equal(result.code, 0, result.stderr);
    return result.stdout;
  }
  return { start, run, processes, database, port };
}
