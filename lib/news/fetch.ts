import "server-only";

import {
  MAX_NEWS_RESPONSE_BYTES,
  NEWS_TIMEOUT_MS,
  OFFICIAL_NEWS_FEED_URL,
} from "@/lib/news/constants";
import { normalizeOfficialNews } from "@/lib/news/normalize";
import type { OfficialNewsFeed } from "@/lib/news/types";

async function readBoundedResponse(response: Response, signal: AbortSignal): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (declaredLength > MAX_NEWS_RESPONSE_BYTES || !response.body) {
    throw new Error("Official news response exceeds its size limit or has no body.");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let length = 0;
  let xml = "";
  const cancel = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_NEWS_RESPONSE_BYTES) {
        throw new Error("Official news response exceeds its size limit.");
      }
      xml += decoder.decode(value, { stream: true });
    }
    return xml + decoder.decode();
  } finally {
    signal.removeEventListener("abort", cancel);
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export async function fetchOfficialNews(): Promise<OfficialNewsFeed> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("Official news request timed out."));
    }, NEWS_TIMEOUT_MS);
  });
  const request = async () => {
    const response = await fetch(OFFICIAL_NEWS_FEED_URL, {
      cache: "no-store",
      redirect: "error",
      headers: { Accept: "application/rss+xml, application/xml, text/xml" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error("Official news source is unavailable.");
    const contentType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
    if (contentType && !["application/rss+xml", "application/xml", "text/xml"].includes(contentType)) {
      throw new Error("Official news source returned an unexpected content type.");
    }
    const xml = await readBoundedResponse(response, controller.signal);
    return normalizeOfficialNews(xml);
  };
  try {
    return await Promise.race([request(), timeout]);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
