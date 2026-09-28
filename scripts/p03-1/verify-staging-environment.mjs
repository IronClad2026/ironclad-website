// Read-only by default; optional copy of two non-secret legal origins to the
// exact feature Preview branch. Never print secret values or API bodies.
import { spawnSync } from "node:child_process";

const cli = process.argv[2];
if (!cli) throw new Error("Pass the installed Vercel CLI entry point.");
const project = "prj_5os8tdLLkgGUSWnrxpiYj6OI6YEB";
function api(path, body) {
  const result = spawnSync(process.execPath, [cli, "api", path, "--scope", "ironclad-tournaments", "--method", body ? "POST" : "GET", "--raw", ...(body ? ["--input", "-"] : [])], {
    encoding: "utf8", windowsHide: true, timeout: 60000, maxBuffer: 8 * 1024 * 1024,
    input: body ? JSON.stringify(body) : undefined,
  });
  if (result.status !== 0) {
    const reason = result.stderr.split("\n").find((line) => line.startsWith("Error:")) ?? "No safe error summary";
    throw new Error(`Vercel operation failed: ${reason.replace(/https?:\/\/\S+/g, "[URL]")}`);
  }
  return JSON.parse(result.stdout);
}
const configuration = api(`/v9/projects/${project}`);
if (configuration.id !== project || configuration.link?.productionBranch !== "master") {
  throw new Error("Unexpected Vercel project/production-branch configuration.");
}
console.log("Verified project identity and production branch (read-only).");
let stagingEnvironment;
for (const branch of ["staging", "codex/p03-1-realtime-match-room"]) {
  const response = api(`/v3/env/pull/${project}/preview/${encodeURIComponent(branch)}?source=vercel-cli:env:run`);
  const env = response.env;
  if (!env) throw new Error(`${branch}: Preview environment unavailable.`);
  if (branch === "staging") stagingEnvironment = env;
  const keys = Object.keys(env).sort();
  console.log(JSON.stringify({ branch,
    stagingOrigin: env.NEXT_PUBLIC_SUPABASE_URL ? env.NEXT_PUBLIC_SUPABASE_URL.trim() === "https://zzbnneprhjicmajpjkdg.supabase.co" : "redacted",
    clerkTestMode: env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ? env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.startsWith("pk_test_") : "redacted",
    keys,
  }));
}
const records = api(`/v9/projects/${project}/env`);
console.log(JSON.stringify({ configuration: records.envs?.filter((row) => row.target?.includes("preview") &&
  (!row.gitBranch || ["staging", "codex/p03-1-realtime-match-room"].includes(row.gitBranch)))
  .map(({key, type, gitBranch}) => ({key, type, gitBranch})) }));
if (process.argv.includes("--configure-preview-legal")) {
  for (const key of ["PREVIEW_LEGAL_DOCUMENT_ORIGIN", "PREVIEW_LEGAL_DOCUMENT_ORIGINS"]) {
    const value = stagingEnvironment?.[key];
    if (typeof value !== "string" || !value) throw new Error(`Missing Staging configuration: ${key}`);
    const gitBranch = "codex/p03-1-realtime-match-room";
    if (records.envs.some((row) => row.key === key && row.gitBranch === gitBranch)) continue;
    api(`/v10/projects/${project}/env`, { key, value, gitBranch, target: ["preview"], type: "encrypted" });
    console.log(`Configured feature Preview key: ${key}`);
  }
}
