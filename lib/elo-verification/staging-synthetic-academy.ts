import "server-only";

import {
  getRelic1v1Elo,
  type Relic1v1Faction,
  type RelicEloResult,
} from "@/lib/elo-verification/relic";
import type { IronCladDivision } from "@/lib/elo-verification/divisions";
import {
  CURRENT_DIVISION_MODEL,
  getDivisionForElo,
  type DivisionModelVersion,
} from "@/lib/division-model";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { supabaseUrl } from "@/lib/supabase-config";

export const STAGING_SUPABASE_PROJECT_REF = "zzbnneprhjicmajpjkdg";
export const STAGING_SYNTHETIC_ACADEMY_ELO = 1_000;
export const STAGING_SYNTHETIC_ACADEMY_FACTION = "US Forces" as const;
export const STAGING_SYNTHETIC_ACADEMY_DIVISION = "Academy" as const;
export const STAGING_SYNTHETIC_ACADEMY_CALCULATION_VERSION =
  "staging-synthetic-academy-v1" as const;
export const STAGING_SYNTHETIC_FUTURE_CALCULATION_VERSION =
  "staging-synthetic-v2" as const;

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;

type SyntheticAcademyRatedResult = {
  status: "rated";
  elo: number;
  faction: typeof STAGING_SYNTHETIC_ACADEMY_FACTION;
  division: IronCladDivision;
  calculationVersion: typeof STAGING_SYNTHETIC_ACADEMY_CALCULATION_VERSION
    | typeof STAGING_SYNTHETIC_FUTURE_CALCULATION_VERSION
    | "staging-synthetic-v1";
};

export type RegistrationRelicEloResult =
  | RelicEloResult
  | SyntheticAcademyRatedResult;

export type RegistrationIdentity = {
  playerId: string;
  clerkUserId: string;
  steamId64: string;
};

export type PersistedRegistrationViewerRelic = {
  elo: unknown;
  faction: unknown;
  division: unknown;
  calculationVersion: unknown;
};

export type EffectiveRegistrationViewerRelic = {
  status: "rated";
  elo: number | null;
  faction: Relic1v1Faction | null;
  division: IronCladDivision;
  calculationVersion: string | null;
  source: "persisted" | "staging_synthetic";
};

export async function getRegistrationRelic1v1Elo({
  supabase,
  identity,
  divisionModelVersion = CURRENT_DIVISION_MODEL,
}: {
  supabase: SupabaseAdminClient;
  identity: RegistrationIdentity;
  divisionModelVersion?: DivisionModelVersion;
}): Promise<RegistrationRelicEloResult> {
  return getRegistrationRelic1v1EloForProject({
    supabase,
    identity,
    divisionModelVersion,
    projectUrl: supabaseUrl,
  });
}

export async function getRegistrationRelic1v1EloForProject({
  supabase,
  identity,
  projectUrl,
  divisionModelVersion = CURRENT_DIVISION_MODEL,
}: {
  supabase: SupabaseAdminClient;
  identity: RegistrationIdentity;
  projectUrl: string;
  divisionModelVersion?: DivisionModelVersion;
}): Promise<RegistrationRelicEloResult> {
  const syntheticResult = await resolveStagingSyntheticAcademyRelic({
    supabase,
    identity,
    projectUrl,
    divisionModelVersion,
  });

  if (syntheticResult) {
    return syntheticResult;
  }

  // A reserved fixture identity must never fall through to live provider lookup.
  if (isReservedSyntheticSteamIdentity(identity.steamId64)) {
    return { status: "invalid_relic_response" };
  }
  return getRelic1v1Elo(identity.steamId64);
}

export async function getEffectiveRegistrationViewerRelic({
  supabase,
  identity,
  persisted,
  divisionModelVersion = CURRENT_DIVISION_MODEL,
}: {
  supabase: SupabaseAdminClient;
  identity: RegistrationIdentity;
  persisted: PersistedRegistrationViewerRelic;
  divisionModelVersion?: DivisionModelVersion;
}): Promise<EffectiveRegistrationViewerRelic | null> {
  return getEffectiveRegistrationViewerRelicForProject({
    supabase,
    identity,
    persisted,
    divisionModelVersion,
    projectUrl: supabaseUrl,
  });
}

