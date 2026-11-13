import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  isPublicPathname,
  isSelfAuthenticatedApiPathname,
} from "@/lib/route-access";
import {
  buildPublicProfileNoticeUrl,
  isNoticeAccessDocument,
  isNoticeAccessPage,
  isNoticeAccessPost,
  isPublicProfileNoticeInstalled,
  NOTICE_LAYOUT_HEADER,
} from "@/lib/public-gaming-profile-notice";
import { loadPublicGamingProfileNotice } from "@/lib/public-gaming-profile-notice-server";

export default clerkMiddleware(async (auth, request) => {
  const pathname = request.nextUrl.pathname;
  if (
    !isPublicPathname(pathname) &&
    !isSelfAuthenticatedApiPathname(pathname)
  ) {
    await auth.protect();
  }
  if (!isPublicProfileNoticeInstalled()) return;

  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete(NOTICE_LAYOUT_HEADER);
  const isPageRead = request.method === "GET" || request.method === "HEAD";
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

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|mp3|webm|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
