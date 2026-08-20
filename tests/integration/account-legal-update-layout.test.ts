import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const layoutSource = readFileSync(
  resolve(process.cwd(), "app/layout.tsx"),
  "utf8"
);

describe("account legal update root-layout contract", () => {
  it("wraps the complete normal application shell in the legal update gate", () => {
    const gateStart = layoutSource.indexOf("<AccountLegalUpdateGate");
    const smoothScrollStart = layoutSource.indexOf("<SmoothScrollProvider>");
    const children = layoutSource.indexOf("<div>{children}</div>");
    const footer = layoutSource.indexOf("<Footer");
    const analytics = layoutSource.indexOf("<ConsentAwareVercelAnalytics");
    const music = layoutSource.indexOf("<SiteMusicPlayer />");
    const smoothScrollEnd = layoutSource.indexOf("</SmoothScrollProvider>");
    const gateEnd = layoutSource.indexOf("</AccountLegalUpdateGate>");

    expect(gateStart).toBeGreaterThan(-1);
    expect(smoothScrollStart).toBeGreaterThan(gateStart);
    expect(children).toBeGreaterThan(smoothScrollStart);
    expect(footer).toBeGreaterThan(children);
    expect(layoutSource).toContain(
      "analyticsConsentAvailable={analyticsConsentAvailable}"
    );
    expect(layoutSource).toContain("state={legalRuntime.accountGate}");
    expect(layoutSource).toContain(
      'process.env.VERCEL_ENV === "production"'
    );
    expect(layoutSource).toContain(
      "isVercelProduction && legalRuntime.analyticsAvailable"
    );
    expect(analytics).toBeGreaterThan(footer);
    expect(music).toBeGreaterThan(analytics);
    expect(smoothScrollEnd).toBeGreaterThan(music);
    expect(gateEnd).toBeGreaterThan(smoothScrollEnd);
  });
});
