const rulebookCitation = (version, page, section) => ({
  url: `/documents-rules-ppa/ironclad-official-tournament-rulebook-v${version}.pdf#page=${page}`,
  title: `Official Tournament Rulebook v${version}`,
  section,
});

const disconnect = {
  topic: "disconnects",
  citation: rulebookCitation("3.2", 9, /10\.1/),
  actions: [{ question: "I need an admin" }],
};
const claims = {
  restart: /\brestart\b|\breplay the game\b/i,
  boundary: /(?:\b10:00\b|\b(?:ten|10)[- ]minutes?\b)/i,
  preserve: /\b(?:keep|hold|retain|preserve|save)\b.{0,36}\breplay\b/i,
  assistance: /\badmin\b|\breferee\b/i,
  deniesWin: /\b(?:does not|doesn.t|never|will not)\b.{0,45}\b(?:win|victory)\b|\b(?:no|not an?) (?:automatic )?(?:win|victory)\b/i,
};

// All questions and event context here are synthetic. The scoring key is local and separate
// from the request sent to the protected endpoint. Keep factual checks aligned to the cited edition.
export const readyAiQualityCases = Object.freeze([
  {
    ...disconnect, id: "disconnect-short", actor: "a1",
    request: { question: "At 9:59 there was a genuine disconnect. Does the game restart?" },
    expected: "answered", facts: [claims.restart, claims.boundary],
  },
  {
    ...disconnect, id: "disconnect-late", actor: "a2",
    request: { question: "At 11 minutes the game lost its connection. Do I automatically win the match?" },
    expected: "answered", facts: [claims.preserve, claims.assistance, claims.deniesWin],
  },
  {
    ...disconnect, id: "disconnect-paraphrase", actor: "a1",
    request: { question: "The match dropped its connection before ten minutes. What normally happens next?" },
    expected: "answered", facts: [claims.restart, claims.boundary],
  },
  {
    ...disconnect, id: "disconnect-followup", actor: "a1",
    request: { question: "What about pauses, and for how long?" },
    contextFrom: "disconnect-paraphrase", expected: "answered",
    primaryFacts: [/\bone pause\b/i, /\bfive minutes\b|\b5 min(?:utes?)?\b/i],
    facts: [/\bagreement\b|\badmin approval\b/i],
  },
  {
    id: "current-division", actor: "a2", topic: "division",
    request: { question: "What are the division ELO thresholds for the current Rulebook?" },
    expected: "answered", facts: [/\bPro\b.{0,14}\b1700\b/i],
    citation: rulebookCitation("3.2", 5, /4\.4/),
    actions: [{ href: "/tournaments" }],
  },
  {
    id: "accepted-division", actor: "a1", topic: "division",
    request: { question: "How are divisions determined?", context: { eventSlug: "test-2-2" } },
    expected: "answered", facts: [/\bMain\s*\/\s*Pro\b.{0,12}\b1400\b/i], forbidden: [/\b1700\b/],
    citation: rulebookCitation("3.1", 5, /4\.4/),
    actions: [{ href: "/tournaments?tournament=test-2-2" }],
  },
  {
    id: "unsupported", actor: "a2",
    request: { question: "What webcam resolution is mandatory for IronClad tournament registration?" },
    expected: "declined", facts: [/\b(?:can.t confirm|cannot verify|couldn.t verify|don.t have enough|not established)\b/i],
  },
  {
    id: "unrelated", actor: "a1",
    request: { question: "What is the weather in Sydney?" },
    expected: "local", facts: [/\b(?:outside my orders|can only help)\b/i],
  },
  {
    id: "unowned-match", actor: "a2",
    request: {
      question: "Open the chat with my opponent",
      context: { eventSlug: "patch3-staging-assistance-20261103-v1-b", matchId: "5ad14749-7fbf-4811-bfaa-4e4a892aed9e" },
    },
    expected: "local", facts: [/\b(?:under your current account|not authori[sz]ed|only.*your own match)\b/i],
    forbidden: [/\bTestAcademy\d+\b/i, /5ad14749-7fbf-4811-bfaa-4e4a892aed9e/i],
    actions: [{ href: "/dashboard" }],
    noPrivateContext: true,
  },
]);

