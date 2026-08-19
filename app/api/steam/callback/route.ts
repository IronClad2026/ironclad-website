import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import {
  buildSteamOpenIdCallbackUrl,
  fetchSteamDisplayName,
  getSteamOpenIdCallbackState,
  normalizeSteamOpenIdOrigin,
  STEAM_OPENID_FLOW_COOKIE_NAME,
  type SteamOpenIdFlowIntent,
  validateSteamOpenIdCallback,
  validateSteamOpenIdFlowCookie,
  verifySteamOpenIdAssertion,
} from "@/lib/steam-openid";
import { loadDictionary } from "@/lib/i18n/loaders";
import { LOCALE_COOKIE_NAME, resolveLocale } from "@/lib/i18n/config";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

type ProfileResult =
  | "already-connected"
  | "cancelled"
  | "connected"
  | "display-name-failed"
  | "duplicate"
  | "failed"
  | "refreshed";

export async function GET(request: NextRequest) {
  let sessionId: string | null = null;
  let userId: string | null = null;

  try {
    ({ sessionId, userId } = await auth());
  } catch {
    return terminalResponse(
      await steamErrorResponse(request, "authentication", 401)
    );
  }

  if (!userId || !sessionId) {
    return terminalResponse(
      await steamErrorResponse(request, "authentication", 401)
    );
  }

  let origin: string;

  try {
    origin = normalizeSteamOpenIdOrigin();
  } catch {
    return terminalResponse(
      await steamErrorResponse(request, "unavailable", 503)
    );
  }

  if (
    request.nextUrl.origin !== origin ||
    request.nextUrl.pathname !== "/api/steam/callback"
  ) {
    return terminalResponse(redirectToProfile(origin, "failed"));
  }

  const state = getSteamOpenIdCallbackState(request.nextUrl.searchParams);
  const flowValidation = validateSteamOpenIdFlowCookie({
    cookieValue: request.cookies.get(STEAM_OPENID_FLOW_COOKIE_NAME)?.value,
    returnedState: state,
    sessionId,
  });

  if (!flowValidation.ok || !state) {
    return terminalResponse(redirectToProfile(origin, "failed"));
  }

  const intent = flowValidation.intent;

  let callback;

  try {
    callback = validateSteamOpenIdCallback(
      request.nextUrl.searchParams,
      buildSteamOpenIdCallbackUrl(origin, state)
    );
  } catch {
    return terminalResponse(redirectToProfile(origin, "failed"));
  }

  if (callback.status === "cancelled") {
    return terminalResponse(redirectToProfile(origin, "cancelled"));
  }

  let steamId64: string;

  try {
    steamId64 = await verifySteamOpenIdAssertion(callback.assertion);
  } catch {
    return terminalResponse(redirectToProfile(origin, "failed"));
  }

  let supabase;

  try {
    supabase = createSupabaseAdminClient();
  } catch {
    return terminalResponse(redirectToProfile(origin, "failed"));
  }

  const currentPlayer = await loadCurrentSteamIdentity(supabase, userId);

  if (currentPlayer.status !== "found") {
    return terminalResponse(redirectToProfile(origin, "failed"));
  }

  if (currentPlayer.steamId64 === steamId64) {
    const displayNameSynchronized = await synchronizeSteamDisplayName(
      supabase,
      currentPlayer,
      userId,
      steamId64
    );
    return terminalResponse(
      redirectToProfile(
        origin,
        getSuccessfulProfileResult(intent, displayNameSynchronized)
      )
    );
  }

  if (currentPlayer.steamId64 !== null) {
    return terminalResponse(redirectToProfile(origin, "already-connected"));
  }

  let linkedPlayer;
  let linkError;

  try {
    const result = await supabase
      .from("players")
      .update({ steam_id64: steamId64 })
      .eq("id", currentPlayer.id)
      .eq("clerk_user_id", userId)
      .is("steam_id64", null)
      .select("steam_id64")
      .maybeSingle();

    linkedPlayer = result.data;
    linkError = result.error;
  } catch {
    console.error("Steam connection storage failed.");
    return terminalResponse(redirectToProfile(origin, "failed"));
  }

  if (getDatabaseErrorCode(linkError) === "23505") {
    return terminalResponse(redirectToProfile(origin, "duplicate"));
  }

  if (linkError) {
    console.error("Steam connection storage failed.");
    return terminalResponse(redirectToProfile(origin, "failed"));
  }

  if (linkedPlayer?.steam_id64 === steamId64) {
    const displayNameSynchronized = await synchronizeSteamDisplayName(
      supabase,
      currentPlayer,
      userId,
      steamId64
    );
    return terminalResponse(
      redirectToProfile(
        origin,
        getSuccessfulProfileResult(intent, displayNameSynchronized)
      )
    );
  }

  const racedPlayer = await loadCurrentSteamIdentity(supabase, userId);

  if (racedPlayer.status === "found" && racedPlayer.steamId64 === steamId64) {
    const displayNameSynchronized = await synchronizeSteamDisplayName(
      supabase,
      racedPlayer,
      userId,
      steamId64
    );
    return terminalResponse(
      redirectToProfile(
        origin,
        getSuccessfulProfileResult(intent, displayNameSynchronized)
      )
    );
  }

  if (racedPlayer.status === "found" && racedPlayer.steamId64 !== null) {
    return terminalResponse(redirectToProfile(origin, "already-connected"));
  }

  return terminalResponse(redirectToProfile(origin, "failed"));
}

