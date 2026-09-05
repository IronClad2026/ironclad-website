import {
  mapPublicCoh3MapDatabaseRow,
  normalizeCoh3MapName,
  projectPublicCoh3Map,
  type Coh3MapRow,
  type PublicCoh3MapDatabaseRow,
  type PublicCoh3Map,
} from "@/lib/coh3-maps";
import {
  getTournamentBracketDisplayName,
  getTournamentBracketSortOrder,
} from "@/lib/tournaments";

export type TournamentMapPoolEntryRow = {
  addedAt: string;
  removedAt: string | null;
  map: Coh3MapRow;
};

export type TournamentMapPoolBracketRow = {
  id: string;
  name: string;
  mapPoolPublishedAt: string | null;
  launchedAt: string | null;
  entries: TournamentMapPoolEntryRow[];
};

export type PublicTournamentMapPoolEntryDatabaseRow = {
  tournament_bracket_id: string;
  added_at: string;
  removed_at: string | null;
  coh3_maps: PublicCoh3MapDatabaseRow | null;
};

export type PublishedTournamentMapPool = {
  bracketId: string;
  divisionName: string;
  publishedAt: string;
  launchedAt: string | null;
  maps: PublicCoh3Map[];
};

export function projectPublishedTournamentMapPools(
  brackets: TournamentMapPoolBracketRow[]
): PublishedTournamentMapPool[] {
  return [...brackets]
    .sort(
      (left, right) =>
        getTournamentBracketSortOrder(left.name) -
          getTournamentBracketSortOrder(right.name) ||
        left.name.localeCompare(right.name)
    )
    .flatMap((bracket) => {
      if (!bracket.mapPoolPublishedAt) {
        return [];
      }

      return [
        {
          bracketId: bracket.id,
          divisionName: getTournamentBracketDisplayName(bracket.name),
          publishedAt: bracket.mapPoolPublishedAt,
          launchedAt: bracket.launchedAt,
          maps: bracket.entries
            .filter((entry) => entry.removedAt === null)
            .map((entry) => projectPublicCoh3Map(entry.map))
            .sort(comparePublicMaps),
        },
      ];
    });
}

function comparePublicMaps(left: PublicCoh3Map, right: PublicCoh3Map) {
  const leftName = normalizeCoh3MapName(left.displayName);
  const rightName = normalizeCoh3MapName(right.displayName);

  if (leftName !== rightName) {
    return leftName < rightName ? -1 : 1;
  }

  return left.id.localeCompare(right.id);
}

export function groupPublicTournamentMapPoolEntries(
  rows: PublicTournamentMapPoolEntryDatabaseRow[]
): Map<string, TournamentMapPoolEntryRow[]> {
  const entriesByBracket = new Map<string, TournamentMapPoolEntryRow[]>();

  for (const row of rows) {
    if (!row.coh3_maps) {
      continue;
    }

    const publicMap = mapPublicCoh3MapDatabaseRow(row.coh3_maps);
    const entries = entriesByBracket.get(row.tournament_bracket_id) ?? [];
    entries.push({
      addedAt: row.added_at,
      removedAt: row.removed_at,
      map: {
        ...publicMap,
        adminNote: null,
        createdAt: row.coh3_maps.created_at,
        updatedAt: row.coh3_maps.updated_at,
        createdByClerkUserId: null,
        updatedByClerkUserId: null,
      },
    });
    entriesByBracket.set(row.tournament_bracket_id, entries);
  }

  return entriesByBracket;
}
