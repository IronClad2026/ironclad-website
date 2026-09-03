import "server-only";

import { getRelic1v1Elo, type RelicEloResult } from "@/lib/elo-verification/relic";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { supabaseUrl } from "@/lib/supabase-config";

export const STAGING_SUPABASE_PROJECT_REF = "zzbnneprhjicmajpjkdg";
export const STAGING_SYNTHETIC_ACADEMY_ELO = 1_000;
export const STAGING_SYNTHETIC_ACADEMY_FACTION = "US Forces" as const;
export const STAGING_SYNTHETIC_ACADEMY_DIVISION = "Academy" as const;
export const STAGING_SYNTHETIC_ACADEMY_CALCULATION_VERSION =
  "staging-synthetic-academy-v1" as const;

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;

type SyntheticAcademyRatedResult = {
  status: "rated";
  elo: typeof STAGING_SYNTHETIC_ACADEMY_ELO;
  faction: typeof STAGING_SYNTHETIC_ACADEMY_FACTION;
  division: typeof STAGING_SYNTHETIC_ACADEMY_DIVISION;
  calculationVersion: typeof STAGING_SYNTHETIC_ACADEMY_CALCULATION_VERSION;
};

export type RegistrationRelicEloResult =
  | RelicEloResult
  | SyntheticAcademyRatedResult;

type RegistrationIdentity = {
  playerId: string;
  clerkUserId: string;
  steamId64: string;
};

export async function getRegistrationRelic1v1Elo({
  supabase,
  identity,
}: {
  supabase: SupabaseAdminClient;
  identity: RegistrationIdentity;
}): Promise<RegistrationRelicEloResult> {
  return getRegistrationRelic1v1EloForProject({
    supabase,
    identity,
    projectUrl: supabaseUrl,
  });
}

export async function getRegistrationRelic1v1EloForProject({
  supabase,
  identity,
  projectUrl,
}: {
  supabase: SupabaseAdminClient;
  identity: RegistrationIdentity;
  projectUrl: string;
}): Promise<RegistrationRelicEloResult> {
  if (!isConfirmedStagingSupabaseProjectUrl(projectUrl)) {
    return getRelic1v1Elo(identity.steamId64);
  }

  let lookup: { data: unknown; error: unknown };

  try {
    lookup = await supabase.rpc("resolve_staging_synthetic_academy_elo", {
      p_profile_id: identity.playerId,
      p_clerk_user_id: identity.clerkUserId,
      p_steam_id64: identity.steamId64,
    });
  } catch {
    console.error("Synthetic Academy rating lookup failed unexpectedly.");
    return getRelic1v1Elo(identity.steamId64);
  }

  if (lookup.error) {
    console.error("Synthetic Academy rating lookup failed.");
    return getRelic1v1Elo(identity.steamId64);
  }

  const syntheticResult = parseSyntheticAcademyResult(lookup.data);

  return syntheticResult ?? getRelic1v1Elo(identity.steamId64);
}

export function isConfirmedStagingSupabaseProjectUrl(value: string) {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    return false;
  }

  return (
    url.protocol === "https:" &&
    url.username === "" &&
    url.password === "" &&
    url.port === "" &&
    url.hostname === `${STAGING_SUPABASE_PROJECT_REF}.supabase.co` &&
    url.pathname === "/" &&
    url.search === "" &&
    url.hash === ""
  );
}

function parseSyntheticAcademyResult(
  value: unknown
): SyntheticAcademyRatedResult | null {
  if (!Array.isArray(value) || value.length !== 1) {
    return null;
  }

  const row = value[0];

  if (
    !isRecord(row) ||
    row.elo !== STAGING_SYNTHETIC_ACADEMY_ELO ||
    row.faction !== STAGING_SYNTHETIC_ACADEMY_FACTION ||
    row.division !== STAGING_SYNTHETIC_ACADEMY_DIVISION ||
    row.calculation_version !==
      STAGING_SYNTHETIC_ACADEMY_CALCULATION_VERSION
  ) {
    return null;
  }

  return {
    status: "rated",
    elo: STAGING_SYNTHETIC_ACADEMY_ELO,
    faction: STAGING_SYNTHETIC_ACADEMY_FACTION,
    division: STAGING_SYNTHETIC_ACADEMY_DIVISION,
    calculationVersion: STAGING_SYNTHETIC_ACADEMY_CALCULATION_VERSION,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
