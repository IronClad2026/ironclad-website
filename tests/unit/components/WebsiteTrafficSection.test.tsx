// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import WebsiteTrafficSection from "@/components/admin/operations/WebsiteTrafficSection";
import type { WebsiteTrafficAnalytics } from "@/lib/vercel-web-analytics-types";

const availableAnalytics = {
  status: "available",
  generatedAt: "2026-08-20T12:34:00.000Z",
  timezone: "UTC",
  summary: {
    today: { visitors: 12, pageViews: 24 },
    sevenDays: { visitors: 61, pageViews: 132 },
    thirtyDays: { visitors: 205, pageViews: 468 },
  },
  trend: [
    { date: "2026-08-19", visitors: 10, pageViews: 18 },
    { date: "2026-08-20", visitors: 12, pageViews: 24 },
  ],
  breakdowns: {
    routes: [{ label: "/tournaments", visitors: 9, pageViews: 17 }],
    countries: [{ label: "Australia", visitors: 8, pageViews: 15 }],
    referrers: [{ label: "search.example", visitors: 6, pageViews: 11 }],
    devices: [{ label: "Mobile", visitors: 7, pageViews: 13 }],
    browsers: [{ label: "Chrome", visitors: 6, pageViews: 12 }],
    operatingSystems: [{ label: "Android", visitors: 5, pageViews: 10 }],
  },
} satisfies WebsiteTrafficAnalytics;

function unavailable(
  reason: Extract<
    WebsiteTrafficAnalytics,
    { status: "unavailable" }
  >["reason"]
): WebsiteTrafficAnalytics {
  return { status: "unavailable", reason };
}

