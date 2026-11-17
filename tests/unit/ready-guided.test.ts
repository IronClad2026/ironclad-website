import { describe, expect, it, vi } from "vitest";
import { resolveReadyAnswer } from "@/lib/ready/answer";
import {
  isReadyActionId, isReadyQuestionId, readyCategories, readyQuestionCatalogue,
  READY_CATALOGUE_VERSION, READY_MENU_VERSION, type ReadyMenuChoice, type ReadyQuestionId,
} from "@/lib/ready/catalogue";
import { readyQuestionPreview } from "@/lib/ready/catalogue-preview";
import { readReadyRequest } from "@/lib/ready/contracts";
import { readyKnowledgeTopics } from "@/lib/ready/knowledge";
import type { ReadyRuleScope } from "@/lib/ready/platform";

const scope = vi.hoisted(() => vi.fn<() => Promise<ReadyRuleScope>>(async () => ({ kind: "general" })));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/ready/platform", () => ({ resolveReadyRuleScope: scope }));

const viewer = { userId: "staging-review-user", sessionId: "review-session" };

function leaves(choices: ReadyMenuChoice[]): ReadyMenuChoice[] {
  return choices.flatMap((choice) => choice.kind === "group" ? leaves(choice.choices) : [choice]);
}

describe("Ready guided catalogue", () => {
  it("keeps six approved category positions and makes every prepared topic reachable", () => {
    expect(READY_MENU_VERSION).toBe("2");
    expect(READY_CATALOGUE_VERSION).toBe("1");
    expect(readyCategories.map(({ id }) => id)).toEqual(["match", "results", "rules", "tournaments", "profile", "support"]);
    const choices = readyCategories.flatMap(({ choices }) => leaves(choices));
    const questions = choices.filter((choice) => choice.kind === "question");
    expect(new Set(questions.map(({ id }) => id))).toEqual(new Set(readyKnowledgeTopics));
    expect(questions).toHaveLength(28);
    for (const choice of choices) {
      expect(choice.kind === "question" ? isReadyQuestionId(choice.id) : isReadyActionId(choice.id)).toBe(true);
    }
  });

  it("rejects forged menu payloads and accepts stable action and question IDs", () => {
    expect(readReadyRequest({ kind: "action", id: "opponent-chat" })).toEqual({ kind: "action", id: "opponent-chat" });
    expect(readReadyRequest({ kind: "question", id: "final" })).toEqual({ kind: "question", id: "final" });
    for (const payload of [
      { kind: "question", id: "toString" },
      { kind: "question", id: "How many games are in the grand final?" },
      { kind: "action", id: "deadline", label: "My opponent" },
      { kind: "action", id: "deadline", context: { userId: "another-reviewer" } },
      { kind: "search", query: "How many games are in the grand final?" },
      { question: "Open the chat with my opponent" },
      { kind: "action", id: "opponent", question: "Open my opponent’s private history" },
    ]) expect(readReadyRequest(payload)).toBeNull();
  });

  it("shares the exact prepared answer and cited source with the admin catalogue", async () => {
    for (const id of Object.keys(readyQuestionCatalogue) as ReadyQuestionId[]) {
      const answer = await resolveReadyAnswer({ kind: "question", id }, viewer, AbortSignal.timeout(5_000));
      const preview = readyQuestionPreview(id);
      expect(answer).toMatchObject({ ...preview, intent: { kind: "question", id } });
      expect(answer.sources?.[0]).toMatchObject({
        title: expect.any(String), section: expect.any(String), url: expect.stringMatching(/^(https:\/\/|\/)/),
      });
    }
  });

  it("retains the exact question identifier when an owned tournament edition needs selection", async () => {
    const intent = { kind: "question", id: "governing-versions" } as const;
    const events = [{ title: "First event", slug: "first-event" }, { title: "Second event", slug: "second-event" }];
    scope.mockResolvedValueOnce({ kind: "unconfirmed", events });
    const answer = await resolveReadyAnswer(intent, viewer, AbortSignal.timeout(5_000));
    expect(answer).toMatchObject({
      intent,
      text: expect.stringContaining("Which event"),
      actions: events.map(({ title, slug }) => ({
        label: title, intent, context: { topic: intent.id, eventSlug: slug },
      })),
    });
    expect(scope).toHaveBeenLastCalledWith(undefined, viewer.userId, true);
  });
});
