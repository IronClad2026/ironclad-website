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
      verifiedPlayerName: string;
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
  playerName: string | null;
  error: string | null;
};

export type EloIdentityStatus = "matched" | "mismatch" | "unavailable";

export type EloIdentityComparisonResult = {
  status: EloIdentityStatus;
  websiteName: string;
  coh3StatsName: string;
};

export type ExactEloComparisonResult = {
  enteredElo: number;
  verifiedElo: number;
  difference: number;
  tolerance: number;
  matches: boolean;
};

const COH3_FACTIONS = ["us", "british", "wehrmacht", "dak"] as const;
const COH3_STATS_SOURCE = "coh3stats" as const;
const DEFAULT_TIMEOUT_MS = 10_000;
const DAY_SECONDS = 86_400;
const LEADERBOARD_READY_UTC_HOUR = 5;
const LEADERBOARD_CANDIDATE_DAYS = 4;
export const ELO_AUTO_VERIFY_TOLERANCE = 75;

const COH3_STORAGE_FACTIONS: Record<Coh3Faction, string> = {
  us: "american",
  british: "british",
  wehrmacht: "german",
  dak: "dak",
};

const PLAYER_NAME_KEYS = [
  "alias",
  "name",
  "player_name",
  "display_name",
  "steam_name",
  "profile_name",
] as const;

const PROFILE_ID_KEYS = [
  "profile_id",
  "profileId",
  "profileID",
  "profileid",
  "relic_id",
  "relicId",
  "relicID",
] as const;

// COH3 Stats exposes per-mode, per-faction leaderboard ratings. IronClad uses
// the highest rounded rating across the four factions for the selected mode.
const RATING_KEYS = [
  "elo",
  "rating",
  "rank_rating",
  "leaderboard_rating",
  "mmr",
] as const;

const MODE_KEYS = ["mode", "type", "leaderboard_type", "game_type"] as const;
const FACTION_KEYS = ["faction", "race", "side", "army"] as const;

