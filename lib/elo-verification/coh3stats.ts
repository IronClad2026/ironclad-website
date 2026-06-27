import "server-only";

import {
  parseCoh3StatsProfileInput,
  parseCoh3StatsProfileUrl as parseSharedCoh3StatsProfileUrl,
} from "@/lib/coh3-stats-profile";

export type Coh3Mode = "1v1" | "2v2" | "3v3" | "4v4";

export type Coh3Faction = "us" | "british" | "wehrmacht" | "dak";

export type EloVerificationResult =
  | {
      ok: true;
      profileId: string;
      mode: Coh3Mode;
      verifiedElo: number;
      highestFaction: Coh3Faction;
      factionElos: Record<Coh3Faction, number | null>;
      source: "coh3stats";
      checkedAt: string;
    }
  | {
      ok: false;
      profileId?: string;
      mode?: Coh3Mode;
      source: "coh3stats";
      checkedAt: string;
      error: string;
    };

export type EloComparisonStatus =
  | "verified"
  | "mismatch_warning"
  | "manual_review_required";

export type EloComparisonResult = {
  claimedElo: number;
  verifiedElo: number;
  difference: number;
  status: EloComparisonStatus;
};

export type VerifyCoh3StatsEloParams = {
  profileUrlOrId: string;
  mode: string;
  fetcher?: typeof fetch;
  now?: Date;
  timeoutMs?: number;
};

type RawLeaderboardFile = {
  leaderboards?: unknown;
};

type RawLeaderboardStat = {
  rating?: unknown;
  members?: unknown;
};

type RawPlayerProfile = {
  profile_id?: unknown;
};

type FactionFetchResult = {
  faction: Coh3Faction;
  elo: number | null;
  error: string | null;
};

const COH3_FACTIONS = ["us", "british", "wehrmacht", "dak"] as const;
const COH3_STATS_SOURCE = "coh3stats" as const;
const DEFAULT_TIMEOUT_MS = 10_000;
const DAY_SECONDS = 86_400;
const LEADERBOARD_READY_UTC_HOUR = 5;
const LEADERBOARD_CANDIDATE_DAYS = 4;

const COH3_STORAGE_FACTIONS: Record<Coh3Faction, string> = {
  us: "american",
  british: "british",
  wehrmacht: "german",
  dak: "dak",
};

export function parseCoh3StatsProfileUrl(input: string) {
  return parseSharedCoh3StatsProfileUrl(input);
}

export function parseCoh3StatsProfileReference(input: string) {
  return parseCoh3StatsProfileInput(input);
}

export function normalizeCoh3Mode(input: string | null | undefined) {
  const normalized = input
    ?.trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/vs/g, "v");

  if (
    normalized === "1v1" ||
    normalized === "2v2" ||
    normalized === "3v3" ||
    normalized === "4v4"
  ) {
    return normalized;
  }

  return null;
}

export function compareClaimedEloWithVerifiedElo({
  claimedElo,
  verifiedElo,
}: {
  claimedElo: number;
  verifiedElo: number;
}): EloComparisonResult {
  const normalizedClaimedElo = Math.round(claimedElo);
  const normalizedVerifiedElo = Math.round(verifiedElo);
  const difference = Math.abs(normalizedClaimedElo - normalizedVerifiedElo);
  const status =
    difference <= 50
      ? "verified"
      : difference <= 100
        ? "mismatch_warning"
        : "manual_review_required";

  return {
    claimedElo: normalizedClaimedElo,
    verifiedElo: normalizedVerifiedElo,
    difference,
    status,
  };
}

