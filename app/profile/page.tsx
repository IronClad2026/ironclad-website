import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import PlayerProfileForm from "@/components/PlayerProfileForm";
import DeleteAccountSection from "@/components/DeleteAccountSection";
import RelicEloVerificationCard from "@/components/RelicEloVerificationCard";
import SteamConnectionCard from "@/components/SteamConnectionCard";
import { getOwnActiveTournamentEloSnapshots } from "@/lib/active-tournament-elo-snapshots";
import { getIronCladDivision } from "@/lib/elo-verification/divisions";
import {
  isPlayerProfileComplete,
  type PlayerProfile,
} from "@/lib/player-profile";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { createAuthenticatedSupabaseClient } from "@/lib/supabase-server";

type SteamConnectionResult =
  | "connected"
  | "cancelled"
  | "already-connected"
  | "duplicate"
  | "failed";

type ProfilePageProps = {
  searchParams: Promise<{
    steam?: string | string[];
  }>;
};

type ProfilePagePlayer = Omit<
  PlayerProfile,
  "coh3_player_card_url" | "current_elo"
>;

type ProtectedProfileData = {
  steam_id64: unknown;
  relic_verified_elo: unknown;
  relic_verified_faction: unknown;
  relic_verified_division: unknown;
  relic_elo_calculation_version: unknown;
  relic_elo_verified_at: unknown;
  relic_elo_last_attempt_at: unknown;
};

type RelicVerification = {
  elo: number;
  faction: string;
  division: string;
  calculationVersion: string;
  verifiedAt: string;
};

const relicFactions = new Set([
  "US Forces",
  "British Forces",
  "Deutsches Afrikakorps",
  "Wehrmacht",
]);
const relicRefreshCooldownMilliseconds = 15 * 60 * 1000;

const steamConnectionResults = new Set<SteamConnectionResult>([
  "connected",
  "cancelled",
  "already-connected",
  "duplicate",
  "failed",
]);

function getSteamConnectionResult(
  value: string | string[] | undefined
): SteamConnectionResult | null {
  if (typeof value !== "string") {
    return null;
  }

  return steamConnectionResults.has(value as SteamConnectionResult)
    ? (value as SteamConnectionResult)
    : null;
}

function getRelicVerification(
  protectedProfile: ProtectedProfileData | null
): RelicVerification | null {
  const elo = parseRelicElo(protectedProfile?.relic_verified_elo);

  if (!protectedProfile || elo === null) {
    return null;
  }

  const expectedDivision = getIronCladDivision(elo);

  if (
    !expectedDivision.ok ||
    typeof protectedProfile.steam_id64 !== "string" ||
    protectedProfile.steam_id64.length === 0 ||
    typeof protectedProfile.relic_verified_faction !== "string" ||
    !relicFactions.has(protectedProfile.relic_verified_faction) ||
    typeof protectedProfile.relic_verified_division !== "string" ||
    protectedProfile.relic_verified_division !== expectedDivision.division ||
    typeof protectedProfile.relic_elo_calculation_version !== "string" ||
    protectedProfile.relic_elo_calculation_version.trim().length === 0 ||
    typeof protectedProfile.relic_elo_verified_at !== "string" ||
    !Number.isFinite(Date.parse(protectedProfile.relic_elo_verified_at))
  ) {
    return null;
  }

  return {
    elo,
    faction: protectedProfile.relic_verified_faction,
    division: protectedProfile.relic_verified_division,
    calculationVersion: protectedProfile.relic_elo_calculation_version,
    verifiedAt: protectedProfile.relic_elo_verified_at,
  };
}

function parseRelicElo(value: unknown): number | null {
  const numericValue =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^\d+$/.test(value)
        ? Number(value)
        : Number.NaN;

  return (
    Number.isSafeInteger(numericValue) &&
    numericValue >= 0 &&
    numericValue <= 5000
  )
    ? numericValue
    : null;
}

function getRefreshAvailableAt(lastAttemptAt: unknown): string | null {
  if (typeof lastAttemptAt !== "string") {
    return null;
  }

  const lastAttemptTimestamp = Date.parse(lastAttemptAt);

  if (!Number.isFinite(lastAttemptTimestamp)) {
    return null;
  }

  return new Date(
    lastAttemptTimestamp + relicRefreshCooldownMilliseconds
  ).toISOString();
}

