"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { requireCurrentAccountLegalAcceptance } from "@/lib/account-legal-mutation-guard";
import { evaluateProfileBadgesAfterCommit } from "@/lib/badges/integration";
import type { IronCladDivision } from "@/lib/elo-verification/divisions";
import {
  getRelic1v1Elo,
  type Relic1v1Faction,
  type RelicEloResult,
} from "@/lib/elo-verification/relic";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const PROFILE_PATH = "/profile";
const REFRESH_COOLDOWN_MS = 15 * 60 * 1_000;
const PLAYER_SELECT = [
  "id",
  "clerk_user_id",
  "steam_id64",
].join(", ");

export type RelicEloSnapshot = {
  elo: number;
  faction: Relic1v1Faction;
  division: IronCladDivision;
  calculationVersion: string;
  verifiedAt: string;
};

export type RelicEloResultCode =
  | "verified"
  | "cooldown"
  | "steam-required"
  | "session-invalid"
  | "auth-required"
  | "service-unavailable"
  | "profile-load-failed"
  | "profile-required"
  | "steam-identity-invalid"
  | "profile-not-found"
  | "steam-identity-mismatch"
  | "no-rated-data"
  | "provider-unavailable"
  | "save-failed"
  | "confirmation-failed";

export type RelicEloActionResult =
  | {
      status: "success";
      code: "verified";
      message: string;
      snapshot: RelicEloSnapshot;
      refreshAvailableAt: string;
    }
  | {
      status: "cooldown";
      code: "cooldown";
      message: string;
      refreshAvailableAt: string;
    }
  | {
      status: "requires_steam";
      code: "steam-required";
      message: string;
    }
  | {
      status: "unavailable";
      code: "provider-unavailable";
      message: string;
      refreshAvailableAt: string;
    }
  | {
      status: "error";
      code: Exclude<
        RelicEloResultCode,
        "verified" | "cooldown" | "steam-required" | "provider-unavailable"
      >;
      message: string;
      refreshAvailableAt?: string;
    };

type PlayerRow = {
  id: string;
  clerk_user_id: string;
  steam_id64: string | null;
};

type ClaimResult =
  | { status: "claimed"; claimedAt: string }
  | { status: "not_claimed" }
  | { status: "invalid" };

