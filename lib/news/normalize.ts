import "server-only";

import { parseXml, XmlElement } from "@rgrove/parse-xml";
import { parseFragment, type DefaultTreeAdapterTypes } from "parse5";
import {
  MAX_NEWS_ARTICLES,
  MAX_NEWS_EXCERPT_LENGTH,
  MAX_NEWS_RESPONSE_BYTES,
} from "@/lib/news/constants";
import type {
  OfficialNewsArticle,
  OfficialNewsCategory,
  OfficialNewsFeed,
} from "@/lib/news/types";

const ARTICLE_URL =
  /^https:\/\/steamcommunity\.com\/games\/1677280\/announcements\/detail\/[0-9]{1,20}$/;
const IMAGE_URL =
  /^https:\/\/clan\.(?:fastly|akamai)\.steamstatic\.com\/images\/(40883127|46192591)\/[a-f0-9]{40}\.(jpg|png|webp)$/;
const OMIT_HTML = new Set([
  "script", "style", "iframe", "object", "embed", "template", "noscript",
  "svg", "math", "video", "audio", "canvas", "form", "input", "button",
]);
const BLOCK_HTML = new Set([
  "address", "article", "aside", "blockquote", "br", "dd", "div", "dl", "dt",
  "figcaption", "figure", "footer", "h1", "h2", "h3", "h4", "h5", "h6",
  "header", "hr", "li", "main", "ol", "p", "pre", "section", "table", "td",
  "th", "tr", "ul",
]);

function invalidFeed(): Error {
  // Parser errors can contain source HTML. Never propagate those into logs.
  return new Error("Invalid official CoH3 news feed.");
}

function compactText(value: string): string {
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ").trim();
}

export function validateOfficialArticleUrl(value: string): string | null {
  // Match the original string too: URL() alone normalizes backslashes, dot
  // segments and credentials, which must not silently become accepted input.
  if (!ARTICLE_URL.test(value)) return null;
  try {
    return new URL(value).href === value ? value : null;
  } catch {
    return null;
  }
}

export function validateOfficialImageUrl(value: string): string | null {
  if (!IMAGE_URL.test(value)) return null;
  try {
    return new URL(value).href === value ? value : null;
  } catch {
    return null;
  }
}

export function classifyNewsCategory(title: string): OfficialNewsCategory {
  if (/\b(?:patch\s+notes?|hot[\s-]?fix(?:es)?)\b/i.test(title)) {
    return "patch-notes";
  }
  if (/\bupdate\b/i.test(title)) return "update";
  return "announcement";
}

function shortenExcerpt(text: string): string {
  if (text.length <= MAX_NEWS_EXCERPT_LENGTH) return text;
  let cut = text.slice(0, MAX_NEWS_EXCERPT_LENGTH - 1);
  const lastSpace = cut.lastIndexOf(" ");
  if (lastSpace >= 200) cut = cut.slice(0, lastSpace);
  // Avoid leaving half of a UTF-16 surrogate pair at the truncation boundary.
  cut = cut.replace(/[\uD800-\uDBFF]$/, "").trimEnd();
  return `${cut}…`;
}

export function normalizeNewsDescription(description: string): {
  excerpt: string;
  imageUrl: string | null;
} {
  if (description.length > 160_000 || (description.match(/</g)?.length ?? 0) > 5_000) {
    throw invalidFeed();
  }
  // parse5 builds an inert tree: it never runs scripts or loads linked resources.
  const fragment = parseFragment(description);
  const text: string[] = [];
  let imageUrl: string | null = null;
  const stack: (DefaultTreeAdapterTypes.ChildNode | string)[] =
    [...fragment.childNodes].reverse();
  while (stack.length) {
    const node = stack.pop()!;
    if (typeof node === "string") {
      text.push(node);
    } else if (node.nodeName === "#text" && "value" in node) {
      text.push(node.value);
    } else if ("tagName" in node) {
      if (OMIT_HTML.has(node.tagName)) continue;
      if (node.tagName === "img") {
        const attributes = new Map(node.attrs.map(({ name, value }) => [name, value]));
        const width = Number.parseInt(attributes.get("width") ?? "", 10);
        const height = Number.parseInt(attributes.get("height") ?? "", 10);
        const unsuitable = (Number.isFinite(width) && width < 160) ||
          (Number.isFinite(height) && height < 90) || attributes.has("hidden");
        if (!imageUrl && !unsuitable) {
          imageUrl = validateOfficialImageUrl(attributes.get("src") ?? "");
        }
      }
      const block = BLOCK_HTML.has(node.tagName);
      if (block) text.push(" ");
      if (block) stack.push(" ");
      stack.push(...[...node.childNodes].reverse());
    }
  }
  return { excerpt: shortenExcerpt(compactText(text.join(""))), imageUrl };
}

