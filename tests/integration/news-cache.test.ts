import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OfficialNewsFeed } from "@/lib/news/types";

const cache = vi.hoisted(() => ({
  producer: undefined as (() => Promise<OfficialNewsFeed>) | undefined,
  keys: undefined as string[] | undefined,
  options: undefined as { revalidate: number } | undefined,
  read: vi.fn<() => Promise<OfficialNewsFeed>>(),
  upstream: vi.fn<() => Promise<OfficialNewsFeed>>(),
}));

vi.mock("next/cache", () => ({
  unstable_cache: (
    producer: () => Promise<OfficialNewsFeed>,
    keys: string[],
    options: { revalidate: number }
  ) => {
    cache.producer = producer;
    cache.keys = keys;
    cache.options = options;
    return cache.read;
  },
}));
vi.mock("@/lib/news/fetch", () => ({ fetchOfficialNews: cache.upstream }));

import { loadOfficialNews } from "@/lib/news/source";

const snapshot: OfficialNewsFeed = {
  articles: [], fetchedAt: "2026-09-20T00:00:00.000Z", sourceLanguage: "en",
};

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

describe("shared normalized news cache boundary", () => {
  it("uses one shared English snapshot with hourly revalidation", async () => {
    cache.read.mockResolvedValue(snapshot);
    expect(cache.keys).toEqual(["official-coh3-steam-news", "v1", "en"]);
    expect(cache.options).toEqual({ revalidate: 3600 });
    expect(await loadOfficialNews()).toBe(snapshot);
    expect(cache.read).toHaveBeenCalledOnce();
    expect(cache.upstream).not.toHaveBeenCalled();
  });

  it("lets the producer reject, preserving Next's last-good revalidation behavior", async () => {
    cache.upstream.mockRejectedValue(new Error("Feed unavailable"));
    await expect(cache.producer!()).rejects.toThrow("Feed unavailable");
  });

  it("isolates cold-cache failures from page callers without logging source bodies", async () => {
    cache.read.mockRejectedValue(new Error("<private upstream source body>"));
    expect(await loadOfficialNews()).toBeNull();
    expect(console.warn).toHaveBeenCalledWith("Official CoH3 news is temporarily unavailable.");
    expect(console.warn).not.toHaveBeenCalledWith(expect.stringContaining("private"));
  });

  it("preserves a successful empty feed as distinct from unavailable", async () => {
    cache.read.mockResolvedValue(snapshot);
    expect(await loadOfficialNews()).toEqual(snapshot);
    expect(console.warn).not.toHaveBeenCalled();
  });
});
