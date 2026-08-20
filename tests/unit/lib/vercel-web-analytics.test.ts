import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  adminIdentity,
  anonymousIdentity,
  playerIdentity,
} from "@/tests/fixtures/auth";

const authMock = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));

import { loadAdminWebsiteTraffic } from "@/lib/vercel-web-analytics";

const NOW = "2026-08-20T12:34:56.789Z";
const ACCESS_TOKEN = "test_vercel_token_private_marker";
const TEAM_ID = "team_test123";
const PROJECT_ID = "prj_test456";
const PROVIDER_ORIGIN = "https://api.vercel.com";
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
  return {
    since: url.searchParams.get("since"),
    until: url.searchParams.get("until"),
    ...(by ? { groupBy: [by] } : {}),
    filter: url.searchParams.get("filter"),
    ...(by ? { limit: Number(url.searchParams.get("limit")) } : {}),
  };
}

function countForStart(start: string | null) {
  if (start === "2026-08-20T00:00:00.000Z") {
    return { visitors: 2, pageviews: 4 };
  }
  if (start === "2026-08-14T00:00:00.000Z") {
    return { visitors: 7, pageviews: 14 };
  }
  return { visitors: 30, pageviews: 60 };
}

function aggregateRows(by: string | null): Record<string, unknown>[] {
  switch (by) {
    case "day":
      return [
        {
          timestamp: "2026-08-20T00:00:00.000Z",
          visitors: 2,
          pageviews: 4,
        },
        {
          timestamp: "2026-08-19T00:00:00Z",
          visitors: 1,
          pageviews: 3,
        },
      ];
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

function successfulProviderResponse(input: RequestInfo | URL) {
  const url = new URL(String(input));

  if (url.pathname.endsWith("/count")) {
    return jsonResponse({
      version: 1,
      query: providerQuery(url),
      data: countForStart(url.searchParams.get("since")),
    });
  }

  const by = url.searchParams.get("by");
  return jsonResponse({
    version: 1,
    query: providerQuery(url, by ?? undefined),
    data: aggregateRows(by),
  });
}

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

  it("loads truthful count, trend, and bounded breakdown metrics for an Admin", async () => {
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
        sevenDays: { visitors: 7, pageViews: 14 },
        thirtyDays: { visitors: 30, pageViews: 60 },
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
    expect(fetchMock).toHaveBeenCalledTimes(10);
    expect(authMock.mock.invocationCallOrder[0]).toBeLessThan(
      fetchMock.mock.invocationCallOrder[0]
    );
    expect(JSON.stringify(result)).not.toContain(ACCESS_TOKEN);
    expect(JSON.stringify(result)).not.toContain("11111111-1111");
    expect(JSON.stringify(result)).not.toContain("/admin");
    expect(JSON.stringify(result)).not.toContain("https://private.example");
  });

  it("uses UTC calendar windows and maps their half-open end to Vercel's inclusive until", async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation((input) => Promise.resolve(successfulProviderResponse(input)));
    vi.stubGlobal("fetch", fetchMock);

    await loadAdminWebsiteTraffic();

    const urls = fetchMock.mock.calls.map(([input]) => new URL(String(input)));
    const countUrls = urls.filter((url) => url.pathname.endsWith("/count"));
    expect(countUrls.map((url) => url.searchParams.get("since"))).toEqual([
      "2026-08-20T00:00:00.000Z",
      "2026-08-14T00:00:00.000Z",
      "2026-07-22T00:00:00.000Z",
    ]);
    expect(
      urls.every(
        (url) =>
          url.origin === PROVIDER_ORIGIN &&
          url.searchParams.get("until") === "2026-08-20T12:34:56.788Z" &&
          url.searchParams.get("filter") === "environment eq 'production'" &&
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
    expect(timeoutSpy).toHaveBeenCalledTimes(10);
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

    try {
      await loadAdminWebsiteTraffic();
    } finally {
      if (originalTimezone === undefined) delete process.env.TZ;
      else process.env.TZ = originalTimezone;
    }

    const todayUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(todayUrl.searchParams.get("since")).toBe(
      "2026-08-20T00:00:00.000Z"
    );
  });

  it("returns a genuine available zero when count data is zero and aggregates are empty", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation((input) => {
      const url = new URL(String(input));
      return Promise.resolve(
        jsonResponse({
          version: 1,
          query: providerQuery(url, url.searchParams.get("by") ?? undefined),
          data: url.pathname.endsWith("/count")
            ? { visitors: 0, pageviews: 0 }
            : [],
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

  it("returns Today as a local real zero at the exact UTC boundary", async () => {
    vi.setSystemTime(new Date("2026-08-20T00:00:00.000Z"));
    const fetchMock = vi.fn<typeof fetch>().mockImplementation((input) => {
      const url = new URL(String(input));
      if (!url.pathname.endsWith("/aggregate") || url.searchParams.get("by") !== "day") {
        return Promise.resolve(successfulProviderResponse(input));
      }
      return Promise.resolve(
        jsonResponse({
          version: 1,
          query: providerQuery(url, "day"),
          data: [
            {
              timestamp: "2026-08-19T00:00:00Z",
              visitors: 1,
              pageviews: 3,
            },
          ],
        })
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await loadAdminWebsiteTraffic();

    expect(result).toMatchObject({
      status: "available",
      summary: { today: { visitors: 0, pageViews: 0 } },
    });
    expect(fetchMock).toHaveBeenCalledTimes(9);
    expect(
      fetchMock.mock.calls.every(([input]) => {
        const url = new URL(String(input));
        return url.searchParams.get("until") !== "2026-08-19T23:59:59.999Z" ||
          url.searchParams.get("since") !== "2026-08-20T00:00:00.000Z";
      })
    ).toBe(true);
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
    { visitors: "1", pageviews: 2 },
    { visitors: -1, pageviews: 2 },
    { visitors: 1.5, pageviews: 2 },
    { visitors: 1, pageviews: Number.MAX_SAFE_INTEGER + 1 },
    { visitors: 1 },
  ])("rejects malformed count metrics %#", async (data) => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation((input) => {
      const url = new URL(String(input));
      return Promise.resolve(
        jsonResponse({ version: 1, query: providerQuery(url), data })
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(loadAdminWebsiteTraffic()).resolves.toEqual({
      status: "unavailable",
      reason: "provider-unavailable",
    });
  });

  it("rejects malformed aggregate schema and duplicate daily buckets", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation((input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/count")) {
        return Promise.resolve(successfulProviderResponse(input));
      }
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

  it("rejects aggregate rows outside the requested UTC window", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation((input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/count")) {
        return Promise.resolve(successfulProviderResponse(input));
      }
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
      if (url.pathname.endsWith("/count")) {
        return Promise.resolve(successfulProviderResponse(input));
      }
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