// Server-side usage: await verifyCoh3StatsElo({ profileUrlOrId, mode: "1v1" });
export async function verifyCoh3StatsElo({
  profileUrlOrId,
  mode,
  fetcher = fetch,
  now = new Date(),
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: VerifyCoh3StatsEloParams): Promise<EloVerificationResult> {
  const checkedAt = now.toISOString();
  const parsedProfile = parseCoh3StatsProfileInput(profileUrlOrId);
  const normalizedMode = normalizeCoh3Mode(mode);

  if (!parsedProfile) {
    return failure({
      checkedAt,
      error: "Invalid COH3 Stats profile URL or profile ID.",
      mode: normalizedMode ?? undefined,
    });
  }

  if (!normalizedMode) {
    return failure({
      checkedAt,
      error: "Unsupported COH3 tournament mode.",
      profileId: parsedProfile.profileId,
    });
  }

  try {
    const candidateTimestamps = getLeaderboardCandidateTimestamps(now);
    const factionResults = await Promise.all(
      COH3_FACTIONS.map((faction) =>
        fetchFactionElo({
          faction,
          mode: normalizedMode,
          profileId: parsedProfile.profileId,
          candidateTimestamps,
          fetcher,
          timeoutMs,
        })
      )
    );
    const factionElos = mapFactionElos(factionResults);
    const highest = selectHighestFactionElo(factionElos);

    if (!highest) {
      const loadErrors = factionResults
        .map((result) => result.error)
        .filter((error): error is string => Boolean(error));

      return failure({
        checkedAt,
        profileId: parsedProfile.profileId,
        mode: normalizedMode,
        error:
          loadErrors.length > 0
            ? `COH3 Stats leaderboard data could not be loaded: ${loadErrors[0]}`
            : "No COH3 Stats leaderboard ELO was found for this profile and mode.",
      });
    }

    return {
      ok: true,
      profileId: parsedProfile.profileId,
      mode: normalizedMode,
      verifiedElo: highest.elo,
      highestFaction: highest.faction,
      factionElos,
      source: COH3_STATS_SOURCE,
      checkedAt,
    };
  } catch (error) {
    console.error("COH3 Stats ELO verification failed:", error);

    return failure({
      checkedAt,
      profileId: parsedProfile.profileId,
      mode: normalizedMode,
      error: "COH3 Stats ELO verification failed.",
    });
  }
}

function failure({
  checkedAt,
  error,
  profileId,
  mode,
}: {
  checkedAt: string;
  error: string;
  profileId?: string;
  mode?: Coh3Mode;
}): EloVerificationResult {
  return {
    ok: false,
    profileId,
    mode,
    source: COH3_STATS_SOURCE,
    checkedAt,
    error,
  };
}

async function fetchFactionElo({
  faction,
  mode,
  profileId,
  candidateTimestamps,
  fetcher,
  timeoutMs,
}: {
  faction: Coh3Faction;
  mode: Coh3Mode;
  profileId: string;
  candidateTimestamps: number[];
  fetcher: typeof fetch;
  timeoutMs: number;
}): Promise<FactionFetchResult> {
  const errors: string[] = [];

  for (const timestamp of candidateTimestamps) {
    const url = getLeaderboardUrl({ timestamp, mode, faction });
    const result = await fetchJson({ url, fetcher, timeoutMs });

    if (result.status === "not_found") {
      continue;
    }

    if (result.status === "error") {
      errors.push(result.error);
      continue;
    }

    return {
      faction,
      elo: findHighestProfileRating(profileId, result.data),
      error: null,
    };
  }

  return {
    faction,
    elo: null,
    error:
      errors[0] ??
      `No recent COH3 Stats leaderboard dump found for ${mode} ${faction}.`,
  };
}

async function fetchJson({
  url,
  fetcher,
  timeoutMs,
}: {
  url: string;
  fetcher: typeof fetch;
  timeoutMs: number;
}): Promise<
  | { status: "ok"; data: unknown }
  | { status: "not_found" }
  | { status: "error"; error: string }
> {
  try {
    const response = await fetcher(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (response.status === 404) {
      return { status: "not_found" };
    }

    if (!response.ok) {
      return {
        status: "error",
        error: `COH3 Stats returned HTTP ${response.status}.`,
      };
    }

    return {
      status: "ok",
      data: await response.json(),
    };
  } catch (error) {
    return {
      status: "error",
      error: error instanceof Error ? error.message : "COH3 Stats fetch failed.",
    };
  }
}

function getLeaderboardUrl({
  timestamp,
  mode,
  faction,
}: {
  timestamp: number;
  mode: Coh3Mode;
  faction: Coh3Faction;
}) {
  const storageFaction = COH3_STORAGE_FACTIONS[faction];
  return `https://storage.coh3stats.com/leaderboards/${timestamp}/${timestamp}_${mode}_${storageFaction}.json`;
}

function getLeaderboardCandidateTimestamps(now: Date) {
  const todayTimestamp = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    0,
    0,
    0
  ) / 1000;
  const latestSafeTimestamp =
    now.getUTCHours() >= LEADERBOARD_READY_UTC_HOUR
      ? todayTimestamp
      : todayTimestamp - DAY_SECONDS;

  return Array.from(
    { length: LEADERBOARD_CANDIDATE_DAYS },
    (_value, index) => latestSafeTimestamp - index * DAY_SECONDS
  );
}

function findHighestProfileRating(profileId: string, payload: unknown) {
  const leaderboardFile = payload as RawLeaderboardFile;

  if (!Array.isArray(leaderboardFile.leaderboards)) {
    return null;
  }

  let highestRating: number | null = null;

  for (const row of leaderboardFile.leaderboards as RawLeaderboardStat[]) {
    if (!Array.isArray(row.members)) {
      continue;
    }

    const includesProfile = row.members.some(
      (member) =>
        String((member as RawPlayerProfile).profile_id ?? "") === profileId
    );
    const rating =
      typeof row.rating === "number" && Number.isFinite(row.rating)
        ? Math.round(row.rating)
        : null;

    if (
      includesProfile &&
      rating !== null &&
      (highestRating === null || rating > highestRating)
    ) {
      highestRating = rating;
    }
  }

  return highestRating;
}

function mapFactionElos(results: FactionFetchResult[]) {
  return results.reduce(
    (elos, result) => ({
      ...elos,
      [result.faction]: result.elo,
    }),
    {
      us: null,
      british: null,
      wehrmacht: null,
      dak: null,
    } as Record<Coh3Faction, number | null>
  );
}

function selectHighestFactionElo(
  factionElos: Record<Coh3Faction, number | null>
) {
  return COH3_FACTIONS.reduce<{
    faction: Coh3Faction;
    elo: number;
  } | null>((highest, faction) => {
    const elo = factionElos[faction];

    if (elo === null) {
      return highest;
    }

    if (!highest || elo > highest.elo) {
      return { faction, elo };
    }

    return highest;
  }, null);
}
