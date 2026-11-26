import { isIP } from "node:net";
import { NextResponse } from "next/server";
import { isCasterProgramEnabled } from "@/lib/caster/environment";
import { CONTINUATION_COOKIE, createInvitationContinuation, digestInvitationSecret, invitationRateKey, isInvitationSecret } from "@/lib/caster/invitation-secret";
import { CASTER_COOKIE_OPTIONS, CASTER_PRIVATE_HEADERS, casterRpc, isCasterPostOrigin, readSmallCasterBody } from "@/lib/caster/server";

type PrepareResult = { status: "valid" | "invalid" | "expired" | "revoked" | "claimed" | "rate_limited"; expires_at?: string };

export async function POST(request: Request) {
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

  // The trusted Vercel ingress supplies this header. Loopback testing uses one bucket.
  const address = request.headers.get("x-vercel-forwarded-for")?.trim() ?? "";
  const rateKey = invitationRateKey(process.env.VERCEL === "1" && isIP(address) ? address : "unknown-source");
  if (!rateKey) return respond("unavailable", 503, true);

  const digest = digestInvitationSecret(secret);
  const result = await casterRpc<PrepareResult>("caster_phase1_prepare", { p_token_digest: digest, p_rate_key: rateKey });
  if (!result) return respond("unavailable", 503, true);
  if (result.status === "rate_limited") return respond("limited", 429, true);
  if (result.status !== "valid") return respond(result.status, 200, true);

  const continuation = result.expires_at && createInvitationContinuation(digest, result.expires_at);
  if (!continuation) return respond("unavailable", 503, true);
  const response = respond("ready", 200);
  response.cookies.set(CONTINUATION_COOKIE, continuation.value, {
    ...CASTER_COOKIE_OPTIONS,
    maxAge: continuation.maxAge,
  });
  return response;
}

function respond(status: string, code: number, clear = false) {
  const response = NextResponse.json({ status }, { status: code, headers: CASTER_PRIVATE_HEADERS });
  if (clear) response.cookies.set(CONTINUATION_COOKIE, "", { ...CASTER_COOKIE_OPTIONS, maxAge: 0 });
  return response;
}
