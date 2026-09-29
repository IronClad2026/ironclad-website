// Temporary, deployment-scoped access for explicitly authorized Staging browser UAT.
// Uses the signed-in Vercel CLI. No global bypass secret, token logs, or stored sessions.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

function api(endpoint, method = "GET", input) {
  const cli = process.env.FOUR_DIVISION_VERCEL_CLI;
  const config = process.env.FOUR_DIVISION_VERCEL_CONFIG;
  assert(cli && config, "Explicit existing Vercel CLI and config paths required");
  const args = [cli, "--global-config", config, "api", endpoint, "--scope", "ironclad-tournaments", "--method", method, "--raw"];
  if (input) args.push("--input", "-");
  const result = spawnSync(process.execPath, args, { input: input ? JSON.stringify(input) : undefined, encoding: "utf8", windowsHide: true, timeout: 60_000, maxBuffer: 8 * 1024 * 1024 });
  if (result.status !== 0) {
    const diagnostic = (result.stderr ?? "").split("\n").find((line) => line.startsWith("Error:")) ?? "Request failed";
    console.error(diagnostic.replace(/[A-Za-z0-9_-]{24,}/g, "[redacted]"));
    throw new Error("Preview access request failed; sensitive response suppressed");
  }
  return JSON.parse(result.stdout);
}

export function createPreviewAccess(origin) {
  assert.match(origin, /^https:\/\/ironclad-website-[a-z0-9]{9}-ironclad-tournaments\.vercel\.app$/);
  const deployment = api(`/v13/deployments/${new URL(origin).hostname}`);
  assert.equal(deployment.projectId, "prj_5os8tdLLkgGUSWnrxpiYj6OI6YEB");
  assert.equal(deployment.meta.githubCommitRef, "codex/four-division-main-pro-split");
  assert.notEqual(deployment.target, "production");
  assert.equal(deployment.readyState, "READY");
  assert.equal(`https://${deployment.url}`, origin);
  const grant = api(`/aliases/${deployment.id}/protection-bypass`, "PATCH", { ttl: 3600 });
  const candidates = Object.entries(grant.protectionBypass ?? grant).filter(([, value]) => value?.scope === "shareable-link");
  assert(candidates.length > 0, "Expected deployment-scoped share grant");
  const [secret] = candidates.sort((a, b) => (b[1].createdAt ?? 0) - (a[1].createdAt ?? 0))[0];
  assert(/^[A-Za-z0-9_-]+$/.test(secret));
  const share = new URL(origin);
  share.searchParams.set("_vercel_share", secret);
  return {
    origin,
    async authorize(context) {
      // Cookies remain inside this isolated browser context and are never exported.
      const page = await context.newPage();
      try {
        await new Promise((resolve) => setTimeout(resolve, 2500));
        const response = await page.goto(share.href, { waitUntil: "domcontentloaded", timeout: 45_000 });
        const target = new URL(page.url());
        if (target.origin !== origin || !response || response.status() >= 400) {
          console.error(JSON.stringify({ previewAccessStatus: response?.status(), finalOrigin: target.origin, finalPath: target.pathname }));
        }
        assert(target.origin === origin && response && response.status() < 400, "Temporary Preview access failed");
      } catch {
        // Playwright navigation errors can contain the private share query.
        throw new Error("Temporary Preview browser authorization failed; sensitive URL suppressed");
      } finally {
        await page.close();
      }
    },
    revoke() {
      api(`/aliases/${deployment.id}/protection-bypass`, "PATCH", { revoke: { secret, regenerate: false } });
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const access = createPreviewAccess(process.argv[2]);
  console.log(JSON.stringify({ origin: access.origin, temporaryDeploymentAccess: true, globalProtectionUnchanged: true }));
  access.revoke();
}
