// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { highlightFileType, MAX_HIGHLIGHT_BYTES, MAX_POSTER_BYTES, putHighlightObject } from "@/components/combat-highlights/media";

afterEach(() => vi.unstubAllGlobals());
describe("Combat Highlight client checks", () => {
  it("uses decimal upload limits and permits the exact video boundary", () => {
    expect(MAX_HIGHLIGHT_BYTES).toBe(15_000_000);
    expect(MAX_POSTER_BYTES).toBe(200_000);
    expect(highlightFileType(new File([new Uint8Array(15_000_000)], "clip.mp4", { type: "video/mp4" }))).toBe("video/mp4");
    expect(() => highlightFileType(new File([new Uint8Array(15_000_001)], "clip.mp4", { type: "video/mp4" }))).toThrow("too-large");
  });
  it.each([["clip.mov", "video/quicktime"], ["clip.mp4", "video/quicktime"], ["clip.mp3", "audio/mpeg"]])("rejects unsupported container or MIME: %s", (name, type) => {
    expect(() => highlightFileType(new File(["clip"], name, { type }))).toThrow("invalid-media");
  });
  it("permits a WebM filename when the platform omits MIME but rejects empty files", () => {
    expect(highlightFileType(new File(["clip"], "clip.webm"))).toBe("video/webm");
    expect(() => highlightFileType(new File([], "empty.webm"))).toThrow("invalid-media");
  });
  it("puts both authorizations in headers, sends the original body, and reports progress", async () => {
    const request = {
      open: vi.fn(), setRequestHeader: vi.fn(), send: vi.fn(), abort: vi.fn(), timeout: 0, status: 204,
      upload: { onprogress: null as null | ((event: { lengthComputable: boolean; loaded: number; total: number }) => void) },
      onload: null as null | (() => void), onerror: null as null | (() => void), ontimeout: null as null | (() => void), onabort: null as null | (() => void),
    };
    vi.stubGlobal("XMLHttpRequest", vi.fn(function () { return request; }));
    const body = new Blob(["original bytes"], { type: "video/webm" });
    const onProgress = vi.fn();
    const result = putHighlightObject({ url: "https://upload.example.test/video", body, authorization: "upload-grant", clerkToken: "clerk-session", contentType: "video/webm", signal: new AbortController().signal, onProgress });
    expect(request.open).toHaveBeenCalledWith("PUT", "https://upload.example.test/video");
    expect(request.setRequestHeader.mock.calls).toEqual([["Authorization", "Bearer upload-grant"], ["X-Clerk-Token", "clerk-session"], ["Content-Type", "video/webm"]]);
    expect(request.send).toHaveBeenCalledWith(body);
    request.upload.onprogress?.({ lengthComputable: true, loaded: 4, total: 8 });
    expect(onProgress).toHaveBeenCalledWith(50);
    request.onload?.();
    await expect(result).resolves.toBeUndefined();
  });
});
