import "server-only";

import {
  getRelic1v1Elo,
  type Relic1v1Faction,
  type RelicEloResult,
} from "@/lib/elo-verification/relic";
import type { IronCladDivision } from "@/lib/elo-verification/divisions";
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
  const syntheticResult = await resolveStagingSyntheticAcademyRelic({
    supabase,
    identity,
    projectUrl,
  });

  if (syntheticResult) {
    return syntheticResult;
  }

  return getRelic1v1Elo(identity.steamId64);
}

export async function getEffectiveRegistrationViewerRelic({
  supabase,
  identity,
  persisted,
}: {
  supabase: SupabaseAdminClient;
  identity: RegistrationIdentity;
  persisted: PersistedRegistrationViewerRelic;
}): Promise<EffectiveRegistrationViewerRelic | null> {
  return getEffectiveRegistrationViewerRelicForProject({
    supabase,
    identity,
    persisted,
    projectUrl: supabaseUrl,
  });
}

export async function getEffectiveRegistrationViewerRelicForProject({
  supabase,
  identity,
  persisted,
  projectUrl,
}: {
  supabase: SupabaseAdminClient;
  identity: RegistrationIdentity;
  persisted: PersistedRegistrationViewerRelic;
  projectUrl: string;
}): Promise<EffectiveRegistrationViewerRelic | null> {
  const syntheticResult = await resolveStagingSyntheticAcademyRelic({
    supabase,
    identity,
    projectUrl,
  });

  if (syntheticResult) {
    return {
      ...syntheticResult,
      source: "staging_synthetic",
    };
  }

  return parsePersistedRegistrationViewerRelic(persisted);
}

async function resolveStagingSyntheticAcademyRelic({
  supabase,
  identity,
  projectUrl,
}: {
  supabase: SupabaseAdminClient;
  identity: RegistrationIdentity;
  projectUrl: string;
}): Promise<SyntheticAcademyRatedResult | null> {
  if (!isConfirmedStagingSupabaseProjectUrl(projectUrl)) {
    return null;
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
    return null;
  }

  if (lookup.error) {
    console.error("Synthetic Academy rating lookup failed.");
    return null;
  }

  return parseSyntheticAcademyResult(lookup.data);
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
    value === "Main / Pro"
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
