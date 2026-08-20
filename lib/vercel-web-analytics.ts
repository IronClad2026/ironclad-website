import "server-only";

import { auth } from "@clerk/nextjs/server";

import { sanitizeAnalyticsBreakdownPath } from "@/lib/analytics-route-policy";
import type {
  WebsiteTrafficAnalytics,
  WebsiteTrafficBreakdownPoint,
  WebsiteTrafficDailyPoint,
  WebsiteTrafficMetric,
  WebsiteTrafficUnavailableReason,
} from "@/lib/vercel-web-analytics-types";

type CustomClaims = { metadata?: { role?: string } };

type VercelAnalyticsConfiguration = {
  accessToken: string;
  projectId: string;
  teamId: string;
};

type UtcWindow = {
  startInclusive: Date;
  endExclusive: Date;
  providerUntilInclusive: Date;
};

type AggregateDimension =
  | "day"
  | "requestPath"
  | "country"
  | "referrerHostname"
  | "deviceType"
  | "browserName"
  | "osName";

type ProviderFailureKind = "plan-restriction" | "rate-limited" | "provider";

class ProviderFailure extends Error {
  readonly kind: ProviderFailureKind;

  constructor(kind: ProviderFailureKind) {
    super("Website traffic provider request failed.");
    this.name = "ProviderFailure";
    this.kind = kind;
  }
}

const VERCEL_ANALYTICS_API_ORIGIN = "https://api.vercel.com";
const VERCEL_ANALYTICS_API_PATH = "/v1/query/web-analytics/visits";
const VERCEL_ANALYTICS_TIMEOUT_MS = 8_000;
const VERCEL_ANALYTICS_RESPONSE_LIMIT = 256_000;
const BREAKDOWN_LIMIT = 8;
const TREND_LIMIT = 31;
const PRODUCTION_FILTER = "environment eq 'production'";
const DAY_MS = 86_400_000;
const MAX_LABEL_LENGTH = 128;
const CONFIGURATION_ID_PATTERN = /^(?:prj|team)_[A-Za-z0-9]+$/;
const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;

/**
 * Loads read-only Production Web Analytics for an authenticated Admin.
 * Authorization deliberately precedes every environment read and network call.
 */
export async function loadAdminWebsiteTraffic(): Promise<WebsiteTrafficAnalytics | null> {
  let identity: Awaited<ReturnType<typeof auth>>;

  try {
    identity = await auth();
  } catch {
    return null;
  }

  const role = (identity.sessionClaims as CustomClaims | null)?.metadata?.role;
  if (!identity.userId || role !== "admin") return null;

  try {
    return await loadAuthorizedAdminWebsiteTraffic();
  } catch (caught) {
    if (caught instanceof ProviderFailure) {
      if (caught.kind === "plan-restriction") {
        return unavailable("plan-restriction");
      }
      if (caught.kind === "rate-limited") {
        return unavailable("rate-limited");
      }
    }

    return unavailable("provider-unavailable");
  }
}

async function loadAuthorizedAdminWebsiteTraffic(): Promise<WebsiteTrafficAnalytics> {
  if (process.env.VERCEL_ENV !== "production") {
    return unavailable("non-production");
  }

  const configuration = readConfiguration();
  if (!configuration) return unavailable("missing-configuration");

  const now = new Date();
  if (Number.isNaN(now.getTime())) return unavailable("provider-unavailable");

  const windows = resolveUtcWindows(now);
  const [
    today,
    sevenDays,
    thirtyDays,
    trend,
    routes,
    countries,
    referrers,
    devices,
    browsers,
    operatingSystems,
  ] = await Promise.all([
    requestCount(configuration, windows.today),
    requestCount(configuration, windows.sevenDays),
    requestCount(configuration, windows.thirtyDays),
    requestTrend(configuration, windows.thirtyDays),
    requestBreakdown(configuration, windows.thirtyDays, "requestPath"),
    requestBreakdown(configuration, windows.thirtyDays, "country"),
    requestBreakdown(
      configuration,
      windows.thirtyDays,
      "referrerHostname"
    ),
    requestBreakdown(configuration, windows.thirtyDays, "deviceType"),
    requestBreakdown(configuration, windows.thirtyDays, "browserName"),
    requestBreakdown(configuration, windows.thirtyDays, "osName"),
  ]);

  return {
    status: "available",
    generatedAt: now.toISOString(),
    timezone: "UTC",
    summary: { today, sevenDays, thirtyDays },
    trend,
    breakdowns: {
      routes,
      countries,
      referrers,
      devices,
      browsers,
      operatingSystems,
    },
  };
}

function unavailable(
  reason: WebsiteTrafficUnavailableReason
): WebsiteTrafficAnalytics {
  return { status: "unavailable", reason };
}

