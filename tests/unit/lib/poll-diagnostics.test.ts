import { describe, expect, it, vi } from "vitest";
import { createPollDiagnostics } from "@/lib/poll-diagnostics";

describe("poll diagnostic privacy", () => {
  it("only emits allowlisted fields/codes with a random bounded correlation ID", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const diagnostic = createPollDiagnostics("tournament");
    const secret = "SYNTHETIC_BEARER_TOKEN_EMAIL_USER_BALLOT_PRIVATE";
    diagnostic("rpc", "private", "rejection", { code: "42501", message: secret, details: secret, hint: secret, ballot: [secret], userId: secret });
    diagnostic("rpc", "public", "rejection", { code: secret, message: secret });
    const hostile = Object.defineProperty({}, "code", { get() { throw new Error(secret); } });
    diagnostic("rpc", "private", "rejection", hostile);
    expect(log.mock.calls[0][1]).toEqual({ surface: "tournament", stage: "rpc", source: "private", category: "rejection", code: "42501", correlationId: expect.stringMatching(/^[0-9a-f-]{36}$/) });
    expect(log.mock.calls[1][1].code).toBe("other");
    expect(log.mock.calls[2][1].code).toBe("other");
    expect(JSON.stringify(log.mock.calls)).not.toContain(secret);
    for (let i = 0; i < 20; i++) diagnostic("application", "request", "unexpected", new Error(secret));
    expect(log).toHaveBeenCalledTimes(8);
    expect(new Set(log.mock.calls.map((call) => call[1].correlationId)).size).toBe(1);
    createPollDiagnostics("community")("client", "private", "acquisition");
    expect(log.mock.calls[8][1].correlationId).not.toBe(log.mock.calls[0][1].correlationId);
  });
});
