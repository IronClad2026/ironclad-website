import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import PlayerProfileForm from "@/components/PlayerProfileForm";
import DeleteAccountSection from "@/components/DeleteAccountSection";
import SteamConnectionCard from "@/components/SteamConnectionCard";
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
      "id, clerk_user_id, display_name, in_game_name, discord_username, steam_username, coh3_player_card_url, country, region, timezone, current_elo, avatar_url, bio, profile_completed, created_at, updated_at"
    )
    .eq("clerk_user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("Player profile load error:", error);
  }

  const profile = (data ?? null) as PlayerProfile | null;
  let steamConnected = false;
  let steamStatusAvailable = true;

  if (profile) {
    try {
      const { data: steamIdentity, error: steamIdentityError } =
        await createSupabaseAdminClient()
          .from("players")
          .select("steam_id64")
          .eq("clerk_user_id", userId)
          .maybeSingle();

      if (steamIdentityError) {
        steamStatusAvailable = false;
        console.error("Steam connection status lookup failed.");
      } else {
        steamConnected =
          typeof steamIdentity?.steam_id64 === "string" &&
          steamIdentity.steam_id64.length > 0;
      }
    } catch {
      steamStatusAvailable = false;
      console.error("Steam connection status is not configured.");
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
            <PlayerProfileForm profile={profile} />

            <SteamConnectionCard
              connected={steamConnected}
              hasPlayer={Boolean(profile)}
              result={steamConnectionResult}
              statusAvailable={steamStatusAvailable}
            />

            <DeleteAccountSection />
          </div>
        )}
      </section>
    </main>
  );
}