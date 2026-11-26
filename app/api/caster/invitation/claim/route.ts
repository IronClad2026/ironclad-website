import { NextRequest, NextResponse } from "next/server";
import { CASTER_STUDIO_PATH } from "@/lib/caster/contracts";
import { getCasterInvitationOrigin, isCasterProgramEnabled } from "@/lib/caster/environment";
import { CONTINUATION_COOKIE, readInvitationContinuation } from "@/lib/caster/invitation-secret";
import { CASTER_COOKIE_OPTIONS, CASTER_PRIVATE_HEADERS, casterRpc, isCasterPostOrigin, loadCurrentCasterAccount, readSmallCasterBody } from "@/lib/caster/server";

export async function POST(request: NextRequest) {
  if (!isCasterProgramEnabled()) return new Response(null, { status: 404, headers: CASTER_PRIVATE_HEADERS });
  if (!isCasterPostOrigin(request) || !/^application\/x-www-form-urlencoded(?:\s*;|$)/i.test(request.headers.get("content-type") ?? "")) {
    return new Response(null, { status: 403, headers: CASTER_PRIVATE_HEADERS });
  }
  const body = await readSmallCasterBody(request, 512);
  const form = new URLSearchParams(body ?? "");
  if (form.getAll("accept").length !== 1 || form.get("accept") !== "yes" || form.getAll("account").length !== 1) {
    return new Response(null, { status: 400, headers: CASTER_PRIVATE_HEADERS });
  }

  const account = await loadCurrentCasterAccount();
  if (account.status !== "open") return studio(account.status);
  if (form.get("account") !== account.id) return studio("account_changed");
  if (!account.emailVerified) return studio("unverified");

  const digest = readInvitationContinuation(request.cookies.get(CONTINUATION_COOKIE)?.value);
  if (!digest) return studio("lost", true);
  const result = await casterRpc<{ status: string }>("caster_phase1_claim", { p_actor: account.id, p_token_digest: digest });
  switch (result?.status) {
    case "claimed":
    case "already_owned":
    case "invalid":
    case "expired":
    case "revoked":
    case "closed":
    case "unavailable":
      return studio(result.status, true);
    case "rate_limited":
    case "legal_required":
    case "legal_unavailable":
      return studio(result.status);
    default:
      return studio("service_unavailable");
  }
}

function studio(status: string, clear = false) {
  const target = new URL(CASTER_STUDIO_PATH, getCasterInvitationOrigin()!);
  target.searchParams.set("claim", status);
  const response = NextResponse.redirect(target, { status: 303, headers: CASTER_PRIVATE_HEADERS });
  if (clear) response.cookies.set(CONTINUATION_COOKIE, "", { ...CASTER_COOKIE_OPTIONS, maxAge: 0 });
  return response;
}