type SteamIdentityLookup =
  | { status: "error" | "missing" }
  | { status: "found"; id: string; steamId64: string | null };

type SteamIdentityClient = ReturnType<typeof createSupabaseAdminClient>;

async function loadCurrentSteamIdentity(
  supabase: SteamIdentityClient,
  userId: string
): Promise<SteamIdentityLookup> {
  let data;
  let error;

  try {
    const result = await supabase
      .from("players")
      .select("id, steam_id64")
      .eq("clerk_user_id", userId)
      .maybeSingle();

    data = result.data;
    error = result.error;
  } catch {
    console.error("Steam connection player lookup failed.");
    return { status: "error" };
  }

  if (error) {
    console.error("Steam connection player lookup failed.");
    return { status: "error" };
  }

  if (typeof data?.id !== "string" || data.id.length === 0) {
    return { status: "missing" };
  }

  return {
    status: "found",
    id: data.id,
    steamId64:
      typeof data.steam_id64 === "string" && data.steam_id64.length > 0
        ? data.steam_id64
        : null,
  };
}

async function synchronizeSteamDisplayName(
  supabase: SteamIdentityClient,
  player: Extract<SteamIdentityLookup, { status: "found" }>,
  userId: string,
  steamId64: string
): Promise<boolean> {
  const steamDisplayName = await fetchSteamDisplayName(steamId64);

  if (!steamDisplayName) {
    console.error("Steam display name lookup failed.");
    return false;
  }

  try {
    const { data, error } = await supabase
      .from("players")
      .update({ steam_username: steamDisplayName })
      .eq("id", player.id)
      .eq("clerk_user_id", userId)
      .eq("steam_id64", steamId64)
      .select("steam_id64, steam_username, profile_completed")
      .maybeSingle();

    if (
      error ||
      data?.steam_id64 !== steamId64 ||
      data?.steam_username !== steamDisplayName
    ) {
      console.error("Steam display name storage failed.");
      return false;
    }

    return true;
  } catch {
    console.error("Steam display name storage failed.");
    return false;
  }
}

function getSuccessfulProfileResult(
  intent: SteamOpenIdFlowIntent,
  displayNameSynchronized: boolean
): ProfileResult {
  if (!displayNameSynchronized) {
    return "display-name-failed";
  }

  return intent === "refresh" ? "refreshed" : "connected";
}

function getDatabaseErrorCode(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }

  return null;
}

async function steamErrorResponse(
  request: NextRequest,
  kind: "authentication" | "unavailable",
  status: number
) {
  const locale = resolveLocale(request.cookies.get(LOCALE_COOKIE_NAME)?.value);
  const dictionary = await loadDictionary(locale, "account-dashboard");
  const message =
    kind === "authentication"
      ? dictionary.steam.authenticationRequired
      : dictionary.steam.unavailable;

  return new Response(message, {
    status,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}

function redirectToProfile(origin: string, result: ProfileResult) {
  const url = new URL("/profile", origin);
  url.searchParams.set("steam", result);
  return NextResponse.redirect(url, 303);
}

function terminalResponse<T extends Response>(response: T) {
  const nextResponse =
    response instanceof NextResponse
      ? response
      : new NextResponse(response.body, {
          headers: response.headers,
          status: response.status,
          statusText: response.statusText,
        });

  nextResponse.cookies.set(STEAM_OPENID_FLOW_COOKIE_NAME, "", {
    httpOnly: true,
    maxAge: 0,
    path: "/",
    sameSite: "lax",
    secure: true,
  });
  nextResponse.headers.set(
    "Cache-Control",
    "private, no-store, max-age=0"
  );
  nextResponse.headers.set("Referrer-Policy", "no-referrer");

  return nextResponse;
}
