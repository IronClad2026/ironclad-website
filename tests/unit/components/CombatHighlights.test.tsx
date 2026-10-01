// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CombatHighlights from "@/components/combat-highlights/CombatHighlights";
import CombatHighlightsEditor from "@/components/combat-highlights/CombatHighlightsEditor";
import { prepareHighlight, putHighlightObject } from "@/components/combat-highlights/media";
import type { HighlightEditorActions, HighlightsState, PublicHighlightClip } from "@/lib/combat-highlights/types";

vi.mock("@/components/combat-highlights/media", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/components/combat-highlights/media")>(),
  prepareHighlight: vi.fn(),
  putHighlightObject: vi.fn(),
}));

const clip: PublicHighlightClip = {
  uploadId: "clip-one", title: "A clean flank", durationMs: 12000, width: 1920, height: 1080,
  fps: 60, contentType: "video/mp4", hasPoster: false, videoUrl: "https://media.example.test/public/one", posterUrl: null,
};
const second = { ...clip, uploadId: "clip-two", title: "Holding the line", videoUrl: "https://media.example.test/public/two" };
const initial = (): HighlightsState => ({
  playerId: "player-one", enabled: true, publicProfileEnabled: false,
  slots: [
    { slotNumber: 1, displayOrder: 1, revision: 7, hidden: false, clip, pendingUploadId: null },
    { slotNumber: 2, displayOrder: 2, revision: 9, hidden: false, clip: second, pendingUploadId: null },
    { slotNumber: 3, displayOrder: 3, revision: 0, hidden: false, clip: null, pendingUploadId: null },
  ],
});
const file = new File(["synthetic fixture"], "flank.mp4", { type: "video/mp4" });
const poster = new Blob(["synthetic poster"], { type: "image/jpeg" });

function actions(): HighlightEditorActions {
  return {
    reserve: vi.fn(), complete: vi.fn(), cancel: vi.fn(), clear: vi.fn(), reorder: vi.fn(), preview: vi.fn(),
  };
}

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  vi.stubGlobal("fetch", vi.fn());
  vi.stubGlobal("URL", class extends URL {
    static createObjectURL = vi.fn(() => "blob:private-preview");
    static revokeObjectURL = vi.fn();
  });
  vi.mocked(prepareHighlight).mockResolvedValue({ file, contentType: "video/mp4", poster, durationMs: 12000, width: 1920, height: 1080 });
  vi.mocked(putHighlightObject).mockResolvedValue();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("public Combat Highlights", () => {
  it("renders nothing for an empty public projection", () => {
    expect(render(<CombatHighlights clips={[]} />).container).toBeEmptyDOMElement();
  });

  it.each([1, 2, 3])("renders %i clips without attaching video sources before interaction", (count) => {
    const clips = [clip, second, { ...clip, uploadId: "clip-three", title: "Final push" }].slice(0, count);
    const { container } = render(<CombatHighlights clips={clips} />);
    const videos = container.querySelectorAll("video");
    expect(videos).toHaveLength(count);
    for (const video of videos) {
      expect(video).not.toHaveAttribute("src");
      expect(video).toHaveAttribute("preload", "none");
      expect(video).not.toHaveAttribute("autoplay");
    }
    expect(screen.getByText("CoH3 gameplay · player submitted")).toBeVisible();
  });

  it("loads the requested clip and pauses other gallery videos when native playback starts", async () => {
    const { container } = render(<CombatHighlights clips={[clip, second]} />);
    const videos = container.querySelectorAll("video");
    fireEvent.click(screen.getByRole("button", { name: "Play A clean flank" }));
    await waitFor(() => expect(videos[0]).toHaveAttribute("src", clip.videoUrl));
    expect(videos[1]).not.toHaveAttribute("src");
    fireEvent.click(screen.getByRole("button", { name: "Play Holding the line" }));
    const pauseFirst = vi.spyOn(videos[0], "pause");
    fireEvent.play(videos[1]);
    expect(pauseFirst).toHaveBeenCalledOnce();
  });

  it("submits the chosen report reason and safely offers sign-in after refusal", async () => {
    const report = vi.fn().mockResolvedValue({ ok: false, code: "sign-in-required" });
    render(<CombatHighlights clips={[clip]} report={report} />);
    fireEvent.click(screen.getByRole("button", { name: "Report A clean flank" }));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "privacy" } });
    fireEvent.click(screen.getByRole("button", { name: "Send report" }));
    await waitFor(() => expect(report).toHaveBeenCalledWith("clip-one", "privacy"));
    expect(await screen.findByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/sign-in");
  });
});