const FACTION_TOKENS: Record<Coh3Faction, string[]> = {
  us: ["us", "usf", "american", "americans", "usforces", "americanforces"],
  british: ["british", "brits", "uk", "britishforces"],
  wehrmacht: ["wehrmacht", "wehr", "german", "germans"],
  dak: [
    "dak",
    "afrika",
    "afrikakorps",
    "africakorps",
    "deutschesafrikakorps",
    "deutschesafrikakorpsdak",
  ],
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

export function compareEnteredEloWithCoh3StatsElo({
  enteredElo,
  verifiedElo,
}: {
  enteredElo: number;
  verifiedElo: number;
}): ExactEloComparisonResult {
  const normalizedEnteredElo = Math.round(enteredElo);
  const normalizedVerifiedElo = Math.round(verifiedElo);
  const difference = Math.abs(normalizedEnteredElo - normalizedVerifiedElo);

  return {
    enteredElo: normalizedEnteredElo,
    verifiedElo: normalizedVerifiedElo,
    difference,
    tolerance: ELO_AUTO_VERIFY_TOLERANCE,
    matches: difference <= ELO_AUTO_VERIFY_TOLERANCE,
  };
}

export function normalizePlayerNameForEloIdentityCheck(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function comparePlayerNameForEloIdentityCheck({
  websiteName,
  coh3StatsName,
}: {
  websiteName: string | null | undefined;
  coh3StatsName: string | null | undefined;
}): EloIdentityComparisonResult {
  const normalizedWebsiteName = normalizePlayerNameForEloIdentityCheck(
    websiteName ?? ""
  );
  const normalizedCoh3StatsName = normalizePlayerNameForEloIdentityCheck(
    coh3StatsName ?? ""
  );

  if (!normalizedWebsiteName || !normalizedCoh3StatsName) {
    return {
      status: "unavailable",
      websiteName: normalizedWebsiteName,
      coh3StatsName: normalizedCoh3StatsName,
    };
  }

  return {
    status:
      normalizedWebsiteName === normalizedCoh3StatsName
        ? "matched"
        : "mismatch",
    websiteName: normalizedWebsiteName,
    coh3StatsName: normalizedCoh3StatsName,
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
    const exportResult = await fetchPlayerExportProfile({
      profileId: parsedProfile.profileId,
      mode: normalizedMode,
      fetcher,
      timeoutMs,
    });

    if (exportResult.status === "ok") {
      const exportVerification = buildVerificationFromPayload({
        payload: exportResult.data,
        profileId: parsedProfile.profileId,
        mode: normalizedMode,
        checkedAt,
      });

      if (exportVerification.ok) {
        return exportVerification;
      }
    }

    const storageVerification = await fetchStorageLeaderboardVerification({
      profileId: parsedProfile.profileId,
      mode: normalizedMode,
      candidateTimestamps: getLeaderboardCandidateTimestamps(now),
      fetcher,
      timeoutMs,
    });

    if (
      !storageVerification.highest ||
      !storageVerification.verifiedPlayerName
    ) {
      const loadErrors = storageVerification.factionResults
        .map((result) => result.error)
        .filter((error): error is string => Boolean(error));

      return failure({
        checkedAt,
        profileId: parsedProfile.profileId,
        mode: normalizedMode,
        error:
          !storageVerification.verifiedPlayerName &&
          storageVerification.highest
            ? "COH3 Stats player name was not found for this profile."
            : loadErrors.length > 0
              ? `COH3 Stats leaderboard data could not be loaded: ${loadErrors[0]}`
              : "No COH3 Stats leaderboard ELO was found for this profile and mode.",
      });
    }

    return {
      ok: true,
      profileId: parsedProfile.profileId,
      mode: normalizedMode,
      verifiedElo: storageVerification.highest.elo,
      verifiedPlayerName: storageVerification.verifiedPlayerName,
      highestFaction: storageVerification.highest.faction,
      factionElos: storageVerification.factionElos,
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

function buildVerificationFromPayload({
  payload,
  profileId,
  mode,
  checkedAt,
}: {
  payload: unknown;
  profileId: string;
  mode: Coh3Mode;
  checkedAt: string;
}): EloVerificationResult {
  const factionElos = extractFactionElosFromPayload(payload, profileId, mode);
  const highest = selectHighestFactionElo(factionElos);
  const verifiedPlayerName = extractPlayerNameFromPayload(payload, profileId);

  if (!verifiedPlayerName) {
    return failure({
      checkedAt,
      profileId,
      mode,
      error: "COH3 Stats player name was not found for this profile.",
    });
  }

  if (!highest) {
    return failure({
      checkedAt,
      profileId,
      mode,
      error: "No COH3 Stats leaderboard ELO was found for this profile and mode.",
    });
  }

  return {
    ok: true,
    profileId,
    mode,
    verifiedElo: highest.elo,
    verifiedPlayerName,
    highestFaction: highest.faction,
    factionElos,
    source: COH3_STATS_SOURCE,
    checkedAt,
  };
}

async function fetchPlayerExportProfile({
  profileId,
  mode,
  fetcher,
  timeoutMs,
}: {
  profileId: string;
  mode: Coh3Mode;
  fetcher: typeof fetch;
  timeoutMs: number;
}) {
  const params = new URLSearchParams({
    types: JSON.stringify([mode]),
    profileIDs: JSON.stringify([Number(profileId)]),
  });

  const result = await fetchText({
    url: `https://coh3stats.com/api/playerExport?${params.toString()}`,
    fetcher,
    timeoutMs,
  });

  if (result.status !== "ok") {
    return result;
  }

  return {
    status: "ok" as const,
    data: parsePlayerExportCsv(result.data, mode),
  };
}

async function fetchStorageLeaderboardVerification({
  profileId,
  mode,
  candidateTimestamps,
  fetcher,
  timeoutMs,
}: {
  profileId: string;
  mode: Coh3Mode;
  candidateTimestamps: number[];
  fetcher: typeof fetch;
  timeoutMs: number;
}) {
  const factionResults = await Promise.all(
    COH3_FACTIONS.map((faction) =>
      fetchFactionElo({
        faction,
        mode,
        profileId,
        candidateTimestamps,
        fetcher,
        timeoutMs,
      })
    )
  );
  const factionElos = mapFactionElos(factionResults);

  return {
    factionResults,
    factionElos,
    highest: selectHighestFactionElo(factionElos),
    verifiedPlayerName:
      factionResults.find((result) => result.playerName)?.playerName ?? null,
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

    const profileMatch = findProfileRatingAndName(profileId, result.data);

    return {
      faction,
      elo: profileMatch.elo,
      playerName: profileMatch.playerName,
      error: null,
    };
  }

  return {
    faction,
    elo: null,
    playerName: null,
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

async function fetchText({
  url,
  fetcher,
  timeoutMs,
}: {
  url: string;
  fetcher: typeof fetch;
  timeoutMs: number;
}): Promise<
  | { status: "ok"; data: string }
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
      data: await response.text(),
    };
  } catch (error) {
    return {
      status: "error",
      error: error instanceof Error ? error.message : "COH3 Stats fetch failed.",
    };
  }
}

function parsePlayerExportCsv(input: string, mode: Coh3Mode) {
  const rows = parseCsvRows(input.trim());
  const [headers, ...records] = rows;

  if (!headers || records.length === 0) {
    return { players: [] };
  }

  return {
    players: records.map((record) => {
      const row = Object.fromEntries(
        headers.map((header, index) => [header, record[index] ?? ""])
      );
      const profileId = row.relic_id ?? "";
      const alias = row.alias ?? "";

      return {
        profile_id: profileId,
        relic_id: profileId,
        alias,
        leaderboards: COH3_FACTIONS.map((faction) => {
          const column = getPlayerExportEloColumn({ faction, mode });

          return {
            mode,
            faction,
            rating: parseNullableNumber(row[column]),
            profile: {
              profile_id: profileId,
              relic_id: profileId,
              alias,
            },
          };
        }),
      };
    }),
  };
}

function parseCsvRows(input: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    const nextCharacter = input[index + 1];

    if (character === '"' && quoted && nextCharacter === '"') {
      value += '"';
      index += 1;
      continue;
    }

    if (character === '"') {
      quoted = !quoted;
      continue;
    }

    if (character === "," && !quoted) {
      row.push(value);
      value = "";
      continue;
    }

    if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && nextCharacter === "\n") {
        index += 1;
      }

      row.push(value);
      rows.push(row);
      row = [];
      value = "";
      continue;
    }

    value += character;
  }

  row.push(value);
  rows.push(row);

  return rows.filter((currentRow) =>
    currentRow.some((currentValue) => currentValue.trim())
  );
}

function getPlayerExportEloColumn({
  faction,
  mode,
}: {
  faction: Coh3Faction;
  mode: Coh3Mode;
}) {
  const factionColumn: Record<Coh3Faction, string> = {
    us: "american",
    british: "british",
    wehrmacht: "german",
    dak: "dak",
  };

  return `${factionColumn[faction]}_${mode}_elo`;
}

function parseNullableNumber(value: string | undefined) {
  if (!value || value === "null" || value === "undefined") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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

function extractFactionElosFromPayload(
  payload: unknown,
  profileId: string,
  mode: Coh3Mode
) {
  const factionElos: Record<Coh3Faction, number | null> = {
    us: null,
    british: null,
    wehrmacht: null,
    dak: null,
  };

  const visit = (
    value: unknown,
    path: string[],
    ancestorReferencesProfile: boolean
  ) => {
    if (Array.isArray(value)) {
      value.forEach((item, index) =>
        visit(item, [...path, String(index)], ancestorReferencesProfile)
      );
      return;
    }

    if (!isRecord(value)) {
      return;
    }

    const referencesProfile =
      ancestorReferencesProfile || recordReferencesProfileId(value, profileId);
    const rating = getRatingFromRecord(value);

    if (referencesProfile && rating !== null) {
      const detectedMode = detectMode(path, value);
      const faction = detectFaction(path, value);

      if (detectedMode === mode && faction) {
        factionElos[faction] =
          factionElos[faction] === null
            ? rating
            : Math.max(factionElos[faction], rating);
      }
    }

    Object.entries(value).forEach(([key, child]) =>
      visit(child, [...path, key], referencesProfile)
    );
  };

  visit(payload, [], false);

  return factionElos;
}

function extractPlayerNameFromPayload(payload: unknown, profileId: string) {
  const matches: Record<string, unknown>[] = [];

  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }

    if (!isRecord(value)) {
      return;
    }

    if (recordHasDirectProfileId(value, profileId)) {
      matches.push(value);
    }

    Object.values(value).forEach(visit);
  };

  visit(payload);

  for (const match of matches) {
    const name = getPreferredPlayerName(match);

    if (name) {
      return name;
    }
  }

  return null;
}

