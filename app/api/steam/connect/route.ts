import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  buildSteamOpenIdAuthenticationUrl,
  createSteamOpenIdFlow,
  normalizeSteamOpenIdOrigin,
  STEAM_OPENID_FLOW_COOKIE_NAME,
} from "@/lib/steam-openid";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export async function POST(request: Request) {
  let sessionId: string | null = null;
  let userId: string | null = null;

  try {
    ({ sessionId, userId } = await auth());
  } catch {
    return new Response("Authentication required.", { status: 401 });
  }

  if (!userId || !sessionId) {
    return new Response("Authentication required.", { status: 401 });
  }

  let origin: string;

  try {
    origin = normalizeSteamOpenIdOrigin();
  } catch {
    return new Response("Steam connection is unavailable.", { status: 503 });
  }

  if (request.headers.get("origin") !== origin) {
    return new Response("Invalid request origin.", { status: 403 });
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

  if (typeof player.steam_id64 === "string" && player.steam_id64.length > 0) {
    return redirectToProfile(origin, "already-connected");
  }

  let flow;
  let response;

  try {
    flow = createSteamOpenIdFlow(sessionId);
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
