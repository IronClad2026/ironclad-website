import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import {
  resolveNotificationDestination,
  type NotificationScope,
} from "@/lib/notifications";

type CustomClaims = {
  metadata?: {
    role?: string;
  };
};

const PRIVATE_NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
} as const;

export async function GET(request: Request) {
  let userId: string | null;
  let claims: CustomClaims | null;

  try {
    const identity = await auth();
    userId = identity.userId;
    claims = identity.sessionClaims as CustomClaims | null;
  } catch {
    return safeRedirect(request, "/sign-in");
  }

  if (!userId) {
    return safeRedirect(request, "/sign-in");
  }

  const isAdmin = claims?.metadata?.role === "admin";
  const fallback = isAdmin ? "/admin" : "/dashboard";
  const url = new URL(request.url);
  const notificationId = url.searchParams.get("notificationId") ?? "";
  const scope = deriveAuthorizedScope(url.searchParams.get("scope"), isAdmin);

  if (!isUuid(notificationId) || !scope) {
    return safeRedirect(request, fallback);
  }

  let destination: string | null;

  try {
    destination = await resolveNotificationDestination(
      notificationId,
      scope,
      scope === "player" ? userId : null
    );
  } catch {
    destination = null;
  }

  return safeRedirect(
    request,
    isSafeRelativeDestination(destination) ? destination : fallback
  );
}

function deriveAuthorizedScope(
  value: string | null,
  isAdmin: boolean
): NotificationScope | null {
  if (value === "player") return "player";
  if (value === "admin" && isAdmin) return "admin";
  return null;
}

function isSafeRelativeDestination(value: string | null): value is string {
  return Boolean(
    value?.startsWith("/") &&
      !value.startsWith("//") &&
      !value.includes("\\") &&
      !/[\u0000-\u001f\u007f]/.test(value)
  );
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function safeRedirect(request: Request, destination: string) {
  const response = NextResponse.redirect(new URL(destination, request.url), 303);

  for (const [name, value] of Object.entries(PRIVATE_NO_STORE_HEADERS)) {
    response.headers.set(name, value);
  }

  return response;
}
