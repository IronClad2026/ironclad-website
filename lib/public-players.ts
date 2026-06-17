import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export type PublicPlayerProfile = {
  id: string;
  displayName: string;
  playerName: string;
  country: string | null;
  region: string | null;
  currentElo: number | null;
  publicProfileEnabled: boolean;
  discordPublicEnabled: boolean;
  discordUsername: string | null;
  hasAvatar: boolean;
  avatarUrl: string | null;
  createdAt: string;
};

type PublicPlayerProfileRow = {
  id: string;
  display_name: string;
  player_name: string;
  country: string | null;
  region: string | null;
  current_elo: number | null;
  public_profile_enabled: boolean;
  discord_public_enabled: boolean;
  discord_username: string | null;
  has_avatar: boolean;
  avatar_url: string | null;
  created_at: string;
};

const PUBLIC_PLAYER_PROFILE_COLUMNS = [
  "id",
  "display_name",
  "player_name",
  "country",
  "region",
  "current_elo",
  "public_profile_enabled",
  "discord_public_enabled",
  "discord_username",
  "has_avatar",
  "avatar_url",
  "created_at",
].join(", ");

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function getPublicPlayers(): Promise<PublicPlayerProfile[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("public_player_profiles")
    .select(PUBLIC_PLAYER_PROFILE_COLUMNS)
    .order("current_elo", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Public players load failed:", error);
    return [];
  }

  return ((data ?? []) as unknown as PublicPlayerProfileRow[]).map(
    mapPublicPlayerProfile
  );
}

export async function getPublicPlayerById(
  playerId: string
): Promise<PublicPlayerProfile | null> {
  if (!UUID_PATTERN.test(playerId)) {
    return null;
  }

  const supabase = createSupabaseAdminClient();
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
  return {
    id: row.id,
    displayName: row.display_name,
    playerName: row.player_name,
    country: row.country,
    region: row.region,
    currentElo: row.current_elo,
    publicProfileEnabled: row.public_profile_enabled,
    discordPublicEnabled: row.discord_public_enabled,
    discordUsername: row.discord_public_enabled ? row.discord_username : null,
    hasAvatar: row.has_avatar,
    avatarUrl: row.has_avatar ? `/players/${row.id}/avatar` : null,
    createdAt: row.created_at,
  };
}
