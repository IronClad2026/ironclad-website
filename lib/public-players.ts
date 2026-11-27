import "server-only";

import { createNoStoreSupabaseClient } from "@/lib/supabase";

export type PublicPlayerProfile = {
  id: string;
  displayName: string;
  playerName: string;
  country: string | null;
  region: string | null;
  currentElo: number | null;
  // Compatibility for existing contact readers: every returned active profile is public.
  // This value is derived from the active-only view, never the legacy player flag.
  publicProfileEnabled: true;
  optionalProfileEnabled: boolean;
  discordPublicEnabled: boolean;
  discordUsername: string | null;
  hasAvatar: boolean;
  avatarUrl: string | null;
  createdAt: string | null;
};

type PublicPlayerProfileRow = {
  id: string;
  display_name: string;
  player_name: string;
  country: string | null;
  region: string | null;
  current_elo: number | null;
  optional_profile_enabled: boolean;
  discord_public_enabled: boolean;
  discord_username: string | null;
  has_avatar: boolean;
  avatar_url: string | null;
  created_at: string | null;
};

const PUBLIC_PLAYER_PROFILE_COLUMNS = [
  "id",
  "display_name",
  "player_name",
  "country",
  "region",
  "current_elo",
  "optional_profile_enabled",
  "discord_public_enabled",
  "discord_username",
  "has_avatar",
  "avatar_url",
  "created_at",
].join(", ");

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function getPublicPlayers(): Promise<PublicPlayerProfile[]> {
  const supabase = createNoStoreSupabaseClient();
  const { data, error } = await supabase
    .from("public_player_profiles")
    .select(PUBLIC_PLAYER_PROFILE_COLUMNS)
    .order("current_elo", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false, nullsFirst: false })
    .order("id", { ascending: true });

  if (error || !Array.isArray(data)) {
    console.error("Public players load failed.");
    throw new Error("Public players could not be loaded.");
  }

  return (data as unknown as PublicPlayerProfileRow[]).map(
    mapPublicPlayerProfile
  );
}

export async function getPublicPlayerById(
  playerId: string
): Promise<PublicPlayerProfile | null> {
  if (!UUID_PATTERN.test(playerId)) {
    return null;
  }

  const supabase = createNoStoreSupabaseClient();
  const { data, error } = await supabase
    .from("public_player_profiles")
    .select(PUBLIC_PLAYER_PROFILE_COLUMNS)
    .eq("id", playerId)
    .maybeSingle();

  if (error) {
    console.error("Public player profile load failed:", error);
    return null;
  }

  return data
    ? mapPublicPlayerProfile(data as unknown as PublicPlayerProfileRow)
    : null;
}

function mapPublicPlayerProfile(
  row: PublicPlayerProfileRow
): PublicPlayerProfile {
  const discordUsername = row.discord_username?.trim() || null;
  const discordPublicEnabled =
    row.discord_public_enabled && discordUsername !== null;
  const optionalProfileEnabled = row.optional_profile_enabled === true;

  return {
    id: row.id,
    displayName: optionalProfileEnabled ? row.display_name : row.player_name,
    playerName: row.player_name,
    country: optionalProfileEnabled ? row.country : null,
    region: row.region,
    currentElo: row.current_elo,
    publicProfileEnabled: true,
    optionalProfileEnabled,
    discordPublicEnabled,
    discordUsername: discordPublicEnabled ? discordUsername : null,
    hasAvatar: optionalProfileEnabled && row.has_avatar,
    avatarUrl: optionalProfileEnabled && row.has_avatar ? `/players/${row.id}/avatar` : null,
    createdAt: optionalProfileEnabled ? row.created_at : null,
  };
}