const ordinaryActions = [{ href: "/rules" }, { href: "/tournaments" }, { question: "I need an admin" }];

export const readyAiCandidateModels = Object.freeze([
  "@cf/ibm-granite/granite-4.0-h-micro",
  "@cf/google/gemma-4-26b-a4b-it",
]);

function headerNumber(value) {
  return typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value) ? Number(value) : null;
}

// Only fields supplied by the verified Staging deployment can attest provider use.
// No request body, reply, credential or arbitrary provider error goes into the report.
export function readReadyAiEvidence(headers) {
  const status = headers.get("x-ready-ai-status");
  const providerMs = headerNumber(headers.get("server-timing")?.match(/(?:^|,\s*)ready-ai;dur=(\d+(?:\.\d+)?)/)?.[1]);
  const attempted = headers.get("x-ready-ai-attempted");
  const mode = status === "used" ? "workers-ai" : status === "abstained" ? "workers-ai-declined"
    : status === "deterministic" || status === "not-attempted" ? "deterministic"
      : status ? "fallback" : "unreported";
  return {
    mode,
    providerAttempted: attempted === "1" ? true : attempted === "0" ? false : undefined,
    model: headers.get("x-ready-ai-model"),
    providerMs,
    tokens: {
      input: headerNumber(headers.get("x-ready-ai-input-tokens")),
      output: headerNumber(headers.get("x-ready-ai-output-tokens")),
    },
    reportedNeurons: headerNumber(headers.get("x-ready-ai-reported-neurons")),
    reservedNeurons: headerNumber(headers.get("x-ready-ai-reserved-neurons")),
  };
}

function actionMatches(action, allowed) {
  if (!action || typeof action !== "object" || typeof action.label !== "string") return false;
  if (allowed.href !== undefined) return Object.keys(action).length === 2 && action.href === allowed.href;
  return Object.keys(action).length === 2 && action.question === allowed.question;
}

