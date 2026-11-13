import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  isPublicProfileNoticeInstalled,
  noticeReturnPath,
  PUBLIC_PROFILE_NOTICE_PATH,
  PUBLIC_PROFILE_NOTICE_VERSION,
} from "@/lib/public-gaming-profile-notice";
import { savePublicGamingProfileNotice } from "@/lib/public-gaming-profile-notice-server";

const HEADERS = { "Cache-Control": "private, no-store" };

export async function POST(request: Request) {
  const currentUrl = new URL(request.url);
  if (request.headers.get("origin") !== currentUrl.origin ||
    !request.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded")) {
    return NextResponse.json({ error: "Invalid request." }, { status: 403, headers: HEADERS });
  }
  const { userId } = await auth();
  if (!userId) return NextResponse.redirect(new URL("/sign-in", currentUrl), { status: 303, headers: HEADERS });
  if (!isPublicProfileNoticeInstalled()) {
    return NextResponse.redirect(new URL("/", currentUrl), { status: 303, headers: HEADERS });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return backToNotice(currentUrl, "/", "required");
  }
  const versions = form.getAll("noticeVersion");
  const checked = form.getAll("acknowledged");
  const returnTo = noticeReturnPath(form.get("returnTo"));
  if (versions.length !== 1 || versions[0] !== PUBLIC_PROFILE_NOTICE_VERSION ||
      checked.length !== 1 || checked[0] !== "yes") {
    return backToNotice(currentUrl, returnTo, "required");
  }
  if (!await savePublicGamingProfileNotice(userId)) {
    return backToNotice(currentUrl, returnTo, "unavailable");
  }
  return NextResponse.redirect(new URL(returnTo, currentUrl), { status: 303, headers: HEADERS });
}

function backToNotice(currentUrl: URL, returnTo: string, error: string) {
  const next = new URL(PUBLIC_PROFILE_NOTICE_PATH, currentUrl);
  next.searchParams.set("returnTo", returnTo);
  next.searchParams.set("error", error);
  return NextResponse.redirect(next, { status: 303, headers: HEADERS });
}