export async function verifyRelicProfileElo(): Promise<RelicEloActionResult> {
  let userId: string | null;

  try {
    ({ userId } = await auth());
  } catch {
    console.error("Relic ELO authentication failed.");
    return errorResult("Your session could not be verified. Sign in again.", "session-invalid");
  }

  if (!userId) {
    return errorResult("Sign in before verifying your ELO.", "auth-required");
  }

  await requireCurrentAccountLegalAcceptance();

  let supabase: ReturnType<typeof createSupabaseAdminClient>;

  try {
    supabase = createSupabaseAdminClient();
  } catch {
    console.error("Relic ELO service configuration failed.");
    return errorResult("ELO verification could not be started right now.", "service-unavailable");
  }

  let playerLookup: { data: unknown; error: unknown };

  try {
    playerLookup = await supabase
      .from("players")
      .select(PLAYER_SELECT)
      .eq("clerk_user_id", userId)
      .maybeSingle();
  } catch {
    console.error("Relic ELO player lookup failed unexpectedly.");
    return errorResult("Your player profile could not be loaded.", "profile-load-failed");
  }

  const { data: rawPlayer, error: playerError } = playerLookup;

  if (playerError) {
    console.error("Relic ELO player lookup failed.");
    return errorResult("Your player profile could not be loaded.", "profile-load-failed");
  }

  const player = parsePlayerRow(rawPlayer, userId);

  if (!player) {
    return errorResult(
      "Complete your player profile before verifying your ELO.",
      "profile-required"
    );
  }

  if (!player.steam_id64) {
    return {
      status: "requires_steam",
      code: "steam-required",
      message: "Connect your Steam account before verifying your ELO.",
    };
  }

  const steamId64 = player.steam_id64;
  let claimResult: { data: unknown; error: unknown };

  try {
    claimResult = await supabase.rpc(
      "claim_relic_elo_verification_attempt",
      {
        p_player_id: player.id,
        p_clerk_user_id: userId,
        p_steam_id64: steamId64,
      }
    );
  } catch {
    console.error("Relic ELO cooldown claim failed unexpectedly.");
    return errorResult("ELO verification could not be started right now.", "service-unavailable");
  }

  const { data: rawClaim, error: claimError } = claimResult;

  if (claimError) {
    console.error("Relic ELO cooldown claim failed.");
    return errorResult("ELO verification could not be started right now.", "service-unavailable");
  }

  const claim = parseClaimResult(rawClaim);

  if (claim.status === "invalid") {
    console.error("Relic ELO cooldown claim returned an invalid result.");
    return errorResult("ELO verification could not be started right now.", "service-unavailable");
  }

  if (claim.status === "not_claimed") {
    return getCooldownResult(supabase, player.id, userId, steamId64);
  }

  const refreshAvailableAt = addCooldown(claim.claimedAt);

  if (!refreshAvailableAt) {
    console.error("Relic ELO cooldown timestamp was invalid.");
    return errorResult("ELO verification could not be started right now.", "service-unavailable");
  }

  let relicResult: RelicEloResult;

  try {
    relicResult = await getRelic1v1Elo(steamId64);
  } catch {
    console.error("Relic ELO request failed unexpectedly.");
    return unavailableResult(
      "Relic is temporarily unavailable. Your previous ELO result remains unchanged.",
      refreshAvailableAt
    );
  }

  if (relicResult.status !== "rated") {
    return mapRelicFailure(relicResult, refreshAvailableAt);
  }

  let snapshotUpdate: { data: unknown; error: unknown };

  try {
    snapshotUpdate = await supabase.rpc(
      "save_relic_profile_elo_snapshot",
      {
        p_player_id: player.id,
        p_clerk_user_id: userId,
        p_steam_id64: steamId64,
        p_claimed_at: claim.claimedAt,
        p_relic_elo: relicResult.elo,
        p_relic_faction: relicResult.faction,
        p_relic_division: relicResult.division,
        p_relic_calculation_version: relicResult.calculationVersion,
      }
    );
  } catch {
    console.error("Relic ELO result save failed unexpectedly.");
    return errorResult(
      "Your verified ELO could not be saved. Any previous result remains unchanged.",
      "save-failed",
      refreshAvailableAt
    );
  }

  const { data: rawSnapshot, error: updateError } = snapshotUpdate;

  if (updateError) {
    console.error("Relic ELO result save failed.");
    return errorResult(
      "Your verified ELO could not be saved. Any previous result remains unchanged.",
      "save-failed",
      refreshAvailableAt
    );
  }

  const snapshot = parseSnapshotResult(rawSnapshot);

  if (
    !snapshot ||
    snapshot.elo !== relicResult.elo ||
    snapshot.faction !== relicResult.faction ||
    snapshot.division !== relicResult.division ||
    snapshot.calculationVersion !== relicResult.calculationVersion.trim()
  ) {
    console.error("Relic ELO result save returned an invalid result.");
    return errorResult(
      "Your verified ELO could not be confirmed. Refresh the page before trying again.",
      "confirmation-failed",
      refreshAvailableAt
    );
  }

  try {
    await evaluateProfileBadgesAfterCommit({
      playerId: player.id,
      reason: "relic_snapshot",
      supabase,
    });
  } catch {
    // The verified provider snapshot is already committed and authoritative.
    console.error("Relic ELO Badge follow-up failed unexpectedly.");
  }

  try {
    revalidatePath(PROFILE_PATH);
  } catch {
    console.error("Relic ELO profile revalidation failed.");
  }

  return {
    status: "success",
    code: "verified",
    message: "Your Relic ELO has been verified.",
    snapshot,
    refreshAvailableAt,
  };
}

async function getCooldownResult(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  playerId: string,
  clerkUserId: string,
  steamId64: string
): Promise<RelicEloActionResult> {
  let cooldownLookup: { data: unknown; error: unknown };

  try {
    cooldownLookup = await supabase
      .from("players")
      .select("relic_elo_last_attempt_at")
      .eq("id", playerId)
      .eq("clerk_user_id", clerkUserId)
      .eq("steam_id64", steamId64)
      .maybeSingle();
  } catch {
    console.error("Relic ELO cooldown reload failed unexpectedly.");
    return errorResult("ELO verification could not be started right now.", "service-unavailable");
  }

  const { data, error } = cooldownLookup;

  if (error || !isRecord(data)) {
    if (error) {
      console.error("Relic ELO cooldown reload failed.");
    }

    return errorResult("ELO verification could not be started right now.", "service-unavailable");
  }

  const lastAttemptAt = parseTimestamp(data.relic_elo_last_attempt_at);
  const refreshAvailableAt = lastAttemptAt
    ? addCooldown(lastAttemptAt)
    : null;

  if (!refreshAvailableAt) {
    console.error("Relic ELO cooldown reload returned an invalid result.");
    return errorResult("ELO verification could not be started right now.", "service-unavailable");
  }

  return {
    status: "cooldown",
    code: "cooldown",
    message: "ELO verification is temporarily on cooldown.",
    refreshAvailableAt,
  };
}

