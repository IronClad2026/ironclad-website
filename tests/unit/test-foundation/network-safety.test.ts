import { describe, expect, it, vi } from "vitest";
import { mockServer } from "@/tests/mocks/server";

const UNHANDLED_REQUEST_URL =
  "http://127.0.0.1:1/msw-unhandled-request-must-be-blocked";

describe("test network safety", () => {
  it("rejects unhandled external requests instead of reaching the network", async () => {
    const unhandledRequest = vi.fn();
    mockServer.events.on("request:unhandled", unhandledRequest);

    try {
      await expect(fetch(UNHANDLED_REQUEST_URL)).rejects.toThrow();
      expect(unhandledRequest).toHaveBeenCalledOnce();
      expect(unhandledRequest.mock.calls[0][0].request.url).toBe(
        UNHANDLED_REQUEST_URL
      );
    } finally {
      mockServer.events.removeListener("request:unhandled", unhandledRequest);
    }
  });
});