describe("Combat Highlights editor", () => {
  it("confirms removal and submits the physical slot revision", async () => {
    const api = actions();
    const updated = initial();
    updated.slots[0] = { ...updated.slots[0], clip: null, revision: 8 };
    vi.mocked(api.clear).mockResolvedValue({ ok: true, code: "saved", state: updated });
    render(<CombatHighlightsEditor initialState={initial()} actions={api} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove A clean flank" }));
    expect(api.clear).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Remove clip" }));
    await waitFor(() => expect(api.clear).toHaveBeenCalledWith(1, 7));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Add clip 1" })).toBeVisible();
  });

  it("requires a fresh removal confirmation after another session changes the clip", async () => {
    const api = actions();
    const refreshed = initial();
    refreshed.slots[0] = { ...refreshed.slots[0], revision: 8, clip: { ...clip, title: "Another session's clip" } };
    vi.mocked(api.clear).mockResolvedValueOnce({ ok: false, code: "conflict", state: refreshed }).mockResolvedValueOnce({ ok: true, code: "saved", state: initial() });
    render(<CombatHighlightsEditor initialState={initial()} actions={api} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove A clean flank" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove clip" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(api.clear).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Remove Another session's clip" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove clip" }));
    await waitFor(() => expect(api.clear).toHaveBeenLastCalledWith(1, 8));
  });

  it("reorders all physical slots with the matching revisions", async () => {
    const api = actions();
    vi.mocked(api.reorder).mockResolvedValue({ ok: true, code: "saved", state: initial() });
    render(<CombatHighlightsEditor initialState={initial()} actions={api} />);
    fireEvent.click(screen.getByRole("button", { name: "Move Holding the line earlier" }));
    await waitFor(() => expect(api.reorder).toHaveBeenCalledWith([2, 1, 3], [9, 7, 0]));
  });

  it("does not fetch owner video until requested and revokes its blob preview", async () => {
    const api = actions();
    vi.mocked(api.preview).mockResolvedValue({ ok: true, code: "saved", videoUrl: "https://private.example.test/owner", clerkToken: "private-session-token" });
    vi.mocked(fetch).mockResolvedValue({ ok: true, blob: async () => new Blob(["clip"], { type: "video/mp4" }) } as Response);
    const { container } = render(<CombatHighlightsEditor initialState={initial()} actions={api} />);
    expect(api.preview).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(container.querySelector("video")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Preview A clean flank" }));
    const dialog = await screen.findByRole("dialog");
    expect(fetch).toHaveBeenCalledWith("https://private.example.test/owner", expect.objectContaining({
      credentials: "omit", cache: "no-store", headers: { Authorization: "Bearer private-session-token" },
    }));
    expect(dialog.querySelector("video")).toHaveAttribute("src", "blob:private-preview");
    expect(document.body.innerHTML).not.toContain("private-session-token");
    expect(document.body.innerHTML).not.toContain("private.example.test");
    fireEvent.click(within(dialog).getByRole("button", { name: "Close clip preview" }));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:private-preview");
  });

  it("requires the declaration, uploads exact media headers through the helper, and then completes", async () => {
    const api = actions();
    const reserved = initial();
    reserved.slots[0] = { ...reserved.slots[0], revision: 8, pendingUploadId: "new-upload" };
    vi.mocked(api.reserve).mockResolvedValue({
      ok: true, code: "saved", state: reserved,
      upload: { uploadId: "new-upload", videoUrl: "https://upload.example.test/video", videoAuthorization: "video-grant", posterUrl: "https://upload.example.test/poster", posterAuthorization: "poster-grant", clerkToken: "clerk-grant" },
    });
    const complete = initial();
    complete.slots[0] = { ...complete.slots[0], revision: 9, clip: { ...clip, title: "Replacement", uploadId: "new-upload" } };
    vi.mocked(api.complete).mockResolvedValue({ ok: true, code: "saved", state: complete });
    render(<CombatHighlightsEditor initialState={initial()} actions={api} />);
    fireEvent.click(screen.getByRole("button", { name: "Replace A clean flank" }));
    fireEvent.change(screen.getByLabelText("Video file"), { target: { files: [file] } });
    await screen.findByText(/flank.mp4 ·/);
    const submit = screen.getByRole("button", { name: "Upload replacement" });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Clip title"), { target: { value: "Replacement" } });
    fireEvent.click(screen.getByLabelText(/This is genuine Company of Heroes 3/));
    fireEvent.click(submit);
    await waitFor(() => expect(api.complete).toHaveBeenCalledWith("new-upload"));
    expect(api.reserve).toHaveBeenCalledWith(expect.objectContaining({ slotNumber: 1, expectedRevision: 7, declarationAccepted: true, declarationVersion: 1, byteLength: file.size, posterByteLength: poster.size, title: "Replacement" }));
    expect(putHighlightObject).toHaveBeenNthCalledWith(1, expect.objectContaining({ body: file, authorization: "video-grant", clerkToken: "clerk-grant", contentType: "video/mp4" }));
    expect(putHighlightObject).toHaveBeenNthCalledWith(2, expect.objectContaining({ body: poster, authorization: "poster-grant", contentType: "image/jpeg" }));
    expect(await screen.findByRole("button", { name: "Replace Replacement" })).toBeVisible();
    expect(api.cancel).not.toHaveBeenCalled();
    expect(document.body.innerHTML).not.toContain("video-grant");
  });

  it("cancels an interrupted replacement with the reserved revision and keeps the old clip", async () => {
    const api = actions();
    const reserved = initial();
    reserved.slots[0] = { ...reserved.slots[0], revision: 8, pendingUploadId: "new-upload" };
    vi.mocked(api.reserve).mockResolvedValue({
      ok: true, code: "saved", state: reserved,
      upload: { uploadId: "new-upload", videoUrl: "https://upload.example.test/video", videoAuthorization: "video-grant", posterUrl: null, posterAuthorization: null, clerkToken: "clerk-grant" },
    });
    vi.mocked(api.cancel).mockResolvedValue({ ok: true, code: "saved", state: initial() });
    vi.mocked(putHighlightObject).mockImplementation(({ signal }) => new Promise((_, reject) => {
      signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }));
    render(<CombatHighlightsEditor initialState={initial()} actions={api} />);
    fireEvent.click(screen.getByRole("button", { name: "Replace A clean flank" }));
    fireEvent.change(screen.getByLabelText("Video file"), { target: { files: [file] } });
    await screen.findByText(/flank.mp4 ·/);
    fireEvent.click(screen.getByLabelText(/This is genuine Company of Heroes 3/));
    fireEvent.click(screen.getByRole("button", { name: "Upload replacement" }));
    await waitFor(() => expect(putHighlightObject).toHaveBeenCalled());
    await act(async () => { fireEvent.click(screen.getAllByRole("button", { name: "Cancel upload" }).at(-1)!); });
    await waitFor(() => expect(api.cancel).toHaveBeenCalledWith("new-upload", 8));
    expect(api.complete).not.toHaveBeenCalled();
    expect(await screen.findByRole("button", { name: "Replace A clean flank" })).toBeVisible();
  });

  it("adopts a conflict revision before retrying a pending cancellation", async () => {
    const api = actions();
    const first = initial();
    first.slots[0].pendingUploadId = "pending-one";
    const refreshed = initial();
    refreshed.slots[0] = { ...refreshed.slots[0], pendingUploadId: "pending-one", revision: 10 };
    vi.mocked(api.cancel).mockResolvedValueOnce({ ok: false, code: "conflict", state: refreshed }).mockResolvedValueOnce({ ok: true, code: "saved", state: initial() });
    render(<CombatHighlightsEditor initialState={first} actions={api} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel pending upload" }));
    await screen.findByText(/These clips changed in another session/);
    fireEvent.click(screen.getByRole("button", { name: "Cancel pending upload" }));
    await waitFor(() => expect(api.cancel).toHaveBeenLastCalledWith("pending-one", 10));
  });
});
