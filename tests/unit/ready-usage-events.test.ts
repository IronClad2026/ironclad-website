import { describe, expect, it } from "vitest";
import { readReadyUsageRequest } from "@/lib/ready/usage-events";

const id = "1ec8bccd-00bf-40e2-9ed0-aa6abc686504";
const envelope = { kind: "event", epoch: id, browserId: id, eventId: id };

describe("Ready usage payloads", () => {
  it("accepts consent and registered topic IDs", () => {
    expect(readReadyUsageRequest({ kind: "choice", enabled: false })).toEqual({ kind: "choice", enabled: false });
    const request = { ...envelope, event: { type: "question_select", questionId: "disconnects", categoryId: "rules" } };
    expect(readReadyUsageRequest(request)).toEqual(request);
  });

  it.each(["actorId", "accountId", "role", "environment", "cohort", "menuVersion", "destinationType"])(
    "rejects client-supplied authority and source classifications (%s)", (field) => {
      expect(readReadyUsageRequest({ ...envelope, [field]: "forged", event: { type: "engage" } })).toBeNull();
    },
  );

  it.each([
    { type: "search_outcome", outcome: "no_result", query: "private text" },
    { type: "search_outcome", outcome: "ambiguous", questionId: "disconnects" },
    { type: "question_select", questionId: "invented" },
    { type: "action_click", actionId: "invented", href: "/private/match" },
    { type: "answer_display", questionId: "disconnects", answerInstanceId: "invalid" },
    { type: "helpfulness", questionId: "disconnects", answerInstanceId: id, helpful: "yes" },
    { type: "engage", morale: "private preference" },
    { type: "technical_error", outcome: "private upstream data" },
  ])("rejects unknown, malformed, or private values ($type)", (event) => {
    expect(readReadyUsageRequest({ ...envelope, event })).toBeNull();
  });
});
