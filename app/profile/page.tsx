import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import PlayerProfileForm from "@/components/PlayerProfileForm";
import DeleteAccountSection from "@/components/DeleteAccountSection";
import {
  isPlayerProfileComplete,
  type PlayerProfile,
} from "@/lib/player-profile";
import { createAuthenticatedSupabaseClient } from "@/lib/supabase-server";

export default async function ProfilePage() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

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
  const profileComplete = isPlayerProfileComplete(profile);

  return (
    <main className="min-h-screen bg-black px-6 pt-32 pb-20 text-white">
      <section className="mx-auto max-w-5xl">
        <div
          className="relative overflow-hidden rounded-3xl border border-orange-500/30 bg-cover bg-center p-8 shadow-2xl md:p-10"
          style={{ backgroundImage: "url('/images/ironclad-background.jpg')" }}
        >
          <div className="absolute inset-0 bg-black/80" />
          <div className="absolute inset-0 bg-gradient-to-r from-black via-black/85 to-orange-950/40" />

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
          <div className="mt-8 rounded-2xl border border-red-500/30 bg-red-500/10 p-5 text-red-300">
            Your player profile could not be loaded. Refresh the page and try
            again.
          </div>
        ) : (
          <div className="mt-8">
            <PlayerProfileForm profile={profile} />
            <DeleteAccountSection />
          </div>
        )}
      </section>
    </main>
  );
}