export async function getEffectiveRegistrationViewerRelicForProject({
  supabase,
  identity,
  persisted,
  projectUrl,
  divisionModelVersion = CURRENT_DIVISION_MODEL,
}: {
  supabase: SupabaseAdminClient;
  identity: RegistrationIdentity;
  persisted: PersistedRegistrationViewerRelic;
  projectUrl: string;
  divisionModelVersion?: DivisionModelVersion;
}): Promise<EffectiveRegistrationViewerRelic | null> {
  const syntheticResult = await resolveStagingSyntheticAcademyRelic({
    supabase,
    identity,
    projectUrl,
    divisionModelVersion,
  });

  if (syntheticResult) {
    return {
      ...syntheticResult,
      source: "staging_synthetic",
    };
  }

  if (isReservedSyntheticSteamIdentity(identity.steamId64) ||
    (typeof persisted.calculationVersion === "string" &&
      persisted.calculationVersion.startsWith("staging-synthetic-"))) {
    return null;
  }
  return parsePersistedRegistrationViewerRelic(persisted);
}

function isReservedSyntheticSteamIdentity(value: string) {
  return /^1844674407370955(?:00\d{2}|010[1-4]|100[1-8])$/.test(value);
}

async function resolveStagingSyntheticAcademyRelic({
  supabase,
  identity,
  projectUrl,
  divisionModelVersion,
}: {
  supabase: SupabaseAdminClient;
  identity: RegistrationIdentity;
  projectUrl: string;
  divisionModelVersion: DivisionModelVersion;
}): Promise<SyntheticAcademyRatedResult | null> {
  if (!isConfirmedStagingSupabaseProjectUrl(projectUrl)) {
    return null;
  }

  let lookup: { data: unknown; error: unknown };

  try {
    lookup = await supabase.rpc("resolve_staging_synthetic_registration_elo", {
      p_profile_id: identity.playerId,
      p_clerk_user_id: identity.clerkUserId,
      p_steam_id64: identity.steamId64,
      p_division_model_version: divisionModelVersion,
    });
  } catch {
    console.error("Synthetic registration rating lookup failed unexpectedly.");
    return null;
  }

  if (lookup.error) {
    console.error("Synthetic registration rating lookup failed.");
    return null;
  }

  return parseSyntheticAcademyResult(lookup.data, identity, divisionModelVersion);
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
  value: unknown,
  identity: RegistrationIdentity,
  model: DivisionModelVersion
): SyntheticAcademyRatedResult | null {
  if (!Array.isArray(value) || value.length !== 1) {
    return null;
  }

  const row = value[0];

  const academy = /^1844674407370955100[1-8]$/.test(identity.steamId64);
  const main = /^184467440737095500(0[1-9]|1[0-4])$/.exec(identity.steamId64);
  const pro = /^1844674407370955010([1-4])$/.exec(identity.steamId64);
  const mainRatings = [1400, 1450, 1500, 1550, 1600, 1700, 1800, 1900, 2000, 2200, 1625, 1650, 1675, 1699];
  const proRatings = [1701, 1750, 1850, 2100];
  const elo = academy ? 1000 : main ? mainRatings[Number(main[1]) - 1]
    : pro ? proRatings[Number(pro[1]) - 1] : null;
  const version = academy ? STAGING_SYNTHETIC_ACADEMY_CALCULATION_VERSION
    : model === "four_division_v1" ? STAGING_SYNTHETIC_FUTURE_CALCULATION_VERSION
      : "staging-synthetic-v1";
  const division = elo === null ? null : getDivisionForElo(elo, model);
  if (!isRecord(row) || elo === null || !division ||
    row.elo !== elo || row.faction !== STAGING_SYNTHETIC_ACADEMY_FACTION ||
    row.division !== division || row.calculation_version !== version) {
    return null;
  }

  return {
    status: "rated",
    elo,
    faction: STAGING_SYNTHETIC_ACADEMY_FACTION,
    division,
    calculationVersion: version,
  };
}

function parsePersistedRegistrationViewerRelic(
  value: PersistedRegistrationViewerRelic
): EffectiveRegistrationViewerRelic | null {
  const division = parseIronCladDivision(value.division);

  if (!division) {
    return null;
  }

  return {
    status: "rated",
    elo: Number.isSafeInteger(value.elo) ? (value.elo as number) : null,
    faction: parseRelicFaction(value.faction),
    division,
    calculationVersion:
      typeof value.calculationVersion === "string" &&
      value.calculationVersion.length > 0
        ? value.calculationVersion
        : null,
    source: "persisted",
  };
}

function parseIronCladDivision(value: unknown): IronCladDivision | null {
  return value === "Academy" ||
    value === "Challenge" ||
    value === "Main / Pro" || value === "Main" || value === "Pro"
    ? value
    : null;
}

function parseRelicFaction(value: unknown): Relic1v1Faction | null {
  return value === "US Forces" ||
    value === "British Forces" ||
    value === "Deutsches Afrikakorps" ||
    value === "Wehrmacht"
    ? value
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