function readConfiguration(): VercelAnalyticsConfiguration | null {
  const accessToken = process.env.VERCEL_ANALYTICS_ACCESS_TOKEN;
  const teamId = process.env.VERCEL_ANALYTICS_TEAM_ID;
  const projectId =
    process.env.VERCEL_ANALYTICS_PROJECT_ID ?? process.env.VERCEL_PROJECT_ID;

  if (
    !isValidSecret(accessToken) ||
    !isValidConfigurationId(teamId, "team_") ||
    !isValidConfigurationId(projectId, "prj_")
  ) {
    return null;
  }

  return { accessToken, teamId, projectId };
}

function isValidSecret(value: string | undefined): value is string {
  return Boolean(
    value &&
      value.length <= 4_096 &&
      value === value.trim() &&
      !/[\u0000-\u0020\u007f]/.test(value)
  );
}

function isValidConfigurationId(
  value: string | undefined,
  prefix: "prj_" | "team_"
): value is string {
  return Boolean(
    value &&
      value.length <= 128 &&
      value.startsWith(prefix) &&
      CONFIGURATION_ID_PATTERN.test(value)
  );
}

function resolveUtcWindows(now: Date) {
  const todayStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  const endExclusive = new Date(now.getTime());
  const providerUntilInclusive = new Date(endExclusive.getTime() - 1);

  const windowFromDays = (days: number): UtcWindow => ({
    startInclusive: new Date(todayStart.getTime() - (days - 1) * DAY_MS),
    endExclusive,
    providerUntilInclusive,
  });

  return {
    today: windowFromDays(1),
    sevenDays: windowFromDays(7),
    thirtyDays: windowFromDays(30),
  };
}

async function requestCount(
  configuration: VercelAnalyticsConfiguration,
  window: UtcWindow
): Promise<WebsiteTrafficMetric> {
  if (window.endExclusive <= window.startInclusive) {
    return { visitors: 0, pageViews: 0 };
  }

  const payload = await requestJson(
    configuration,
    createApiUrl(configuration, "/count", window)
  );

  if (!isProviderEnvelope(payload) || !isRecord(payload.data)) {
    throw new ProviderFailure("provider");
  }

  const visitors = parseCount(payload.data.visitors);
  const pageViews = parseCount(payload.data.pageviews);
  if (visitors === null || pageViews === null) {
    throw new ProviderFailure("provider");
  }

  return { visitors, pageViews };
}

async function requestTrend(
  configuration: VercelAnalyticsConfiguration,
  window: UtcWindow
): Promise<WebsiteTrafficDailyPoint[]> {
  const payload = await requestJson(
    configuration,
    createApiUrl(configuration, "/aggregate", window, "day", TREND_LIMIT)
  );
  const rows = parseAggregateEnvelope(payload, "day", TREND_LIMIT);
  const seenDates = new Set<string>();

  const points = rows.map((row) => {
    const timestamp = row.timestamp;
    const visitors = parseCount(row.visitors);
    const pageViews = parseCount(row.pageviews);

    if (
      typeof timestamp !== "string" ||
      visitors === null ||
      pageViews === null
    ) {
      throw new ProviderFailure("provider");
    }

    const parsedTimestamp = new Date(timestamp);
    if (Number.isNaN(parsedTimestamp.getTime())) {
      throw new ProviderFailure("provider");
    }
    const date = parsedTimestamp.toISOString().slice(0, 10);
    const midnight = `${date}T00:00:00.000Z`;

    if (
      parsedTimestamp.toISOString() !== midnight ||
      parsedTimestamp < window.startInclusive ||
      parsedTimestamp >= window.endExclusive ||
      seenDates.has(date)
    ) {
      throw new ProviderFailure("provider");
    }

    seenDates.add(date);
    return { date, visitors, pageViews };
  });

  return points.sort((left, right) => left.date.localeCompare(right.date));
}

async function requestBreakdown(
  configuration: VercelAnalyticsConfiguration,
  window: UtcWindow,
  dimension: Exclude<AggregateDimension, "day">
): Promise<WebsiteTrafficBreakdownPoint[]> {
  const payload = await requestJson(
    configuration,
    createApiUrl(
      configuration,
      "/aggregate",
      window,
      dimension,
      BREAKDOWN_LIMIT
    )
  );
  const rows = parseAggregateEnvelope(payload, dimension, BREAKDOWN_LIMIT);
  const points: WebsiteTrafficBreakdownPoint[] = [];

  for (const row of rows) {
    const rawLabel = row[dimension];
    const label =
      dimension === "requestPath"
        ? sanitizeAnalyticsBreakdownPath(rawLabel)
        : sanitizeDimensionLabel(rawLabel, dimension);
    const visitors = parseCount(row.visitors);
    const pageViews = parseCount(row.pageviews);

    if (visitors === null || pageViews === null) {
      throw new ProviderFailure("provider");
    }

    // Provider roll-ups and any unexpected path fail closed instead of entering
    // the serialized Admin model. Other metric dimensions are bounded below.
    if (label === null) continue;
    points.push({ label, visitors, pageViews });
  }

  return points;
}

