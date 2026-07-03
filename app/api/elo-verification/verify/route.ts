import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { parseCoh3StatsProfileUrl } from "@/lib/coh3-stats-profile";
import { checkCoh3ProfileOwnership } from "@/lib/coh3-profile-ownership";
import { verifyRegistrationEloIdentity } from "@/lib/elo-verification/registration";
import {
  getEloVerificationSetting,
  getEloVerificationSupportLinkSetting,
} from "@/lib/platform-settings";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

type VerifyRequestBody = {
  ign?: unknown;
  enteredElo?: unknown;
  coh3statsProfileUrl?: unknown;
  tournamentId?: unknown;
  mode?: unknown;
};

export async function POST(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json(
      {
        ok: false,
        reason: "external_error",
        message: "Sign in before registering for a tournament.",
      },
      { status: 401 }
    );
  }

  const setting = await getEloVerificationSetting();

  if (!setting.enabled) {
    return NextResponse.json({
      ok: true,
      message: "ELO verification is disabled.",
    });
  }

  let body: VerifyRequestBody;

  try {
    body = (await request.json()) as VerifyRequestBody;
  } catch {
    return NextResponse.json({
      ok: false,
      reason: "external_error",
      message:
        "Could not verify the coh3stats profile right now. Please try again later.",
    });
  }

  const coh3statsProfileUrl =
    typeof body.coh3statsProfileUrl === "string"
      ? body.coh3statsProfileUrl
      : "";
  const parsedProfile = parseCoh3StatsProfileUrl(coh3statsProfileUrl);

  if (!parsedProfile) {
    return NextResponse.json({
      ok: false,
      reason: "invalid_url",
      message: "Please enter a valid coh3stats profile URL.",
    });
  }

  const adminSupabase = createSupabaseAdminClient();
  const { data: player, error: playerError } = await adminSupabase
    .from("players")
    .select("id, coh3_profile_id")
    .eq("clerk_user_id", userId)
    .maybeSingle();

  if (playerError || !player?.id) {
    console.error("ELO verification profile ownership lookup failed:", playerError);
    return NextResponse.json({
      ok: false,
      reason: "external_error",
      message:
        "Could not verify the coh3stats profile right now. Please try again later.",
    });
  }

  const ownershipCheck = await checkCoh3ProfileOwnership({
    supabase: adminSupabase,
    profileId: parsedProfile.profileId,
    playerId: player.id,
    linkedProfileId:
      typeof player.coh3_profile_id === "string"
        ? player.coh3_profile_id
        : null,
  });

  if (!ownershipCheck.ok) {
    return NextResponse.json({
      ok: false,
      reason: ownershipCheck.reason,
      message: ownershipCheck.message,
    });
  }

  const mode =
    typeof body.mode === "string" && body.mode.trim()
      ? body.mode
      : await loadTournamentMode(body.tournamentId);

  const supportLinkSetting = await getEloVerificationSupportLinkSetting();
  const result = await verifyRegistrationEloIdentity({
    ign: typeof body.ign === "string" ? body.ign : "",
    enteredElo:
      typeof body.enteredElo === "number" ||
      typeof body.enteredElo === "string"
        ? body.enteredElo
        : null,
    coh3statsProfileUrl: parsedProfile.normalizedUrl,
    mode,
    supportUrl: supportLinkSetting.url,
  });

  return NextResponse.json(result);
}

async function loadTournamentMode(tournamentId: unknown) {
  if (typeof tournamentId !== "string" || !tournamentId.trim()) {
    return null;
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("tournaments")
    .select("format")
    .eq("id", tournamentId)
    .maybeSingle();

  if (error) {
    console.error("ELO verification tournament mode lookup failed:", error);
    return null;
  }

  return typeof data?.format === "string" ? data.format : null;
}
