import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE_MAX_AGE_SECONDS,
  LOCALE_COOKIE_NAME,
  LOCALE_OPTIONS,
  SUPPORTED_LOCALES,
  isLocale,
  resolveLocale,
  toIntlLocale,
} from "@/lib/i18n/config";
import {
  formatDateTime,
  formatNumber,
  formatRegionName,
  selectPlural,
} from "@/lib/i18n/format";

describe("locale configuration and formatting", () => {
  it("locks the eight launch locale identifiers and deterministic fallback", () => {
    expect(SUPPORTED_LOCALES).toEqual([
      "en",
      "it",
      "zh-CN",
      "ru",
      "es",
      "pt-BR",
      "ko",
      "fr",
    ]);
    expect(LOCALE_OPTIONS.map((option) => option.id)).toEqual(
      SUPPORTED_LOCALES
    );
    expect(LOCALE_OPTIONS.find((option) => option.id === "it")).toEqual({
      id: "it",
      code: "IT",
      label: "Italiano",
      indicator: "🇮🇹",
    });
    expect(DEFAULT_LOCALE).toBe("en");
    expect(LOCALE_COOKIE_NAME).toBe("ironclad_locale");
    expect(LOCALE_COOKIE_MAX_AGE_SECONDS).toBe(31_536_000);
    expect(isLocale("pt-BR")).toBe(true);
    expect(isLocale("it")).toBe(true);
    expect(isLocale("pt")).toBe(false);
    expect(resolveLocale("de")).toBe("en");
    expect(resolveLocale(undefined)).toBe("en");
  });

  it("uses the exact Italian Intl locale for dates, numbers, and percentages", () => {
    expect(toIntlLocale("it")).toBe("it-IT");
    expect(formatNumber(1234.5, "it")).toBe(
      new Intl.NumberFormat("it-IT").format(1234.5)
    );
    expect(
      formatNumber(0.125, "it", {
        style: "percent",
        maximumFractionDigits: 1,
      })
    ).toBe(
      new Intl.NumberFormat("it-IT", {
        style: "percent",
        maximumFractionDigits: 1,
      }).format(0.125)
    );
    expect(
      formatDateTime(
        "2026-08-18T14:30:00.000Z",
        "it",
        { kind: "utc" },
        { dateStyle: "medium", timeStyle: "short" }
      )
    ).toBe(
      new Intl.DateTimeFormat("it-IT", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "UTC",
      }).format(new Date("2026-08-18T14:30:00.000Z"))
    );
  });

  it("requires explicit timezone semantics for dates", () => {
    const instant = "2026-08-18T14:30:00.000Z";
    const options: Intl.DateTimeFormatOptions = {
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
      month: "2-digit",
      year: "numeric",
    };

    const utc = formatDateTime(instant, "en", { kind: "utc" }, options);
    const sydney = formatDateTime(
      instant,
      "en",
      { kind: "australia-sydney" },
      options
    );

    expect(utc).toContain("14");
    expect(sydney).toContain("00");
    expect(utc).not.toBe(sydney);
  });

  it("uses locale-aware number, region, and Russian plural presentation", () => {
    expect(formatNumber(1234.5, "fr")).toContain(",5");
    const frenchPercent = formatNumber(0.125, "fr", {
      style: "percent",
      maximumFractionDigits: 1,
    });
    expect(frenchPercent).toContain("12,5");
    expect(frenchPercent).toContain("%");
    expect(frenchPercent).not.toBe("12.5%");
    expect(formatRegionName("BR", "pt-BR")).not.toBe("BR");
    expect(selectPlural(1, "ru")).toBe("one");
    expect(selectPlural(2, "ru")).toBe("few");
    expect(selectPlural(5, "ru")).toBe("many");
    expect(selectPlural(21, "ru")).toBe("one");
  });
});
