import "server-only";

import { parseCoh3StatsProfileUrl } from "@/lib/coh3-stats-profile";
import {
  compareEnteredEloWithCoh3StatsElo,
  comparePlayerNameForEloIdentityCheck,
  verifyCoh3StatsElo,
  type Coh3Faction,
  type Coh3Mode,
} from "@/lib/elo-verification/coh3stats";
import { DEFAULT_ELO_VERIFICATION_SUPPORT_URL } from "@/lib/platform-settings";

export type RegistrationEloVerificationReason =
  | "invalid_url"
  | "ign_mismatch"
  | "elo_mismatch"
  | "external_error";

export type RegistrationEloVerificationResult =
  | {
      ok: true;
      message: string;
      profileId: string;
      mode: Coh3Mode;
      coh3statsName: string;
      coh3statsElo: number;
      highestFaction: Coh3Faction;
      factionElos: Record<Coh3Faction, number | null>;
      difference: number;
      tolerance: number;
      checkedAt: string;
      normalizedProfileUrl: string;
    }
  | {
      ok: false;
      reason: RegistrationEloVerificationReason;
      message: string;
      profileId?: string;
      coh3statsName?: string;
      coh3statsElo?: number;
      supportUrl?: string;
    };

export async function verifyRegistrationEloIdentity({
  ign,
  enteredElo,
  coh3statsProfileUrl,
  mode,
  supportUrl = DEFAULT_ELO_VERIFICATION_SUPPORT_URL,
}: {
  ign: string | null | undefined;
  enteredElo: number | string | null | undefined;
  coh3statsProfileUrl: string | null | undefined;
  mode: string | null | undefined;
  supportUrl?: string | null | undefined;
}): Promise<RegistrationEloVerificationResult> {
  const parsedProfile = parseCoh3StatsProfileUrl(coh3statsProfileUrl);

  if (!parsedProfile) {
    return {
      ok: false,
      reason: "invalid_url",
      message: "Please enter a valid coh3stats profile URL.",
    };
  }

  const numericEnteredElo = Number(enteredElo);

  if (!Number.isFinite(numericEnteredElo)) {
    return {
      ok: false,
      reason: "elo_mismatch",
      message: "The ELO entered does not match the ELO found on coh3stats.",
      profileId: parsedProfile.profileId,
    };
  }

  const verification = await verifyCoh3StatsElo({
    profileUrlOrId: parsedProfile.normalizedUrl,
    mode: mode ?? "",
  });

  if (!verification.ok) {
    return {
      ok: false,
      reason: "external_error",
      message:
        "Could not verify the coh3stats profile right now. Please try again later.",
      profileId: verification.profileId ?? parsedProfile.profileId,
    };
  }

  const identityComparison = comparePlayerNameForEloIdentityCheck({
    websiteName: ign,
    coh3StatsName: verification.verifiedPlayerName,
  });

  if (identityComparison.status !== "matched") {
    return {
      ok: false,
      reason:
        identityComparison.status === "mismatch"
          ? "ign_mismatch"
          : "external_error",
      message:
        identityComparison.status === "mismatch"
          ? "The IGN does not match the coh3stats profile."
          : "Could not verify the coh3stats profile right now. Please try again later.",
      profileId: verification.profileId,
      coh3statsName: verification.verifiedPlayerName,
      coh3statsElo: verification.verifiedElo,
    };
  }

  const eloComparison = compareEnteredEloWithCoh3StatsElo({
    enteredElo: numericEnteredElo,
    verifiedElo: verification.verifiedElo,
  });

  if (!eloComparison.matches) {
    const effectiveSupportUrl =
      supportUrl?.trim() || DEFAULT_ELO_VERIFICATION_SUPPORT_URL;

    return {
      ok: false,
      reason: "elo_mismatch",
      message: buildEloMismatchSupportMessage(effectiveSupportUrl),
      profileId: verification.profileId,
      coh3statsName: verification.verifiedPlayerName,
      coh3statsElo: verification.verifiedElo,
      supportUrl: effectiveSupportUrl,
    };
  }

  return {
    ok: true,
    message: "ELO verification passed.",
    profileId: verification.profileId,
    mode: verification.mode,
    coh3statsName: verification.verifiedPlayerName,
    coh3statsElo: verification.verifiedElo,
    highestFaction: verification.highestFaction,
    factionElos: verification.factionElos,
    difference: eloComparison.difference,
    tolerance: eloComparison.tolerance,
    checkedAt: verification.checkedAt,
    normalizedProfileUrl: parsedProfile.normalizedUrl,
  };
}

function buildEloMismatchSupportMessage(
  supportUrl: string | null | undefined
) {
  const discordUrl = supportUrl ?? DEFAULT_ELO_VERIFICATION_SUPPORT_URL;

  return `Your registration could not be completed because the ELO information provided does not match our verification requirements.\n\nIf you believe this is a mistake or need more information, please contact an admin on Discord by opening a ticket in the 1v1 ticket channel.\n\nDiscord server: ${discordUrl}`;
}
