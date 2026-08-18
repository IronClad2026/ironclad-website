export type PlayerProfile = {
  id: string;
  clerk_user_id: string;
  display_name: string;
  in_game_name: string;
  discord_username: string | null;
  steam_username: string | null;
  coh3_player_card_url: string | null;
  coh3_profile_id?: string | null;
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
  | "country"
  | "region"
  | "timezone"
> & {
  steam_id64: string | null;
};

export function isPlayerProfileComplete(
  profile: Partial<PlayerProfileCompletionData> | null | undefined
) {
  if (!profile) {
    return false;
  }

  return Boolean(
    hasText(profile.avatar_url) &&
      (hasText(profile.display_name) || hasText(profile.in_game_name)) &&
      hasText(profile.steam_id64) &&
      hasText(profile.country) &&
      hasText(profile.region) &&
      hasText(profile.timezone)
  );
}

export function isPlayerProfileTournamentReady(
  profile: Partial<PlayerProfileCompletionData> | null | undefined,
  eloVerificationEnabled: boolean
) {
  void eloVerificationEnabled;
  return isPlayerProfileComplete(profile);
}

function hasText(value: string | null | undefined) {
  return Boolean(value?.trim());
}

export type ProfileField =
  | "avatar"
  | "displayName"
  | "inGameName"
  | "discordUsername"
  | "country"
  | "region"
  | "timezone"
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
