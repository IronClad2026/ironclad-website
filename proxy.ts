import { clerkMiddleware } from "@clerk/nextjs/server";
import { type NextFetchEvent, type NextRequest, NextResponse } from "next/server";
import {
  casterRouteAccess,
  isPublicPathname,
  isSelfAuthenticatedApiPathname,
} from "@/lib/route-access";
import { getCasterInvitationOrigin } from "@/lib/caster/environment";
import { signCasterLayoutContext } from "@/lib/caster/layout-context";
import {
  CASTER_LAYOUT_HEADER,
  CASTER_PREPARE_PATH,
  CASTER_SIGN_IN_PATH,
  isCasterInvitationRead,
} from "@/lib/caster/routes";
import { isReadyStagingEnabled } from "@/lib/ready/review-access";
import { isReadyWardrobePilotEnabled } from "@/lib/wardrobe/environment";
import {
  buildPublicProfileNoticeUrl,
  isNoticeAccessDocument,
  isNoticeAccessPage,
  isNoticeAccessPost,
  isPublicProfileNoticeInstalled,
  NOTICE_LAYOUT_HEADER,
} from "@/lib/public-gaming-profile-notice";
import { loadPublicGamingProfileNotice } from "@/lib/public-gaming-profile-notice-server";

const authenticatedProxy = clerkMiddleware(async (auth, request) => {
  const pathname = request.nextUrl.pathname;
  const isPageRead = request.method === "GET" || request.method === "HEAD";
  const casterOrigin = getCasterInvitationOrigin();
  const requestHeaders = new Headers(request.headers);
  const hasSuppliedCasterHeader = requestHeaders.has(CASTER_LAYOUT_HEADER);
  const casterAccess = requestHeaders.has("next-action") ? null : casterRouteAccess(
    pathname, request.method, casterOrigin !== null,
  );
  requestHeaders.delete(NOTICE_LAYOUT_HEADER);
  requestHeaders.delete(CASTER_LAYOUT_HEADER);

  if (casterAccess) {
    if (casterAccess === "studio" || casterAccess === "protected-api") {
      const { userId } = await auth();
      if (!userId) {
        const headers = { "Cache-Control": "private, no-store" };
        if (casterAccess === "protected-api") {
          return NextResponse.json({ error: "Authentication required." }, { status: 401, headers });
        }
        return NextResponse.redirect(new URL(CASTER_SIGN_IN_PATH, casterOrigin!), { status: 303, headers });
      }
    }
    if (casterAccess === "auth" || casterAccess === "studio") {
      const legalError = casterAccess === "studio" ? request.nextUrl.searchParams.get("legal") : null;
      const context = signCasterLayoutContext({
        view: casterAccess,
        legalError: legalError === "required" || legalError === "retry" ? legalError : null,
      });
      if (!context) return new NextResponse(null, { status: 503 });
      requestHeaders.set(CASTER_LAYOUT_HEADER, context);
    }
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  const isReadyAssetRead = isPageRead &&
    (pathname === "/mascot-v6/assets/interaction.json" || pathname === "/mascot-v6/assets/ironclad.glb") &&
    isReadyStagingEnabled();
  const isWardrobePilotRoute = isReadyWardrobePilotEnabled() && (
    (isPageRead && pathname === "/profile/ready") ||
    pathname === "/api/ready/wardrobe" ||
    pathname.startsWith("/api/ready/wardrobe/assets/")
  );
  if (
    !isPublicPathname(pathname) &&
    !isSelfAuthenticatedApiPathname(pathname) &&
    !isReadyAssetRead &&
    !isWardrobePilotRoute
  ) {
    await auth.protect();
  }
  if (!isPublicProfileNoticeInstalled()) {
    if (hasSuppliedCasterHeader) {
      return NextResponse.next({ request: { headers: requestHeaders } });
    }
    return;
  }
  if (isPageRead && isNoticeAccessPage(pathname)) {
    requestHeaders.set(NOTICE_LAYOUT_HEADER, "account-access");
    return NextResponse.next({ request: { headers: requestHeaders } });
  }
  // Only the two dedicated, independently authenticated handlers can POST
  // while the notice is pending. A Server Action posted to an exempt URL
  // must never inherit this exception.
  if (isNoticeAccessPost(pathname) && request.method === "POST") {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }
  const { userId } = await auth();
  if (!userId) return NextResponse.next({ request: { headers: requestHeaders } });

  const notice = await loadPublicGamingProfileNotice(userId);
  if (notice === "required" || notice === "unavailable") {
    if (isPageRead && isNoticeAccessDocument(pathname)) {
      requestHeaders.set(NOTICE_LAYOUT_HEADER, "public-document");
      return NextResponse.next({ request: { headers: requestHeaders } });
    }
    if (isPageRead && (!pathname.startsWith("/api/") || pathname === "/api/notifications/click")) {
      return NextResponse.redirect(buildPublicProfileNoticeUrl(request.nextUrl), {
        status: 303,
        headers: { "Cache-Control": "private, no-store" },
      });
    }
    return NextResponse.json({ error: "Public gaming profile acknowledgement required." }, {
      status: notice === "required" ? 403 : 503,
      headers: { "Cache-Control": "private, no-store" },
    });
  }
  return NextResponse.next({ request: { headers: requestHeaders } });
});

export default function proxy(request: NextRequest, event: NextFetchEvent) {
  // Clerk can redirect from its session handshake before the callback runs.
  // Serve the standalone invitation shell first so the browser clears the
  // fragment before any redirect can carry it to the identity provider.
  if (isCasterInvitationRead(request.nextUrl.pathname, request.method)) return NextResponse.next();
  // This handler validates its own origin and needs no Clerk identity. Keep the
  // raw secret POST out of the session-handshake redirect path as well.
  if (request.nextUrl.pathname === CASTER_PREPARE_PATH && request.method === "POST") {
    if (request.headers.has("next-action")) return new NextResponse(null, { status: 403 });
    return NextResponse.next();
  }
  return authenticatedProxy(request, event);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|mp3|webm|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
