/* Synthetic native RSC fixture: no environment files, providers or network. */
import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import ts from "typescript";
const require = createRequire(import.meta.url);

// Use the exact React server runtime bundled with this Next.js installation.
// The aliases are confined to this child process, as in Next's own server setup.
const { addHookAliases } = require("next/dist/server/require-hook");
addHookAliases([
  ["react", require.resolve("next/dist/compiled/react/react.react-server")],
  ["next/dist/compiled/react", require.resolve("next/dist/compiled/react/react.react-server")],
  ["react-dom", require.resolve("next/dist/compiled/react-dom")],
]);
const React = require("react");
const { renderToReadableStream } = require("next/dist/compiled/react-server-dom-webpack/server.node");
const jsx = require("next/dist/compiled/react/jsx-runtime.react-server");
const requests = new AsyncLocalStorage();
const playerId = "11111111-1111-4111-8111-111111111111";
const secondPlayerId = "22222222-2222-4222-8222-222222222222";
const expectedPerRequest = Number(process.argv[2]);
assert([1, 2].includes(expectedPerRequest), "Explicit expected lookup count required");

const mocks = {
  react: React,
  "react/jsx-runtime": jsx,
  "next/navigation": { notFound() { throw new Error("SYNTHETIC_NOT_FOUND"); } },
  "@/lib/public-players": { async getPublicPlayerById(id) {
    const request = requests.getStore();
    assert(request, "Missing native request context");
    request.lookups.push(id);
    await new Promise((resolve) => setTimeout(resolve, 1));
    if (request.failure) throw new Error("SYNTHETIC_LOOKUP_UNAVAILABLE");
    return request.rows[id] ?? null;
  } },
  "@/lib/i18n/request": { getRequestLocale: async () => "en" },
  "@/lib/i18n/loaders": { loadDictionary: async () => ({ players: {
    notFoundTitle: "Profile unavailable", profileMetadataTitle: "{name}", profileMetadataDescription: "Public profile {name}",
  } }) },
  "@/lib/i18n/translate": { translate: (copy, key, values = {}) => key.split(".").reduce((value, part) => value[part], copy).replace(/\{name\}/g, values.name ?? "") },
  "@/lib/player-showcase/read": { getPublicPlayerShowcase: async () => null },
  "@/lib/combat-highlights/read": { getPublicCombatHighlights: async () => [] },
  "@/lib/active-tournament-elo-snapshots": { getPublicActiveTournamentEloSnapshots: async () => [] },
  "@/lib/public-player-competition": {
    getPublicPlayerCompetitionHistory: async () => ({ status: "unavailable" }),
    parsePublicHistoryPage: () => 1,
  },
  "../highlight-actions": { reportHighlight: async () => ({ ok: true }) },
  "@/components/PublicPlayerProfileHeader": { default: ({ player }) => React.createElement("p", null, player.displayName) },
  "@/components/PublicPlayerStats": { default: () => null },
  "@/components/combat-highlights/CombatHighlights": { default: () => null },
};
const source = readFileSync(path.resolve("app/players/[playerId]/page.tsx"), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
const loaded = { exports: {} };
new Function("require", "module", "exports", compiled)((name) => {
  assert(Object.hasOwn(mocks, name), "Unexpected provider or component import: " + name);
  return Object.hasOwn(mocks[name], "default") ? { __esModule: true, ...mocks[name] } : mocks[name];
}, loaded, loaded.exports);
const page = loaded.exports;

async function renderRequest(rows, { failure = false, metadataId = playerId, bodyId = playerId } = {}) {
  const state = { rows, failure, lookups: [] };
  return requests.run(state, async () => {
    let outcomes;
    async function Root() {
      outcomes = await Promise.allSettled([
        page.generateMetadata({ params: Promise.resolve({ playerId: metadataId }) }),
        page.default({ params: Promise.resolve({ playerId: bodyId }), searchParams: Promise.resolve({}) }),
      ]);
      return React.createElement("section", null,
        outcomes[0].status === "fulfilled" ? outcomes[0].value.title : "metadata-error",
        outcomes[1].status === "fulfilled" ? outcomes[1].value : "body-error");
    }
    const errors = [];
    const stream = renderToReadableStream(React.createElement(Root), {}, { onError: (error) => { errors.push(error.message); } });
    let text = "";
    for await (const chunk of stream) text += Buffer.from(chunk).toString("utf8");
    assert.deepEqual(errors, []);
    return { lookups: state.lookups, text, outcomes };
  });
}

(async () => {
  let benchmarkLookups = 0;
  for (let index = 0; index < 30; index++) {
    const result = await renderRequest({ [playerId]: { id: playerId, displayName: "SyntheticPublicAlpha", playerName: "SyntheticPublicAlpha" } });
    assert(result.outcomes.every((outcome) => outcome.status === "fulfilled"));
    assert.equal(result.lookups.length, expectedPerRequest);
    assert(result.text.includes("SyntheticPublicAlpha"));
    benchmarkLookups += result.lookups.length;
  }
  const [alpha, beta] = await Promise.all([
    renderRequest({ [playerId]: { id: playerId, displayName: "SyntheticPublicAlpha", playerName: "SyntheticPublicAlpha" } }),
    renderRequest({ [playerId]: { id: playerId, displayName: "SyntheticPublicBeta", playerName: "SyntheticPublicBeta" } }),
  ]);
  assert.equal(alpha.lookups.length, expectedPerRequest);
  assert.equal(beta.lookups.length, expectedPerRequest);
  assert(alpha.text.includes("SyntheticPublicAlpha") && !alpha.text.includes("SyntheticPublicBeta"));
  assert(beta.text.includes("SyntheticPublicBeta") && !beta.text.includes("SyntheticPublicAlpha"));
  const hidden = await renderRequest({});
  assert.equal(hidden.lookups.length, expectedPerRequest);
  assert.equal(hidden.outcomes[0].value.title, "Profile unavailable");
  assert.equal(hidden.outcomes[1].reason.message, "SYNTHETIC_NOT_FOUND");
  const failure = await renderRequest({}, { failure: true });
  assert.equal(failure.lookups.length, expectedPerRequest);
  assert(failure.outcomes.every((outcome) => outcome.status === "rejected"));
  const recovered = await renderRequest({ [playerId]: { id: playerId, displayName: "RecoveredPublicProfile", playerName: "RecoveredPublicProfile" } });
  assert.equal(recovered.lookups.length, expectedPerRequest);
  assert(recovered.text.includes("RecoveredPublicProfile"));
  const distinct = await renderRequest({ [playerId]: { id: playerId, displayName: "FirstPublicProfile", playerName: "FirstPublicProfile" }, [secondPlayerId]: { id: secondPlayerId, displayName: "SecondPublicProfile", playerName: "SecondPublicProfile" } }, { bodyId: secondPlayerId });
  assert.deepEqual(distinct.lookups.sort(), [playerId, secondPlayerId].sort());
  process.stdout.write(JSON.stringify({ format: "native-public-profile-request-isolation-v1", passed: true, runtimeVersion: React.version, benchmarkRequests: 30, lookupsPerMetadataAndPageRequest: expectedPerRequest, totalBenchmarkLookups: benchmarkLookups, simultaneousRequestsIsolated: true, nextRequestPrivacyOptOutFresh: true, failureDoesNotPersistToNextRequest: true, distinctIdsDoNotCollide: true, realProvidersUsed: false }) + "\n");
})().catch((error) => { process.stderr.write(error.stack + "\n"); process.exitCode = 1; });