function childrenNamed(element: XmlElement, name: string): XmlElement[] {
  return element.children.filter(
    (child): child is XmlElement => child instanceof XmlElement && child.name === name
  );
}

function field(element: XmlElement, name: string): string | null {
  const matches = childrenNamed(element, name);
  if (matches.length !== 1 || matches[0].children.some((child) => child instanceof XmlElement)) {
    return null;
  }
  return matches[0].text.trim();
}

function normalizeArticle(item: XmlElement): OfficialNewsArticle | null {
  const rawUrl = field(item, "link");
  const externalId = field(item, "guid");
  const rawTitle = field(item, "title");
  const rawDate = field(item, "pubDate");
  const description = field(item, "description") ?? "";
  const url = rawUrl ? validateOfficialArticleUrl(rawUrl) : null;
  if (!url || externalId !== url || !rawTitle || rawTitle.length > 500 || !rawDate) {
    return null;
  }
  const date = Date.parse(rawDate);
  if (!Number.isFinite(date)) return null;
  const title = compactText(rawTitle);
  if (!title) return null;
  const { excerpt, imageUrl } = normalizeNewsDescription(description);
  return {
    id: externalId,
    source: "relic-steam",
    externalId,
    title,
    publishedAt: new Date(date).toISOString(),
    url,
    excerpt,
    imageUrl,
    category: classifyNewsCategory(title),
  };
}

export function normalizeOfficialNews(
  xml: string,
  fetchedAt: string = new Date().toISOString()
): OfficialNewsFeed {
  if (Buffer.byteLength(xml, "utf8") > MAX_NEWS_RESPONSE_BYTES ||
    /<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml) ||
    (xml.match(/<(?=[A-Za-z_])/g)?.length ?? 0) > 2_000) {
    throw invalidFeed();
  }
  let document;
  try {
    // No external DTD loading or custom entity resolution is supported by this
    // parser. Reject DTDs anyway; undefined entity references must stay errors.
    document = parseXml(xml, {
      ignoreUndefinedEntities: false,
      preserveDocumentType: true,
    });
  } catch {
    throw invalidFeed();
  }
  const root = document.root;
  if (!root || root.name !== "rss" || root.attributes.version !== "2.0" ||
    document.children.some((node) => node.type === "doctype")) {
    throw invalidFeed();
  }
  const channels = childrenNamed(root, "channel");
  if (channels.length !== 1) throw invalidFeed();
  const channel = channels[0];
  if (!/^en(?:-us)?$/i.test(field(channel, "language") ?? "") ||
    !/^https:\/\/steamcommunity\.com\/games\/1677280\/?$/.test(field(channel, "link") ?? "")) {
    throw invalidFeed();
  }
  const items = childrenNamed(channel, "item");
  const accepted = items.map(normalizeArticle).filter(
    (article): article is OfficialNewsArticle => article !== null
  );
  // A genuinely empty RSS channel is valid. An unexpected feed containing
  // only rejected articles must not overwrite a previous successful snapshot.
  if (items.length > 0 && accepted.length === 0) throw invalidFeed();
  accepted.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.id.localeCompare(b.id));
  const unique = new Map<string, OfficialNewsArticle>();
  for (const article of accepted) {
    if (!unique.has(article.externalId)) unique.set(article.externalId, article);
  }
  const articles = [...unique.values()].slice(0, MAX_NEWS_ARTICLES);
  return { articles, fetchedAt, sourceLanguage: "en" };
}
