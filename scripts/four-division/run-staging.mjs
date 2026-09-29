// Keeps authorized development credentials in the existing private source.
// Never copies them to this worktree or sends them to a different project.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { spawn } from "node:child_process";
import path from "node:path";

const [source, command, port = "3104"] = process.argv.slice(2);
assert(source && ["build", "dev", "start"].includes(command));
assert(/^[0-9]{4,5}$/.test(port) && Number(port) > 1024 && Number(port) <= 65535);
const environment = parseEnv(readFileSync(source, "utf8"));
assert.equal(environment.NEXT_PUBLIC_SUPABASE_URL, "https://zzbnneprhjicmajpjkdg.supabase.co");
assert(environment.CLERK_SECRET_KEY?.startsWith("sk_test_"));
assert(environment.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_test_"));
assert.equal(Buffer.from(environment.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.slice(8), "base64").toString(), "guided-goshawk-34.clerk.accounts.dev$");
const npm = path.join(path.dirname(process.execPath), "node_modules/npm/bin/npm-cli.js");
const child = spawn(process.execPath, [npm, "run", command, ...(command === "build" ? [] : ["--", "--hostname", "127.0.0.1", "--port", port])], {
  windowsHide: true,
  stdio: "inherit",
  env: { ...process.env, ...environment },
});
child.on("error", () => { console.error("Staging process could not start"); process.exitCode = 1; });
child.on("exit", (code) => { process.exitCode = code ?? 1; });
