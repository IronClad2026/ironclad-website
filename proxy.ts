import { clerkMiddleware } from "@clerk/nextjs/server";
import {
  isPublicPathname,
  isSelfAuthenticatedApiPathname,
} from "@/lib/route-access";

export default clerkMiddleware(async (auth, request) => {
  if (
    !isPublicPathname(request.nextUrl.pathname) &&
    !isSelfAuthenticatedApiPathname(request.nextUrl.pathname)
  ) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|mp3|webm|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
