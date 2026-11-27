import { readdirSync, readFileSync, lstatSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

export const SOURCE_ROOTS = ["app", "components", "lib", "content", "public", "workers", ".github", ".env.example", "next.config.ts", "package.json", "package-lock.json"];
const patterns = [
  ["staging-reference", /zzbnneprhjicmajpjkdg/i],
  ["fixture-identity", /Test(?:Academy|Challenge|Main|Pro)|staging[-_]synthetic|staging_badge_cross_division|STAGING_SYNTHETIC/i],
  ["fixture-credential", /(?:fixture|test(?:academy|challenge|main|pro))[^\r\n]{0,50}(?:password|secret)|(?:password|secret)[^\r\n]{0,50}(?:fixture|test(?:academy|challenge|main|pro))/i],
  ["embedded-identity", /["'][0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}["']|\buser_[A-Za-z0-9]{10,}\b|\b[0-9]{17}\b/i],
  ["runtime-tooling-import", /(?:from\s*|import\s*\(|require\s*\()["'](?:@\/|(?:\.\.\/)+)(?:tests|scripts)\//],
  ["clerk-test-key", /(?:pk|sk)_test_/],
  ["embedded-secret", /(?:sk_live_|sb_secret_)[A-Za-z0-9_-]{12,}|eyJhbGciOi[A-Za-z0-9_-]{30,}/],
  ["provider-endpoint", /https?:\/\/[^\s"'<>]*(?:workers\.dev|r2\.dev|r2\.cloudflarestorage\.com)/i],
  ["staging-legal-url", /https?:\/\/[^\s"'<>]*(?:staging|preview)[^\s"'<>]*(?:legal|rulebook|privacy|participation)/i],
];

const PRODUCTION_MEDIA_ORIGIN = "https://ironclad-production-combat-highlights.ironclad-website.workers.dev";
const reviewedRenderAssets = {
  "public/mascot-v6/assets/interaction.json": "54e9472477d5a0067125bfd4de1396982bafbf45d3a39271f97e86f48b171fc8",
  "public/mascot-v6/vendor/build/three.module.min.js": "e2b5ee6bccd38fd6d8a2428546b83c5f2426d84b152ef82be8055556e3b40eb6",
};
const reviewedStageLines = [
  ["lib/caster/environment.ts", "staging-reference", 'const STAGING_SUPABASE_REF = "zzbnneprhjicmajpjkdg";'],
  ["lib/caster/environment.ts", "clerk-test-key", '!publishableKey?.startsWith("pk_test_") || !environment.CLERK_SECRET_KEY?.startsWith("sk_test_") ||'],
  ["lib/ready/review-access.ts", "staging-reference", 'environment.NEXT_PUBLIC_SUPABASE_URL?.replace(/\\/$/, "") === "https://zzbnneprhjicmajpjkdg.supabase.co" &&'],
  ["lib/ready/review-access.ts", "clerk-test-key", 'environment.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_test_") === true &&'],
  ["lib/ready/review-access.ts", "clerk-test-key", 'environment.CLERK_SECRET_KEY?.startsWith("sk_test_") === true;'],
  ["lib/ready/review-access.ts", "fixture-identity", '.split(",").map((value) => value.trim()).filter((value) => /^TestAcademy[1-4]$/.test(value));'],
  ["lib/ready/review-access.ts", "fixture-identity", 'metadata.ironclad_fixture_source === "staging_synthetic_uat" &&'],
  ["lib/ready/review-access.ts", "fixture-identity", 'metadata.ironclad_fixture_contract_version === "staging-synthetic-v1" &&'],
  ["lib/ready/usage.ts", "staging-reference", 'environment.NEXT_PUBLIC_SUPABASE_URL?.replace(/\\/$/, "") !== "https://zzbnneprhjicmajpjkdg.supabase.co") return null;'],
  ["lib/wardrobe/access.ts", "fixture-identity", 'user.privateMetadata.ironclad_fixture_source !== "staging_synthetic_uat" ||'],
];
function dedicatedProductionWorker(source) {
  try {
    // The reviewed deployment file has whole-line comments only. Reject any
    // unparseable representation rather than accepting a broad hostname rule.
    const config = JSON.parse(source.replace(/^\s*\/\/.*$/gm, ""));
    const expectedKeys = ["$schema", "name", "account_id", "main", "compatibility_date", "workers_dev", "preview_urls", "r2_buckets", "vars", "observability"].sort();
    return JSON.stringify(Object.keys(config).sort()) === JSON.stringify(expectedKeys) &&
      config.name === "ironclad-production-combat-highlights" &&
      config.account_id === "cbe0a3809d7429e07e97e3795803182b" && config.main === "src/index.ts" &&
      config.workers_dev === true && config.preview_urls === false &&
      JSON.stringify(config.r2_buckets) === JSON.stringify([{ binding: "MEDIA", bucket_name: "ironclad-production-combat-highlights" }]) &&
      JSON.stringify(Object.keys(config.vars).sort()) === JSON.stringify(["DEPLOYMENT_ENV", "ENABLED", "SUPABASE_URL", "MEDIA_ORIGIN", "ALLOWED_ORIGINS"].sort()) &&
      config.vars.DEPLOYMENT_ENV === "production" && config.vars.ENABLED === "false" &&
      config.vars.SUPABASE_URL === "https://nsyjtqpvyxlzyujlbzos.supabase.co" &&
      config.vars.MEDIA_ORIGIN === PRODUCTION_MEDIA_ORIGIN &&
      config.vars.ALLOWED_ORIGINS === "https://ironcladtournaments.com,https://www.ironcladtournaments.com" &&
      config.observability?.enabled === false;
  } catch { return false; }
}

export function scanText(file, source) {
  const findings = [];
  const knownRenderNumbers = Object.hasOwn(reviewedRenderAssets, file) &&
    createHash("sha256").update(source.replaceAll("\r\n", "\n")).digest("hex") === reviewedRenderAssets[file];
  source.split(/\r?\n/).forEach((line, index) => {
    for (const [rule, pattern] of patterns) {
      if (!pattern.test(line)) continue;
      if (rule === "embedded-identity" && knownRenderNumbers) continue;
      if (reviewedStageLines.some(([path, name, expected]) => path === file && name === rule && line.trim() === expected)) continue;
      if (file === "lib/p03-preview-safety.ts" && rule === "staging-reference" && line.trim() === 'const STAGING_REF = "zzbnneprhjicmajpjkdg";') continue;
      if (file === "lib/p03-preview-safety.ts" && rule === "clerk-test-key" && /^\s*if \(!\/\^(pk|sk)_test_/.test(line)) continue;
      if (file === ".github/workflows/ci.yml" && rule === "clerk-test-key" && /^\s*(CLERK_SECRET_KEY: sk_test_not-a-real-secret|NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: pk_test_Y2xlcmsudGVzdCQ=)\s*$/.test(line)) continue;
      if (file === "workers/combat-highlights/wrangler.jsonc" && rule === "provider-endpoint" &&
          line.trim() === `"MEDIA_ORIGIN": "${PRODUCTION_MEDIA_ORIGIN}",` && dedicatedProductionWorker(source)) continue;
      // Never return the matching text, credential, endpoint or identity.
      findings.push({ file, line: index + 1, rule });
    }
  });
  return findings;
}

export function checkSource(root) {
  const findings = [];
  const inspect = (relative) => {
    const absolute = path.join(root, relative);
    let stat;
    try { stat = lstatSync(absolute); } catch { findings.push({ file: relative, rule: "required-source-missing" }); return; }
    if (stat.isSymbolicLink()) { findings.push({ file: relative, rule: "source-symlink-forbidden" }); return; }
    if (stat.isDirectory()) for (const name of readdirSync(absolute).sort()) inspect(`${relative}/${name}`);
    else if (/\.(?:[cm]?[jt]sx?|jsonc?|html|ya?ml|toml|svg|txt)$/.test(relative) || relative === ".env.example") findings.push(...scanText(relative, readFileSync(absolute, "utf8")));
  };
  SOURCE_ROOTS.forEach(inspect);
  return { verdict: findings.length ? "STOP" : "PASS", findings, productionMutated: false, exceptions: "Only exact Preview guard lines, pinned Ready renderer asset numbers, non-secret CI placeholders and the complete reviewed disabled dedicated Production Worker contract are allowed. Tests/docs/read-only release tooling are outside deployable scope." };
}
