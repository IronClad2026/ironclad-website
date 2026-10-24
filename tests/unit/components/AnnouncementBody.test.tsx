// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import AnnouncementBody from "@/components/AnnouncementBody";

const text = (value: string) => ({ type: "text", text: value });
const paragraph = (value?: string) => ({ type: "paragraph", ...(value ? { content: [text(value)] } : {}) });
const envelope = (content: unknown[]) => ({ version: 1, doc: { type: "doc", content } });

afterEach(cleanup);

describe("safe announcement body", () => {
  it("renders semantic formatting, safe links, and both supported heading levels", () => {
    const bodyDocument = envelope([
      { type: "heading", attrs: { level: 3 }, content: [text("Tournament briefing")] },
      { type: "heading", attrs: { level: 4 }, content: [text("Schedule")] },
      { type: "paragraph", content: [{ ...text("Play boldly"), marks: [{ type: "bold" }, { type: "italic" }, { type: "underline" }] }, text(" "), { ...text("Read more"), marks: [{ type: "link", attrs: { href: "https://example.com/news", target: "_blank", rel: "noopener noreferrer nofollow", class: null } }] }] },
      { type: "bulletList", content: [{ type: "listItem", content: [paragraph("Check in")] }] },
      { type: "orderedList", attrs: { start: 3 }, content: [{ type: "listItem", content: [paragraph("Join lobby")] }] },
    ]);
    const { container } = render(<AnnouncementBody body="Plain fallback" bodyDocument={bodyDocument} className="mt-5" />);
    expect(screen.getByRole("heading", { level: 3, name: "Tournament briefing" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 4, name: "Schedule" })).toBeInTheDocument();
    expect(container.querySelector("u em strong")).toHaveTextContent("Play boldly");
    expect(screen.getByRole("link", { name: "Read more" })).toHaveAttribute("href", "https://example.com/news");
    expect(screen.getByRole("link")).not.toHaveAttribute("target");
    expect(screen.getByRole("link")).not.toHaveAttribute("class");
    expect(container.querySelector("ul > li")).toHaveTextContent("Check in");
    expect(container.querySelector("ol")).toHaveAttribute("start", "3");
    expect(container.firstElementChild).toHaveClass("mt-5");
    expect(screen.queryByText("Plain fallback")).not.toBeInTheDocument();
  });

  it("preserves consecutive empty paragraphs and hard breaks, including trailing breaks", () => {
    const { container } = render(<AnnouncementBody body="Fallback" bodyDocument={envelope([
      paragraph("First"), paragraph(), paragraph(),
      { type: "paragraph", content: [text("Next"), { type: "hardBreak" }, text("Last"), { type: "hardBreak" }] },
    ])} />);
    expect(container.querySelectorAll("p")).toHaveLength(4);
    expect(Array.from(container.querySelectorAll("p")).map((node) => node.textContent)).toEqual(["First", "", "", "NextLast"]);
    expect(container.querySelectorAll("br")).toHaveLength(3);
    expect(container.querySelector("br[aria-hidden='true']")).toBeInTheDocument();
  });

  it("escapes authored text even when the document is valid", () => {
    const value = '<img src=x onerror="alert(1)"><script>alert(2)</script>';
    const { container } = render(<AnnouncementBody body="Fallback" bodyDocument={envelope([paragraph(value)])} />);
    expect(container.querySelector("p")?.textContent).toBe(value);
    expect(container.querySelector("img, script")).toBeNull();
  });

  it.each([
    undefined,
    null,
    { version: 2, doc: { type: "doc", content: [paragraph("Unknown")] } },
    envelope([{ type: "paragraph", content: [{ ...text("Attack"), marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] }] }]),
    envelope([{ type: "paragraph", attrs: { onclick: "alert(1)" }, content: [text("Attack")] }]),
  ])("falls back to literal legacy text for absent, unsupported or malformed documents", (bodyDocument) => {
    const body = "Legacy <b>literal</b>\n\nSecond paragraph";
    const { container } = render(<AnnouncementBody body={body} bodyDocument={bodyDocument} />);
    expect(container.querySelector("p")?.textContent).toBe(body);
    expect(container.querySelector("p")).toHaveClass("whitespace-pre-wrap");
    expect(container.querySelector("a, b, script")).toBeNull();
  });
});
