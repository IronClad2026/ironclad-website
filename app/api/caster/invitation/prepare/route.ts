import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { NextRequest, NextResponse } from "next/server";
import { isCasterProgramEnabled } from "@/lib/caster/environment";
import { CONTINUATION_COOKIE, CONTINUATION_MAX_AGE_SECONDS, digestInvitationSecret, generateContinuation, isInvitationSecret, readContinuationDigest } from "@/lib/caster/invitation-secret";
import { CASTER_COOKIE_OPTIONS, CASTER_PRIVATE_HEADERS, casterRpc, isCasterPostOrigin, readSmallCasterBody } from "@/lib/caster/server";

type PrepareResult = { status: "valid" | "invalid" | "expired" | "revoked" | "claimed" | "rate_limited"; expires_at?: string };

export async function POST(request: NextRequest) {
  if (!isCasterProgramEnabled()) return respond("unavailable", 404);
  if (!isCasterPostOrigin(request) || !/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? "")) {
    return respond("invalid", 403);
  }

  const body = await readSmallCasterBody(request, 128);
  let secret: unknown;
  try {
    secret = body ? JSON.parse(body)?.secret : undefined;
  } catch {
    return respond("invalid", 400, true);
  }
  if (!isInvitationSecret(secret)) return respond("invalid", 400, true);

  const continuation = generateContinuation();
  const result = await casterRpc<PrepareResult>("caster_phase1_prepare_continuation", {
    p_token_digest: digestInvitationSecret(secret),
    p_continuation_digest: continuation.digest,
    p_source_digest: rateSourceDigest(request),
    p_previous_continuation_digest: readContinuationDigest(request.cookies.get(CONTINUATION_COOKIE)?.value),
  });
  if (!result) return respond("unavailable", 503, true);
  if (result.status === "rate_limited") return respond("limited", 429, true);
  if (result.status !== "valid") return respond(result.status, 200, true);

  const secondsRemaining = Math.floor((Date.parse(result.expires_at ?? "") - Date.now()) / 1000);
  if (!Number.isFinite(secondsRemaining) || secondsRemaining <= 0) return respond("unavailable", 503, true);
  const response = respond("ready", 200);
  response.cookies.set(CONTINUATION_COOKIE, continuation.value, {
    ...CASTER_COOKIE_OPTIONS,
    maxAge: Math.min(CONTINUATION_MAX_AGE_SECONDS, secondsRemaining),
  });
  return response;
}

function rateSourceDigest(request: Request) {
  // Only the trusted Vercel ingress supplies a source. PostgreSQL HMACs this
  // prehash with a private pepper before keeping any rate-limit record.
  const ip = process.env.VERCEL === "1" ? request.headers.get("x-vercel-forwarded-for")?.trim() ?? "" : "";
  const version = ip.includes("%") ? 0 : isIP(ip);
  const source = version === 6 ? new URL(`http://[${ip}]/`).hostname : version === 4 ? ip : "unknown-source";
  return createHash("sha256").update(`ironclad:caster:prepare-source:${source}`).digest("hex");
}

function respond(status: string, code: number, clear = false) {
  const response = NextResponse.json({ status }, { status: code, headers: CASTER_PRIVATE_HEADERS });
  if (clear) response.cookies.set(CONTINUATION_COOKIE, "", { ...CASTER_COOKIE_OPTIONS, maxAge: 0 });
  return response;
}
