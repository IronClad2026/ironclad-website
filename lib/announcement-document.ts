/** Shared by server validation, the admin editor, and the safe public renderer. */
export const ANNOUNCEMENT_DOCUMENT_LIMITS = {
  bytes: 64 * 1024,
  nodes: 2_048,
  depth: 12,
  plainText: 10_000,
  href: 2_048,
  listStart: 1_000_000,
} as const;

export type AnnouncementMark =
  | { type: "bold" | "italic" | "underline" }
  | { type: "link"; attrs: { href: string } };

export type AnnouncementInlineNode =
  | { type: "text"; text: string; marks?: AnnouncementMark[] }
  | { type: "hardBreak"; marks?: AnnouncementMark[] };

export type AnnouncementParagraphNode = {
  type: "paragraph";
  content?: AnnouncementInlineNode[];
};

export type AnnouncementBlockNode =
  | AnnouncementParagraphNode
  | {
      type: "heading";
      attrs: { level: 3 | 4 };
      content?: AnnouncementInlineNode[];
    }
  | {
      type: "bulletList";
      content: AnnouncementListItemNode[];
    }
  | {
      type: "orderedList";
      attrs: { start: number };
      content: AnnouncementListItemNode[];
    };

export type AnnouncementListItemNode = {
  type: "listItem";
  content: AnnouncementBlockNode[];
};

export type AnnouncementDocument = {
  version: 1;
  doc: { type: "doc"; content: AnnouncementBlockNode[] };
};

type JsonObject = Record<string, unknown>;
type ParseBudget = { nodes: number; characters: number };

function isObject(value: unknown): value is JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasOnlyKeys(value: JsonObject, allowed: readonly string[]): boolean {
  return Reflect.ownKeys(value).every(
    (key) => typeof key === "string" && allowed.includes(key)
  );
}

function hasValidText(value: string): boolean {
  // PostgreSQL text cannot store NUL. Reject other non-printing C0 controls and
  // lone UTF-16 surrogates instead of silently replacing authored content.
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) {
    return false;
  }
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return false;
    }
  }
  return true;
}

