import "server-only";

import { auth } from "@clerk/nextjs/server";

import { hasCurrentPatch2AdminAccess } from "@/lib/patch2-admin-access";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { isReadyEngagementEnabled, isReadyProductionEnabled, readyReviewAliases } from "./review-access";

export const READY_USAGE_TIMEZONE = "Australia/Sydney";
const DAY_MS = 86_400_000;
const MAX_RANGE_DAYS = 366;
const REPORT_TIMEOUT_MS = 6_000;
const versionPattern = /^[0-9]{1,8}$/;
const aggregateIdPattern = /^[a-z][a-z0-9_-]{0,63}$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const sydneyDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: READY_USAGE_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit",
});

export type ReadyUsageSearchParams = Record<string, string | string[] | undefined>;
type UsagePeriod = "7d" | "30d" | "custom";
type UsageCohort = "reviewer" | "player";
type UsageVersion = { menuVersion: string; catalogueVersion: string };

export type ReadyUsageFilters = {
  period: UsagePeriod;
  start: string;
  end: string;
  today: string;
  retainedFrom: string;
  cohort: UsageCohort;
  version: UsageVersion | null;
  invalidRange: boolean;
};

const totalKeys = [
  "manualOpenings", "categorySelections", "questionSelections", "answerDisplays",
  "actionClicks", "unmatchedSearches", "fallbacks", "technicalErrors", "helpful", "stillNeedHelp",
] as const;
const trendKeys = ["manualOpenings", "answerDisplays", "actionClicks"] as const;
const questionKeys = ["selections", "displays", "helpful", "stillNeedHelp"] as const;

type Counts<Key extends string> = Record<Key, number>;
type UsageCount = { id: string; count: number };

export type ReadyUsageReport = {
  coverage: { availableFrom: string | null; retainedDetailFrom: string; collected: boolean; timezone: typeof READY_USAGE_TIMEZONE };
  versions: UsageVersion[];
  totals: Counts<(typeof totalKeys)[number]> & { engagedAccounts: number | null; engagedSessions: number | null; missingTopics: number };
  trend: (Counts<(typeof trendKeys)[number]> & { date: string })[];
  categories: UsageCount[];
  missingByCategory: UsageCount[];
  questions: (Counts<(typeof questionKeys)[number]> & { id: string })[];
  destinations: UsageCount[];
  errors: UsageCount[];
};

export type ReadyUsageResult = { status: "unauthorized" } | ({ filters: ReadyUsageFilters } & (
  { status: "ready"; report: ReadyUsageReport } | { status: "unavailable" | "not-collected" | "outside-retention" }
));

