import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  adminIdentity,
  anonymousIdentity,
  playerIdentity,
} from "@/tests/fixtures/auth";

const authMock = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));

import { loadAdminWebsiteTraffic } from "@/lib/vercel-web-analytics";
import { ANALYTICS_APPROVED_REPORTING_PATHS } from "@/lib/analytics-route-policy";

const NOW = "2026-08-20T12:34:56.789Z";
const ACCESS_TOKEN = "test_vercel_token_private_marker";
const TEAM_ID = "team_test123";
const PROJECT_ID = "prj_test456";
const PROVIDER_ORIGIN = "https://api.vercel.com";
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const PRODUCTION_APPROVED_ROUTE_FILTER = `environment eq 'production' and requestPath in (${ANALYTICS_APPROVED_REPORTING_PATHS.map(
  (pathname) => `'${pathname}'`
).join(",")})`;
const ENVIRONMENT_KEYS = [
  "VERCEL_ENV",
  "VERCEL_ANALYTICS_ACCESS_TOKEN",
  "VERCEL_ANALYTICS_TEAM_ID",
  "VERCEL_ANALYTICS_PROJECT_ID",
  "VERCEL_PROJECT_ID",
] as const;

const originalEnvironment = Object.fromEntries(
  ENVIRONMENT_KEYS.map((key) => [key, process.env[key]])
);

