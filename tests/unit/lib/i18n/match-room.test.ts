import { describe, expect, it } from "vitest";
import { SUPPORTED_LOCALES, toIntlLocale } from "@/lib/i18n/config";
import { getMatchRoomControlCopy } from "@/lib/i18n/match-room-control";
import { getMatchRoomCopy } from "@/lib/i18n/match-room";
import type { MatchRoomErrorCode } from "@/lib/match-room";

const ERROR_CODES = [
  "auth_required",
  "forbidden",
  "invalid_request",
  "stale_room",
  "read_only",
  "disabled",
  "rate_limited",
  "idempotency_conflict",
  "legal_required",
  "legal_unavailable",
  "unavailable",
] satisfies MatchRoomErrorCode[];

describe("Match Room localization", () => {
  it.each(SUPPORTED_LOCALES)("provides emergency control copy in %s", (locale) => {
    const copy = getMatchRoomControlCopy(locale);
    expect(Object.keys(copy).sort()).toEqual(Object.keys(getMatchRoomControlCopy("en")).sort());
    for (const [key, value] of Object.entries(copy)) {
      expect(value.trim().length).toBeGreaterThan(0);
      if (locale !== "en") expect(value).not.toBe(getMatchRoomControlCopy("en")[key as keyof typeof copy]);
    }
  });
  it.each(SUPPORTED_LOCALES)("provides complete room and action copy in %s", (locale) => {
    const copy = getMatchRoomCopy(locale);
    expect(Object.keys(copy).sort()).toEqual(Object.keys(getMatchRoomCopy("en")).sort());
    expect(Object.keys(copy.errors).sort()).toEqual([...ERROR_CODES].sort());
    for (const value of Object.values(copy)) {
      if (typeof value === "string") expect(value.trim().length).toBeGreaterThan(0);
    }
    for (const code of ERROR_CODES) expect(copy.errors[code].trim().length).toBeGreaterThan(0);
    expect(copy.privateNotice).toContain("IronClad");
    expect(copy.historyNotice).toContain("50");
  });

  it.each(SUPPORTED_LOCALES)("formats both character counts with the %s locale", (locale) => {
    const copy = getMatchRoomCopy(locale);
    const number = new Intl.NumberFormat(toIntlLocale(locale));
    expect(copy.count(999, 1000)).toBe(
      `${number.format(999)} / ${number.format(1000)} ${copy.characterUnit}`
    );
    expect(copy.count(0, 1000)).toContain(number.format(0));
  });

  it("provides translated critical states without falling back to English", () => {
    const english = getMatchRoomCopy("en");
    for (const locale of SUPPORTED_LOCALES.filter((value) => value !== "en")) {
      const copy = getMatchRoomCopy(locale);
      for (const key of [
        "title", "privateNotice", "placeholder", "send", "sending", "retry",
        "readOnly", "historical", "empty", "newMessages", "historyNotice",
        "adminProfileRequired", "assistanceLabel", "assistanceSuccess",
        "discordOptional", "discordNotShared", "historyLoadFailed",
        "assistanceStatusNone", "assistanceStatusRequested", "assistanceStatusResolved",
        "assistanceRequestAgain", "assistanceReopen", "assistanceResolve", "assistanceResolving",
        "assistanceLoadFailed", "assistanceActionFailed", "assistanceRequestConfirmation",
        "assistanceResolutionConfirmation",
      ] as const) {
        expect(copy[key], `${locale}.${key}`).not.toBe(english[key]);
      }
      for (const code of ERROR_CODES) {
        expect(copy.errors[code], `${locale}.errors.${code}`).not.toBe(english.errors[code]);
      }
    }
  });

  it("keeps copy references stable for polling component dependencies", () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(getMatchRoomCopy(locale)).toBe(getMatchRoomCopy(locale));
    }
  });
});