function findProfileRatingAndName(profileId: string, payload: unknown) {
  const leaderboardFile = payload as RawLeaderboardFile;

  if (!Array.isArray(leaderboardFile.leaderboards)) {
    return { elo: null, playerName: null };
  }

  let highestRating: number | null = null;
  let playerName: string | null = null;

  for (const row of leaderboardFile.leaderboards as RawLeaderboardStat[]) {
    if (!Array.isArray(row.members)) {
      continue;
    }

    const matchedMember = row.members.find(
      (member) =>
        String((member as RawPlayerProfile).profile_id ?? "") === profileId
    );
    const rating =
      typeof row.rating === "number" && Number.isFinite(row.rating)
        ? Math.round(row.rating)
        : null;

    if (
      matchedMember &&
      rating !== null &&
      (highestRating === null || rating > highestRating)
    ) {
      highestRating = rating;
      playerName = isRecord(matchedMember)
        ? getPreferredPlayerName(matchedMember)
        : null;
    }
  }

  return { elo: highestRating, playerName };
}

function recordReferencesProfileId(
  record: Record<string, unknown>,
  profileId: string
) {
  if (recordHasDirectProfileId(record, profileId)) {
    return true;
  }

  return Object.values(record).some((value) =>
    valueReferencesProfileId(value, profileId)
  );
}