export default async function ProfilePage({ searchParams }: ProfilePageProps) {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  const { steam } = await searchParams;
  const steamConnectionResult = getSteamConnectionResult(steam);
  const supabase = await createAuthenticatedSupabaseClient();

  const { data, error } = await supabase
    .from("players")
    .select(
      "id, clerk_user_id, display_name, in_game_name, discord_username, steam_username, country, region, timezone, avatar_url, bio, profile_completed, created_at, updated_at"
    )
    .eq("clerk_user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("Player profile load error:", error);
  }

  const profile = (data ?? null) as ProfilePagePlayer | null;
  let steamConnected = false;
  let steamStatusAvailable = true;
  let initialVerification: RelicVerification | null = null;
  let initialRefreshAvailableAt: string | null = null;
  let activeTournamentEloSnapshots: Awaited<
    ReturnType<typeof getOwnActiveTournamentEloSnapshots>
  > = [];

  if (profile) {
    activeTournamentEloSnapshots =
      await getOwnActiveTournamentEloSnapshots(supabase, userId);

    try {
      const { data: protectedProfileData, error: protectedProfileError } =
        await createSupabaseAdminClient()
          .from("players")
          .select(
            "steam_id64, relic_verified_elo, relic_verified_faction, relic_verified_division, relic_elo_calculation_version, relic_elo_verified_at, relic_elo_last_attempt_at"
          )
          .eq("clerk_user_id", userId)
          .maybeSingle();

      if (protectedProfileError) {
        steamStatusAvailable = false;
        console.error("Protected profile status lookup failed.");
      } else {
        const protectedProfile =
          (protectedProfileData as ProtectedProfileData | null) ?? null;

        steamConnected =
          typeof protectedProfile?.steam_id64 === "string" &&
          protectedProfile.steam_id64.length > 0;
        initialVerification = getRelicVerification(protectedProfile);
        initialRefreshAvailableAt = getRefreshAvailableAt(
          protectedProfile?.relic_elo_last_attempt_at ?? null
        );
      }
    } catch {
      steamStatusAvailable = false;
      console.error("Protected profile status is not configured.");
    }
  }

  const profileComplete = isPlayerProfileComplete(profile);

  return (
    <main
      className="min-h-screen bg-black bg-cover bg-center bg-fixed px-6 pt-32 pb-20 text-white"
      style={{
        backgroundImage:
          "linear-gradient(180deg,rgba(0,0,0,0.9),rgba(0,0,0,0.76) 44%,rgba(0,0,0,0.94)),linear-gradient(110deg,rgba(0,0,0,0.94),rgba(0,0,0,0.62),rgba(249,115,22,0.12),rgba(0,0,0,0.92)),url('/images/sfondi/8.jpg')",
        backgroundAttachment: "fixed",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        backgroundSize: "cover",
      }}
    >
      <section className="relative z-10 mx-auto max-w-5xl">
        <div className="relative overflow-hidden border border-orange-500/25 bg-black/70 p-8 shadow-[0_0_45px_rgba(0,0,0,0.55)] backdrop-blur md:p-10">
          <div
            className="absolute inset-0 bg-cover bg-center opacity-55"
            style={{ backgroundImage: "url('/images/ironclad-background.jpg')" }}
          />
          <div className="absolute inset-0 bg-black/68" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.18),rgba(0,0,0,0.86)),linear-gradient(110deg,rgba(0,0,0,0.94),rgba(0,0,0,0.58),rgba(249,115,22,0.15),rgba(0,0,0,0.9))]" />
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.045)_1px,transparent_1px)] bg-[length:52px_52px] opacity-25" />

          <div className="relative z-10 max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.35em] text-orange-400">
              IronClad Player Account
            </p>

            <h1 className="mt-4 text-4xl font-bold tracking-tight md:text-6xl">
              {profile ? "Manage Player Profile" : "Complete Player Profile"}
            </h1>

            <p className="mt-5 leading-7 text-zinc-300">
              Store your competitive identity once so future IronClad
              tournament registrations can be faster and more consistent.
            </p>

            <div className="mt-6 inline-flex rounded-full border border-white/10 bg-black/40 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-zinc-300">
              {profileComplete
                ? "Profile Complete"
                : "Profile Setup Required"}
            </div>
          </div>
        </div>

        {error ? (
          <div className="mt-8 border border-red-500/30 bg-red-500/10 p-5 text-red-300 shadow-2xl shadow-black/30 backdrop-blur">
            Your player profile could not be loaded. Refresh the page and try
            again.
          </div>
        ) : (
          <div className="mt-8">
            <PlayerProfileForm
              profile={profile}
              verifiedCurrentElo={initialVerification?.elo ?? null}
              activeTournamentEloSnapshots={activeTournamentEloSnapshots}
            />

            <SteamConnectionCard
              connected={steamConnected}
              hasPlayer={Boolean(profile)}
              result={steamConnectionResult}
              statusAvailable={steamStatusAvailable}
            />

            <RelicEloVerificationCard
              hasPlayer={Boolean(profile)}
              steamConnected={steamConnected}
              statusAvailable={steamStatusAvailable}
              initialVerification={initialVerification}
              initialRefreshAvailableAt={initialRefreshAvailableAt}
            />

            <DeleteAccountSection />
          </div>
        )}
      </section>
    </main>
  );
}
