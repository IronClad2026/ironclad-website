import "server-only";

import {
  getIronCladDivision,
  type IronCladDivision,
} from "@/lib/elo-verification/divisions";

export const RELIC_ELO_CALCULATION_VERSION =
  "relic-highest-1v1-v1" as const;

export type Relic1v1Faction =
  | "US Forces"
  | "British Forces"
  | "Deutsches Afrikakorps"
  | "Wehrmacht";

export type RelicEloResult =
  | {
      status: "rated";
      elo: number;
      faction: Relic1v1Faction;
      division: IronCladDivision;
      calculationVersion: typeof RELIC_ELO_CALCULATION_VERSION;
    }
  | { status: "invalid_steam_input" }
  | { status: "profile_not_found" }
  | { status: "steam_identity_mismatch" }
  | { status: "unranked" }
  | { status: "invalid_relic_response" }
  | { status: "relic_integration_error" }
  | { status: "external_relic_unavailable" };

type RelicMember = {
  name: string;
  personalStatGroupId: number;
};

type RelicStatGroup = {
  id: number;
  members: RelicMember[];
};

type RelicLeaderboardRow = {
  leaderboardId: number;
  statGroupId: number;
  value: Record<string, unknown>;
};

type RelicRatingCandidate = {
  leaderboardId: number;
  faction: Relic1v1Faction;
  rating: number;
  lastMatchDate: number | null;
};

const RELIC_PERSONAL_STAT_ENDPOINT =
  "https://coh3-api.reliclink.com/community/leaderboard/getpersonalstat";
const RELIC_REQUEST_TIMEOUT_MS = 10_000;
const MAX_STEAM_ID64 = "18446744073709551615";

const APPROVED_ONE_V_ONE_LEADERBOARDS = new Map<
  number,
  Relic1v1Faction
>([
  [2130255, "US Forces"],
  [2130257, "British Forces"],
  [2130259, "Deutsches Afrikakorps"],
  [2130261, "Wehrmacht"],
]);

export async function getRelic1v1Elo(
  steamId64: string
): Promise<RelicEloResult> {
  if (!isValidSteamId64(steamId64)) {
    return { status: "invalid_steam_input" };
  }

  const profileName = buildSteamProfileName(steamId64);
  const requestUrl = new URL(RELIC_PERSONAL_STAT_ENDPOINT);
  requestUrl.searchParams.set("title", "coh3");
  requestUrl.searchParams.set("profile_names", JSON.stringify([profileName]));

  const signal = AbortSignal.timeout(RELIC_REQUEST_TIMEOUT_MS);
  let response: Response;

  try {
    response = await fetch(requestUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      redirect: "error",
      signal,
    });
  } catch {
    return { status: "external_relic_unavailable" };
  }

  if (signal.aborted) {
    return { status: "external_relic_unavailable" };
  }

  if (response.status !== 200) {
    return response.status === 429 || response.status >= 500
      ? { status: "external_relic_unavailable" }
      : { status: "relic_integration_error" };
  }

  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    return signal.aborted
      ? { status: "external_relic_unavailable" }
      : { status: "invalid_relic_response" };
  }

  if (signal.aborted) {
    return { status: "external_relic_unavailable" };
  }

  return selectRelic1v1Elo(payload, steamId64);
}

