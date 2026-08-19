import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  buildSteamOpenIdAuthenticationUrl,
  createSteamOpenIdFlow,
  normalizeSteamOpenIdOrigin,
  STEAM_OPENID_FLOW_COOKIE_NAME,
} from "@/lib/steam-openid";
import { loadDictionary } from "@/lib/i18n/loaders";
import {
  LOCALE_COOKIE_NAME,
  resolveLocale,
  type Locale,
} from "@/lib/i18n/config";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export async function POST(request: Request) {
  let sessionId: string | null = null;
  let userId: string | null = null;

  try {
    ({ sessionId, userId } = await auth());
  } catch {
    return steamErrorResponse(request, "authentication", 401);
  }

  if (!userId || !sessionId) {
    return steamErrorResponse(request, "authentication", 401);
  }

  let origin: string;

  try {
    origin = normalizeSteamOpenIdOrigin();
  } catch {
    return steamErrorResponse(request, "unavailable", 503);
  }

  if (request.headers.get("origin") !== origin) {
    return steamErrorResponse(request, "failed", 403);
  }

  let supabase;

  try {
    supabase = createSupabaseAdminClient();
  } catch {
    return redirectToProfile(origin, "failed");
  }

  let player;
  let error;

  try {
    const result = await supabase
      .from("players")
      .select("id, steam_id64")
      .eq("clerk_user_id", userId)
      .maybeSingle();

    player = result.data;
    error = result.error;
  } catch {
    console.error("Steam connection player lookup failed.");
    return redirectToProfile(origin, "failed");
  }

  if (error) {
    console.error("Steam connection player lookup failed.");
    return redirectToProfile(origin, "failed");
  }

  if (!player?.id) {
    return redirectToProfile(origin, "failed");
  }

  const intent =
    typeof player.steam_id64 === "string" && player.steam_id64.length > 0
      ? "refresh"
      : "connect";

  let flow;
  let response;

  try {
    flow = createSteamOpenIdFlow(sessionId, intent);
    response = NextResponse.redirect(
      buildSteamOpenIdAuthenticationUrl(origin, flow.state),
      303
    );
    response.cookies.set(
      STEAM_OPENID_FLOW_COOKIE_NAME,
      flow.cookieValue,
      flow.cookieOptions
    );
  } catch {
    return redirectToProfile(origin, "failed");
  }

  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Referrer-Policy", "no-referrer");

  return response;
}

async function steamErrorResponse(
  request: Request,
  kind: "authentication" | "unavailable" | "failed",
  status: number
) {
  const locale = getRequestLocale(request);
  const dictionary = await loadDictionary(locale, "account-dashboard");
  const message =
    kind === "authentication"
      ? dictionary.steam.authenticationRequired
      : kind === "unavailable"
        ? dictionary.steam.unavailable
        : dictionary.steam.failed;

  return new Response(message, {
    status,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}

function getRequestLocale(request: Request): Locale {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const encodedValue = cookieHeader
    .split(";")
    .map((part) => part.trim().split("="))
    .find(([name]) => name === LOCALE_COOKIE_NAME)?.[1];

  if (!encodedValue) return resolveLocale(undefined);

  try {
    return resolveLocale(decodeURIComponent(encodedValue));
  } catch {
    return resolveLocale(undefined);
  }
}

function redirectToProfile(
  origin: string,
  result: "already-connected" | "failed"
) {
  const url = new URL("/profile", origin);
  url.searchParams.set("steam", result);
  const response = NextResponse.redirect(url, 303);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
