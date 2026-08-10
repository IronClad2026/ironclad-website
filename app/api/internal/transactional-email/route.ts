import { NextResponse } from "next/server";
import { loadTransactionalEmailWorkerSecret } from "@/lib/transactional-email/config";
import { authorizeTransactionalEmailWorkerRequest } from "@/lib/transactional-email/route-auth";

export const runtime = "nodejs";
export const maxDuration = 60;

const PRIVATE_NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  "X-Content-Type-Options": "nosniff",
} as const;

function jsonResponse(body: object, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: PRIVATE_NO_STORE_HEADERS,
  });
}

export async function POST(request: Request) {
  let configuredSecret: string;

  try {
    configuredSecret = loadTransactionalEmailWorkerSecret();
  } catch {
    return jsonResponse(
      { ok: false, code: "WORKER_AUTH_UNAVAILABLE" },
      503
    );
  }

  const authorization = authorizeTransactionalEmailWorkerRequest(
    request.headers.get("authorization"),
    configuredSecret
  );

  if (authorization === "unavailable") {
    return jsonResponse(
      { ok: false, code: "WORKER_AUTH_UNAVAILABLE" },
      503
    );
  }

  if (authorization !== "authorized") {
    return jsonResponse({ ok: false, code: "WORKER_UNAUTHORIZED" }, 401);
  }

  try {
    const { runTransactionalEmailWorker } = await import(
      "@/lib/transactional-email/worker"
    );
    const result = await runTransactionalEmailWorker();

    return jsonResponse({
      ok: true,
      claimed: result.claimed,
      sent: result.sent,
      skipped: result.skipped,
      retryableFailures: result.retryableFailures,
      permanentFailures: result.permanentFailures,
    });
  } catch {
    return jsonResponse({ ok: false, code: "WORKER_FAILED" }, 500);
  }
}
