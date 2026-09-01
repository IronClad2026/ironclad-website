import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { acknowledgeBadgeReveal } from "@/app/dashboard/badge-reveal-actions";
import DashboardBadgeCollection from "@/components/badges/DashboardBadgeCollection";
import { loadPlayerBadgeRevealDashboardState } from "@/lib/badges/reveals";
import { loadDictionary } from "@/lib/i18n/loaders";
import { getRequestLocale } from "@/lib/i18n/request";
import { createAuthenticatedSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const dictionary = await loadDictionary(await getRequestLocale(), "badges");

  return {
    title: dictionary.metadata.pageTitle,
    description: dictionary.metadata.pageDescription,
  };
}

export default async function DashboardBadgeCollectionPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  const locale = await getRequestLocale();
  const dictionary = await loadDictionary(locale, "badges");
  const supabase = await createAuthenticatedSupabaseClient();
  const { data: player, error: playerError } = await supabase
    .from("players")
    .select("id")
    .eq("clerk_user_id", userId)
    .maybeSingle();

  if (playerError) {
    console.error("Dashboard Badge collection player load failed.", {
      operation: "dashboard-badge-player-load",
      code:
        typeof playerError.code === "string"
          ? playerError.code
          : "PLAYER_LOAD_FAILED",
    });
  }

  const playerId =
    !playerError && typeof player?.id === "string" ? player.id : null;
  const state = playerError
    ? { status: "error" as const, code: "award-load-failed" as const }
    : await loadPlayerBadgeRevealDashboardState(supabase, playerId);
  const loadError =
    state.status === "error" && state.code === "award-load-failed"
      ? dictionary.dashboard.loadErrorDescription
      : null;
  const revealLoadError =
    state.status === "error" && state.code === "reveal-load-failed"
      ? dictionary.dashboard.loadErrorDescription
      : null;

  return (
    <main
      className="min-h-screen overflow-x-hidden bg-black bg-cover bg-center bg-fixed px-4 pt-32 pb-20 text-white sm:px-6 lg:px-8"
      style={{
        backgroundImage:
          "linear-gradient(180deg,rgba(0,0,0,0.92),rgba(0,0,0,0.78) 44%,rgba(0,0,0,0.95)),linear-gradient(110deg,rgba(0,0,0,0.94),rgba(0,0,0,0.62),rgba(249,115,22,0.11),rgba(0,0,0,0.92)),url('/images/sfondi/7.jpg')",
        backgroundAttachment: "fixed",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        backgroundSize: "cover",
      }}
    >
      <DashboardBadgeCollection
        badgeData={state.status === "success" ? state.badgeData : null}
        pendingReveals={
          state.status === "success" ? state.pendingReveals : []
        }
        acknowledgeRevealAction={acknowledgeBadgeReveal}
        loadError={loadError}
        revealLoadError={revealLoadError}
        dictionary={dictionary}
        locale={locale}
      />
    </main>
  );
}
