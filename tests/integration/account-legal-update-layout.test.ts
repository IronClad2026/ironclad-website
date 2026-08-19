import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const layoutSource = readFileSync(
  resolve(process.cwd(), "app/layout.tsx"),
  "utf8"
);

describe("account legal update root-layout contract", () => {
  it("wraps the complete normal application shell in the legal update gate", () => {
    const gateStart = layoutSource.indexOf(
      "<AccountLegalUpdateGate copy={common.legalUpdate}>"
    );
    const smoothScrollStart = layoutSource.indexOf("<SmoothScrollProvider>");
    const children = layoutSource.indexOf("<div>{children}</div>");
    const footer = layoutSource.indexOf("<Footer");
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
    expect(music).toBeGreaterThan(footer);
    expect(smoothScrollEnd).toBeGreaterThan(music);
    expect(gateEnd).toBeGreaterThan(smoothScrollEnd);
  });
});