/** Only absolute HTTP(S) URLs and same-origin paths are supported. */
export function normalizeAnnouncementHref(value: unknown): string | null {
  if (typeof value !== "string" || value.length > ANNOUNCEMENT_DOCUMENT_LIMITS.href) {
    return null;
  }
  const href = value.trim();
  if (
    !href ||
    !hasValidText(href) ||
    /[\s\\]/u.test(href) ||
    /%0[0-9a-f]|%1[0-9a-f]|%7f/iu.test(href)
  ) {
    return null;
  }
  try {
    if (href.startsWith("/") && !href.startsWith("//")) {
      const url = new URL(href, "https://announcement.invalid");
      if (url.origin !== "https://announcement.invalid") return null;
      const normalized = `${url.pathname}${url.search}${url.hash}`;
      return normalized.length <= ANNOUNCEMENT_DOCUMENT_LIMITS.href
        ? normalized
        : null;
    }
    if (!/^https?:\/\//iu.test(href)) return null;
    const url = new URL(href);
    if (!url.hostname || url.username || url.password) return null;
    const normalized = url.href;
    return normalized.length <= ANNOUNCEMENT_DOCUMENT_LIMITS.href
      ? normalized
      : null;
  } catch {
    return null;
  }
}

function parseMarks(value: unknown): AnnouncementMark[] | null {
  if (!Array.isArray(value) || value.length > 4) return null;
  const marks: AnnouncementMark[] = [];
  const seen = new Set<string>();
  for (const mark of value) {
    if (!isObject(mark) || typeof mark.type !== "string" || seen.has(mark.type)) {
      return null;
    }
    seen.add(mark.type);
    if (mark.type === "bold" || mark.type === "italic" || mark.type === "underline") {
      if (!hasOnlyKeys(mark, ["type"])) return null;
      marks.push({ type: mark.type });
    } else if (mark.type === "link") {
      if (!hasOnlyKeys(mark, ["type", "attrs"]) || !isObject(mark.attrs)) return null;
      const attrs = mark.attrs;
      if (
        !hasOnlyKeys(attrs, ["href", "target", "rel", "class", "title"]) ||
        ("target" in attrs && attrs.target !== null && attrs.target !== "_blank") ||
        ("rel" in attrs && attrs.rel !== null && attrs.rel !== "noopener noreferrer nofollow") ||
        ("class" in attrs && attrs.class !== null) ||
        ("title" in attrs && attrs.title !== null)
      ) {
        return null;
      }
      const href = normalizeAnnouncementHref(attrs.href);
      if (!href) return null;
      // Tiptap's fixed defaults may be present in getJSON. Persist only href;
      // the renderer owns all DOM attributes and navigation behavior.
      marks.push({ type: "link", attrs: { href } });
    } else {
      return null;
    }
  }
  return marks;
}

function takeNode(value: unknown, budget: ParseBudget, depth: number): value is JsonObject {
  budget.nodes += 1;
  return (
    budget.nodes <= ANNOUNCEMENT_DOCUMENT_LIMITS.nodes &&
    depth <= ANNOUNCEMENT_DOCUMENT_LIMITS.depth &&
    isObject(value)
  );
}

function parseInline(value: unknown, budget: ParseBudget, depth: number): AnnouncementInlineNode | null {
  if (!takeNode(value, budget, depth)) return null;
  const marks = value.marks === undefined ? undefined : parseMarks(value.marks);
  if (marks === null) return null;
  const markFields = marks?.length ? { marks } : {};
  if (value.type === "text") {
    if (
      !hasOnlyKeys(value, ["type", "text", "marks"]) ||
      typeof value.text !== "string" ||
      !value.text.length ||
      value.text.length > ANNOUNCEMENT_DOCUMENT_LIMITS.plainText ||
      !hasValidText(value.text)
    ) {
      return null;
    }
    budget.characters += value.text.length;
    if (budget.characters > ANNOUNCEMENT_DOCUMENT_LIMITS.plainText) return null;
    return { type: "text", text: value.text, ...markFields };
  }
  if (value.type === "hardBreak" && hasOnlyKeys(value, ["type", "marks"])) {
    return { type: "hardBreak", ...markFields };
  }
  return null;
}

function parseInlineContent(value: unknown, budget: ParseBudget, depth: number): AnnouncementInlineNode[] | null {
  if (!Array.isArray(value) || value.length > ANNOUNCEMENT_DOCUMENT_LIMITS.nodes) return null;
  const content: AnnouncementInlineNode[] = [];
  for (const child of value) {
    const parsed = parseInline(child, budget, depth);
    if (!parsed) return null;
    content.push(parsed);
  }
  return content;
}

function parseListItem(value: unknown, budget: ParseBudget, depth: number): AnnouncementListItemNode | null {
  if (
    !takeNode(value, budget, depth) ||
    value.type !== "listItem" ||
    !hasOnlyKeys(value, ["type", "content"])
  ) return null;
  const content = parseBlocks(value.content, budget, depth + 1);
  if (!content || content[0].type !== "paragraph") return null;
  return { type: "listItem", content };
}

function parseBlock(value: unknown, budget: ParseBudget, depth: number): AnnouncementBlockNode | null {
  if (!takeNode(value, budget, depth)) return null;
  if (value.type === "paragraph" || value.type === "heading") {
    const allowed = value.type === "heading" ? ["type", "attrs", "content"] : ["type", "content"];
    if (!hasOnlyKeys(value, allowed)) return null;
    const content = value.content === undefined
      ? []
      : parseInlineContent(value.content, budget, depth + 1);
    if (!content) return null;
    const contentFields = content.length ? { content } : {};
    if (value.type === "paragraph") return { type: "paragraph", ...contentFields };
    if (
      !isObject(value.attrs) ||
      !hasOnlyKeys(value.attrs, ["level"]) ||
      (value.attrs.level !== 3 && value.attrs.level !== 4)
    ) return null;
    return { type: "heading", attrs: { level: value.attrs.level }, ...contentFields };
  }
  if (value.type === "bulletList" || value.type === "orderedList") {
    const allowed = value.type === "orderedList" ? ["type", "attrs", "content"] : ["type", "content"];
    if (
      !hasOnlyKeys(value, allowed) ||
      !Array.isArray(value.content) ||
      !value.content.length ||
      value.content.length > ANNOUNCEMENT_DOCUMENT_LIMITS.nodes
    ) return null;
    const content: AnnouncementListItemNode[] = [];
    for (const item of value.content) {
      const parsed = parseListItem(item, budget, depth + 1);
      if (!parsed) return null;
      content.push(parsed);
    }
    if (value.type === "bulletList") return { type: "bulletList", content };
    // ProseMirror omits default attributes in some clipboard/import paths.
    const attrs = value.attrs === undefined ? { start: 1 } : value.attrs;
    if (
      !isObject(attrs) ||
      !hasOnlyKeys(attrs, ["start", "type"]) ||
      ("type" in attrs && attrs.type !== null && attrs.type !== "1") ||
      !Number.isInteger(attrs.start) ||
      (attrs.start as number) < 1 ||
      (attrs.start as number) > ANNOUNCEMENT_DOCUMENT_LIMITS.listStart
    ) return null;
    return { type: "orderedList", attrs: { start: attrs.start as number }, content };
  }
  return null;
}

function parseBlocks(value: unknown, budget: ParseBudget, depth: number): AnnouncementBlockNode[] | null {
  if (!Array.isArray(value) || !value.length || value.length > ANNOUNCEMENT_DOCUMENT_LIMITS.nodes) return null;
  const content: AnnouncementBlockNode[] = [];
  for (const block of value) {
    const parsed = parseBlock(block, budget, depth);
    if (!parsed) return null;
    content.push(parsed);
  }
  return content;
}

function inlineText(content: AnnouncementInlineNode[] | undefined): string {
  return content?.map((node) => node.type === "text" ? node.text : "\n").join("") ?? "";
}

function blockText(block: AnnouncementBlockNode): string {
  if (block.type === "paragraph" || block.type === "heading") return inlineText(block.content);
  return block.content.map((item, index) => {
    const prefix = block.type === "bulletList" ? "• " : `${block.attrs.start + index}. `;
    const text = item.content.map(blockText).join("\n\n");
    return `${prefix}${text.replace(/\n/gu, "\n  ")}`;
  }).join("\n");
}

/** Text fallback retains paragraph boundaries, hard breaks, and list labels. */
export function getAnnouncementPlainText(document: AnnouncementDocument): string {
  return document.doc.content.map(blockText).join("\n\n");
}

/** List labels and layout whitespace alone do not constitute authored content. */
export function hasAnnouncementDocumentText(document: AnnouncementDocument): boolean {
  const hasText = (block: AnnouncementBlockNode): boolean => {
    if (block.type === "paragraph" || block.type === "heading") {
      return block.content?.some((node) => node.type === "text" && node.text.trim().length > 0) ?? false;
    }
    return block.content.some((item) => item.content.some(hasText));
  };
  return document.doc.content.some(hasText);
}

/** Fail closed on writes; callers rendering existing content can use body fallback. */
export function parseAnnouncementDocument(input: unknown): AnnouncementDocument | null {
  try {
    if (
      !isObject(input) ||
      !hasOnlyKeys(input, ["version", "doc"]) ||
      input.version !== 1 ||
      !isObject(input.doc) ||
      input.doc.type !== "doc" ||
      !hasOnlyKeys(input.doc, ["type", "content"])
    ) return null;
    const content = parseBlocks(input.doc.content, { nodes: 1, characters: 0 }, 1);
    if (!content) return null;
    const document: AnnouncementDocument = { version: 1, doc: { type: "doc", content } };
    if (getAnnouncementPlainText(document).length > ANNOUNCEMENT_DOCUMENT_LIMITS.plainText) return null;
    // Check the received representation too, including permitted Tiptap defaults.
    const encoder = new TextEncoder();
    if (
      encoder.encode(JSON.stringify(input)).byteLength > ANNOUNCEMENT_DOCUMENT_LIMITS.bytes ||
      encoder.encode(JSON.stringify(document)).byteLength > ANNOUNCEMENT_DOCUMENT_LIMITS.bytes
    ) return null;
    return document;
  } catch {
    // Includes cyclic, excessively deep, and non-JSON values from external callers.
    return null;
  }
}