function mapRelicFailure(
  result: Exclude<RelicEloResult, { status: "rated" }>,
  refreshAvailableAt: string
): RelicEloActionResult {
  switch (result.status) {
    case "invalid_steam_input":
      return errorResult(
        "Your connected Steam identity could not be verified. Any previous ELO result remains unchanged.",
        "steam-identity-invalid",
        refreshAvailableAt
      );
    case "profile_not_found":
      return errorResult(
        "No Company of Heroes 3 profile was found for your connected Steam account. Any previous ELO result remains unchanged.",
        "profile-not-found",
        refreshAvailableAt
      );
    case "steam_identity_mismatch":
      return errorResult(
        "Relic could not confirm your connected game identity. Any previous ELO result remains unchanged.",
        "steam-identity-mismatch",
        refreshAvailableAt
      );
    case "unranked":
      return errorResult(
        "No rated 1v1 ELO is currently available. Any previous ELO result remains unchanged.",
        "no-rated-data",
        refreshAvailableAt
      );
    case "invalid_relic_response":
    case "relic_integration_error":
      return unavailableResult(
        "ELO verification could not be completed right now. Your previous ELO result remains unchanged.",
        refreshAvailableAt
      );
    case "external_relic_unavailable":
      return unavailableResult(
        "Relic is temporarily unavailable. Your previous ELO result remains unchanged.",
        refreshAvailableAt
      );
  }
}

function errorResult(
  message: string,
  code: Exclude<
    RelicEloResultCode,
    "verified" | "cooldown" | "steam-required" | "provider-unavailable"
  >,
  refreshAvailableAt?: string
): RelicEloActionResult {
  return refreshAvailableAt
    ? { status: "error", code, message, refreshAvailableAt }
    : { status: "error", code, message };
}

function unavailableResult(
  message: string,
  refreshAvailableAt: string
): RelicEloActionResult {
  return {
    status: "unavailable",
    code: "provider-unavailable",
    message,
    refreshAvailableAt,
  };
}

function parsePlayerRow(value: unknown, userId: string): PlayerRow | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    value.id.length === 0 ||
    value.clerk_user_id !== userId ||
    !(
      value.steam_id64 === null ||
      (typeof value.steam_id64 === "string" && value.steam_id64.length > 0)
    )
  ) {
    return null;
  }

  return value as PlayerRow;
}

function parseClaimResult(value: unknown): ClaimResult {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return { status: "not_claimed" };
    }

    if (value.length !== 1) {
      return { status: "invalid" };
    }

    return parseClaimRow(value[0]);
  }

  if (value === null) {
    return { status: "not_claimed" };
  }

  return parseClaimRow(value);
}

function parseClaimRow(value: unknown): ClaimResult {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 1 ||
    !("claimed_at" in value)
  ) {
    return { status: "invalid" };
  }

  const claimedAt = parseTimestamp(value.claimed_at);

  return claimedAt
    ? { status: "claimed", claimedAt }
    : { status: "invalid" };
}

function parseSnapshot(value: unknown): RelicEloSnapshot | null {
  if (!isRecord(value)) {
    return null;
  }

  const currentElo = parseSafeInteger(value.current_elo);
  const elo = parseSafeInteger(value.relic_verified_elo);
  const verifiedAt = parseTimestamp(value.relic_elo_verified_at);

  if (
    currentElo === null ||
    elo === null ||
    currentElo !== elo ||
    !isRelicFaction(value.relic_verified_faction) ||
    !isIronCladDivision(value.relic_verified_division) ||
    typeof value.relic_elo_calculation_version !== "string" ||
    value.relic_elo_calculation_version.trim().length === 0 ||
    !verifiedAt
  ) {
    return null;
  }

  return {
    elo,
    faction: value.relic_verified_faction,
    division: value.relic_verified_division,
    calculationVersion: value.relic_elo_calculation_version,
    verifiedAt,
  };
}

function parseSnapshotResult(value: unknown): RelicEloSnapshot | null {
  if (Array.isArray(value)) {
    return value.length === 1 ? parseSnapshot(value[0]) : null;
  }

  return parseSnapshot(value);
}

function parseTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }

  const milliseconds = Date.parse(value);

  return Number.isFinite(milliseconds) ? value : null;
}

function addCooldown(timestamp: string): string | null {
  const milliseconds = Date.parse(timestamp);

  return Number.isFinite(milliseconds)
    ? new Date(milliseconds + REFRESH_COOLDOWN_MS).toISOString()
    : null;
}

function isRelicFaction(value: unknown): value is Relic1v1Faction {
  return (
    value === "US Forces" ||
    value === "British Forces" ||
    value === "Deutsches Afrikakorps" ||
    value === "Wehrmacht"
  );
}

function isIronCladDivision(value: unknown): value is IronCladDivision {
  return (
    value === "Academy" ||
    value === "Challenge" ||
    value === "Main / Pro"
  );
}

function parseSafeInteger(value: unknown): number | null {
  const numericValue =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^\d+$/.test(value)
        ? Number(value)
        : Number.NaN;

  return Number.isSafeInteger(numericValue) && numericValue >= 0
    ? numericValue
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
