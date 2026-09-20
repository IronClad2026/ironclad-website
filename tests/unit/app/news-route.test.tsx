// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import english from "@/lib/i18n/dictionaries/en/public";

const mocks = vi.hoisted(() => ({ source: vi.fn() }));
vi.mock("@/lib/i18n/request", () => ({ getRequestLocale: async () => "en" }));
vi.mock("@/lib/news/source", () => ({ loadOfficialNews: mocks.source }));

import { generateMetadata } from "@/app/news/page";
import LatestNewsSection from "@/components/news/LatestNewsSection";

describe("public news server boundaries", () => {
  beforeEach(() => mocks.source.mockResolvedValue(null));
  afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

  it("keeps preview non-indexable and uses an aggregator canonical", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    const metadata = await generateMetadata();
    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(metadata.alternates?.canonical).toBe("https://www.ironcladtournaments.com/news");
    expect(metadata.title).toBe(english.news.metadataTitle);
    expect(metadata.openGraph).toMatchObject({ type: "website" });
    expect(mocks.source).not.toHaveBeenCalled();
  });

  it("prepares the eventual production listing for normal indexing", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    expect((await generateMetadata()).robots).toBeUndefined();
  });

  it("renders nothing for the optional homepage section during a cold-cache outage", async () => {
    const { container } = render(await LatestNewsSection({ copy: english.news, locale: "en" }));
    expect(container).toBeEmptyDOMElement();
    expect(mocks.source).toHaveBeenCalledOnce();
  });
});
