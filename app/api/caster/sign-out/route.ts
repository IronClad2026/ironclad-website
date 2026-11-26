import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

import { getCasterInvitationOrigin } from "@/lib/caster/environment";
import { CASTER_SIGN_IN_PATH, CASTER_STUDIO_PATH } from "@/lib/caster/routes";
import { CASTER_PRIVATE_HEADERS, isCasterPostOrigin } from "@/lib/caster/server";

const CLERK_SESSION_COOKIE = /^__session(?:_[A-Za-z0-9_-]{8})?$/;
const ENDED_SESSION_STATES = new Set(["abandoned", "ended", "expired", "removed", "replaced", "revoked"]);

export async function POST(request: NextRequest) {
  const origin = getCasterInvitationOrigin();
  if (!origin) return new NextResponse(null, { status: 404, headers: CASTER_PRIVATE_HEADERS });
  if (!isCasterPostOrigin(request)) return new NextResponse(null, { status: 403, headers: CASTER_PRIVATE_HEADERS });

  try {
    const { userId, sessionId } = await auth();
    if (!userId || !sessionId) return new NextResponse(null, { status: 401, headers: CASTER_PRIVATE_HEADERS });

    const { sessions } = await clerkClient();
    const session = await sessions.revokeSession(sessionId).catch(() => sessions.getSession(sessionId));
    if (session.id === sessionId && session.userId === userId && ENDED_SESSION_STATES.has(session.status)) {
      const response = NextResponse.redirect(new URL(CASTER_SIGN_IN_PATH, origin), {
        status: 303,
        headers: CASTER_PRIVATE_HEADERS,
      });
      // The app-domain session JWT can outlive revocation briefly. Expire its
      // browser copies so Clerk reconciles with the provider on the next read.
      // Keep the device marker and a prepared invitation for account switching.
      for (const { name } of request.cookies.getAll()) {
        if (CLERK_SESSION_COOKIE.test(name)) {
          response.cookies.set(name, "", { maxAge: 0, path: "/", sameSite: "lax", secure: request.nextUrl.protocol === "https:" });
        }
      }
      return response;
    }
  } catch {
    // A failed provider call leaves the browser signed in so it can retry.
  }

  const retry = new URL(CASTER_STUDIO_PATH, origin);
  retry.searchParams.set("signOut", "retry");
  return NextResponse.redirect(retry, { status: 303, headers: CASTER_PRIVATE_HEADERS });
}
