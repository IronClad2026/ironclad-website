// Provision only the Phase B Preview branch and disabled Staging Worker.
// Values stay in this process and child stdin. Never print environment values,
// credentials, request bodies, CLI error bodies, or generated signing keys.
import { generateKeyPairSync } from "node:crypto";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const [vercelCli, wranglerCli] = process.argv.slice(2);
const project = "prj_5os8tdLLkgGUSWnrxpiYj6OI6YEB";
const branch = "codex/player-showcase-phase-b-combat-highlights";
const config = resolve("workers/combat-highlights/wrangler.jsonc");
if (!vercelCli || !wranglerCli) throw new Error("Pass the installed Vercel and Wrangler CLI entry points.");
// Obtain this public key from the connected Supabase API for the verified Staging
// project. Existing Vercel authentication/database Secrets are write-only and are
// inherited by Preview deployments; they are never copied or downgraded here.
const publishableKey = process.env.COMBAT_HIGHLIGHTS_WORKER_PUBLISHABLE_INPUT;
delete process.env.COMBAT_HIGHLIGHTS_WORKER_PUBLISHABLE_INPUT;
if (!publishableKey || !/^sb_publishable_[A-Za-z0-9_-]{16,}$/.test(publishableKey)) throw new Error("An enabled Staging publishable key is required.");

function run(entry, args, input) {
  const result = spawnSync(process.execPath, [entry, ...args], { input, encoding: "utf8", timeout: 60000, maxBuffer: 4 * 1024 * 1024, windowsHide: true, env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: "cbe0a3809d7429e07e97e3795803182b" } });
  if (result.error || result.status !== 0) throw new Error("Configuration operation failed. No response or secret values have been printed.");
  return result.stdout;
}
const records = JSON.parse(run(vercelCli, ["api", "/v3/env/pull/" + project + "/preview/staging?source=vercel-cli:env:run", "--scope", "ironclad-tournaments", "--method", "GET", "--raw"]));
const legal = records.env;
for (const key of ["PREVIEW_LEGAL_DOCUMENT_ORIGIN", "PREVIEW_LEGAL_DOCUMENT_ORIGINS"]) if (typeof legal?.[key] !== "string" || !legal[key]) throw new Error("Required normal Staging legal setting is absent: " + key);
const pair = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const variables = [
  ["COMBAT_HIGHLIGHTS_WORKER_URL", "https://ironclad-staging-combat-highlights.ironclad-website.workers.dev", "encrypted"],
  ["COMBAT_HIGHLIGHTS_SIGNING_PRIVATE_JWK", JSON.stringify(pair.privateKey.export({ format: "jwk" })), "sensitive"],
  ["COMBAT_HIGHLIGHTS_ALLOWED_ORIGINS", "", "encrypted"],
  ["PREVIEW_LEGAL_DOCUMENT_ORIGIN", legal.PREVIEW_LEGAL_DOCUMENT_ORIGIN, "encrypted"],
  ["PREVIEW_LEGAL_DOCUMENT_ORIGINS", legal.PREVIEW_LEGAL_DOCUMENT_ORIGINS, "encrypted"],
];
for (const [key, value, type] of variables) {
  run(vercelCli, ["api", "/v10/projects/" + project + "/env", "--scope", "ironclad-tournaments", "--method", "POST", "--input", "-", "--silent"], JSON.stringify({ key, value, type, target: ["preview"], gitBranch: branch }));
  process.stdout.write("Configured Preview key: " + key + "\n");
}
run(wranglerCli, ["secret", "put", "SIGNING_PUBLIC_JWK", "--config", config], JSON.stringify(pair.publicKey.export({ format: "jwk" })));
process.stdout.write("Configured Staging Worker public verification key.\n");
run(wranglerCli, ["secret", "put", "SUPABASE_PUBLISHABLE_KEY", "--config", config], publishableKey);
process.stdout.write("Configured Staging Worker publishable key. Worker remains disabled.\n");