function createApiUrl(
  configuration: VercelAnalyticsConfiguration,
  suffix: "/count" | "/aggregate",
  window: UtcWindow,
  by?: AggregateDimension,
  limit?: number
) {
  const url = new URL(
    `${VERCEL_ANALYTICS_API_PATH}${suffix}`,
    VERCEL_ANALYTICS_API_ORIGIN
  );
  url.searchParams.set("projectId", configuration.projectId);
  url.searchParams.set("teamId", configuration.teamId);
  url.searchParams.set("since", window.startInclusive.toISOString());
  url.searchParams.set("until", window.providerUntilInclusive.toISOString());
  url.searchParams.set("filter", PRODUCTION_FILTER);
  if (by) url.searchParams.set("by", by);
  if (limit !== undefined) url.searchParams.set("limit", String(limit));
  return url;
}

async function requestJson(
  configuration: VercelAnalyticsConfiguration,
  url: URL
): Promise<unknown> {
  let response: Response;

  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${configuration.accessToken}`,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(VERCEL_ANALYTICS_TIMEOUT_MS),
    });
  } catch {
    throw new ProviderFailure("provider");
  }

  if (!response.ok) {
    if (response.status === 402) {
      throw new ProviderFailure("plan-restriction");
    }
    if (response.status === 429) {
      throw new ProviderFailure("rate-limited");
    }
    throw new ProviderFailure("provider");
  }

  const declaredLength = response.headers.get("content-length");
  if (
    declaredLength !== null &&
    (!/^\d+$/.test(declaredLength) ||
      Number(declaredLength) > VERCEL_ANALYTICS_RESPONSE_LIMIT)
  ) {
    throw new ProviderFailure("provider");
  }

  let text: string;
  try {
    text = await response.text();
  } catch {
    throw new ProviderFailure("provider");
  }

  if (text.length === 0 || text.length > VERCEL_ANALYTICS_RESPONSE_LIMIT) {
    throw new ProviderFailure("provider");
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderFailure("provider");
  }
}

function isProviderEnvelope(
  payload: unknown
): payload is { version: number; query: Record<string, unknown>; data: unknown } {
  if (!isRecord(payload) || !isRecord(payload.query)) return false;

  return (
    typeof payload.version === "number" &&
    Number.isFinite(payload.version) &&
    typeof payload.query.since === "string" &&
    typeof payload.query.until === "string" &&
    (payload.query.filter === undefined ||
      typeof payload.query.filter === "string")
  );
}

function parseAggregateEnvelope(
  payload: unknown,
  dimension: AggregateDimension,
  limit: number
): Record<string, unknown>[] {
  if (
    !isProviderEnvelope(payload) ||
    !Array.isArray(payload.data) ||
    payload.data.length > limit + 1 ||
    typeof payload.query.limit !== "number" ||
    !Number.isSafeInteger(payload.query.limit) ||
    payload.query.limit < 1 ||
    (payload.query.groupBy !== undefined &&
      (!Array.isArray(payload.query.groupBy) ||
        payload.query.groupBy.length !== 1 ||
        payload.query.groupBy[0] !== dimension))
  ) {
    throw new ProviderFailure("provider");
  }

  const rows: Record<string, unknown>[] = [];
  for (const row of payload.data) {
    if (!isRecord(row)) throw new ProviderFailure("provider");
    rows.push(row);
  }
  return rows;
}

function parseCount(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
    ? value
    : null;
}

function sanitizeDimensionLabel(
  candidate: unknown,
  dimension: Exclude<AggregateDimension, "day" | "requestPath">
): string | null {
  if (
    typeof candidate !== "string" ||
    candidate.length === 0 ||
    candidate.length > MAX_LABEL_LENGTH ||
    candidate !== candidate.trim() ||
    /[\u0000-\u001f\u007f<>]/.test(candidate) ||
    UUID_PATTERN.test(candidate)
  ) {
    return null;
  }

  if (dimension === "referrerHostname") {
    if (
      candidate !== "Others" &&
      candidate !== "Direct" &&
      candidate !== "None" &&
      (!/^[A-Za-z0-9.-]+$/.test(candidate) ||
        candidate.includes("..") ||
        candidate.startsWith(".") ||
        candidate.endsWith("."))
    ) {
      return null;
    }
  } else if (/[@\\/?#]/.test(candidate)) {
    return null;
  }

  return candidate;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
