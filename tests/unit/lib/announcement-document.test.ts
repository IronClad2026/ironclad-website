import { describe, expect, it } from "vitest";
import { getSchema } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  ANNOUNCEMENT_DOCUMENT_LIMITS,
  getAnnouncementPlainText,
  hasAnnouncementDocumentText,
  normalizeAnnouncementHref,
  parseAnnouncementDocument,
  type AnnouncementDocument,
} from "@/lib/announcement-document";

const text = (value: string) => ({ type: "text", text: value });
const paragraph = (value?: string) => ({ type: "paragraph", ...(value ? { content: [text(value)] } : {}) });
const envelope = (content: unknown[]) => ({ version: 1, doc: { type: "doc", content } });

function document(content: unknown[]): AnnouncementDocument {
  const result = parseAnnouncementDocument(envelope(content));
  if (!result) throw new Error("Expected a valid announcement document");
  return result;
}

describe("announcement rich-document contract", () => {
  it("accepts the installed Tiptap schema's real default link and numbered-list attributes", () => {
    const schema = getSchema([StarterKit.configure({
      blockquote: false,
      code: false,
      codeBlock: false,
      horizontalRule: false,
      strike: false,
      heading: { levels: [3, 4] },
    })]);
    const editorDocument = schema.nodeFromJSON({
      type: "doc",
      content: [{
        type: "orderedList",
        content: [{
          type: "listItem",
          content: [{
            type: "paragraph",
            content: [{ ...text("Read briefing"), marks: [{ type: "link", attrs: { href: "https://example.com/briefing" } }] }],
          }],
        }],
      }],
    }).toJSON();
    const parsed = parseAnnouncementDocument({ version: 1, doc: editorDocument });
    expect(parsed).not.toBeNull();
    expect(parsed?.doc.content[0]).toMatchObject({ attrs: { start: 1 } });
    expect(parsed && getAnnouncementPlainText(parsed)).toBe("1. Read briefing");
  });

  it("accepts only the supported formatting and canonicalizes fixed editor link defaults", () => {
    const result = document([
      { type: "heading", attrs: { level: 3 }, content: [text("Briefing")] },
      {
        type: "paragraph",
        content: [{
          type: "text",
          text: "Ready",
          marks: [
            { type: "bold" }, { type: "italic" }, { type: "underline" },
            { type: "link", attrs: { href: "HTTPS://EXAMPLE.COM/news", target: "_blank", rel: "noopener noreferrer nofollow", class: null, title: null } },
          ],
        }],
      },
      { type: "heading", attrs: { level: 4 }, content: [text("Details")] },
      { type: "orderedList", attrs: { start: 3 }, content: [{ type: "listItem", content: [paragraph("Join"), { type: "bulletList", content: [{ type: "listItem", content: [paragraph("Play")] }] }] }] },
    ]);
    expect(result.doc.content[1]).toEqual({
      type: "paragraph",
      content: [{
        type: "text", text: "Ready",
        marks: [
          { type: "bold" }, { type: "italic" }, { type: "underline" },
          { type: "link", attrs: { href: "https://example.com/news" } },
        ],
      }],
    });
    expect(getAnnouncementPlainText(result)).toBe("Briefing\n\nReady\n\nDetails\n\n3. Join\n  \n  • Play");
    expect(parseAnnouncementDocument(result)).toEqual(result);
  });

  it("retains repeated empty paragraphs, hard breaks, whitespace and Unicode", () => {
    const result = document([
      paragraph("  第一回 🎮 é  "), paragraph(), paragraph(),
      { type: "paragraph", content: [text("한글"), { type: "hardBreak", marks: [{ type: "bold" }] }, { type: "hardBreak" }, text("العربية"), { type: "hardBreak" }] },
    ]);
    expect(getAnnouncementPlainText(result)).toBe("  第一回 🎮 é  \n\n\n\n\n\n한글\n\nالعربية\n");
    expect(hasAnnouncementDocumentText(result)).toBe(true);
  });

  it("permits an empty composer document while distinguishing blank list labels from content", () => {
    expect(getAnnouncementPlainText(document([paragraph()]))).toBe("");
    expect(hasAnnouncementDocumentText(document([paragraph()]))).toBe(false);
    const blankList = document([{ type: "bulletList", content: [{ type: "listItem", content: [paragraph("  \t")] }] }]);
    expect(getAnnouncementPlainText(blankList)).toContain("• ");
    expect(hasAnnouncementDocumentText(blankList)).toBe(false);
  });

  it("defaults missing ordered-list start and allows exactly 10,000 plain-text characters", () => {
    expect(document([{ type: "orderedList", content: [{ type: "listItem", content: [paragraph("Join")] }] }]).doc.content[0]).toMatchObject({ attrs: { start: 1 } });
    expect(document([{ type: "orderedList", attrs: { start: 1, type: null }, content: [{ type: "listItem", content: [paragraph("Join")] }] }]).doc.content[0]).toMatchObject({ attrs: { start: 1 } });
    expect(parseAnnouncementDocument(envelope([paragraph("a".repeat(10_000))]))).not.toBeNull();
    expect(parseAnnouncementDocument(envelope([paragraph("a".repeat(10_001))]))).toBeNull();
    expect(parseAnnouncementDocument(envelope([paragraph("a".repeat(5_000)), paragraph("b".repeat(4_999))]))).toBeNull();
  });

  it.each([
    ["unsupported envelope version", { version: 2, doc: { type: "doc", content: [paragraph("A")] } }],
    ["unknown envelope key", { ...envelope([paragraph("A")]), html: "<b>A</b>" }],
    ["missing root blocks", envelope([])],
    ["text at document root", envelope([text("A")])],
    ["paragraph inside paragraph", envelope([{ type: "paragraph", content: [paragraph("A")] }])],
    ["heading above announcement title", envelope([{ type: "heading", attrs: { level: 2 }, content: [text("A")] }])],
    ["arbitrary paragraph attributes", envelope([{ ...paragraph("A"), attrs: { style: "color:red" } }])],
    ["unknown text attributes", envelope([{ type: "paragraph", content: [{ ...text("A"), onclick: "alert(1)" }] }])],
    ["image node", envelope([{ type: "image", attrs: { src: "https://example.com/a.jpg" } }])],
    ["raw HTML node", envelope([{ type: "html", content: "<script>alert(1)</script>" }])],
    ["empty text node", envelope([{ type: "paragraph", content: [text("")] }])],
    ["unsupported mark", envelope([{ type: "paragraph", content: [{ ...text("A"), marks: [{ type: "code" }] }] }])],
    ["duplicate mark", envelope([{ type: "paragraph", content: [{ ...text("A"), marks: [{ type: "bold" }, { type: "bold" }] }] }])],
    ["arbitrary mark attributes", envelope([{ type: "paragraph", content: [{ ...text("A"), marks: [{ type: "bold", attrs: { class: "hidden" } }] }] }])],
    ["empty list", envelope([{ type: "bulletList", content: [] }])],
    ["paragraph directly inside list", envelope([{ type: "bulletList", content: [paragraph("A")] }])],
    ["list item without initial paragraph", envelope([{ type: "bulletList", content: [{ type: "listItem", content: [{ type: "heading", attrs: { level: 3 }, content: [text("A")] }] }] }])],
    ["negative list start", envelope([{ type: "orderedList", attrs: { start: -1 }, content: [{ type: "listItem", content: [paragraph("A")] }] }])],
    ["huge list start", envelope([{ type: "orderedList", attrs: { start: 1_000_001 }, content: [{ type: "listItem", content: [paragraph("A")] }] }])],
    ["list CSS attributes", envelope([{ type: "orderedList", attrs: { start: 1, style: "list-style:none" }, content: [{ type: "listItem", content: [paragraph("A")] }] }])],
    ["lone high surrogate", envelope([paragraph("\ud800")])],
    ["lone low surrogate", envelope([paragraph("\udc00")])],
    ["database-incompatible NUL", envelope([paragraph("A\u0000B")])],
  ])("rejects %s", (_name, value) => {
    expect(parseAnnouncementDocument(value)).toBeNull();
  });

  it.each([
    { href: "javascript:alert(1)" },
    { href: "https://example.com", onclick: "alert(1)" },
    { href: "https://example.com", target: "namedWindow" },
    { href: "https://example.com", rel: "opener" },
    { href: "https://example.com", class: "hidden" },
    { href: "https://example.com", title: "Unsupported stored title" },
  ])("rejects an unsafe link or unexpected link attributes: %j", (attrs) => {
    expect(parseAnnouncementDocument(envelope([{ type: "paragraph", content: [{ ...text("Link"), marks: [{ type: "link", attrs }] }] }]))).toBeNull();
  });

  it("bounds byte size, node count, nesting depth, and cyclic inputs", () => {
    const href = `https://example.com/${"a".repeat(1_900)}`;
    const withLinks = Array.from({ length: 40 }, () => ({ type: "text", text: "a", marks: [{ type: "link", attrs: { href } }] }));
    expect(new TextEncoder().encode(JSON.stringify(envelope([{ type: "paragraph", content: withLinks }]))).byteLength).toBeGreaterThan(ANNOUNCEMENT_DOCUMENT_LIMITS.bytes);
    expect(parseAnnouncementDocument(envelope([{ type: "paragraph", content: withLinks }]))).toBeNull();
    expect(parseAnnouncementDocument(envelope([{ type: "paragraph", content: Array.from({ length: ANNOUNCEMENT_DOCUMENT_LIMITS.nodes }, () => ({ type: "hardBreak" })) }]))).toBeNull();
    let nested: unknown = paragraph("A");
    for (let level = 0; level < 7; level += 1) nested = { type: "bulletList", content: [{ type: "listItem", content: [paragraph(), nested] }] };
    expect(parseAnnouncementDocument(envelope([nested]))).toBeNull();
    const cyclic: Record<string, unknown> = { type: "bulletList" };
    cyclic.content = [{ type: "listItem", content: [paragraph(), cyclic] }];
    expect(parseAnnouncementDocument(envelope([cyclic]))).toBeNull();
  });
});

describe("announcement hyperlink policy", () => {
  it.each([
    ["https://EXAMPLE.com/news?q=1#update", "https://example.com/news?q=1#update"],
    ["http://example.com", "http://example.com/"],
    [" /announcements?tab=all#latest ", "/announcements?tab=all#latest"],
    ["/", "/"],
    ["https://例え.jp/ニュース", "https://xn--r8jz45g.jp/%E3%83%8B%E3%83%A5%E3%83%BC%E3%82%B9"],
  ])("normalizes %s", (value, expected) => {
    expect(normalizeAnnouncementHref(value)).toBe(expected);
  });

  it.each([
    "javascript:alert(1)", "JaVaScRiPt:alert(1)", "java\nscript:alert(1)",
    "data:text/html,<script>alert(1)</script>", "vbscript:msgbox(1)", "file:///etc/passwd",
    "//evil.example", "/\\evil.example", "https:\\evil.example", "mailto:admin@example.com",
    "https://user:password@example.com", "https://example.com/%0aevil", "https://example.com/hello world",
    "https://example.com/\ud800", "https://", "", "a".repeat(2_049), null, {},
  ])("rejects unsafe or unsupported href %j", (value) => {
    expect(normalizeAnnouncementHref(value)).toBeNull();
  });
});
