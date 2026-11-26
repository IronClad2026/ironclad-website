import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { recordCurrentAccountLegalAcceptance } from "@/lib/account-legal-write";
import { getCasterInvitationOrigin } from "@/lib/caster/environment";
import { CASTER_SIGN_IN_PATH, CASTER_STUDIO_PATH } from "@/lib/caster/routes";
import { isCasterPostOrigin, readSmallCasterBody } from "@/lib/caster/server";

const HEADERS = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
const FIELDS = ["termsDocumentId", "privacyDocumentId", "termsAccepted", "privacyAcknowledged"];

export async function POST(request: Request) {
  const origin = getCasterInvitationOrigin();
  if (!origin) return new NextResponse(null, { status: 404, headers: HEADERS });
  if (!isCasterPostOrigin(request) ||
    !/^application\/x-www-form-urlencoded(?:\s*;|$)/i.test(request.headers.get("content-type") ?? "")) {
    return new NextResponse(null, { status: 403, headers: HEADERS });
  }

  const redirectTo = new URL(CASTER_STUDIO_PATH, origin);
  try {
    const { userId, sessionId } = await auth();
    if (!userId || !sessionId) {
      return NextResponse.redirect(new URL(CASTER_SIGN_IN_PATH, origin), { status: 303, headers: HEADERS });
    }

    const body = await readSmallCasterBody(request, 2_048);
    const form = new URLSearchParams(body ?? "");
    const result = body !== null && FIELDS.every((field) => form.getAll(field).length === 1) &&
      [...form.keys()].every((field) => FIELDS.includes(field))
      ? await recordCurrentAccountLegalAcceptance(userId, form, "caster")
      : "acceptance-required";

    if (result !== "accepted") redirectTo.searchParams.set("legal", result === "unavailable" ? "retry" : "required");
  } catch {
    redirectTo.searchParams.set("legal", "retry");
  }
  return NextResponse.redirect(redirectTo, { status: 303, headers: HEADERS });
}
