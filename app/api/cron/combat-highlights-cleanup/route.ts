import { createHash, timingSafeEqual } from "node:crypto";
import { drainHighlightCleanup } from "@/lib/combat-highlights/cleanup";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const privateHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
};

export async function GET(request: Request) {
  // Next.js can dispatch an implicit HEAD through GET. It must not run cleanup.
  if (request.method !== "GET") {
    return Response.json({ ok: false }, { status: 405, headers: privateHeaders });
  }

  const secret = process.env.CRON_SECRET;
  if (!secret || !secret.trim()) {
    return Response.json({ ok: false }, { status: 401, headers: privateHeaders });
  }
  const expectedDigest = createHash("sha256").update(`Bearer ${secret}`, "utf8").digest();
  const suppliedDigest = createHash("sha256").update(request.headers.get("authorization") ?? "", "utf8").digest();
  if (!timingSafeEqual(expectedDigest, suppliedDigest)) {
    return Response.json({ ok: false }, { status: 401, headers: privateHeaders });
  }

  try {
    const deleted = await drainHighlightCleanup(10);
    return Response.json({ deleted }, { headers: privateHeaders });
  } catch {
    return Response.json({ ok: false }, { status: 503, headers: privateHeaders });
  }
}
