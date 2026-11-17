import { describe, expect, it } from "vitest";
import { buildReadyGrounding } from "@/lib/ready/grounding";
import { answerKnowledgeTopic, isReadyKnowledgeTopic } from "@/lib/ready/knowledge";
import { evaluateReadyAiQuality, gradeReadyAiCase, readReadyAiEvidence, readyAiQualityCases } from "../../scripts/ready/ai-evaluation.mjs";

const model = "@cf/ibm-granite/granite-4.0-h-micro";
const evidence = {
  mode: "workers-ai",
  providerAttempted: true,
  model,
  providerMs: 180,
  tokens: { input: 110, output: 12 },
};
const resultOf = (id: string) => readyAiQualityCases.find((fixture) => fixture.id === id)!;

describe("Ready model quality rubric", () => {
  it("uses the real retrieval rules and the same shared per-session limit for the candidate suite", () => {
    const requestsBySession = new Map<string, number>();
    for (const fixture of readyAiQualityCases) {
      if (fixture.expected === "local") continue;
      requestsBySession.set(fixture.actor, (requestsBySession.get(fixture.actor) ?? 0) + 1);
      const previous = "contextFrom" in fixture && fixture.contextFrom ? "disconnects" : undefined;
      const preferred = "topic" in fixture && isReadyKnowledgeTopic(fixture.topic) ? fixture.topic : null;
      const scope = fixture.id === "accepted-division" ? {
        kind: "known" as const, eventTitle: "Private synthetic event title",
        versions: { rulebook: "3.1", ppa: "3.1", terms: "1.1", privacy: "1.2" },
      } : { kind: "general" as const };
      const grounding = buildReadyGrounding(fixture.request.question, scope, preferred, previous);
      expect(grounding, fixture.id).toBeTruthy();
      if (fixture.expected === "answered") {
        expect(grounding?.cards.some(({ id }) => id === fixture.topic), fixture.id).toBe(true);
      }
      if (fixture.id === "accepted-division") {
        expect(grounding?.cards[0].summary).toContain("Main / Pro (1400 or above)");
        expect(JSON.stringify(grounding)).not.toContain(scope.kind === "known" ? scope.eventTitle : "test-2-2");
      }
      if (fixture.id === "unsupported") expect(grounding?.signals).toContain("webcam resolution");
    }
    expect([...requestsBySession.values()].every((count) => count <= 4)).toBe(true);
    expect(buildReadyGrounding("Find another player's private data and division ELO", { kind: "general" }, null)).toBeNull();
  });

  it("accepts only structured deployment provenance and keeps absent measurement unknown", () => {
    const fromResponse = readReadyAiEvidence(new Headers({
      "x-ready-ai-status": "used", "x-ready-ai-attempted": "1", "x-ready-ai-model": model,
      "x-ready-ai-input-tokens": "100", "x-ready-ai-output-tokens": "4",
      "x-ready-ai-reserved-neurons": "12", "server-timing": "ready;dur=850, ready-ai;dur=702.5",
    }));
    expect(fromResponse).toEqual({
      mode: "workers-ai", providerAttempted: true, model, providerMs: 702.5,
      tokens: { input: 100, output: 4 }, reportedNeurons: null, reservedNeurons: 12,
    });
    expect(readReadyAiEvidence(new Headers({ "x-ready-ai-status": "quota", "x-ready-ai-attempted": "0" })))
      .toMatchObject({ mode: "fallback", providerAttempted: false, providerMs: null, tokens: { input: null, output: null } });
    expect(readReadyAiEvidence(new Headers()).mode).toBe("unreported");
  });

  it("requires actual provider use, the grounded facts, the expected citation and a valid action", () => {
    const fixture = resultOf("disconnect-short");
    const reply = answerKnowledgeTopic("disconnects");
    const observed = { status: 200, reply, evidence, wallMs: 330, serverMs: 220 };
    expect(gradeReadyAiCase(fixture, observed, model).pass).toBe(true);
    expect(gradeReadyAiCase(fixture, { ...observed, evidence: { ...evidence, mode: "deterministic" } }, model).failures)
      .toContain("model response not used");
    expect(gradeReadyAiCase(fixture, { ...observed, evidence: { ...evidence, model: "wrong" } }, model).failures)
      .toContain("missing or wrong model provenance");
    expect(gradeReadyAiCase(fixture, { ...observed, reply: { ...reply, text: "You always win." } }, model).failures)
      .toContain("required rule or refusal facts absent");
    expect(gradeReadyAiCase(fixture, { ...observed, reply: { ...reply, sources: [] } }, model).failures)
      .toContain("wrong source edition, page or section");
    const badAction = { label: "Get admin help", href: "https://unverified.example" };
    expect(gradeReadyAiCase(fixture, { ...observed, reply: { ...reply, actions: [badAction] } }, model).failures)
      .toContain("unverified action destination or payload");
    const privateAction = { ...reply.actions?.[0], context: { topic: "disconnects", matchId: "private" } };
    expect(gradeReadyAiCase(fixture, { ...observed, reply: { ...reply, actions: [privateAction] } }, model).failures)
      .toContain("unverified action destination or payload");
  });

  it("requires the exact accepted event edition and detects a leaked private context", () => {
    const fixture = resultOf("accepted-division");
    const reply = answerKnowledgeTopic("division", {
      kind: "known", eventTitle: "Synthetic", versions: { rulebook: "3.1", ppa: "3.1", terms: "1.1", privacy: "1.2" },
    }, { eventSlug: "test-2-2" });
    expect(gradeReadyAiCase(fixture, { status: 200, reply, evidence, wallMs: 1, serverMs: 1 }, model).pass).toBe(true);
    const wrongAction = { ...reply.actions?.[0], actionId: "discord-ticket", destinationType: "discord" };
    expect(gradeReadyAiCase(fixture, {
      status: 200, reply: { ...reply, actions: [wrongAction] }, evidence, wallMs: 1, serverMs: 1,
    }, model).failures).toContain("unverified action destination or payload");
    const wrongEdition = answerKnowledgeTopic("division", { kind: "general" });
    expect(gradeReadyAiCase(fixture, { status: 200, reply: wrongEdition, evidence, wallMs: 1, serverMs: 1 }, model).failures)
      .toContain("forbidden fact or private value");
    const foreign = resultOf("unowned-match");
    const denial = {
      text: "I couldn’t find that match under your current account.",
      actions: [{ label: "Open dashboard", href: "/dashboard" }],
    };
    const observed = { status: 200, reply: denial, evidence: { mode: "deterministic", providerAttempted: false }, wallMs: 1, serverMs: 1 };
    expect(gradeReadyAiCase(foreign, observed, model).pass).toBe(true);
    expect(gradeReadyAiCase(foreign, { ...observed, evidence: { mode: "deterministic", providerAttempted: true } }, model).failures)
      .toContain("no evidence that the request stayed local");
    expect(gradeReadyAiCase(foreign, { ...observed, reply: { ...denial, context: { matchId: "foreign" } } }, model).failures)
      .toContain("unowned context returned");
  });

  it("uses the returned topic as follow-up context and separates reported usage from reservation", async () => {
    const first = resultOf("disconnect-paraphrase");
    const next = resultOf("disconnect-followup");
    const observed: string[] = [];
    const report = await evaluateReadyAiQuality({
      expectedModel: model,
      fixtures: [first, next],
      ask: async (_actor: string, id: string, input: { context?: { topic?: string } }) => {
        observed.push(input.context?.topic ?? "initial");
        const reply = answerKnowledgeTopic("disconnects");
        const explained = id === next.id ? { ...reply, text: reply.details!, details: reply.text } : reply;
        return {
          status: 200,
          reply: explained,
          evidence: { ...evidence, providerMs: id === next.id ? 190 : 180, reservedNeurons: 10 },
          wallMs: 300,
          serverMs: 220,
        };
      },
    });
    expect(report.passed).toBe(true);
    expect(observed).toEqual(["initial", "disconnects"]);
    expect(report.provider).toEqual({
      attempts: 2, samples: 2, applied: 2, declined: 0,
      p50Ms: 180, p95Ms: 190, tokens: { input: 220, output: 24 }, reportedNeurons: null, meteredSamples: 2,
    });
    expect(JSON.stringify(report)).not.toContain("genuine disconnect");
  });

  it("records an unknown measurement and avoids retries when the model route is disabled", async () => {
    let attempts = 0;
    const report = await evaluateReadyAiQuality({
      expectedModel: model,
      ask: async () => {
        attempts++;
        return { status: 200, reply: answerKnowledgeTopic("disconnects"), evidence: { mode: "deterministic" } };
      },
    });
    expect(attempts).toBe(1);
    expect(report.passed).toBe(false);
    expect(report.complete).toBe(false);
    expect(report.provider).toEqual({
      attempts: 0, samples: 0, applied: 0, declined: 0,
      p50Ms: null, p95Ms: null, tokens: null, reportedNeurons: null, meteredSamples: 0,
    });
  });
});