function valueReferencesProfileId(value: unknown, profileId: string): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => valueReferencesProfileId(item, profileId));
  }

  if (!isRecord(value)) {
    return false;
  }

  return recordReferencesProfileId(value, profileId);
}

function recordHasDirectProfileId(
  record: Record<string, unknown>,
  profileId: string
) {
  return PROFILE_ID_KEYS.some((key) => String(record[key] ?? "") === profileId);
}

function getPreferredPlayerName(record: Record<string, unknown>): string | null {
  for (const key of PLAYER_NAME_KEYS) {
    const value = record[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  const nestedProfile = record.profile;

  if (isRecord(nestedProfile)) {
    return getPreferredPlayerName(nestedProfile);
  }

  for (const key of ["player", "member"]) {
    const nestedRecord = record[key];

    if (isRecord(nestedRecord)) {
      const nestedName = getPreferredPlayerName(nestedRecord);

      if (nestedName) {
        return nestedName;
      }
    }
  }

  return null;
}

function getRatingFromRecord(record: Record<string, unknown>) {
  for (const key of RATING_KEYS) {
    const value = record[key];

    if (typeof value === "number" && Number.isFinite(value)) {
      return Math.round(value);
    }

    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);

      if (Number.isFinite(parsed)) {
        return Math.round(parsed);
      }
    }
  }

  return null;
}

function detectMode(path: string[], record: Record<string, unknown>) {
  const tokens = [
    ...path,
    ...MODE_KEYS.map((key) => record[key]).filter(
      (value): value is string | number =>
        typeof value === "string" || typeof value === "number"
    ),
  ].map(normalizeToken);
  const validModes: Coh3Mode[] = ["1v1", "2v2", "3v3", "4v4"];

  for (const token of tokens) {
    const mode = normalizeCoh3Mode(token);

    if (mode) {
      return mode;
    }

    const embeddedMode = validModes.find((candidate) =>
      token.includes(candidate)
    );

    if (embeddedMode) {
      return embeddedMode;
    }
  }

  return null;
}

function detectFaction(path: string[], record: Record<string, unknown>) {
  const tokens = [
    ...path,
    ...FACTION_KEYS.map((key) => record[key]).filter(
      (value): value is string | number =>
        typeof value === "string" || typeof value === "number"
    ),
  ].map(normalizeToken);

  for (const [faction, aliases] of Object.entries(FACTION_TOKENS) as [
    Coh3Faction,
    string[],
  ][]) {
    if (
      tokens.some((token) =>
        aliases.some(
          (alias) =>
            token === alias || (alias.length > 2 && token.includes(alias))
        )
      )
    ) {
      return faction;
    }
  }

  return null;
}

function normalizeToken(value: string | number) {
  return String(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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
