export type PlayerProfile = {
  id: string;
  clerk_user_id: string;
  display_name: string;
  in_game_name: string;
  discord_username: string | null;
  steam_username: string | null;
  coh3_player_card_url: string | null;
  country: string | null;
  region: string | null;
  timezone: string | null;
  current_elo: number | null;
  avatar_url: string | null;
  bio: string | null;
  public_profile_enabled?: boolean;
  discord_public_enabled?: boolean;
  profile_completed: boolean;
  created_at: string;
  updated_at: string;
};

export type PlayerProfileCompletionData = Pick<
  PlayerProfile,
  | "avatar_url"
  | "display_name"
  | "in_game_name"
  | "discord_username"
  | "steam_username"
  | "coh3_player_card_url"
  | "country"
  | "region"
  | "timezone"
  | "current_elo"
>;

export function isPlayerProfileComplete(
  profile: Partial<PlayerProfileCompletionData> | null | undefined
) {
  if (!profile) {
    return false;
  }

  return Boolean(
    hasText(profile.avatar_url) &&
      (hasText(profile.display_name) || hasText(profile.in_game_name)) &&
      hasText(profile.discord_username) &&
      hasText(profile.steam_username) &&
      hasText(profile.country) &&
      hasText(profile.region) &&
      hasText(profile.timezone) &&
      Number.isInteger(profile.current_elo) &&
      Number(profile.current_elo) >= 0 &&
      Number(profile.current_elo) <= 5000
  );
}

export function isPlayerProfileTournamentReady(
  profile: Partial<PlayerProfileCompletionData> | null | undefined,
  eloVerificationEnabled: boolean
) {
  return Boolean(
    isPlayerProfileComplete(profile) &&
      (!eloVerificationEnabled || hasText(profile?.coh3_player_card_url))
  );
}

function hasText(value: string | null | undefined) {
  return Boolean(value?.trim());
}

export type ProfileField =
  | "avatar"
  | "displayName"
  | "inGameName"
  | "discordUsername"
  | "steamUsername"
  | "coh3PlayerCardUrl"
  | "country"
  | "region"
  | "timezone"
  | "currentElo"
  | "bio";

export type ProfileActionState = {
  status: "idle" | "error" | "success";
  message: string;
  errors: Partial<Record<ProfileField, string>>;
};

export const initialProfileActionState: ProfileActionState = {
  status: "idle",
  message: "",
  errors: {},
};
