import { describe, expect, it } from "vitest";
import { readReadySuggestion } from "@/lib/ready/suggestion-contract";

const suggestion = {
  submissionId: "c92a3f38-9d51-47c3-b225-e8336bd33b02",
  description: "  Add a topic explaining replay uploads.\r\nWhere can I start? ",
  categoryId: "results",
};

describe("Ready topic suggestion input", () => {
  it("preserves multiline text and accepts an omitted category", () => {
    expect(readReadySuggestion(suggestion)).toEqual({
      ...suggestion,
      description: "Add a topic explaining replay uploads.\nWhere can I start?",
    });
    expect(readReadySuggestion({ ...suggestion, categoryId: undefined })?.categoryId).toBeNull();
  });

  it.each([
    { submissionId: "random" },
    { submissionId: `${suggestion.submissionId}\n` },
    { description: " \n\t " },
    { description: "a".repeat(501) },
    { description: "\u0000text" },
    { description: "\ud800text" },
    { categoryId: "guessed" },
    { email: "unexpected@example.test" },
  ])("rejects invalid or extra input", (patch) => {
    expect(readReadySuggestion({ ...suggestion, ...patch })).toBeNull();
  });
});
