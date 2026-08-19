import { toIntlLocale, type Locale } from "@/lib/i18n/config";

export type TimeZoneSemantics =
  | { kind: "local" }
  | { kind: "utc" }
  | { kind: "australia-sydney" }
  | { kind: "tournament"; timeZone: string };

type DateTimeValue = Date | number | string;

function toDate(value: DateTimeValue): Date {
  return value instanceof Date ? value : new Date(value);
}

function getTimeZone(
  semantics: TimeZoneSemantics
): string | undefined {
  switch (semantics.kind) {
    case "local":
      return undefined;
    case "utc":
      return "UTC";
    case "australia-sydney":
      return "Australia/Sydney";
    case "tournament":
      return semantics.timeZone;
  }
}

export function formatDateTime(
  value: DateTimeValue,
  locale: Locale,
  semantics: TimeZoneSemantics,
  options: Intl.DateTimeFormatOptions = {
    dateStyle: "medium",
    timeStyle: "short",
  }
): string {
  return new Intl.DateTimeFormat(toIntlLocale(locale), {
    ...options,
    timeZone: getTimeZone(semantics),
  }).format(toDate(value));
}

export function formatNumber(
  value: number | bigint,
  locale: Locale,
  options?: Intl.NumberFormatOptions
): string {
  return new Intl.NumberFormat(toIntlLocale(locale), options).format(value);
}

export function selectPlural(
  value: number,
  locale: Locale,
  options?: Intl.PluralRulesOptions
): Intl.LDMLPluralRule {
  return new Intl.PluralRules(toIntlLocale(locale), options).select(value);
}

export function formatRelativeTime(
  value: number,
  unit: Intl.RelativeTimeFormatUnit,
  locale: Locale,
  options?: Intl.RelativeTimeFormatOptions
): string {
  return new Intl.RelativeTimeFormat(toIntlLocale(locale), options).format(
    value,
    unit
  );
}

export function formatRegionName(
  regionCode: string,
  locale: Locale,
  fallback = regionCode
): string {
  try {
    return (
      new Intl.DisplayNames([toIntlLocale(locale)], { type: "region" }).of(
        regionCode
      ) ?? fallback
    );
  } catch {
    return fallback;
  }
}
