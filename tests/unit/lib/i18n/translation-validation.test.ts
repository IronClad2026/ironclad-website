import { describe, expect, it } from "vitest";
import {
  getDictionaryMessage,
  getInterpolationVariables,
  interpolateMessage,
  translate,
} from "@/lib/i18n/translate";
import {
  assertDictionaryValid,
  validateDictionary,
} from "@/lib/i18n/validation";

const english = {
  match: {
    ready: "{player} is ready for Match {number}.",
    retry: "Retry",
  },
};

describe("dictionary lookup and validation", () => {
  it("looks up nested semantic keys and interpolates named values", () => {
    expect(getDictionaryMessage(english, "match.retry")).toBe("Retry");
    expect(getDictionaryMessage(english, "match.missing")).toBeUndefined();
    expect(
      translate(english, "match.ready", { player: "Ari", number: 3 })
    ).toBe("Ari is ready for Match 3.");
    expect(translate(english, "match.missing")).toBe("match.missing");
    expect(interpolateMessage("{count} games", { count: 2 })).toBe(
      "2 games"
    );
    expect(getInterpolationVariables("{b} {a} {b}")).toEqual(["a", "b"]);
  });

  it("rejects missing, extra, blank, invalid, and mismatched values", () => {
    const issues = validateDictionary(english, {
      match: {
        ready: "{player} está listo.",
        retry: "  ",
        extra: "Extra",
      },
    });

    expect(issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "INTERPOLATION_MISMATCH",
        "BLANK_VALUE",
        "EXTRA_KEY",
      ])
    );
    expect(() => assertDictionaryValid(english, {}, "test/es")).toThrow(
      /MISSING_KEY/
    );
    expect(
      validateDictionary(english, { match: "invalid" }).map(
        (issue) => issue.code
      )
    ).toContain("MISSING_KEY");
  });
});