export function selectRelic1v1Elo(
  payload: unknown,
  steamId64: string
): RelicEloResult {
  if (!isValidSteamId64(steamId64)) {
    return { status: "invalid_steam_input" };
  }

  if (!isRecord(payload) || !isRecord(payload.result)) {
    return { status: "invalid_relic_response" };
  }

  const resultCode = payload.result.code;
  const resultMessage = payload.result.message;

  if (!Number.isSafeInteger(resultCode) || typeof resultMessage !== "string") {
    return { status: "invalid_relic_response" };
  }

  if (
    !Array.isArray(payload.statGroups) ||
    !Array.isArray(payload.leaderboardStats)
  ) {
    return { status: "invalid_relic_response" };
  }

  const statGroups = parseStatGroups(payload.statGroups);
  const leaderboardRows = parseLeaderboardRows(payload.leaderboardStats);

  if (!statGroups || !leaderboardRows) {
    return { status: "invalid_relic_response" };
  }

  if (resultCode !== 0) {
    if (statGroups.length !== 0 || leaderboardRows.length !== 0) {
      return { status: "invalid_relic_response" };
    }

    return resultCode === 3
      ? { status: "profile_not_found" }
      : { status: "relic_integration_error" };
  }

  if (statGroups.length === 0) {
    return { status: "invalid_relic_response" };
  }

  const expectedProfileName = buildSteamProfileName(steamId64);
  const matchingGroups = statGroups.filter((group) =>
    group.members.some((member) => member.name === expectedProfileName)
  );

  if (matchingGroups.length === 0) {
    return { status: "steam_identity_mismatch" };
  }

  if (matchingGroups.length !== 1) {
    return { status: "invalid_relic_response" };
  }

  const matchingGroup = matchingGroups[0];
  const matchingMembers = matchingGroup.members.filter(
    (member) => member.name === expectedProfileName
  );

  if (
    matchingMembers.length !== 1 ||
    matchingMembers[0].personalStatGroupId !== matchingGroup.id
  ) {
    return { status: "invalid_relic_response" };
  }

  const approvedRows = leaderboardRows.filter(
    (row) =>
      row.statGroupId === matchingGroup.id &&
      APPROVED_ONE_V_ONE_LEADERBOARDS.has(row.leaderboardId)
  );

  if (approvedRows.length === 0) {
    return { status: "unranked" };
  }

  const seenLeaderboardIds = new Set<number>();

  for (const row of approvedRows) {
    if (seenLeaderboardIds.has(row.leaderboardId)) {
      return { status: "invalid_relic_response" };
    }

    seenLeaderboardIds.add(row.leaderboardId);
  }

  const candidates: RelicRatingCandidate[] = [];
  let hasMalformedApprovedRow = false;

  for (const row of approvedRows) {
    const rating = row.value.rating;
    const wins = row.value.wins;
    const losses = row.value.losses;

    if (
      !isNonNegativeSafeInteger(rating) ||
      !isNonNegativeSafeInteger(wins) ||
      !isNonNegativeSafeInteger(losses)
    ) {
      hasMalformedApprovedRow = true;
      continue;
    }

    if (wins === 0 && losses === 0) {
      continue;
    }

    candidates.push({
      leaderboardId: row.leaderboardId,
      faction: APPROVED_ONE_V_ONE_LEADERBOARDS.get(row.leaderboardId)!,
      rating,
      lastMatchDate: isNonNegativeSafeInteger(row.value.lastmatchdate)
        ? row.value.lastmatchdate
        : null,
    });
  }

  if (candidates.length === 0) {
    return hasMalformedApprovedRow
      ? { status: "invalid_relic_response" }
      : { status: "unranked" };
  }

  candidates.sort(compareRatingCandidates);
  const selected = candidates[0];
  const division = getIronCladDivision(selected.rating);

  if (!division.ok) {
    return { status: "invalid_relic_response" };
  }

  return {
    status: "rated",
    elo: selected.rating,
    faction: selected.faction,
    division: division.division,
    calculationVersion: RELIC_ELO_CALCULATION_VERSION,
  };
}

function compareRatingCandidates(
  left: RelicRatingCandidate,
  right: RelicRatingCandidate
) {
  if (left.rating !== right.rating) {
    return right.rating - left.rating;
  }

  // Equal ratings prefer the newest valid match date. Missing or invalid dates
  // sort last, and a remaining tie is resolved by the lowest leaderboard ID.
  const leftLastMatchDate = left.lastMatchDate ?? -1;
  const rightLastMatchDate = right.lastMatchDate ?? -1;

  if (leftLastMatchDate !== rightLastMatchDate) {
    return rightLastMatchDate - leftLastMatchDate;
  }

  return left.leaderboardId - right.leaderboardId;
}

function parseStatGroups(value: unknown): RelicStatGroup[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const groups: RelicStatGroup[] = [];
  const seenGroupIds = new Set<number>();

  for (const rawGroup of value) {
    if (
      !isRecord(rawGroup) ||
      !isNonNegativeSafeInteger(rawGroup.id) ||
      !Array.isArray(rawGroup.members) ||
      rawGroup.members.length === 0 ||
      seenGroupIds.has(rawGroup.id)
    ) {
      return null;
    }

    const members: RelicMember[] = [];

    for (const rawMember of rawGroup.members) {
      if (
        !isRecord(rawMember) ||
        typeof rawMember.name !== "string" ||
        rawMember.name.length === 0 ||
        !isNonNegativeSafeInteger(rawMember.personal_statgroup_id)
      ) {
        return null;
      }

      members.push({
        name: rawMember.name,
        personalStatGroupId: rawMember.personal_statgroup_id,
      });
    }

    seenGroupIds.add(rawGroup.id);
    groups.push({ id: rawGroup.id, members });
  }

  return groups;
}

function parseLeaderboardRows(value: unknown): RelicLeaderboardRow[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const rows: RelicLeaderboardRow[] = [];

  for (const rawRow of value) {
    if (
      !isRecord(rawRow) ||
      !isNonNegativeSafeInteger(rawRow.leaderboard_id) ||
      !isNonNegativeSafeInteger(rawRow.statgroup_id)
    ) {
      return null;
    }

    rows.push({
      leaderboardId: rawRow.leaderboard_id,
      statGroupId: rawRow.statgroup_id,
      value: rawRow,
    });
  }

  return rows;
}

function buildSteamProfileName(steamId64: string) {
  return `/steam/${steamId64}`;
}

function isValidSteamId64(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    !/^(0|[1-9][0-9]{0,19})$/.test(value)
  ) {
    return false;
  }

  return value.length < MAX_STEAM_ID64.length || value <= MAX_STEAM_ID64;
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
