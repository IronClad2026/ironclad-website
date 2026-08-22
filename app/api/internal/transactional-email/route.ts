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
    const [emailModule, pushModule] = await Promise.allSettled([
      import("@/lib/transactional-email/worker"),
      import("@/lib/web-push/worker"),
    ]);
    const [emailResult, pushResult] = await Promise.allSettled([
      emailModule.status === "fulfilled"
        ? emailModule.value.runTransactionalEmailWorker()
        : Promise.reject(emailModule.reason),
      pushModule.status === "fulfilled"
        ? pushModule.value.runWebPushWorker()
        : Promise.reject(pushModule.reason),
    ]);

    if (
      emailResult.status === "rejected" ||
      pushResult.status === "rejected"
    ) {
      return jsonResponse({ ok: false, code: "WORKER_FAILED" }, 500);
    }

    return jsonResponse({
      ok: true,
      claimed: emailResult.value.claimed,
      sent: emailResult.value.sent,
      skipped: emailResult.value.skipped,
      retryableFailures: emailResult.value.retryableFailures,
      permanentFailures: emailResult.value.permanentFailures,
      push: {
        enabled: pushResult.value.enabled,
        claimed: pushResult.value.claimed,
        sent: pushResult.value.sent,
        skipped: pushResult.value.skipped,
        retryableFailures: pushResult.value.retryableFailures,
        permanentFailures: pushResult.value.permanentFailures,
      },
    });
  } catch {
    return jsonResponse({ ok: false, code: "WORKER_FAILED" }, 500);
  }
}
