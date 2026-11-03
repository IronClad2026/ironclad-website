import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/match-chat/translation/route";
import * as actions from "@/app/tournaments/chat-translation-actions";

vi.mock("@/app/tournaments/chat-translation-actions", () => ({
  validateMatchChatTranslations: vi.fn(), translateMatchChatMessage: vi.fn(),
}));
const ORIGIN = "https://staging.example.test";
const payload = { operation: "validate", input: { roomId: "room", messageIds: [] } };
const request = (body = JSON.stringify(payload), headers: Record<string, string> = {}) => new NextRequest(`${ORIGIN}/api/match-chat/translation`, {
  method: "POST", headers: { origin: ORIGIN, "content-type": "application/json", ...headers }, body,
});
beforeEach(() => {
  vi.mocked(actions.validateMatchChatTranslations).mockResolvedValue({ ok: false, code: "auth_required" });
  vi.mocked(actions.translateMatchChatMessage).mockResolvedValue({ ok: false, code: "forbidden" });
});
describe("independent chat translation transport", () => {
  it.each(["https://foreign.example", "null", ""])("rejects foreign/missing Origin %s before action execution", async (origin) => {
    const response = await POST(request(undefined, { origin }));
    expect(response.status).toBe(403);
    expect(actions.validateMatchChatTranslations).not.toHaveBeenCalled();
  });
  it("requires JSON and rejects oversized declared or streamed bodies", async () => {
    expect((await POST(request(undefined, { "content-type": "text/plain" }))).status).toBe(403);
    expect((await POST(request(undefined, { "content-length": "4097" }))).status).toBe(413);
    expect((await POST(request("x".repeat(4097)))).status).toBe(413);
    expect(actions.validateMatchChatTranslations).not.toHaveBeenCalled();
  });
  it.each(["{", "null", "[]", '{"operation":"other","input":{}}', '{"operation":"validate","input":{},"body":"spoof"}'])("rejects malformed or unknown payload %s", async (body) => {
    expect((await POST(request(body))).status).toBe(400);
    expect(actions.validateMatchChatTranslations).not.toHaveBeenCalled();
  });
  it("passes only fixed validation input to the authenticated action and disables HTTP caching", async () => {
    const response = await POST(request());
    expect(actions.validateMatchChatTranslations).toHaveBeenCalledExactlyOnceWith(payload.input);
    expect(actions.translateMatchChatMessage).not.toHaveBeenCalled();
    expect(await response.json()).toEqual({ ok: false, code: "auth_required" });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
  it("preserves authorization denial through the independent translation path", async () => {
    const input = { roomId: "forged", messageId: "foreign" };
    const response = await POST(request(JSON.stringify({ operation: "translate", input })));
    expect(actions.translateMatchChatMessage).toHaveBeenCalledExactlyOnceWith(input);
    expect(await response.json()).toEqual({ ok: false, code: "forbidden" });
    expect(actions.validateMatchChatTranslations).not.toHaveBeenCalled();
  });
});