describe("WebsiteTrafficSection", () => {
  afterEach(cleanup);

  it("renders the six truthful UTC summary cards and measurement caveats", () => {
    render(<WebsiteTrafficSection analytics={availableAnalytics} />);

    expect(
      screen.getByRole("heading", { name: "Public-site reach" })
    ).toBeInTheDocument();

    const expectedCards = [
      ["Vercel Visitors — Today", "12"],
      ["Vercel Visitors — 7 days", "61"],
      ["Vercel Visitors — 30 days", "205"],
      ["Page Views — Today", "24"],
      ["Page Views — 7 days", "132"],
      ["Page Views — 30 days", "468"],
    ] as const;

    for (const [name, value] of expectedCards) {
      const card = screen.getByRole("article", { name });
      expect(within(card).getByText(value)).toBeInTheDocument();
      expect(within(card).getByText(/UTC/)).toBeInTheDocument();
    }

    expect(
      screen.getByText(/anonymous, request-derived daily measure/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/visitor hash resets daily/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/latest 30-day UTC reporting window/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/not globally unique people/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/declined consent.*blockers.*free-tier collection pauses/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/20 Aug 2026.*12:34.*UTC/)).toBeInTheDocument();

    for (const forbiddenLabel of [
      "Unique People",
      "Returning Users",
      "Bounce Rate",
      "UTM",
      "Subscribers",
      "Revenue",
    ]) {
      expect(screen.queryByText(forbiddenLabel, { exact: true })).not.toBeInTheDocument();
    }
  });

  it("renders a native trend chart with an accessible text-table equivalent", () => {
    const { container } = render(
      <WebsiteTrafficSection analytics={availableAnalytics} />
    );

    expect(
      screen.getByRole("heading", { name: "Daily public-site traffic" })
    ).toBeInTheDocument();
    expect(screen.getByText(/grouped by UTC day/i)).toBeInTheDocument();
    expect(container.querySelector("svg")).toBeInTheDocument();

    const table = screen.getByRole("table", {
      name: "Daily public-site traffic in UTC",
    });
    expect(within(table).getByText("2026-08-19")).toBeInTheDocument();
    expect(within(table).getByText("2026-08-20")).toBeInTheDocument();
    expect(
      within(table).getByRole("columnheader", { name: "Vercel Visitors" })
    ).toBeInTheDocument();
    expect(
      within(table).getByRole("columnheader", { name: "Page Views" })
    ).toBeInTheDocument();
  });

  it("renders concise card lists for all six approved breakdowns", () => {
    render(<WebsiteTrafficSection analytics={availableAnalytics} />);

    const expected = [
      ["Top Public Routes", "/tournaments"],
      ["Countries", "Australia"],
      ["Referrer Hostnames", "search.example"],
      ["Device Types", "Mobile"],
      ["Browsers", "Chrome"],
      ["Operating Systems", "Android"],
    ] as const;

    for (const [name, value] of expected) {
      const list = screen.getByRole("list", { name });
      expect(within(list).getByText(value)).toBeInTheDocument();
      expect(within(list).getByText(/visitors/)).toBeInTheDocument();
      expect(within(list).getByText(/views/)).toBeInTheDocument();
    }

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("defensively prevents raw route and full-referrer labels reaching the UI", () => {
    const analytics: WebsiteTrafficAnalytics = {
      ...availableAnalytics,
      breakdowns: {
        ...availableAnalytics.breakdowns,
        routes: [
          {
            label: "/admin/private?selected=private-id",
            visitors: 1,
            pageViews: 1,
          },
        ],
        referrers: [
          {
            label: "https://referrer.example/private/path?token=secret#state",
            visitors: 1,
            pageViews: 1,
          },
        ],
      },
    };

    const { container } = render(
      <WebsiteTrafficSection analytics={analytics} />
    );

    expect(screen.getByText("Other approved public route")).toBeInTheDocument();
    expect(screen.getByText("referrer.example")).toBeInTheDocument();
    expect(container).not.toHaveTextContent("/admin/private");
    expect(container).not.toHaveTextContent("private-id");
    expect(container).not.toHaveTextContent("/private/path");
    expect(container).not.toHaveTextContent("token=secret");
  });

  it("distinguishes successful zero traffic from unavailable traffic", () => {
    const analytics: WebsiteTrafficAnalytics = {
      status: "available",
      generatedAt: "2026-08-20T00:00:00.000Z",
      timezone: "UTC",
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
    };

    render(<WebsiteTrafficSection analytics={analytics} />);

    expect(screen.getAllByText("0")).toHaveLength(6);
    expect(screen.getByText(/genuine reported zeros/i)).toBeInTheDocument();
    expect(screen.getByText(/No daily trend history/i)).toBeInTheDocument();
    expect(screen.getByText(/No approved public routes/i)).toBeInTheDocument();
    expect(
      screen.queryByText("Website traffic analytics unavailable")
    ).not.toBeInTheDocument();
  });

  it.each([
    ["non-production", "Preview / non-Production"],
    ["missing-configuration", "Production configuration unavailable"],
    ["plan-restriction", "Current plan / API unavailable"],
    ["rate-limited", "Temporarily rate limited"],
    ["provider-unavailable", "Provider unavailable"],
  ] as const)(
    "renders %s as an honest traffic-only unavailable state",
    (reason, label) => {
      render(<WebsiteTrafficSection analytics={unavailable(reason)} />);

      expect(
        screen.getByText("Website traffic analytics unavailable")
      ).toBeInTheDocument();
      expect(screen.getByText(label)).toBeInTheDocument();
      expect(screen.queryByRole("article", { name: /Page Views/ })).not.toBeInTheDocument();
      expect(screen.queryByText("0", { exact: true })).not.toBeInTheDocument();
      expect(
        screen.getByRole("heading", { name: "Public-site reach" })
      ).toBeInTheDocument();
    }
  );

  it("uses narrow-mobile-first cards and viewport-safe native chart contracts", () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        "components/admin/operations/WebsiteTrafficSection.tsx"
      ),
      "utf8"
    );

    expect(source).toContain("p-4 sm:p-6");
    expect(source).toContain(
      "grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3"
    );
    expect(source).toContain(
      "grid min-w-0 gap-4 lg:grid-cols-2 xl:grid-cols-3"
    );
    expect(source).toContain("grid-cols-1");
    expect(source).toContain("sm:grid-cols-[minmax(0,1fr)_auto]");
    expect(source).toContain('className="h-44 w-full max-w-full"');
    expect(source).toContain('<table className="sr-only">');
    expect(source).toContain("break-all");
    expect(source).not.toContain("overflow-x-auto");
    expect(source).not.toContain("min-w-max");
  });
});
