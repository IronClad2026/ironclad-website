import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const runTransactionalEmailWorkerMock = vi.hoisted(() => vi.fn());
const workerModuleLoadedMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/transactional-email/worker", () => {
  workerModuleLoadedMock();
  return {
    runTransactionalEmailWorker: runTransactionalEmailWorkerMock,
  };
});

import {
  maxDuration,
  POST,
  runtime,
} from "@/app/api/internal/transactional-email/route";

const WORKER_SECRET = "test-worker-secret";

function createRequest(authorization?: string) {
  return new Request("https://example.test/api/internal/transactional-email", {
    method: "POST",
    headers: authorization ? { Authorization: authorization } : undefined,
  });
}

function expectNoStore(response: Response) {
  expect(response.headers.get("Cache-Control")).toContain("no-store");
  expect(response.headers.get("Pragma")).toBe("no-cache");
}

describe("transactional email worker route", () => {
  beforeEach(() => {
    vi.stubEnv("TRANSACTIONAL_EMAIL_WORKER_SECRET", WORKER_SECRET);
    runTransactionalEmailWorkerMock.mockResolvedValue({
      claimed: 5,
      sent: 2,
      skipped: 1,
      retryableFailures: 1,
      permanentFailures: 1,
      privateIdentifier: "must-not-leak",
    });
  });

  it("uses the Node.js runtime and a 60-second maximum duration", () => {
    expect(runtime).toBe("nodejs");
    expect(maxDuration).toBe(60);
  });

  it.each([undefined, "Bearer wrong-secret", "Basic test-worker-secret"])(
    "rejects unauthorized requests before invoking the worker (%s)",
    async (authorization) => {
      const response = await POST(createRequest(authorization));

      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({
        ok: false,
        code: "WORKER_UNAUTHORIZED",
      });
      expectNoStore(response);
      expect(workerModuleLoadedMock).not.toHaveBeenCalled();
      expect(runTransactionalEmailWorkerMock).not.toHaveBeenCalled();
    }
  );

  it("fails closed before invoking the worker when the route secret is absent", async () => {
    vi.stubEnv("TRANSACTIONAL_EMAIL_WORKER_SECRET", "");

    const response = await POST(
      createRequest(`Bearer ${WORKER_SECRET}`)
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      ok: false,
      code: "WORKER_AUTH_UNAVAILABLE",
    });
    expectNoStore(response);
    expect(workerModuleLoadedMock).not.toHaveBeenCalled();
    expect(runTransactionalEmailWorkerMock).not.toHaveBeenCalled();
  });

  it("returns only approved aggregate counts for an authorized invocation", async () => {
    const response = await POST(
      createRequest(`Bearer ${WORKER_SECRET}`)
    );

    expect(response.status).toBe(200);
    expectNoStore(response);
    expect(await response.json()).toEqual({
      ok: true,
      claimed: 5,
      sent: 2,
      skipped: 1,
      retryableFailures: 1,
      permanentFailures: 1,
    });
    expect(runTransactionalEmailWorkerMock).toHaveBeenCalledOnce();
  });

  it("returns a sanitized no-store failure without worker details", async () => {
    runTransactionalEmailWorkerMock.mockRejectedValueOnce(
      new Error("private provider detail")
    );

    const response = await POST(
      createRequest(`Bearer ${WORKER_SECRET}`)
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      ok: false,
      code: "WORKER_FAILED",
    });
    expectNoStore(response);
  });

  it("exports POST as its only HTTP method handler", () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        "app/api/internal/transactional-email/route.ts"
      ),
      "utf8"
    );

    expect(source).toContain("export async function POST");
    expect(source).not.toMatch(
      /export\s+(?:async\s+)?function\s+(?:GET|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/
    );
  });
});
