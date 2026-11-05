// ROOT REVIEW BEFORE EXECUTION. Fixed, anonymous GETs on reviewed Staging only.
// No application env files, tokens, browser state or credentials are read here.
// The official CLI may use its existing login/automation access; it must not
// create credentials, link a project, pull env, follow redirects or deploy.
// Run from C:/Users/pc/Documents/ChatGPT/Website:
// node ironclad-patch2-review-performance/scripts/patch2/staging-review-benchmark.mjs --phase before
// AFTER is deliberately unavailable until root reviews and pins a target below:
// node .../staging-review-benchmark.mjs --phase after --deployment <reviewed-id>
import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { lstat, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CLI_CWD = "C:/Users/pc/Documents/ChatGPT/Website";
const REVIEW_WORKTREE = `${CLI_CWD}/ironclad-patch2-review-performance`;
const VERCEL_CLI = "C:/Users/pc/AppData/Local/npm-cache/_npx/0da89b8b7bd584d8/node_modules/vercel/dist/index.js";
const GIT = "C:/Program Files/Git/cmd/git.exe";
const SCOPE = "ironclad-tournaments";
const STAGING_DATABASE = "zzbnneprhjicmajpjkdg";
const BASELINE = Object.freeze({
  deployment: "dpl_HPFjyQyVYW8jQdoZ1gP5wD4EfAwx",
  origin: "https://ironclad-website-ad5nqzdyt-ironclad-tournaments.vercel.app",
  commit: "40fa3fa8bf611d2f2c9708fb160fe49477858e91",
  configuredRegions: ["iad1"],
});
// Add ONLY an independently reviewed immutable Staging deployment here, after
// checking its commit, Preview target and exact Staging database binding.
// No arbitrary URL, project, branch, path, sample count or output argument exists.
const AFTER_TARGETS = Object.freeze([]);
const ROUTES = Object.freeze([
  { path: "/tournaments", title: /tournaments?/i },
  { path: "/rankings", title: /rankings?/i },
  { path: "/players", title: /players?/i },
]);
// Generic anonymous HTTP GET: Clerk Development intentionally handles a real
// browser document via a separate handshake. No cookies/tokens are extracted or
// redirects followed; public server rendering remains signed out.
const HEADERS = Object.freeze({ Accept: "*/*", "Accept-Language": "en" });
const WARM_SAMPLES = 10;
const MAX_BODY = 8 * 1024 * 1024;
const MAX_CAPTURE = MAX_BODY + 512 * 1024;
const SAFE_HEADERS = new Set(["cache-control", "x-vercel-cache", "x-vercel-id", "age"]);
const samples = [];
let phase, target, sourceHash, step = "arguments", failed = false, reportPath = null, reportEligible = false, transportFailure = null, responseDiagnostic = null;

function requireCheck(ok, label) {
  step = label;
  if (!ok) throw new Error("BENCHMARK_CHECK_FAILED");
}

function parseArguments(tokens) {
  const args = {};
  for (let index = 0; index < tokens.length; index += 2) {
    const key = tokens[index], value = tokens[index + 1];
    requireCheck(["--phase", "--deployment"].includes(key) && typeof value === "string" &&
      !value.startsWith("--") && !Object.hasOwn(args, key), "explicit supported arguments");
    args[key] = value;
  }
  requireCheck(["before", "after"].includes(args["--phase"]), "before or after phase required");
  phase = args["--phase"];
  if (phase === "before") {
    requireCheck(args["--deployment"] === undefined || args["--deployment"] === BASELINE.deployment,
      "before uses only the fixed baseline");
    return BASELINE;
  }
  const reviewed = AFTER_TARGETS.filter((entry) => entry.deployment === args["--deployment"]);
  requireCheck(reviewed.length === 1, "after requires an explicitly pinned reviewed target");
  const entry = reviewed[0];
  requireCheck(/^dpl_[A-Za-z0-9]+$/.test(entry.deployment) && entry.deployment !== BASELINE.deployment &&
    /^[a-f0-9]{40}$/.test(entry.commit) &&
    /^https:\/\/ironclad-website-[a-z0-9]+-ironclad-tournaments\.vercel\.app$/.test(entry.origin) &&
    entry.origin !== BASELINE.origin && entry.configuredRegions?.length === 1 &&
    entry.configuredRegions[0] === "hnd1", "after is only a separately reviewed Tokyo Staging target");
  return entry;
}

async function absent(path, label) {
  let exists = false;
  try { await lstat(path); exists = true; }
  catch (error) { if (error.code !== "ENOENT") throw new Error("METADATA_CHECK_FAILED"); }
  requireCheck(!exists, label);
}

function osEnvironment() {
  const env = {};
  for (const key of ["SystemRoot", "SYSTEMROOT", "WINDIR", "COMSPEC", "PATHEXT", "TEMP", "TMP",
    "APPDATA", "LOCALAPPDATA", "USERPROFILE", "HOMEDRIVE", "HOMEPATH", "HOME"]) {
    if (typeof process.env[key] === "string") env[key] = process.env[key];
  }
  // The CLI itself uses process.execPath; its only required child here is native
  // Windows curl. Restrict its PATH instead of inheriting application tooling.
  const systemRoot = process.env.SystemRoot ?? process.env.SYSTEMROOT;
  requireCheck(typeof systemRoot === "string" && /^[A-Za-z]:[\\/]/.test(systemRoot), "known Windows system directory");
  env.PATH = resolve(systemRoot, "System32");
  return { ...env, CI: "1", NO_COLOR: "1", VERCEL_TELEMETRY_DISABLED: "1" };
}

async function assertLocalTransport() {
  requireCheck((await realpath(process.cwd())).toLowerCase() === (await realpath(CLI_CWD)).toLowerCase(),
    "launch only from the reviewed unlinked parent directory");
  for (let ancestor = CLI_CWD; ; ancestor = dirname(ancestor)) {
    await absent(resolve(ancestor, ".vercel", "project.json"), "no Vercel project binding");
    await absent(resolve(ancestor, ".vercel", "repo.json"), "no Vercel repository binding");
    if (dirname(ancestor) === ancestor) break;
  }
  await absent(resolve(CLI_CWD, ".vercel"), "unlinked CLI working directory");
  const manifest = JSON.parse(await readFile(resolve(dirname(VERCEL_CLI), "..", "package.json"), "utf8"));
  requireCheck(manifest.name === "vercel" && manifest.version === "59.3.0", "exact reviewed existing CLI59.3");
  const env = osEnvironment(), nativeCurl = resolve(env.PATH, "curl.exe");
  requireCheck((await lstat(nativeCurl)).isFile(), "native System32 curl exists");
  // curl may search the executable directory as well as profile directories.
  // Check metadata only. Never read, modify or bypass an existing curl config.
  const configDirectories = new Set([CLI_CWD, dirname(nativeCurl), env.HOME, env.USERPROFILE, env.APPDATA].filter(Boolean));
  for (const directory of configDirectories) {
    await absent(resolve(directory, ".curlrc"), "default curl config absent");
    await absent(resolve(directory, "_curlrc"), "default Windows curl config absent");
  }
  await absent(resolve(CLI_CWD, "curl.exe"), "no working-directory curl shadow");
  await absent(resolve(dirname(process.execPath), "curl.exe"), "no Node-directory curl shadow");
  return env;
}

function readResponse(output, marker, route) {
  requireCheck(Buffer.isBuffer(output) && output.length <= MAX_CAPTURE, "bounded binary response capture");
  const markerAt = output.lastIndexOf(Buffer.from(marker));
  requireCheck(markerAt > 0, "unique timing trailer present");
  const trailer = output.subarray(markerAt + Buffer.byteLength(marker)).toString("utf8");
  const match = /^([1-5][0-9]{2})\t([0-9]+(?:\.[0-9]+)?)\t([0-9]+(?:\.[0-9]+)?)\t([0-9]+)\t(\S+)\n$/.exec(trailer);
  requireCheck(match !== null && match[5] === `${target.origin}${route.path}`, "exact immutable Staging URL reached");
  const status = Number(match[1]), ttfb = Number(match[2]), total = Number(match[3]), bytes = Number(match[4]);
  // Native curl seconds and byte count only. Capture before validation so a
  // redirect/error cannot be confused with a local CLI transport failure.
  responseDiagnostic = { status, ttfb: Number.isFinite(ttfb) ? ttfb : null,
    total: Number.isFinite(total) ? total : null, bytes: Number.isSafeInteger(bytes) ? bytes : null };
  const wire = output.subarray(0, markerAt);
  let offset = 0, headers = {}, contentType = "", headerStatus = 0, redirect = null;
  while (true) {
    let end = wire.indexOf(Buffer.from("\r\n\r\n"), offset), separator = 4;
    const alternate = wire.indexOf(Buffer.from("\n\n"), offset);
    if (end < 0 || (alternate >= 0 && alternate < end)) { end = alternate; separator = 2; }
    requireCheck(end >= offset && end - offset <= 64 * 1024, "bounded response header block");
    const lines = wire.subarray(offset, end).toString("latin1").split(/\r?\n/);
    const statusLine = /^HTTP\/[0-9]+(?:\.[0-9]+)? ([1-5][0-9]{2})(?:\s.*)?$/.exec(lines[0]);
    requireCheck(statusLine !== null && lines.length <= 200, "actual HTTP status and bounded header count");
    headerStatus = Number(statusLine[1]);
    offset = end + separator;
    if (headerStatus >= 100 && headerStatus < 200) continue;
    headers = {};
    for (const line of lines.slice(1)) {
      const colon = line.indexOf(":");
      requireCheck(colon > 0 && line.length <= 16 * 1024, "valid bounded HTTP header");
      const key = line.slice(0, colon).toLowerCase(), value = line.slice(colon + 1).trim();
      if (key === "content-type") contentType = value;
      if (key === "location" && status >= 300 && status < 400) {
        const destination = new URL(value, target.origin);
        redirect = {
          origin: destination.origin === target.origin ? "same-staging-origin"
            : destination.origin === "https://guided-goshawk-34.clerk.accounts.dev" || destination.origin === "https://guided-goshawk-34.accounts.dev" ? "configured-clerk-development-origin"
              : destination.origin === "https://vercel.com" ? "vercel-origin" : "other-origin",
          clerkHandshake: Array.from(destination.searchParams.keys()).some(key => key.startsWith("__clerk")),
        };
      }
      if (SAFE_HEADERS.has(key)) headers[key] = headers[key] ? `${headers[key]}, ${value}` : value;
    }
    break;
  }
  const body = wire.subarray(offset);
  responseDiagnostic = { ...responseDiagnostic, redirect };
  requireCheck(status === 200 && Number.isFinite(ttfb) && total >= ttfb && Number.isSafeInteger(bytes) && bytes <= MAX_BODY,
    "successful bounded GET with valid native curl timings");
  requireCheck(headerStatus === status && body.length === bytes && body.length <= MAX_BODY,
    "headers trailer and complete response bytes agree");
  requireCheck(/^text\/html(?:;|$)/i.test(contentType), "HTML response required");
  const html = body.toString("utf8"), title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "";
  requireCheck(/ironclad/i.test(title) && route.title.test(title) && /<html(?:\s|>)/i.test(html),
    "expected IronClad page title and HTML");
  requireCheck(!/\b(?:error|not found|authentication required)\b/i.test(title) &&
    !/id=["']__next_error__["']/i.test(html) &&
    !/<h[12][^>]*>\s*(?:Application error|Internal Server Error|Service Unavailable)/i.test(html),
    "no SSO or application error page counted");
  // No HTML, title text, cookies, tokens or raw headers leave this function.
  return {
    status, ttfbMs: ttfb * 1000, totalMs: total * 1000, bytes,
    headers, observedRequestRegions: (headers["x-vercel-id"] ?? "").split("::").filter((part) => /^[a-z]{3}[0-9]$/.test(part)),
    semanticValidation: true,
  };
}

function classifyPrivateTransportError(error) {
  // Inspect only a bounded private stderr buffer. Return an enum and numeric
  // exit status, never native messages, arguments, headers, stdout or tokens.
  const stderr = Buffer.isBuffer(error?.stderr) ? error.stderr.subarray(0, 64 * 1024).toString("utf8")
    : typeof error?.stderr === "string" ? error.stderr.slice(0, 64 * 1024) : "";
  let category = "other";
  if (/curl:\s*(?:option[^\r\n]{0,160}(?:unknown|unrecognized|not supported)|[^\r\n]{0,160}(?:unknown|unrecognized)\s+option)/i.test(stderr)) {
    category = "unknownCurlOption";
  } else if (error?.code === "ENOENT" || /curl command not found|spawn (?:curl|git|node)(?:\.exe)? ENOENT|(?:curl|git|node)(?:\.exe)?[^\r\n]{0,40}is not recognized/i.test(stderr)) {
    category = "missingChildExecutable";
  } else if (/no existing credentials|not authenticated|authentication required|authorization required|not authorized|invalid token|login required|please (?:log|sign) in|deployment protection|\bSSO\b/i.test(stderr)) {
    category = "protectionAuth";
  } else if (["ETIMEDOUT", "ECONNRESET", "ENOTFOUND"].includes(error?.code) || error?.status === 28 ||
    /certificate|\bschannel\b|SSL connect error|could not resolve|couldn't resolve|failed to connect|could not connect|operation timed out|connection reset|recv failure|send failure|ENOTFOUND|ECONNRESET|ETIMEDOUT/i.test(stderr)) {
    category = "networkCertificate";
  }
  return { category, exitCode: Number.isInteger(error?.status) && error.status >= 0 && error.status <= 65535 ? error.status : null };
}

async function requestSample(route) {
  transportFailure = null;
  responseDiagnostic = null;
  const env = await assertLocalTransport();
  const marker = `\nPATCH2_HTTP_TIMING_${randomBytes(16).toString("hex")}:`;
  let output;
  try {
    // CLI59.3 explicit deployment + unlinked cwd keeps createIfMissing=false.
    // Existing configured automation access only; never --yes/link/env/trace.
    step = `${route.path} private CLI GET transport`;
    output = execFileSync(process.execPath, [VERCEL_CLI, "curl", route.path,
      "--deployment", target.deployment, "--scope", SCOPE, "--",
      "--silent", "--show-error", "--request", "GET", "--proto", "=https",
      "--max-time", "30", "--max-filesize", String(MAX_BODY), "--max-redirs", "0",
      "--include", "--suppress-connect-headers", "--header", "@-",
      "--write-out", `${marker}%{http_code}\t%{time_starttransfer}\t%{time_total}\t%{size_download}\t%{url_effective}\n`,
    ], { cwd: CLI_CWD, env, input: Buffer.from(Object.entries(HEADERS).map(([key, value]) => `${key}: ${value}`).join("\n") + "\n"),
      encoding: "buffer", maxBuffer: MAX_CAPTURE, timeout: 60_000, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
  } catch (error) {
    // Native/CLI errors can contain automation headers. Do not print them.
    transportFailure = classifyPrivateTransportError(error);
    throw new Error("PRIVATE_TRANSPORT_FAILURE");
  }
  await assertLocalTransport();
  return readResponse(output, marker, route);
}

function statistics(values) {
  const sorted = [...values].sort((left, right) => left - right), count = sorted.length;
  if (count === 0) return null;
  return { count, min: sorted[0], p50: count % 2 ? sorted[(count - 1) / 2] : (sorted[count / 2 - 1] + sorted[count / 2]) / 2,
    p95: sorted[Math.ceil(count * 0.95) - 1], max: sorted[count - 1] };
}

const startedAt = new Date().toISOString();
try {
  target = parseArguments(process.argv.slice(2));
  await assertLocalTransport();
  requireCheck((await realpath(dirname(dirname(dirname(fileURLToPath(import.meta.url)))))).toLowerCase() ===
    (await realpath(REVIEW_WORKTREE)).toLowerCase(), "helper belongs only to the reviewed isolated worktree");
  sourceHash = createHash("sha256").update(await readFile(fileURLToPath(import.meta.url))).digest("hex");
  // Local ignore check only. This invokes no remote, credential helper or hook.
  execFileSync(GIT, ["-c", `safe.directory=${REVIEW_WORKTREE}`, "-C", REVIEW_WORKTREE, "check-ignore", "--quiet", "--", ".release-local/staging-review-benchmark.json"],
    { env: osEnvironment(), stdio: ["ignore", "pipe", "pipe"], timeout: 5000, windowsHide: true });
  reportEligible = true;
  for (const route of ROUTES) {
    for (let index = 0; index <= WARM_SAMPLES; index++) {
      step = `${route.path} ${index === 0 ? "first observation" : `warm ${index}`}`;
      const observation = await requestSample(route);
      const sample = { path: route.path, kind: index === 0 ? "first-observation" : "serial-warm", index,
        observedAt: new Date().toISOString(), ...observation };
      samples.push(sample);
      console.log(JSON.stringify({ event: "validated-sample", phase, path: sample.path, kind: sample.kind, index,
        status: sample.status, ttfbMs: sample.ttfbMs, totalMs: sample.totalMs, bytes: sample.bytes }));
    }
  }
  requireCheck(samples.length === ROUTES.length * (WARM_SAMPLES + 1), "all thirty-three GET observations validated");
} catch {
  failed = true;
} finally {
  const aggregate = ROUTES.map((route) => {
    const selected = samples.filter((sample) => sample.path === route.path && sample.kind === "serial-warm");
    return { path: route.path, ttfbMs: statistics(selected.map((sample) => sample.ttfbMs)),
      totalMs: statistics(selected.map((sample) => sample.totalMs)), bytes: statistics(selected.map((sample) => sample.bytes)) };
  });
  const report = {
    result: failed ? "FAILED" : "PASS", failedCheck: failed ? step : null, transportFailure, responseDiagnostic,
    phase: phase ?? null, target: target ?? null, helperSha256: sourceHash ?? null, startedAt, finishedAt: new Date().toISOString(),
    plan: { method: "GET", headers: HEADERS, paths: ROUTES.map((route) => route.path), firstObservationsPerRoute: 1,
      serialWarmSamplesPerRoute: WARM_SAMPLES, maximumBodyBytes: MAX_BODY, expectedDatabaseProject: STAGING_DATABASE,
      backendBindingEvidence: "Root must independently verify the pinned deployment's Staging configuration; these GET timings do not prove that binding." },
    limitations: ["Ten warm samples give descriptive p50/p95 only; nearest-rank p95 is the observed maximum.",
      "First observation is not claimed to be an infrastructure cold start.",
      "Native curl timing excludes CLI startup/auth/project lookup; it measures HTTP TTFB and complete HTML transfer, not browser paint or click latency.",
      "Generic anonymous Accept:*/* GETs exercise signed-out public rendering, not Clerk Development document-handshake time or authenticated player queries.",
      "Region and code changes have combined effects unless separately controlled.",
      "x-vercel-id region components may describe ingress and execution; they do not independently prove the function region.",
      "Machine, locale, access method, database and fixture state must stay comparable between runs."],
    aggregate, samples,
  };
  if (reportEligible) {
    try {
      // Destination is ignored by the existing local Git exclusion; never overwrite
      // earlier evidence. No response body or arbitrary headers are persisted.
      const directory = resolve(REVIEW_WORKTREE, ".release-local");
      await mkdir(directory, { recursive: true });
      requireCheck((await realpath(directory)).toLowerCase() ===
        resolve(await realpath(REVIEW_WORKTREE), ".release-local").toLowerCase(), "report remains inside the reviewed worktree");
      reportPath = resolve(directory, `staging-review-http-${phase}-${startedAt.replace(/[^0-9TZ]/g, "")}-${randomBytes(3).toString("hex")}.json`);
      await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n", { encoding: "utf8", flag: "wx" });
    } catch { failed = true; reportPath = null; }
  }
  console.log(JSON.stringify({ result: failed ? "FAILED" : "PASS", phase: phase ?? null, validatedObservations: samples.length,
    warmSamplesPerRoute: WARM_SAMPLES, aggregate, reportPath, transportFailure, responseDiagnostic, noApplicationOrDatabaseWrites: true,
    noNewCredentialOrDeploymentProtectionChange: true, browserTiming: false }));
  if (failed) process.exitCode = 1;
}
