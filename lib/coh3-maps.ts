export const COH3_MAP_SOURCE_TYPES = ["official", "community"] as const;
export const COH3_GAME_MODE = "1v1" as const;
export const COH3_MAP_STATUSES = [
  "active",
  "retired",
  "temporarily_disabled",
] as const;

export type Coh3MapSourceType = (typeof COH3_MAP_SOURCE_TYPES)[number];
export type Coh3GameMode = typeof COH3_GAME_MODE;
export type Coh3MapStatus = (typeof COH3_MAP_STATUSES)[number];

export type Coh3MapInput = {
  slug: string;
  displayName: string;
  sourceType: Coh3MapSourceType;
  creatorName: string | null;
  gameMode: Coh3GameMode;
  status: Coh3MapStatus;
  thumbnailPath: string | null;
  sourceReference: string | null;
  adminNote: string | null;
};

export type Coh3MapRow = Coh3MapInput & {
  id: string;
  createdAt: string;
  updatedAt: string;
  createdByClerkUserId: string | null;
  updatedByClerkUserId: string | null;
};

export type Coh3MapDatabaseRow = {
  id: string;
  slug: string;
  display_name: string;
  source_type: Coh3MapSourceType;
  creator_name: string | null;
  game_mode: Coh3GameMode;
  status: Coh3MapStatus;
  thumbnail_path: string | null;
  source_reference: string | null;
  admin_note: string | null;
  created_at: string;
  updated_at: string;
  created_by_clerk_user_id: string | null;
  updated_by_clerk_user_id: string | null;
};

export type PublicCoh3MapDatabaseRow = Omit<
  Coh3MapDatabaseRow,
  "admin_note" | "created_by_clerk_user_id" | "updated_by_clerk_user_id"
>;

export type PublicCoh3Map = Pick<
  Coh3MapRow,
  | "id"
  | "slug"
  | "displayName"
  | "sourceType"
  | "creatorName"
  | "gameMode"
  | "status"
  | "thumbnailPath"
  | "sourceReference"
>;

export type Coh3MapInputResult =
  | { ok: true; value: Coh3MapInput }
  | { ok: false; error: string };

const sourceTypeSet = new Set<string>(COH3_MAP_SOURCE_TYPES);
const statusSet = new Set<string>(COH3_MAP_STATUSES);

function optionalText(value: unknown): string | null | undefined {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  return value.trim() || null;
}

export function normalizeCoh3MapName(displayName: string): string {
  return displayName.trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
}

export function parseCoh3MapInput(input: unknown): Coh3MapInputResult {
  if (!input || typeof input !== "object") {
    return { ok: false, error: "Enter valid map details." };
  }

  const candidate = input as Record<string, unknown>;
  if (typeof candidate.slug !== "string") {
    return { ok: false, error: "Enter a stable map key." };
  }

  const slug = candidate.slug.trim();
  if (slug.length > 100 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return {
      ok: false,
      error: "Map keys must use lowercase letters, numbers, and single hyphens.",
    };
  }

  if (typeof candidate.displayName !== "string") {
    return { ok: false, error: "Enter a map name." };
  }

  const displayName = candidate.displayName.trim().replace(/\s+/g, " ");
  if (!displayName || displayName.length > 120) {
    return { ok: false, error: "Enter a map name of 120 characters or fewer." };
  }

  if (
    typeof candidate.sourceType !== "string" ||
    !sourceTypeSet.has(candidate.sourceType)
  ) {
    return { ok: false, error: "Select Official or Community." };
  }

  if (candidate.gameMode !== COH3_GAME_MODE) {
    return { ok: false, error: "Feature A supports 1v1 maps only." };
  }

  if (
    typeof candidate.status !== "string" ||
    !statusSet.has(candidate.status)
  ) {
    return { ok: false, error: "Select a valid map status." };
  }

  const creatorName = optionalText(candidate.creatorName);
  const thumbnailPath = optionalText(candidate.thumbnailPath);
  const sourceReference = optionalText(candidate.sourceReference);
  const adminNote = optionalText(candidate.adminNote);

  if (
    creatorName === undefined ||
    thumbnailPath === undefined ||
    sourceReference === undefined ||
    adminNote === undefined
  ) {
    return { ok: false, error: "Enter valid map metadata." };
  }

  if (creatorName && creatorName.length > 120) {
    return {
      ok: false,
      error: "Creator attribution must be 120 characters or fewer.",
    };
  }

  if (
    thumbnailPath &&
    (!thumbnailPath.startsWith("/") ||
      thumbnailPath.startsWith("//") ||
      thumbnailPath.includes("\\") ||
      thumbnailPath.includes(".."))
  ) {
    return {
      ok: false,
      error: "Thumbnail paths must refer to a local public asset.",
    };
  }

  if (thumbnailPath && thumbnailPath.length > 500) {
    return {
      ok: false,
      error: "Thumbnail paths must be 500 characters or fewer.",
    };
  }

  if (sourceReference && sourceReference.length > 500) {
    return {
      ok: false,
      error: "Source references must be 500 characters or fewer.",
    };
  }

  if (adminNote && adminNote.length > 2_000) {
    return {
      ok: false,
      error: "Admin notes must be 2,000 characters or fewer.",
    };
  }

  return {
    ok: true,
    value: {
      slug,
      displayName,
      sourceType: candidate.sourceType as Coh3MapSourceType,
      creatorName,
      gameMode: COH3_GAME_MODE,
      status: candidate.status as Coh3MapStatus,
      thumbnailPath,
      sourceReference,
      adminNote,
    },
  };
}

export function mapCoh3MapDatabaseRow(row: Coh3MapDatabaseRow): Coh3MapRow {
  return {
    id: row.id,
    slug: row.slug,
    displayName: row.display_name,
    sourceType: row.source_type,
    creatorName: row.creator_name,
    gameMode: row.game_mode,
    status: row.status,
    thumbnailPath: row.thumbnail_path,
    sourceReference: row.source_reference,
    adminNote: row.admin_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdByClerkUserId: row.created_by_clerk_user_id,
    updatedByClerkUserId: row.updated_by_clerk_user_id,
  };
}

export function mapPublicCoh3MapDatabaseRow(
  row: PublicCoh3MapDatabaseRow
): PublicCoh3Map {
  return {
    id: row.id,
    slug: row.slug,
    displayName: row.display_name,
    sourceType: row.source_type,
    creatorName: row.creator_name,
    gameMode: row.game_mode,
    status: row.status,
    thumbnailPath: row.thumbnail_path,
    sourceReference: row.source_reference,
  };
}

export function isEligibleOneVersusOnePoolMap(
  map: Pick<Coh3MapRow, "status"> & { gameMode: string }
): boolean {
  return map.status === "active" && map.gameMode === COH3_GAME_MODE;
}

export function projectPublicCoh3Map(map: Coh3MapRow): PublicCoh3Map {
  return {
    id: map.id,
    slug: map.slug,
    displayName: map.displayName,
    sourceType: map.sourceType,
    creatorName: map.creatorName,
    gameMode: map.gameMode,
    status: map.status,
    thumbnailPath: map.thumbnailPath,
    sourceReference: map.sourceReference,
  };
}
