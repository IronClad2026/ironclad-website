import { describe, expect, it } from "vitest";
import { countCurrentThoughtCodePoints, validateCurrentThought, isShowcaseRevision, isShowcaseUuid } from "@/lib/player-showcase/validation";

describe("Current Thought normalization and limits", () => {
  it.each([
    [null, null], ["", null], [" \t\r\n ", null], ["  Ready  ", "Ready"],
    ["e\u0301", "é"], ["one\r\ntwo\tthree\u2028four\u2029five", "one  two three four five"],
    ["العربية فارسی\u200c 中文 한글", "العربية فارسی\u200c 中文 한글"],
    ["👩‍👩‍👧‍👦", "👩‍👩‍👧‍👦"],
    ['<img src=x onerror="alert(1)">', '<img src=x onerror="alert(1)">'],
    ["https://example.test/<script>", "https://example.test/<script>"],
  ])("normalizes %j as inert text", (input, expected) => {
    expect(validateCurrentThought(input)).toEqual({ ok: true, value: expected, count: Array.from(expected ?? "").length });
  });
  it.each(["a", "😀", "字", "e\u0301"])("accepts 160 normalized %s code points", (unit) => {
    expect(validateCurrentThought(unit.repeat(160)).ok).toBe(true);
    expect(validateCurrentThought(unit.repeat(161))).toMatchObject({ ok: false, code: "thoughtTooLong", count: 161 });
  });
  it("counts emoji and NFC without UTF-16 length", () => {
    expect(countCurrentThoughtCodePoints("😀e\u0301")).toBe(2);
  });
  it.each(["\u0000", "\u000b", "\u000c", "\u001f", "\u007f", "\u0085", "\u009f", "\u202a", "\u202b", "\u202c", "\u202d", "\u202e", "\u2066", "\u2067", "\u2068", "\u2069", "\ud800", "\udfff"])("rejects forbidden code point %j even at edges", (control) => {
    expect(validateCurrentThought(control + "valid")).toMatchObject({ ok: false, code: "thoughtInvalid" });
    expect(validateCurrentThought("valid" + control)).toMatchObject({ ok: false, code: "thoughtInvalid" });
  });
  it.each([undefined, 12, false, {}, ["text"]])("rejects nontext payload %j", (input) => {
    expect(validateCurrentThought(input)).toMatchObject({ ok: false, code: "thoughtInvalid" });
  });
  it("validates UUID and exact safe nonnegative revision", () => {
    expect(isShowcaseUuid("930daaa0-e658-4476-9c47-36ded9651ba4")).toBe(true);
    for (const value of ["", "user_abc", {}, null]) expect(isShowcaseUuid(value)).toBe(false);
    for (const value of [0, 1, 42, Number.MAX_SAFE_INTEGER]) expect(isShowcaseRevision(value)).toBe(true);
    for (const value of ["1", -1, 0.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) expect(isShowcaseRevision(value)).toBe(false);
  });
});
