import { readdirSync, readFileSync, lstatSync } from "node:fs";
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

export function scanText(file, source) {
  const findings = [];
  source.split(/\r?\n/).forEach((line, index) => {
    for (const [rule, pattern] of patterns) {
      if (!pattern.test(line)) continue;
      if (file === "lib/p03-preview-safety.ts" && rule === "staging-reference" && line.trim() === 'const STAGING_REF = "zzbnneprhjicmajpjkdg";') continue;
      if (file === "lib/p03-preview-safety.ts" && rule === "clerk-test-key" && /^\s*if \(!\/\^(pk|sk)_test_/.test(line)) continue;
      if (file === ".github/workflows/ci.yml" && rule === "clerk-test-key" && /^\s*(CLERK_SECRET_KEY: sk_test_not-a-real-secret|NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: pk_test_Y2xlcmsudGVzdCQ=)\s*$/.test(line)) continue;
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
  return { verdict: findings.length ? "STOP" : "PASS", findings, productionMutated: false, exceptions: "Only exact existing Preview guard lines and exact non-secret CI placeholders are allowed. Tests/docs/read-only release tooling are outside deployable scope." };
}
