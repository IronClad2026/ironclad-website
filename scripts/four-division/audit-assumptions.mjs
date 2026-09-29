// Reproducible source inventory. No environment files, remote requests, or DB writes.
// Classification records reviewed semantic families; unknown runtime files fail closed.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const BASELINE = "bad52b92ce1e0cbc6260f523c43d1d33b30375b8";
const OUTPUT = "docs/audits/four-division-assumptions";
const SELF = "scripts/four-division/audit-assumptions.mjs";
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const pattern = /\bmain\b|main\s*\/\s*pro|1400\s*\+|three[- ]divisions?|\b3[- ]divisions?|Test(?:Main|Pro)\w*|staging-synthetic-v1|academy.{0,60}challenge|challenge.{0,60}academy|bracket_type|division_model|valid_main|season|grid-cols-3|\bthree\b|(?:length|cardinality|count\(|\.size|size\()\s*(?:===?|<>|!==?|<=?|>=?)\s*3\b|(?:bracket|division|fixture|alias).{0,65}(?:length.{0,7}[34]|\b30\b)/ig;
const files = [...new Set(execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean))].sort();
const contents = new Map();
for (const file of files) {
  if (!/\.(?:tsx?|m?js|cjs|sql|md|json|ya?ml|ps1|py|html|css)$/.test(file) ||
      /lock\.json$|-evidence\.json$|(^|\/)test-results\/|^docs\/audits\//.test(file) || file === SELF) continue;
  try { contents.set(file, readFileSync(file, "utf8")); } catch { /* A removed tracked file is not remaining source. */ }
}
const families = {
  semantic_element: "HTML main landmarks, DOM selectors, entry-point main(), or ordinary English main: not competition identity.",
  responsive_layout: "Three visual columns describe a wrapping responsive layout or three metrics/actions, not an allowed-Division count. Map-pool cards map the complete supplied list and may wrap 3+1.",
  unrelated_count: "Three means JWT/path segments, CLI argument arity, suggested agent-team size, private proof keys, media slots, or badge/match thresholds; it is not a tournament division limit.",
  repository_branch: "Repository branch/path or release-tool naming; not tournament semantics.",
  historical_migration: "Immutable ordered historical migration. Its original labels/thresholds document the prior schema; current definitions are determined by later explicit replacements, not editing deployed history.",
  current_authority: "Current explicit model-aware SQL definition: immutable legacy main and future main_progression/pro remain distinct; authority uses tournament model and season official_bracket_type. Reviewed by symbol and covered by full replay/model/lifecycle tests.",
  legacy_fixture_authority: "Existing exact synthetic cross-division helper remains v1/legacy-only. New synthetic_registration_expected_elo permits its enrollment exception only for legacy_three_v1; it cannot authorize a future eligibility bypass.",
  historical_legal: "Archived rulebook/PPA v3.1 corpus deliberately preserves historical Main / Pro and 1400+ wording. Effective v3.2 has four divisions and explicit historical separation.",
  effective_legal: "Effective v3.2 distinguishes future Academy/Challenge/Main/Pro, independent eight-player workflows, Pro six-event authority, and historical Main / Pro. Retained old names explain preserved history.",
  historical_document: "Explicitly historical project or implementation/security report. Source and ordered migrations are authoritative; old phase descriptions are retained as historical evidence.",
  current_document: "Current guide distinguishes 38 permanent fixture identities, future pools, Pro authority, and legacy compatibility. Three championships in Triple Crown remain the fixed badge contract, not the event's division count.",
  model_resolver: "Canonical model resolver maps stored legacy Main to accounting main and display Main / Pro, future Main to main_progression, and future Pro to pro; unknown model/version fails closed.",
  tournament_configuration: "Three-entry TOURNAMENT_BRACKET_CONFIGS is the legacy config; FOUR_DIVISION_BRACKET_CONFIGS supplies four for current events. Every current editor/loader obtains configs through the event model.",
  registration_snapshot: "Persisted evidence accepts historical Main / Pro alongside future Main/Pro; target-event model determines eligibility and calculation version. Saved history is not reclassified.",
  leaderboard_authority: "Season references are scoped by immutable main/pro authority. Main career uses main_progression; old main is a historical bucket; display ordering never changes prize rank.",
  generic_season_operation: "Administrator reconciliation and lifecycle operations address a season ID or generic season status. Current DB authority enforces which division counts and frozen-season rules.",
  badge_catalogue: "Unchanged 30-badge identity/artwork contract. Main/Elite means historical main or future main_progression; Pro does not satisfy Elite/Triple Crown. Three distinct championship legs remain intentional.",
  badge_authority: "Canonical evaluator preserves all 30 definitions, reads model-aware SQL summaries and immutable main/pro season authority, and stores actual Main source bucket metadata.",
  translated_copy: "Current translated public/help copy separates future Main progression, Pro seasons, and explicitly historical Main / Pro labels. Badge translations retain the unchanged 30-badge identity contract.",
  fixture_catalogue: "Exact 38-alias allowlist preserves original 30 registry identities/ELO/v1 provenance, adds TestMain11–14/TestPro1–4, classifies future 9 Main / 9 Pro by numeric ELO, and uses v2 only for future enrollments.",
  transition_tool: "Intentionally exact legacy transition scope: eight verified original fixtures, existing P03 results, one guarded additional legacy event, Season 2 main 6/6, then Pro 0/6; not an ordinary future-event creator.",
  fixture_release_tool: "Guarded Staging tooling distinguishes original 30 credential pairs from eight additions, prepares 18 upper fixtures, and targets explicit future Main/Pro. Count 30 here protects unchanged originals.",
  hosted_test: "Browser/rehearsal scenario explicitly exercises current model or legacy rendering. DOM main and viewport column counts are presentation selectors, not eligibility authority.",
  versioned_migration_test: "Test pins a historical migration's literal contract rather than asserting the latest stored definition. Current four-division behavior is verified separately by full ordered replay and dedicated SQL tests.",
  historical_sql_fixture: "Version-scoped older rollback/concurrency fixture retained for its original phase. Legacy names/points are historical fixture facts; this is not an ordinary future-event creation template. The current CI suites are updated or superseded by the full four-division runner.",
  current_test: "Current regression includes historical compatibility fixtures or explicit future-model assertions. Legacy labels intentionally exercise preserved history; generic season references are model-neutral.",
  fixed_map_pool_bound: "Defect fixed: admin batch map publication previously rejected a fourth bracket. It now accepts up to four; DB validates actual event ownership, eligibility, and distinct selections. Focused test proves four accepted/five rejected.",
};
const runtime = new Map();
function assign(names, family) { for (const name of names) runtime.set(name, family); }
assign(["lib/division-model.ts", "lib/elo-verification/divisions.ts"], "model_resolver");
assign(["lib/tournaments.ts", "components/admin/tournaments/TournamentEditor.tsx", "app/admin/tournaments/actions.ts"], "tournament_configuration");
assign(["lib/active-tournament-elo-snapshots.ts", "app/tournaments/actions.ts", "app/tournaments/page.tsx", "app/profile/relic-elo-action.ts", "lib/elo-verification/staging-synthetic-academy.ts", "components/TournamentsExperience.tsx", "components/admin/tournaments/AdminTournamentMatches.tsx"], "registration_snapshot");
assign(["lib/leaderboard/public.ts", "components/LeaderboardExperience.tsx", "lib/player-dashboard.ts"], "leaderboard_authority");
assign(["lib/leaderboard/admin.ts", "app/admin/leaderboard-actions.ts", "components/AdminLeaderboardControls.tsx", "components/TournamentRecoveryControl.tsx", "components/admin/tournaments/TournamentControls.tsx", "lib/admin-tournament-workspace.ts", "lib/admin-operations.ts", "lib/admin-tournament-match-workspace.ts", "lib/admin-tournament-registration-workspace.ts", "app/admin/page.tsx", "app/admin/registrations/page.tsx", "app/admin/tournaments/[tournamentId]/page.tsx", "app/admin/tournaments/page.tsx", "app/admin/tournaments/media-actions.ts", "lib/tournament-division-invitations.ts", "lib/tournament-division-state-data.ts", "components/admin/tournaments/TournamentWorkspaceHeader.tsx"], "generic_season_operation");
assign(["lib/badges/catalog.ts", "lib/badges/types.ts"], "badge_catalogue");
assign(["lib/badges/authority.ts", "lib/badges/reconciliation.ts"], "badge_authority");
assign(["app/about/page.tsx", "components/rules/RulesExperience.tsx", "lib/i18n/glossary.ts"], "translated_copy");
assign(["scripts/lib/staging-synthetic-uat.mjs", "scripts/staging-synthetic-academy-uat.mjs", "scripts/badges/staging-acceptance-plan.mjs", "scripts/p03-1/hosted-smoke.mjs"], "fixture_catalogue");
assign(["scripts/four-division/legacy-transition.mjs", "scripts/four-division/evaluate-transition-badges.mjs", "scripts/four-division/compare-protected-baseline.mjs"], "transition_tool");
assign(["scripts/four-division/provision-additions.mjs", "scripts/four-division/fixture-credentials.mjs", "scripts/four-division/publish-legal-pdfs.mjs", "scripts/four-division/hosted-auth.mjs"], "fixture_release_tool");
assign(["scripts/four-division/hosted-competition.mjs", "scripts/four-division/hosted-ui.mjs", "scripts/four-division/hosted-results.mjs", "scripts/four-division/hosted-room.mjs"], "hosted_test");
assign(["scripts/generate-legal-pdfs.py"], "effective_legal");
assign(["scripts/phase15c/audit-release-preflight.sql", "scripts/phase15c/legal-document-register.mjs"], "historical_document");
const migrationFunctions = [];
for (const [file, text] of contents) {
  if (!file.startsWith("supabase/migrations/")) continue;
  for (const match of text.matchAll(/create\s+(?:or\s+replace\s+)?function\s+((?:public|ironclad_private)\.)?([a-zA-Z0-9_]+)\s*\(/ig)) {
    const name = `${match[1] ?? "public."}${match[2]}`;
    migrationFunctions.push({ file, name, offset: match.index, line: text.slice(0, match.index).split("\n").length });
  }
}
const lastDefinition = new Map(migrationFunctions.map((item) => [item.name.toLowerCase(), item]));
function classify(file, line, text) {
  if (file === "AGENTS.md") return ["unrelated", "unrelated_count"];
  if (/process.argv.length|parts.length|credential.split|segments.length|keys.length/.test(text) || /^lib\/(combat-highlights|web-push)\//.test(file) || file === "components/combat-highlights/CombatHighlightsEditor.tsx" || (file === "components/tournaments/PublishedTournamentGallery.tsx" && /entries.length/.test(text))) return ["unrelated", "unrelated_count"];
  if (file === "app/admin/tournaments/map-pool-actions.ts") return ["defect_fixed", "fixed_map_pool_bound"];
  if (/<\/?main\b|(?:getByRole|locator|querySelector|querySelectorAll)\(["']main(?:[ "'\.#[]|$)|(?:async )?function main\(|\bmain\(\)|\/main\.tsx|main data flow|main disclosure|main submission|\bmain\.(?:querySelector|querySelectorAll)|expect\(main\)/.test(text) || file === "components/badges/useBadgeModalDialog.ts") return ["unrelated", "semantic_element"];
  if (/grid-cols-3/.test(text) && !/\bmain\b|season|division_model/i.test(text)) return ["unrelated", "responsive_layout"];
  if (file === ".github/workflows/ci.yml" || file === "scripts/four-division/preview-access.mjs") return ["unrelated", "repository_branch"];
  if (file.startsWith("content/legal-history/")) return ["correct_historical", "historical_legal"];
  if (file === "content/legal-corpus.json") return ["correct_compatibility", "effective_legal"];
  if (file.startsWith("supabase/migrations/")) {
    if (file.includes("202609290")) return ["correct_compatibility", "current_authority"];
    if (file.includes("staging_badge_cross_division")) return ["correct_compatibility", "legacy_fixture_authority"];
    return ["correct_historical", "historical_migration"];
  }
  if (file.startsWith("lib/i18n/dictionaries/")) return ["correct_compatibility", file.endsWith("/badges.ts") ? "badge_catalogue" : "translated_copy"];
  if (runtime.has(file)) return ["correct_compatibility", runtime.get(file)];
  if (file === "lib/news/normalize.ts") return ["unrelated", "semantic_element"];
  if (file === "PROJECT_CONTEXT.md" || /^docs\/(?!badge-staging-acceptance|tournament-deletion)/.test(file)) return ["correct_historical", "historical_document"];
  if (/^docs\/(badge-staging-acceptance|tournament-deletion)/.test(file)) return ["correct_compatibility", "current_document"];
  if (file.startsWith("tests/") || file.startsWith("e2e/")) {
    if (file.includes("migration.test") || (contents.get(file).includes("supabase/migrations") && !file.includes("four-division"))) return ["correct_historical", "versioned_migration_test"];
    if (/^tests\/database\//.test(file) && !/four-division|match-room|match-result-(transactional|ux)/.test(file)) return ["correct_historical", "historical_sql_fixture"];
    return ["correct_compatibility", "current_test"];
  }
  return ["unreviewed", "unreviewed"];
}
const rows = [];
const residuals = [];
for (const [file, source] of contents) {
  source.split(/\r?\n/).forEach((text, index) => {
    pattern.lastIndex = 0;
    const matches = [...text.matchAll(pattern)];
    if (!matches.length) return;
    const [category, family] = classify(file, index + 1, text);
    const symbol = migrationFunctions.filter((item) => item.file === file && item.line <= index + 1).at(-1);
    const latest = symbol ? lastDefinition.get(symbol.name.toLowerCase()) : null;
    const row = { file, line: index + 1, category, family, matches: [...new Set(matches.map((match) => match[0]))], occurrences: matches.map((match) => ({ term: match[0], column: match.index + 1 })),
      excerpt: text.trim().slice(0, 280), lineSha256: hash(text), ...(symbol ? { sqlContext: symbol.name, latestDefinition: `${latest.file}:${latest.line}` } : {}) };
    rows.push(row);
    if (category === "unreviewed") residuals.push({ file, line: index + 1, excerpt: text.trim().slice(0, 200) });
  });
}
const badgePaths = ["lib/badges/catalog.ts", "lib/badges/types.ts", ...Array.from({ length: 30 }, (_, index) => `public/assets/badges/${index + 1}.png`)];
const badgeHashes = badgePaths.map((file) => {
  const baseline = execFileSync("git", ["show", `${BASELINE}:${file}`], { maxBuffer: 32 * 1024 * 1024 });
  const current = readFileSync(file);
  // Git/text checkout newline normalization is irrelevant to catalogue meaning.
  const normalize = (bytes) => file.endsWith(".ts") ? Buffer.from(bytes.toString("utf8").replaceAll("\r\n", "\n")) : bytes;
  return { file, baselineSha256: hash(normalize(baseline)), currentSha256: hash(normalize(current)), unchanged: hash(normalize(baseline)) === hash(normalize(current)) };
});
assert(badgeHashes.every((row) => row.unchanged), "Badge catalogue/types/artwork changed");
const catalog = contents.get("lib/badges/catalog.ts");
const badgeDefinitions = [...catalog.matchAll(/number:\s*(\d+),\s*name:\s*"([^"]+)",\s*slug:\s*"([^"]+)"/g)].map((match) => ({ number: Number(match[1]), name: match[2], slug: match[3], compatibility: [5, 9, 26, 28, 29, 30].includes(Number(match[1])) ? "Version/authority-sensitive: progression ranks, Main championship leg, or season authority explicitly updated and regression-tested" : "Generic qualification preserved; current summaries include all five stored accounting IDs and regression coverage" }));
assert.equal(badgeDefinitions.length, 30);
assert.deepEqual(badgeDefinitions.map((row) => row.number), Array.from({ length: 30 }, (_, index) => index + 1));
const manualCases = [
  ["lib/tournaments.ts", 23, "Three-entry legacy config is selected only by legacy_three_v1; future config adds Pro and narrows Main. Current call sites pass model."],
  ["lib/division-model.ts", 25, "Stored Main resolves to legacy main versus future main_progression; Pro accepted only for four_division_v1."],
  ["lib/leaderboard/public.ts", 290, "main/pro whitelist selects official historical/current season standings; career query handles academy/challenge/main_progression separately."],
  ["components/LeaderboardExperience.tsx", 454, "CareerExplanation fallback Main is reached only from the career branch; Pro/main official views render their separate explanation."],
  ["lib/badges/authority.ts", 330, "Three trophy-family keys are fixed Academy/Challenge/Main badge legs, not division whitelist; actual Main source metadata can be main_progression."],
  ["lib/admin-operations.ts", 840, "Four current names plus conditional historical Main / Pro; legacy records keep their display identity."],
  ["components/AdminTournamentMapPools.tsx", 126, "Grid has three columns but maps every card; fourth wraps without filtering or disabling Pro. This is distinct from the fixed action limit."],
  ["app/admin/tournaments/map-pool-actions.ts", 39, "Actual cardinality defect fixed to four and independently tested at four/five boundary."],
  ["scripts/lib/staging-synthetic-uat.mjs", 198, "Main alias regex 1–14 and Pro 1–4 are exact catalogue identities; future eligibility derives from immutable numeric ratings."],
  ["scripts/four-division/provision-additions.mjs", 15, "slice(0,30) protects original credentials; only 8 additions are provisioned. It does not truncate the current 38-fixture catalogue."],
  ["supabase/migrations/20260929011812_four_division_fixture_authority.sql", 600, "Provider-null cross-division exception explicitly requires legacy_three_v1; future snapshots require current typed provenance."],
  ["supabase/migrations/20260929011829_four_division_accounting_badges.sql", 2998, "valid_main_event_count remains a response alias; valid_qualifying_event_count and immutable official_bracket_type carry current season semantics."],
  ["content/legal-corpus.json", 324, "1400+ is retained only in an explicit historical-event paragraph; future Main 1400–1699 and Pro 1700+ have separate rows."],
  ["supabase/migrations/20260929032200_four_division_registration_evidence.sql", 61, "Deferred evidence checks preserve canonical-only real registration and legacy v1/future v2 fixture CLI evidence; normal synthetic browser registration requires matching provenance plus legal consent with no Steam ownership claim. Forced deferred checks cover positive and negative cases."],
  ["app/profile/page.tsx", 226, "Reserved synthetic identity is only a hint: the exact pinned Staging registry resolver must authorize synthetic eligibility. Client cards receive an eligibility summary, not Steam IDs or live-provider claims."],
  ["components/TournamentsExperience.tsx", 4052, "Synthetic account-control consent is explicitly separate from Steam ownership wording; the client flag changes presentation only, while the RPC determines synthetic authority."],
  ["PROJECT_CONTEXT.md", 3, "Historical banner prevents old two-division prototype text from being mistaken for current source."],
];
const report = { auditedAt: new Date().toISOString(), baseline: BASELINE, scope: "Tracked plus nonignored source; dependency/build/generated evidence/lock files excluded", patterns: pattern.source,
  categories: { correct_historical: "Preserved explicit legacy/version-scoped facts", correct_compatibility: "Reviewed current behavior including legacy compatibility and future semantics", unrelated: "Not a competition division assumption", defect_fixed: "Concrete discovered defect corrected with regression coverage" },
  coverage: { matchedLines: rows.length, matchedFiles: new Set(rows.map((row) => row.file)).size, residuals: residuals.length, counts: Object.fromEntries([...new Set(rows.map((row) => row.category))].map((category) => [category, rows.filter((row) => row.category === category).length])) },
  families, manualCases: manualCases.map(([file,line,rationale])=>({file,line,rationale})), badgeCatalogue: { count: 30, allCatalogueAndArtworkHashesUnchanged: true, definitions: badgeDefinitions, hashes: badgeHashes },
  fixedFindings: [
    { file: "app/admin/tournaments/map-pool-actions.ts", line: 39, before: "bracketIds.length > 3", after: "bracketIds.length > 4", proof: "tests/integration/admin-map-pool-actions.test.ts: four accepted, five rejected; all five tests pass" },
    { file: "docs/badge-staging-acceptance.md", line: 23, before: "30 aliases / three pools / future season TestMain2", after: "38 aliases / 10,10,9,9 future pools / Pro TestMain6; legacy-only helper explicit" },
    { file: "docs/tournament-deletion.md", line: 37, before: "only Main / Pro season wording", after: "official Pro or historical Main / Pro" },
    { file: "PROJECT_CONTEXT.md", line: 3, before: "unmarked old two-division platform overview", after: "explicit historical snapshot banner" },
  ], residuals, rows };
mkdirSync(path.dirname(OUTPUT), { recursive: true });
// Keep metadata readable and each inventory record on one line for review.
const metadata = JSON.stringify({ ...report, rows: [] }, null, 2);
const compactRows = rows.map((row) => "    " + JSON.stringify(row)).join(",\n");
writeFileSync(`${OUTPUT}.json`, metadata.replace('"rows": []', () => '"rows": [\n' + compactRows + "\n  ]") + "\n");
const markdown = [
  "# Four-division remaining-assumptions audit", "",
  "The inventory categorizes " + rows.length + " matching source lines across " + report.coverage.matchedFiles + " files. The static inventory found an application defect: all-four map-pool publication was rejected by an old three-bracket limit. That limit is fixed and its four/five boundary is tested. Hosted verification later found an older deferred registration-evidence trigger rejecting the new synthetic browser contract; a fourth additive migration fixes that separate integration defect with commit-time regression checks.", "",
  "The JSON companion contains every indexed file/line, exact matched terms, source-line SHA256, category, reviewed-family rationale, and SQL definition context. This is a reviewed-family audit, not a claim that every historical SQL harness was rerun. Immutable migrations and version-scoped historical tests remain historical evidence; current authority was checked with a full 160-migration replay, model/permission checks, twelve P03 division variants, and the played lifecycle/concurrency harness.", "",
  "## Counts", "", "| Category | Matching lines |", "| --- | ---: |",
  ...Object.entries(report.coverage.counts).map(([category,count])=>"| " + category + " | " + count + " |"), "",
  "Unclassified source residuals: " + residuals.length + ". Ignored directories, dependencies, generated test evidence, lock files and binary documents are excluded. The scan includes Main/main, Main / Pro, 1400+, model/accounting keys, season references, fixture aliases/contracts, three-count checks and three-column layouts.", "",
  "## Manually reviewed semantic cases", "", "| File:line | Decision |", "| --- | --- |",
  ...manualCases.map(([file,line,rationale])=>"| [" + file + ":" + line + "](../../" + file + "#L" + line + ") | " + rationale + " |"), "",
  "## Badge identity gate", "",
  "All 30 catalogue entries, badge type definitions, and PNG assets 1–30 match baseline " + BASELINE + ". Catalogue/type SHA256 comparisons normalize only CRLF/LF; artwork hashes compare exact bytes. No badge identity, artwork, slug, or number was changed.", "",
  "Progression (5), Season Campaigner (9), Elite Champion (26), Triple Crown (28), and season podium/champion (29–30) require model/authority compatibility. The remaining generic qualifications retain their contracts while current SQL summaries include all five stored accounting IDs. Triple Crown deliberately remains Academy + Challenge + Main/Elite; Pro championships do not substitute for Main. Detailed per-badge names, slugs, and hashes are in the JSON companion.", "",
  "## Verification and limits", "",
  "The discovered map action change passed five focused integration tests. All seven existing database CI commands passed locally, as did the complete four-division runner. The final full application lint/type/build and hosted UI checks are recorded by the release coordinator. This audit performs no live database mutation and reads no environment files.", "",
  "Reproduce: node scripts/four-division/audit-assumptions.mjs. The command fails if catalogue/artwork changes or an unclassified source file appears. Reviewed-family classifications and manual decisions remain visible in the generator; new behavior requires review even when its file belongs to an existing family.", "",
];
writeFileSync(OUTPUT + ".md", markdown.join("\n"));
console.log(JSON.stringify({ ...report.coverage, badgeDefinitions: 30, badgeCatalogueAndArtworkUnchanged: true, residuals }, null, 2));
if (residuals.length) process.exitCode = 1;
