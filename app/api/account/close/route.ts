import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { deleteIronCladAccount } from "@/app/profile/delete-account-action";
import { ACCOUNT_CLOSE_PATH, isPublicProfileNoticeInstalled } from "@/lib/public-gaming-profile-notice";

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
    return NextResponse.redirect(new URL("/profile", currentUrl), { status: 303, headers: HEADERS });
  }

  const next = new URL(ACCOUNT_CLOSE_PATH, currentUrl);
  try {
    const form = await request.formData();
    const confirmations = form.getAll("confirmation");
    if (confirmations.length !== 1 || confirmations[0] !== "DELETE") {
      next.searchParams.set("result", "confirmation-invalid");
      return NextResponse.redirect(next, { status: 303, headers: HEADERS });
    }
    const result = await deleteIronCladAccount({ status: "idle", message: "" }, form);
    if (result.status === "success") {
      return NextResponse.redirect(new URL("/", currentUrl), { status: 303, headers: HEADERS });
    }
    next.searchParams.set("result", result.code ?? "unavailable");
  } catch {
    next.searchParams.set("result", "unavailable");
  }
  return NextResponse.redirect(next, { status: 303, headers: HEADERS });
}