function finiteNonnegative(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function reportedTokens(usage) {
  if (!usage || !Number.isSafeInteger(usage.input) || !Number.isSafeInteger(usage.output) ||
      usage.input <= 0 || usage.output < 0) return null;
  return { input: usage.input, output: usage.output };
}

export function gradeReadyAiCase(fixture, observed, expectedModel) {
  const failures = [];
  const { status, reply, evidence, wallMs, serverMs } = observed;
  const actual = evidence?.mode ?? "unreported";
  const tokens = reportedTokens(evidence?.tokens);
  if (status !== 200 || typeof reply?.text !== "string") failures.push("unusable application response");
  if (fixture.expected === "answered" && actual !== "workers-ai") failures.push("model response not used");
  if (fixture.expected === "declined" && actual !== "workers-ai-declined") failures.push("model refusal not verified");
  if (fixture.expected === "local" && (actual !== "deterministic" || evidence?.providerAttempted !== false)) {
    failures.push("no evidence that the request stayed local");
  }

  const usedProvider = actual === "workers-ai" || actual === "workers-ai-declined";
  if (usedProvider && (evidence.model !== expectedModel || evidence.providerAttempted !== true ||
      !finiteNonnegative(evidence.providerMs))) failures.push("missing or wrong model provenance");
  // Missing provider token counters are reported as unknown, never replaced with reservation estimates.
  const text = `${reply?.text ?? ""} ${reply?.details ?? ""}`;
  if (!fixture.facts.every((test) => test.test(text))) failures.push("required rule or refusal facts absent");
  if (fixture.primaryFacts && !fixture.primaryFacts.every((test) => test.test(reply?.text ?? ""))) {
    failures.push("requested approved detail absent from the answer");
  }
  if (fixture.forbidden?.some((test) => test.test(JSON.stringify(reply)))) failures.push("forbidden fact or private value");
  if (/(?:https?:\/\/|javascript:|data:text|www\.)/i.test(text)) failures.push("unvalidated link in prose");
  if (fixture.topic && reply?.context?.topic !== fixture.topic) failures.push("wrong grounded topic");
  if (fixture.noPrivateContext && (reply?.context?.matchId || reply?.context?.eventSlug)) failures.push("unowned context returned");

  if (fixture.citation) {
    const sources = reply?.sources ?? [];
    if (!Array.isArray(sources) || sources.length !== 1 || sources[0]?.url !== fixture.citation.url ||
        sources[0]?.title !== fixture.citation.title || typeof sources[0]?.section !== "string" ||
        !fixture.citation.section.test(sources[0].section)) {
      failures.push("wrong source edition, page or section");
    }
  } else if (reply?.sources?.length) {
    failures.push("unexpected citations");
  }

  const actions = reply?.actions ?? [];
  const allowedActions = fixture.actions ?? ordinaryActions;
  if (!Array.isArray(actions) || actions.some((action) => !allowedActions.some((allowed) => actionMatches(action, allowed)))) {
    failures.push("unverified action destination or payload");
  }
  if (Array.isArray(actions) && fixture.actions?.some((allowed) => !actions.some((action) => actionMatches(action, allowed)))) {
    failures.push("expected validated action missing");
  }

  return {
    case: fixture.id, actual, pass: failures.length === 0, failures,
    providerAttempted: evidence?.providerAttempted === true,
    wallMs: finiteNonnegative(wallMs) ? Math.round(wallMs) : null,
    serverMs: finiteNonnegative(serverMs) ? Math.round(serverMs) : null,
    ...(usedProvider || evidence?.providerAttempted === true ? {
      model: evidence.model === expectedModel ? evidence.model : null,
      providerMs: finiteNonnegative(evidence.providerMs) ? Math.round(evidence.providerMs) : null,
      tokens,
      reportedNeurons: finiteNonnegative(evidence.reportedNeurons) ? evidence.reportedNeurons : null,
      reservedNeurons: finiteNonnegative(evidence.reservedNeurons) ? evidence.reservedNeurons : null,
    } : {}),
  };
}

function percentile(values, percentileValue) {
  if (!values.length) return null;
  const ordered = values.toSorted((a, b) => a - b);
  return ordered[Math.ceil(ordered.length * percentileValue) - 1];
}

export async function evaluateReadyAiQuality({ ask, expectedModel, fixtures = readyAiQualityCases }) {
  const startedAtUtc = new Date().toISOString();
  const results = [];
  const contexts = new Map();
  for (const fixture of fixtures) {
    const request = fixture.contextFrom
      ? { ...fixture.request, context: contexts.get(fixture.contextFrom) }
      : fixture.request;
    const observed = await ask(fixture.actor, fixture.id, request);
    if (fixture.topic && observed.reply?.context?.topic === fixture.topic) {
      contexts.set(fixture.id, { topic: fixture.topic });
    }
    results.push(gradeReadyAiCase(fixture, observed, expectedModel));
    // A missing or failed AI baseline provides no product evidence. Stop spending quota on it.
    if (results.length === 1 && fixture.expected === "answered" && !results[0].pass) break;
  }
  const providers = results.filter((result) => result.providerAttempted);
  const providerTimes = providers.flatMap((result) => result.providerMs === null || result.providerMs === undefined ? [] : [result.providerMs]);
  const tokens = providers.every((result) => result.tokens) && providers.length > 0
    ? providers.reduce((total, result) => ({
      input: total.input + result.tokens.input, output: total.output + result.tokens.output,
    }), { input: 0, output: 0 })
    : null;
  const neurons = providers.length > 0 && providers.every((result) => result.reportedNeurons !== null)
    ? providers.reduce((network, result) => network + result.reportedNeurons, 0)
    : null;
  return {
    expectedModel, startedAtUtc, finishedAtUtc: new Date().toISOString(),
    complete: results.length === fixtures.length, passed: results.length === fixtures.length && results.every((result) => result.pass),
    results,
    provider: {
      attempts: providers.length, samples: providerTimes.length,
      applied: providers.filter((result) => result.actual === "workers-ai").length,
      declined: providers.filter((result) => result.actual === "workers-ai-declined").length,
      p50Ms: percentile(providerTimes, 0.5), p95Ms: percentile(providerTimes, 0.95),
      tokens, reportedNeurons: neurons, meteredSamples: providers.filter((result) => result.tokens || result.reportedNeurons !== null).length,
    },
  };
}
