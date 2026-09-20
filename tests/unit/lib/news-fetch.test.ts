import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MAX_NEWS_RESPONSE_BYTES,
  NEWS_TIMEOUT_MS,
  OFFICIAL_NEWS_FEED_URL,
} from "@/lib/news/constants";
import { fetchOfficialNews } from "@/lib/news/fetch";
import { newsRss } from "./news-fixtures";

function xmlResponse(body: BodyInit | null = newsRss(), init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  if (!headers.has("content-type")) headers.set("content-type", "text/xml; charset=UTF-8");
  return new Response(body, { ...init, headers });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("bounded official RSS fetch", () => {
  it("requests only the fixed English source and exposes only normalized data", async () => {
    const fetchMock = vi.fn().mockResolvedValue(xmlResponse());
    vi.stubGlobal("fetch", fetchMock);
    const feed = await fetchOfficialNews();
    expect(fetchMock).toHaveBeenCalledWith(OFFICIAL_NEWS_FEED_URL, expect.objectContaining({
      cache: "no-store",
      redirect: "error",
      signal: expect.any(AbortSignal),
    }));
    expect(feed.articles).toHaveLength(1);
    expect(feed.sourceLanguage).toBe("en");
    expect(JSON.stringify(feed)).not.toContain("<img");
  });

  it("rejects an oversized declared response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(xmlResponse("small body", {
      headers: { "content-length": String(MAX_NEWS_RESPONSE_BYTES + 1) },
    })));
    await expect(fetchOfficialNews()).rejects.toThrow("size limit");
  });

  it("enforces actual streamed bytes even if the size header lies", async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(MAX_NEWS_RESPONSE_BYTES));
        controller.enqueue(new Uint8Array(1));
      },
      cancel,
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(xmlResponse(stream, {
      headers: { "content-length": "1" },
    })));
    await expect(fetchOfficialNews()).rejects.toThrow("size limit");
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("bounds a stalled upstream fetch and aborts its request", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockImplementation(() => new Promise(() => undefined));
    vi.stubGlobal("fetch", fetchMock);
    const result = fetchOfficialNews().catch((error: Error) => error);
    await vi.advanceTimersByTimeAsync(NEWS_TIMEOUT_MS);
    expect(await result).toMatchObject({ message: "Official news request timed out." });
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
  });

  it("applies the same deadline to a stalled response body", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({ cancel });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(xmlResponse(stream)));
    const result = fetchOfficialNews().catch((error: Error) => error);
    await vi.advanceTimersByTimeAsync(NEWS_TIMEOUT_MS);
    expect(await result).toBeInstanceOf(Error);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it.each([404, 429, 500, 503])("rejects HTTP %s without publishing an empty success", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(xmlResponse(null, { status })));
    await expect(fetchOfficialNews()).rejects.toThrow("unavailable");
  });

  it("rejects network errors, malformed XML, HTML error pages and invalid UTF-8", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error("Network unavailable"))
      .mockResolvedValueOnce(xmlResponse("<rss>broken"))
      .mockResolvedValueOnce(new Response("<html>Unavailable</html>", {
        headers: { "content-type": "text/html" },
      }))
      .mockResolvedValueOnce(xmlResponse(new Uint8Array([0xff, 0xfe, 0xff])));
    vi.stubGlobal("fetch", fetchMock);
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await expect(fetchOfficialNews()).rejects.toBeInstanceOf(Error);
    }
  });

  it("returns an explicit valid empty feed", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(xmlResponse(newsRss(""))));
    expect((await fetchOfficialNews()).articles).toEqual([]);
  });
});
