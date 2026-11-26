// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CasterApplicationEditor from "@/app/caster-studio/CasterApplicationEditor";
import { CASTER_APPLICATION_PATH, emptyCasterDraft, type CasterPhase2Application } from "@/lib/caster/application";
import { getCasterApplicationCopy } from "@/lib/caster/application-copy";

const email = "synthetic-caster@example.test";
const discord = "synthetic-caster-contact";
const fetchMock = vi.fn<typeof fetch>();
const copy = getCasterApplicationCopy("en");

function application(overrides: Partial<CasterPhase2Application> = {}): CasterPhase2Application {
  return {
    id: "10000000-0000-4000-8000-000000000001",
    status: "draft",
    draft: {
      ...emptyCasterDraft(),
      displayName: "Test Caster",
      country: "AU",
      languages: ["English"],
      avatar: "20000000-0000-4000-8000-000000000001",
      discord,
      bio: { version: 1, doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "I cast tournaments." }] }] } },
    },
    draft_version: 4,
    submitted_revision_id: null,
    revision: null,
    feedback: null,
    membership_active: false,
    ...overrides,
  };
}

function openStudio(initial = application()) {
  return render(<CasterApplicationEditor initial={initial} copy={copy} locale="en-AU" email={email}
    countries={[{ code: "AU", label: "Australia" }]} retryLabel="Refresh and try again" />);
}

function openPreview() {
  fireEvent.click(screen.getByRole("button", { name: copy.actions.next }));
  fireEvent.click(screen.getByRole("button", { name: copy.actions.preview }));
}

beforeEach(() => vi.stubGlobal("fetch", fetchMock));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Caster application editor", () => {
  it("saves unsaved edits before submitting the server-confirmed version", async () => {
    const initial = application();
    const updatedDraft = { ...initial.draft, displayName: "Updated caster" };
    const saved = application({ draft: updatedDraft, draft_version: 5 });
    const submitted = application({ ...saved, status: "submitted", draft_version: 6 });
    fetchMock.mockResolvedValueOnce(Response.json({ status: "ok", application: saved }));
    fetchMock.mockResolvedValueOnce(Response.json({ status: "ok", application: submitted }));

    openStudio(initial);
    fireEvent.change(screen.getByRole("textbox", { name: /Caster display name/ }), { target: { value: "Updated caster" } });
    openPreview();
    expect(screen.queryByText(email)).toBeNull();
    expect(screen.queryByText(discord)).toBeNull();
    expect(screen.queryByText(copy.preview.designation)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: copy.actions.submit }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(copy.status.submitted));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(CASTER_APPLICATION_PATH);
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ action: "save", version: 4, draft: updatedDraft });
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({ action: "submit", version: 5 });
    expect(screen.queryByRole("button", { name: copy.actions.submit })).toBeNull();
  });

  it("keeps edits and avoids submitting after a draft version conflict", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ status: "conflict" }, { status: 409 }));
    openStudio();
    fireEvent.change(screen.getByRole("textbox", { name: /Caster display name/ }), { target: { value: "Unsubmitted edit" } });
    openPreview();
    fireEvent.click(screen.getByRole("button", { name: copy.actions.submit }));

    expect(await screen.findByRole("alert")).toHaveTextContent(copy.result.conflict);
    expect(screen.getByRole("heading", { name: "Unsubmitted edit" })).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("allows an active direct approval to edit without presenting submission again", () => {
    openStudio(application({ status: "approved", membership_active: true }));
    expect(screen.getByRole("textbox", { name: /Caster display name/ })).toBeVisible();
    openPreview();

    expect(screen.getByText(copy.preview.designation)).toBeVisible();
    expect(screen.queryByRole("button", { name: copy.actions.submit })).toBeNull();
  });

  it("shows the real rich-text editor with an emoji-aware count and no biography link tool", async () => {
    const initial = application();
    initial.draft.bio = {
      version: 1,
      doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "🎙".repeat(1_500) }] }] },
    };
    openStudio(initial);
    expect(await screen.findByRole("textbox", { name: copy.fields.bio })).toBeVisible();
    expect(screen.getByText("1,500 / 2,000")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Insert or edit link" })).toBeNull();
  });

  it("keeps an unchanged saved draft clean when the biography editor loads or remounts", async () => {
    openStudio();
    expect(await screen.findByRole("textbox", { name: copy.fields.bio })).toBeVisible();
    expect(screen.getByRole("button", { name: copy.actions.save })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: copy.actions.next }));
    fireEvent.click(screen.getByRole("button", { name: copy.actions.previous }));
    expect(await screen.findByRole("textbox", { name: copy.fields.bio })).toBeVisible();
    expect(screen.getByRole("button", { name: copy.actions.save })).toBeDisabled();
    expect(screen.queryByText(copy.result.unsaved)).toBeNull();
  });
});