function setProductionConfiguration() {
  process.env.VERCEL_ENV = "production";
  process.env.VERCEL_ANALYTICS_ACCESS_TOKEN = ACCESS_TOKEN;
  process.env.VERCEL_ANALYTICS_TEAM_ID = TEAM_ID;
  process.env.VERCEL_ANALYTICS_PROJECT_ID = PROJECT_ID;
  delete process.env.VERCEL_PROJECT_ID;
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function providerQuery(url: URL, by?: string) {
  const since = new Date(String(url.searchParams.get("since")));
  const requestedUntil = new Date(String(url.searchParams.get("until")));
  const boundaryMs = by === "day" ? DAY_MS : HOUR_MS;
  const until = new Date(
    (Math.floor(requestedUntil.getTime() / boundaryMs) + 1) * boundaryMs
  );

  return {
    since: since.toISOString().replace(".000Z", "Z"),
    until: until.toISOString().replace(".000Z", "Z"),
    ...(by && by !== "day" ? { groupBy: [by] } : {}),
    filter: url.searchParams.get("filter"),
    ...(by ? { limit: Number(url.searchParams.get("limit")) } : {}),
  };
}

type DailyProviderRow = {
  timestamp: string;
  visitors: number;
  pageviews: number;
};

const DEFAULT_DAILY_ROWS: DailyProviderRow[] = [
  {
    timestamp: "2026-08-20T00:00:00.000Z",
    visitors: 2,
    pageviews: 4,
  },
  {
    timestamp: "2026-08-19T00:00:00.000Z",
    visitors: 1,
    pageviews: 3,
  },
];

function utcDayRow(
  daysBeforeToday: number,
  visitors: number,
  pageviews: number
): DailyProviderRow {
  return {
    timestamp: new Date(
      Date.UTC(2026, 7, 20) - daysBeforeToday * 86_400_000
    ).toISOString(),
    visitors,
    pageviews,
  };
}

function aggregateRows(by: string | null): Record<string, unknown>[] {
  switch (by) {
    case "day":
      return DEFAULT_DAILY_ROWS;
    case "requestPath":
      return [
        { requestPath: "/", visitors: 12, pageviews: 20 },
        {
          requestPath: "/players/[playerId]",
          visitors: 4,
          pageviews: 8,
        },
        {
          requestPath: "/players/11111111-1111-4111-8111-111111111111",
          visitors: 3,
          pageviews: 5,
        },
        { requestPath: "/admin", visitors: 2, pageviews: 3 },
        { requestPath: "Others", visitors: 1, pageviews: 2 },
      ];
    case "country":
      return [{ country: "AU", visitors: 9, pageviews: 18 }];
    case "referrerHostname":
      return [
        { referrerHostname: "google.com", visitors: 6, pageviews: 11 },
        {
          referrerHostname: "https://private.example/path",
          visitors: 1,
          pageviews: 1,
        },
      ];
    case "deviceType":
      return [{ deviceType: "Desktop", visitors: 8, pageviews: 16 }];
    case "browserName":
      return [{ browserName: "Chrome", visitors: 7, pageviews: 13 }];
    case "osName":
      return [{ osName: "Windows", visitors: 6, pageviews: 12 }];
    default:
      return [];
  }
}

function successfulProviderResponse(
  input: RequestInfo | URL,
  dailyRows: Record<string, unknown>[] = DEFAULT_DAILY_ROWS
) {
  const url = new URL(String(input));

  // This reproduces the live defect: the provider adjusted the requested
  // partial current-day count window to a midnight boundary and returned a
  // misleading zero while the daily aggregate contained real traffic. The
  // corrected loader must never make this request.
  if (url.pathname.endsWith("/count")) {
    return jsonResponse({
      version: 1,
      query: {
        since: "2026-08-20T00:00:00.000Z",
        until: "2026-08-21T00:00:00.000Z",
        filter: url.searchParams.get("filter"),
      },
      data: { visitors: 0, pageviews: 0 },
    });
  }

  const by = url.searchParams.get("by");
  return jsonResponse({
    version: 1,
    query: providerQuery(url, by ?? undefined),
    data: by === "day" ? dailyRows : aggregateRows(by),
  });
}

function stubSuccessfulProvider(
  dailyRows: Record<string, unknown>[] = DEFAULT_DAILY_ROWS
) {
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockImplementation((input) =>
      Promise.resolve(successfulProviderResponse(input, dailyRows))
    );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function stubProviderQueryMutation(
  targetDimension: string,
  mutate: (query: Record<string, unknown>) => void
) {
  const fetchMock = vi.fn<typeof fetch>().mockImplementation((input) => {
    const url = new URL(String(input));
    const by = url.searchParams.get("by");
    const query = providerQuery(url, by ?? undefined) as Record<
      string,
      unknown
    >;

    if (by === targetDimension) mutate(query);

    return Promise.resolve(
      jsonResponse({
        version: 1,
        query,
        data: by === "day" ? DEFAULT_DAILY_ROWS : aggregateRows(by),
      })
    );
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const QUERY_MISMATCH_CASES: Array<
  [string, string, (query: Record<string, unknown>) => void]
> = [
  [
    "a wrong since instant",
    "country",
    (query) => {
      query.since = "2026-07-22T00:00:00.001Z";
    },
  ],
  [
    "a wrong normalized until instant",
    "country",
    (query) => {
      query.until = "2026-08-20T13:00:00.001Z";
    },
  ],
  [
    "a wrong normalized daily until instant",
    "day",
    (query) => {
      query.until = "2026-08-20T13:00:00Z";
    },
  ],
  [
    "a wrong filter",
    "country",
    (query) => {
      query.filter = PRODUCTION_APPROVED_ROUTE_FILTER.replace(
        "environment eq 'production'",
        "environment eq 'preview'"
      );
    },
  ],
  [
    "a filter missing the Production restriction",
    "country",
    (query) => {
      query.filter = PRODUCTION_APPROVED_ROUTE_FILTER.replace(
        "environment eq 'production' and ",
        ""
      );
    },
  ],
  [
    "missing filter metadata",
    "country",
    (query) => {
      delete query.filter;
    },
  ],
  [
    "the wrong breakdown group",
    "country",
    (query) => {
      query.groupBy = ["browserName"];
    },
  ],
  [
    "missing breakdown group metadata",
    "country",
    (query) => {
      delete query.groupBy;
    },
  ],
  [
    "malformed group metadata",
    "country",
    (query) => {
      query.groupBy = "country";
    },
  ],
  [
    "the wrong limit",
    "country",
    (query) => {
      query.limit = 7;
    },
  ],
  [
    "malformed limit metadata",
    "country",
    (query) => {
      query.limit = "8";
    },
  ],
  [
    "a present wrong daily group",
    "day",
    (query) => {
      query.groupBy = ["country"];
    },
  ],
  [
    "malformed since metadata",
    "country",
    (query) => {
      query.since = "not-a-date";
    },
  ],
];

describe("server-only Vercel Web Analytics loader", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
    authMock.mockResolvedValue(adminIdentity);
    setProductionConfiguration();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    for (const key of ENVIRONMENT_KEYS) {
      const original = originalEnvironment[key];
      if (original === undefined) delete process.env[key];
      else process.env[key] = original;
    }
  });

  it.each([
    ["an unauthenticated visitor", anonymousIdentity],
    ["a normal Player", playerIdentity],
  ])("denies %s before reading configuration or fetching", async (_, identity) => {
    authMock.mockResolvedValue(identity);
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    const accessed = new Set<PropertyKey>();
    const original = process.env;
    process.env = new Proxy(original, {
      get(target, property, receiver) {
        if (ENVIRONMENT_KEYS.includes(property as (typeof ENVIRONMENT_KEYS)[number])) {
          accessed.add(property);
        }
        return Reflect.get(target, property, receiver);
      },
    });

    try {
      await expect(loadAdminWebsiteTraffic()).resolves.toBeNull();
    } finally {
      process.env = original;
    }

    expect(accessed.size).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails closed before configuration access when Clerk authorization fails", async () => {
    authMock.mockRejectedValue(new Error("private Clerk failure"));
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    await expect(loadAdminWebsiteTraffic()).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["VERCEL_ENV", "VERCEL_ANALYTICS_ACCESS_TOKEN"])(
    "sanitizes an authorized environment read failure for %s",
    async (failingKey) => {
      const original = process.env;
      process.env = new Proxy(original, {
        get(target, property, receiver) {
          if (property === failingKey) throw new Error("private env failure");
          return Reflect.get(target, property, receiver);
        },
      });
      const fetchMock = vi.fn<typeof fetch>();
      vi.stubGlobal("fetch", fetchMock);

      try {
        await expect(loadAdminWebsiteTraffic()).resolves.toEqual({
          status: "unavailable",
          reason: "provider-unavailable",
        });
      } finally {
        process.env = original;
      }

      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it("returns a Preview-only unavailable state without reading provider configuration", async () => {
    process.env.VERCEL_ENV = "preview";
    const accessed = new Set<PropertyKey>();
    const original = process.env;
    process.env = new Proxy(original, {
      get(target, property, receiver) {
        if (ENVIRONMENT_KEYS.includes(property as (typeof ENVIRONMENT_KEYS)[number])) {
          accessed.add(property);
        }
        return Reflect.get(target, property, receiver);
      },
    });
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    try {
      await expect(loadAdminWebsiteTraffic()).resolves.toEqual({
        status: "unavailable",
        reason: "non-production",
      });
    } finally {
      process.env = original;
    }

    expect(accessed).toEqual(new Set(["VERCEL_ENV"]));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    "VERCEL_ANALYTICS_ACCESS_TOKEN",
    "VERCEL_ANALYTICS_TEAM_ID",
    "VERCEL_ANALYTICS_PROJECT_ID",
  ] as const)("fails safely when %s is missing", async (key) => {
    delete process.env[key];
    if (key === "VERCEL_ANALYTICS_PROJECT_ID") {
      delete process.env.VERCEL_PROJECT_ID;
    }
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    await expect(loadAdminWebsiteTraffic()).resolves.toEqual({
      status: "unavailable",
      reason: "missing-configuration",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts the verified server-side Vercel system project ID fallback", async () => {
    delete process.env.VERCEL_ANALYTICS_PROJECT_ID;
    process.env.VERCEL_PROJECT_ID = PROJECT_ID;
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation((input) => Promise.resolve(successfulProviderResponse(input)));
    vi.stubGlobal("fetch", fetchMock);

    const result = await loadAdminWebsiteTraffic();

    expect(result?.status).toBe("available");
    expect(
      fetchMock.mock.calls.every(([input]) =>
        String(input).includes(`projectId=${PROJECT_ID}`)
      )
    ).toBe(true);
  });

  it.each([
    ["team ID", "VERCEL_ANALYTICS_TEAM_ID", "team_bad/value"],
    ["project ID", "VERCEL_ANALYTICS_PROJECT_ID", "project-name"],
    ["token whitespace", "VERCEL_ANALYTICS_ACCESS_TOKEN", " secret "],
  ])("rejects malformed %s configuration", async (_, key, value) => {
    process.env[key] = value;
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    await expect(loadAdminWebsiteTraffic()).resolves.toEqual({
      status: "unavailable",
      reason: "missing-configuration",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("loads truthful daily summaries, trend, and bounded breakdown metrics for an Admin", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation((input) => Promise.resolve(successfulProviderResponse(input)));
    vi.stubGlobal("fetch", fetchMock);

    const result = await loadAdminWebsiteTraffic();

    expect(result).toEqual({
      status: "available",
      generatedAt: NOW,
      timezone: "UTC",
      summary: {
        today: { visitors: 2, pageViews: 4 },
        sevenDays: { visitors: 3, pageViews: 7 },
        thirtyDays: { visitors: 3, pageViews: 7 },
      },
      trend: [
        { date: "2026-08-19", visitors: 1, pageViews: 3 },
        { date: "2026-08-20", visitors: 2, pageViews: 4 },
      ],
      breakdowns: {
        routes: [
          { label: "/", visitors: 12, pageViews: 20 },
          { label: "/players/[playerId]", visitors: 4, pageViews: 8 },
        ],
        countries: [{ label: "AU", visitors: 9, pageViews: 18 }],
        referrers: [
          { label: "google.com", visitors: 6, pageViews: 11 },
        ],
        devices: [{ label: "Desktop", visitors: 8, pageViews: 16 }],
        browsers: [{ label: "Chrome", visitors: 7, pageViews: 13 }],
        operatingSystems: [
          { label: "Windows", visitors: 6, pageViews: 12 },
        ],
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(7);
    expect(
      fetchMock.mock.calls.some(([input]) =>
        new URL(String(input)).pathname.endsWith("/count")
      )
    ).toBe(false);
    expect(authMock.mock.invocationCallOrder[0]).toBeLessThan(
      fetchMock.mock.invocationCallOrder[0]
    );
    expect(JSON.stringify(result)).not.toContain(ACCESS_TOKEN);
    expect(JSON.stringify(result)).not.toContain("11111111-1111");
    expect(JSON.stringify(result)).not.toContain("/admin");
    expect(JSON.stringify(result)).not.toContain("https://private.example");
  });

  it("accepts current provider normalization with omitted daily group metadata", async () => {
    stubSuccessfulProvider();

    await expect(loadAdminWebsiteTraffic()).resolves.toMatchObject({
      status: "available",
      summary: { today: { visitors: 2, pageViews: 4 } },
    });
  });

  it("accepts an exact daily group when the provider includes it", async () => {
    stubProviderQueryMutation("day", (query) => {
      query.groupBy = ["day"];
    });

    await expect(loadAdminWebsiteTraffic()).resolves.toMatchObject({
      status: "available",
    });
  });

  it.each(QUERY_MISMATCH_CASES)(
    "fails closed when the provider echoes %s",
    async (_, dimension, mutate) => {
      stubProviderQueryMutation(dimension, mutate);

      await expect(loadAdminWebsiteTraffic()).resolves.toEqual({
        status: "unavailable",
        reason: "provider-unavailable",
      });
    }
  );

  it("rejects an unsupported provider envelope version", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation((input) => {
      const url = new URL(String(input));
      const by = url.searchParams.get("by");
      return Promise.resolve(
        jsonResponse({
          version: by === "country" ? 2 : 1,
          query: providerQuery(url, by ?? undefined),
          data: by === "day" ? DEFAULT_DAILY_ROWS : aggregateRows(by),
        })
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(loadAdminWebsiteTraffic()).resolves.toEqual({
      status: "unavailable",
      reason: "provider-unavailable",
    });
  });

  it("ignores the live adjusted-zero count defect and uses today's partial daily row", async () => {
    const fetchMock = stubSuccessfulProvider([utcDayRow(0, 2, 7)]);

    const result = await loadAdminWebsiteTraffic();

    expect(result).toMatchObject({
      status: "available",
      summary: {
        today: { visitors: 2, pageViews: 7 },
        sevenDays: { visitors: 2, pageViews: 7 },
        thirtyDays: { visitors: 2, pageViews: 7 },
      },
    });
    expect(
      fetchMock.mock.calls.some(([input]) =>
        new URL(String(input)).pathname.endsWith("/count")
      )
    ).toBe(false);
  });

  it("sums exactly today plus six and twenty-nine prior UTC dates", async () => {
    const dailyRows = Array.from({ length: 30 }, (_, daysBeforeToday) =>
      daysBeforeToday === 0
        ? utcDayRow(daysBeforeToday, 2, 7)
        : utcDayRow(daysBeforeToday, 1, 2)
    );
    stubSuccessfulProvider(dailyRows);

    const result = await loadAdminWebsiteTraffic();

    expect(result).toMatchObject({
      status: "available",
      summary: {
        today: { visitors: 2, pageViews: 7 },
        sevenDays: { visitors: 8, pageViews: 19 },
        thirtyDays: { visitors: 31, pageViews: 65 },
      },
    });
  });

  it("treats sparse dates as zero and excludes day seven only from the seven-day total", async () => {
    stubSuccessfulProvider([
      utcDayRow(0, 2, 7),
      utcDayRow(6, 3, 4),
      utcDayRow(7, 11, 13),
      utcDayRow(29, 17, 19),
    ]);

    const result = await loadAdminWebsiteTraffic();

    expect(result).toMatchObject({
      status: "available",
      summary: {
        today: { visitors: 2, pageViews: 7 },
        sevenDays: { visitors: 5, pageViews: 11 },
        thirtyDays: { visitors: 33, pageViews: 43 },
      },
    });
  });

  it("sums daily Vercel Visitors without deduplicating across dates", async () => {
    stubSuccessfulProvider([utcDayRow(0, 2, 4), utcDayRow(1, 3, 6)]);

    const result = await loadAdminWebsiteTraffic();

    expect(result).toMatchObject({
      status: "available",
      summary: {
        sevenDays: { visitors: 5, pageViews: 10 },
        thirtyDays: { visitors: 5, pageViews: 10 },
      },
    });
  });

  it("uses one route-limited UTC daily aggregate plus six bounded breakdowns", async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation((input) => Promise.resolve(successfulProviderResponse(input)));
    vi.stubGlobal("fetch", fetchMock);

    await loadAdminWebsiteTraffic();

    const urls = fetchMock.mock.calls.map(([input]) => new URL(String(input)));
    expect(urls).toHaveLength(7);
    expect(
      urls.filter((url) => url.pathname.endsWith("/count"))
    ).toHaveLength(0);
    expect(
      urls.every(
        (url) =>
          url.origin === PROVIDER_ORIGIN &&
          url.pathname.endsWith("/aggregate") &&
          url.searchParams.get("since") === "2026-07-22T00:00:00.000Z" &&
          url.searchParams.get("until") === "2026-08-20T12:34:56.788Z" &&
          url.searchParams.get("filter") ===
            PRODUCTION_APPROVED_ROUTE_FILTER &&
          url.searchParams.get("teamId") === TEAM_ID &&
          url.searchParams.get("projectId") === PROJECT_ID
      )
    ).toBe(true);
    expect(
      urls
        .filter((url) => url.pathname.endsWith("/aggregate"))
        .map((url) => [
          url.searchParams.get("by"),
          url.searchParams.get("limit"),
        ])
    ).toEqual([
      ["day", "31"],
      ["requestPath", "8"],
      ["country", "8"],
      ["referrerHostname", "8"],
      ["deviceType", "8"],
      ["browserName", "8"],
      ["osName", "8"],
    ]);
    expect(
      urls.filter((url) => url.searchParams.get("by") === "day")
    ).toHaveLength(1);
    for (const pathname of ANALYTICS_APPROVED_REPORTING_PATHS) {
      expect(PRODUCTION_APPROVED_ROUTE_FILTER).toContain(`'${pathname}'`);
    }
    expect(PRODUCTION_APPROVED_ROUTE_FILTER).not.toMatch(
      /\/admin|\/dashboard|\?|#|[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i
    );
    expect(timeoutSpy).toHaveBeenCalledTimes(7);
    expect(timeoutSpy).toHaveBeenCalledWith(8_000);

    for (const [, init] of fetchMock.mock.calls) {
      expect(init).toMatchObject({ method: "GET", cache: "no-store" });
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      expect(new Headers(init?.headers).get("authorization")).toBe(
        `Bearer ${ACCESS_TOKEN}`
      );
    }
  });

  it("uses UTC rather than the server's local timezone", async () => {
    const originalTimezone = process.env.TZ;
    process.env.TZ = "Australia/Sydney";
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation((input) => Promise.resolve(successfulProviderResponse(input)));
    vi.stubGlobal("fetch", fetchMock);

    let result: Awaited<ReturnType<typeof loadAdminWebsiteTraffic>>;
    try {
      result = await loadAdminWebsiteTraffic();
    } finally {
      if (originalTimezone === undefined) delete process.env.TZ;
      else process.env.TZ = originalTimezone;
    }

    const dailyUrl = fetchMock.mock.calls
      .map(([input]) => new URL(String(input)))
      .find((url) => url.searchParams.get("by") === "day");
    expect(dailyUrl?.searchParams.get("since")).toBe(
      "2026-07-22T00:00:00.000Z"
    );
    expect(result).toMatchObject({
      status: "available",
      summary: { today: { visitors: 2, pageViews: 4 } },
    });
  });

  it("returns a genuine available zero when the complete aggregate is empty", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation((input) => {
      const url = new URL(String(input));
      return Promise.resolve(
        jsonResponse({
          version: 1,
          query: providerQuery(url, url.searchParams.get("by") ?? undefined),
          data: [],
        })
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await loadAdminWebsiteTraffic();

    expect(result).toMatchObject({
      status: "available",
      summary: {
        today: { visitors: 0, pageViews: 0 },
        sevenDays: { visitors: 0, pageViews: 0 },
        thirtyDays: { visitors: 0, pageViews: 0 },
      },
      trend: [],
      breakdowns: {
        routes: [],
        countries: [],
        referrers: [],
        devices: [],
        browsers: [],
        operatingSystems: [],
      },
    });
  });

  it("returns Today as a genuine zero at UTC midnight while retaining prior dates", async () => {
    vi.setSystemTime(new Date("2026-08-20T00:00:00.000Z"));
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation((input) =>
        Promise.resolve(
          successfulProviderResponse(input, [utcDayRow(1, 1, 3)])
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await loadAdminWebsiteTraffic();

    expect(result).toMatchObject({
      status: "available",
      summary: {
        today: { visitors: 0, pageViews: 0 },
        sevenDays: { visitors: 1, pageViews: 3 },
        thirtyDays: { visitors: 1, pageViews: 3 },
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(7);
    const dailyUrl = fetchMock.mock.calls
      .map(([input]) => new URL(String(input)))
      .find((url) => url.searchParams.get("by") === "day");
    expect(dailyUrl?.searchParams.get("since")).toBe(
      "2026-07-22T00:00:00.000Z"
    );
    expect(dailyUrl?.searchParams.get("until")).toBe(
      "2026-08-19T23:59:59.999Z"
    );
  });

  it.each([
    [400, "provider-unavailable"],
    [401, "provider-unavailable"],
    [402, "plan-restriction"],
    [403, "provider-unavailable"],
    [404, "provider-unavailable"],
    [410, "provider-unavailable"],
    [429, "rate-limited"],
    [500, "provider-unavailable"],
    [503, "provider-unavailable"],
  ])("maps HTTP %i to a safe traffic-only state", async (status, reason) => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("private provider details", { status }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await loadAdminWebsiteTraffic();

    expect(result).toEqual({ status: "unavailable", reason });
    expect(JSON.stringify(result)).not.toContain("private provider details");
    expect(JSON.stringify(result)).not.toContain(ACCESS_TOKEN);
  });

  it("sanitizes timeouts and other fetch rejections", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValue(
        new DOMException(`timeout with ${ACCESS_TOKEN}`, "TimeoutError")
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await loadAdminWebsiteTraffic();

    expect(result).toEqual({
      status: "unavailable",
      reason: "provider-unavailable",
    });
    expect(JSON.stringify(result)).not.toContain(ACCESS_TOKEN);
  });

  it("sanitizes AbortSignal setup failures after authorization", async () => {
    vi.spyOn(AbortSignal, "timeout").mockImplementation(() => {
      throw new Error("private AbortSignal setup failure");
    });
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    await expect(loadAdminWebsiteTraffic()).resolves.toEqual({
      status: "unavailable",
      reason: "provider-unavailable",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON without exposing the provider body", async () => {
    const privateMarker = "private-provider-response-marker";
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(`{ malformed ${privateMarker}`, {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await loadAdminWebsiteTraffic();

    expect(result).toEqual({
      status: "unavailable",
      reason: "provider-unavailable",
    });
    expect(JSON.stringify(result)).not.toContain(privateMarker);
  });

  it.each([
    { timestamp: "2026-08-20T00:00:00.000Z", visitors: "1", pageviews: 2 },
    { timestamp: "2026-08-20T00:00:00.000Z", visitors: -1, pageviews: 2 },
    { timestamp: "2026-08-20T00:00:00.000Z", visitors: 1.5, pageviews: 2 },
    {
      timestamp: "2026-08-20T00:00:00.000Z",
      visitors: 1,
      pageviews: Number.MAX_SAFE_INTEGER + 1,
    },
    { timestamp: "2026-08-20T00:00:00.000Z", visitors: 1 },
    { timestamp: "not-a-date", visitors: 1, pageviews: 2 },
    { timestamp: "2026-08-20T01:00:00.000Z", visitors: 1, pageviews: 2 },
  ])("rejects malformed daily rows %#", async (row) => {
    stubSuccessfulProvider([row]);

    await expect(loadAdminWebsiteTraffic()).resolves.toEqual({
      status: "unavailable",
      reason: "provider-unavailable",
    });
  });

  it("rejects duplicate daily buckets", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation((input) => {
      const url = new URL(String(input));
      const by = url.searchParams.get("by");
      const rows =
        by === "day"
          ? [
              { timestamp: "2026-08-20T00:00:00Z", visitors: 1, pageviews: 1 },
              { timestamp: "2026-08-20T00:00:00Z", visitors: 2, pageviews: 2 },
            ]
          : aggregateRows(by);
      return Promise.resolve(
        jsonResponse({
          version: 1,
          query: providerQuery(url, by ?? undefined),
          data: rows,
        })
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(loadAdminWebsiteTraffic()).resolves.toEqual({
      status: "unavailable",
      reason: "provider-unavailable",
    });
  });

  it("fails closed when otherwise valid daily values overflow a summary", async () => {
    stubSuccessfulProvider([
      utcDayRow(0, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER),
      utcDayRow(1, 1, 1),
    ]);

    await expect(loadAdminWebsiteTraffic()).resolves.toEqual({
      status: "unavailable",
      reason: "provider-unavailable",
    });
  });

  it("rejects aggregate rows outside the requested UTC window", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation((input) => {
      const url = new URL(String(input));
      const by = url.searchParams.get("by");
      return Promise.resolve(
        jsonResponse({
          version: 1,
          query: providerQuery(url, by ?? undefined),
          data:
            by === "day"
              ? [
                  {
                    timestamp: "2026-07-21T00:00:00Z",
                    visitors: 1,
                    pageviews: 1,
                  },
                ]
              : aggregateRows(by),
        })
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(loadAdminWebsiteTraffic()).resolves.toEqual({
      status: "unavailable",
      reason: "provider-unavailable",
    });
  });

  it("rejects oversized, non-array, and over-limit aggregate payloads", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation((input) => {
      const url = new URL(String(input));
      const by = url.searchParams.get("by");
      const data =
        by === "country"
          ? Array.from({ length: 10 }, (_, index) => ({
              country: `Country ${index}`,
              visitors: index,
              pageviews: index,
            }))
          : aggregateRows(by);
      return Promise.resolve(
        jsonResponse({
          version: 1,
          query: providerQuery(url, by ?? undefined),
          data,
        })
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(loadAdminWebsiteTraffic()).resolves.toEqual({
      status: "unavailable",
      reason: "provider-unavailable",
    });
  });

  it("rejects a response body whose declared size exceeds the bound", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("{}", {
        status: 200,
        headers: { "content-length": "256001" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(loadAdminWebsiteTraffic()).resolves.toEqual({
      status: "unavailable",
      reason: "provider-unavailable",
    });
  });
});