export function dateInSydney(now = new Date()): string {
  const parts = Object.fromEntries(sydneyDate.formatToParts(now).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function dateOrdinal(value: unknown): number | null {
  if (typeof value !== "string" || !datePattern.test(value)) return null;
  const date = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(date) && new Date(date).toISOString().slice(0, 10) === value ? date : null;
}

function dateIsValid(value: unknown): value is string {
  return dateOrdinal(value) !== null;
}

function isVersion(value: unknown): value is string {
  return typeof value === "string" && versionPattern.test(value);
}

export function readyUsageVersionKey({ menuVersion, catalogueVersion }: UsageVersion) {
  return `${menuVersion}/${catalogueVersion}`;
}

function parseVersion(value: unknown): UsageVersion | null {
  if (typeof value !== "string") return null;
  const [menuVersion, catalogueVersion, extra] = value.split("/");
  return extra === undefined && isVersion(menuVersion) && isVersion(catalogueVersion)
    ? { menuVersion, catalogueVersion } : null;
}

function retainedDateFrom(today: string): string {
  const [year, month, day] = today.split("-").map(Number);
  const lastDayLastYear = new Date(Date.UTC(year - 1, month, 0)).getUTCDate();
  return new Date(Date.UTC(year - 1, month - 1, Math.min(day, lastDayLastYear) + 1)).toISOString().slice(0, 10);
}

export function parseReadyUsageFilters(params: ReadyUsageSearchParams, now = new Date()): ReadyUsageFilters {
  const today = dateInSydney(now);
  const todayOrdinal = Date.parse(`${today}T00:00:00.000Z`);
  const requestedStart = dateOrdinal(params.start);
  const requestedEnd = dateOrdinal(params.end);
  const requestedCustom = params.period === "custom";
  const validCustom = requestedCustom && requestedStart !== null && requestedEnd !== null &&
    requestedStart <= requestedEnd && requestedEnd <= todayOrdinal && requestedEnd - requestedStart < MAX_RANGE_DAYS * DAY_MS;
  const period = validCustom ? "custom" : params.period === "7d" ? "7d" : "30d";
  const presetDays = period === "7d" ? 7 : 30;
  return {
    period,
    start: validCustom ? new Date(requestedStart).toISOString().slice(0, 10)
      : new Date(todayOrdinal - (presetDays - 1) * DAY_MS).toISOString().slice(0, 10),
    end: validCustom ? new Date(requestedEnd).toISOString().slice(0, 10) : today,
    today,
    retainedFrom: retainedDateFrom(today),
    cohort: params.cohort === "player" ? "player" : "reviewer",
    version: parseVersion(params.version),
    invalidRange: requestedCustom && !validCustom,
  };
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid report object");
  return value as Record<string, unknown>;
}

function array<T>(value: unknown, map: (item: unknown) => T, max: number): T[] {
  if (!Array.isArray(value) || value.length > max) throw new Error("Invalid report rows");
  return value.map(map);
}

function count(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error("Invalid report count");
  return value;
}

function counts<Key extends string>(value: Record<string, unknown>, keys: readonly Key[]): Counts<Key> {
  return Object.fromEntries(keys.map((key) => [key, count(value[key])])) as Counts<Key>;
}

function aggregateId(value: unknown): string {
  if (typeof value !== "string" || !aggregateIdPattern.test(value)) throw new Error("Invalid aggregate ID");
  return value;
}

function usageCount(value: unknown): UsageCount {
  const entry = record(value);
  return { id: aggregateId(entry.id), count: count(entry.count) };
}

/** Select only documented aggregate fields before they reach the report page. */
function normalizeReport(value: unknown, filters: ReadyUsageFilters): ReadyUsageReport {
  const root = record(value);
  const coverage = record(root.coverage);
  const totals = record(root.totals);
  if ((coverage.availableFrom !== null && !dateIsValid(coverage.availableFrom)) ||
    !dateIsValid(coverage.retainedDetailFrom) || typeof coverage.collected !== "boolean" ||
    coverage.timezone !== READY_USAGE_TIMEZONE) throw new Error("Invalid report coverage");
  const exactStart = coverage.availableFrom && coverage.availableFrom > filters.start ? coverage.availableFrom : filters.start;
  const exactCoverage = !coverage.availableFrom || exactStart >= coverage.retainedDetailFrom;
  return {
    coverage: {
      availableFrom: coverage.availableFrom,
      retainedDetailFrom: coverage.retainedDetailFrom,
      collected: coverage.collected,
      timezone: READY_USAGE_TIMEZONE,
    },
    versions: array(root.versions, (value) => {
      const { menuVersion, catalogueVersion } = record(value);
      if (!isVersion(menuVersion) || !isVersion(catalogueVersion)) throw new Error("Invalid report version");
      return { menuVersion, catalogueVersion };
    }, 128),
    totals: {
      ...counts(totals, totalKeys),
      missingTopics: totals.missingTopics === undefined ? 0 : count(totals.missingTopics),
      engagedAccounts: totals.engagedAccounts === null || !exactCoverage ? null : count(totals.engagedAccounts),
      engagedSessions: totals.engagedSessions === null || !exactCoverage ? null : count(totals.engagedSessions),
    },
    trend: array(root.trend, (value) => {
      const entry = record(value);
      if (!dateIsValid(entry.date) || entry.date < filters.start || entry.date > filters.end) throw new Error("Invalid report date");
      return { ...counts(entry, trendKeys), date: entry.date };
    }, MAX_RANGE_DAYS),
    categories: array(root.categories, usageCount, 128),
    missingByCategory: root.missingByCategory === undefined ? [] : array(root.missingByCategory, usageCount, 7),
    questions: array(root.questions, (value) => {
      const entry = record(value);
      return { ...counts(entry, questionKeys), id: aggregateId(entry.id) };
    }, 256),
    destinations: array(root.destinations, usageCount, 128),
    errors: root.errors === undefined ? [] : array(root.errors, usageCount, 128),
  };
}

export async function loadReadyUsageReport(params: ReadyUsageSearchParams): Promise<ReadyUsageResult> {
  if (!isReadyEngagementEnabled()) return { status: "unauthorized" };
  const identity = await auth().catch(() => null);
  if (!identity) return { status: "unauthorized" };
  const { userId, sessionId, sessionClaims } = identity;
  if (!userId || !await hasCurrentPatch2AdminAccess(userId, sessionClaims, sessionId)) {
    return { status: "unauthorized" };
  }
  const filters = parseReadyUsageFilters(params);
  if (filters.cohort === "player" || (!isReadyProductionEnabled() && !readyReviewAliases(process.env).length)) {
    return { status: "not-collected", filters };
  }
  if (filters.end < filters.retainedFrom) return { status: "outside-retention", filters };

  let report: ReadyUsageReport;
  try {
    const { data, error } = await createSupabaseAdminClient().rpc("get_ready_usage_report", {
      p_start: filters.start < filters.retainedFrom ? filters.retainedFrom : filters.start,
      p_end: filters.end,
      p_menu_version: filters.version?.menuVersion ?? null,
      p_catalogue_version: filters.version?.catalogueVersion ?? null,
      p_cohort: filters.cohort,
    }).abortSignal(AbortSignal.timeout(REPORT_TIMEOUT_MS));
    if (error) return { status: "unavailable", filters };
    report = normalizeReport(data, filters);
  } catch {
    return { status: "unavailable", filters };
  }
  if (!await hasCurrentPatch2AdminAccess(userId, sessionClaims, sessionId, false, { refreshClerkAuthority: true })) {
    return { status: "unauthorized" };
  }
  return { status: "ready", filters, report };
}
