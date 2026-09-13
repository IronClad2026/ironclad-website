import { auth } from "@clerk/nextjs/server";
import { MapPin } from "lucide-react";
import { redirect } from "next/navigation";
import DashboardNotifications from "@/components/DashboardNotifications";
import DashboardBadgesSection from "@/components/badges/DashboardBadgesSection";
import DiscordContactVisibilityCard from "@/components/DiscordContactVisibilityCard";
import PublicProfileVisibilityCard from "@/components/PublicProfileVisibilityCard";
import PlayerDivisionInvitations from "@/components/PlayerDivisionInvitations";
import PollsAndDecisions from "@/components/PollsAndDecisions";
import { acknowledgeBadgeReveal } from "@/app/dashboard/badge-reveal-actions";
import { loadPlayerBadgeRevealDashboardState } from "@/lib/badges/reveals";
import InAppNotificationCenter from "@/components/InAppNotificationCenter";
import { loadPlayerNotifications } from "@/lib/notifications";
import { formatDashboardRegistrationCount } from "@/lib/i18n/dashboard-count";
import { loadDictionaries } from "@/lib/i18n/loaders";
import { getRequestLocale } from "@/lib/i18n/request";
import { translate } from "@/lib/i18n/translate";
import type { MessageValues } from "@/lib/i18n/types";
import { loadCommunityPollsForRequest } from "@/lib/player-polls";
import { loadPlayerCareerDashboard } from "@/lib/player-dashboard";
import { getPlayerShowcaseEnabled } from "@/lib/player-showcase/read";
import { loadPlayerTournamentDivisionInvitations } from "@/lib/tournament-division-invitations";
import {
  type PlayerProfile,
} from "@/lib/player-profile";
import { createAuthenticatedSupabaseClient } from "@/lib/supabase-server";
import type { TournamentStatus } from "@/lib/tournaments";
import DashboardIdentity from "@/components/dashboard/DashboardIdentity";
import DashboardCareerHistory from "@/components/dashboard/DashboardCareerHistory";
import DashboardPerformance from "@/components/dashboard/DashboardPerformance";
import { EmptyRegistrations, RegistrationCard } from "@/components/dashboard/DashboardRegistrations";
import { groupDashboardRegistrations, type PlayerRegistration } from "@/components/dashboard/registration-presentation";

export const dynamic = "force-dynamic";

type DashboardTranslator = (
  path: string,
  values?: MessageValues
) => string;

type PlayerRegistrationRow = Omit<
  PlayerRegistration,
  "launched_at" | "tournament_status"
> & {
  tournament_brackets?:
    | { launched_at: string | null }
    | { launched_at: string | null }[];
  tournaments?:
    | { status: TournamentStatus }
    | { status: TournamentStatus }[];
};

export default async function PlayerDashboardPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  const locale = await getRequestLocale();
  const dictionaries = await loadDictionaries(
    locale,
    ["account-dashboard", "badges"] as const
  );
  const t: DashboardTranslator = (path, values) =>
    translate(dictionaries["account-dashboard"], path, values);

  const supabase = await createAuthenticatedSupabaseClient();
  const [
    profileResult,
    registrationsResult,
    career,
    playerNotifications,
    communityPolls,
    showcaseEnabled,
  ] =
    await Promise.all([
      supabase
        .from("players")
        .select(
          "id, clerk_user_id, display_name, in_game_name, discord_username, steam_username, coh3_player_card_url, country, region, timezone, current_elo, avatar_url, bio, profile_completed, public_profile_enabled, discord_public_enabled, created_at, updated_at"
        )
        .eq("clerk_user_id", userId)
        .maybeSingle(),
      supabase
        .from("registrations")
        .select(
          "id, tournament_title, tournament_bracket_id, bracket_name, registration_status, elo_status, submitted_elo, withdrawn_at, waitlist_offer_status, waitlist_offer_created_at, waitlist_offer_expires_at, waitlist_offer_resolved_at, created_at, tournament_brackets!inner(launched_at), tournaments!inner(status)"
        )
        .eq("clerk_user_id", userId)
        .order("created_at", { ascending: false }),
      loadPlayerCareerDashboard(userId, locale),
      loadPlayerNotifications(userId, 8, locale),
      loadCommunityPollsForRequest(),
      getPlayerShowcaseEnabled(),
    ]);

  if (profileResult.error) {
    console.error("Dashboard profile load error:", profileResult.error);
  }

  if (registrationsResult.error) {
    console.error(
      "Dashboard registrations load error:",
      registrationsResult.error
    );
  }

  const profile = (profileResult.data ?? null) as PlayerProfile | null;
  const registrations = ((registrationsResult.data ??
    []) as PlayerRegistrationRow[]).map((registration) => ({
    ...registration,
    launched_at: first(registration.tournament_brackets)?.launched_at ?? null,
    tournament_status:
      first(registration.tournaments)?.status ?? "upcoming",
  }));
  const divisionInvitationState =
    profileResult.error
      ? { status: "error" as const, invitations: [] }
      : !profile
        ? { status: "success" as const, invitations: [] }
        : await loadPlayerTournamentDivisionInvitations(userId, profile.id);
  const badgeRevealState = profileResult.error
    ? { status: "error" as const, code: "award-load-failed" as const }
    : await loadPlayerBadgeRevealDashboardState(
        supabase,
        profile?.id ?? null
      );
  const badgeLoadError =
    badgeRevealState.status === "error" &&
    badgeRevealState.code === "award-load-failed"
      ? dictionaries.badges.dashboard.loadErrorDescription
      : null;
  const badgeRevealLoadError =
    badgeRevealState.status === "error" &&
    badgeRevealState.code === "reveal-load-failed"
      ? dictionaries.badges.dashboard.loadErrorDescription
      : null;

  const { current: currentRegistrations, previous: previousRegistrations } =
    groupDashboardRegistrations(registrations);
  const previousRegistrationNodes = previousRegistrations.map((registration) => (
    <RegistrationCard key={registration.id} registration={registration} locale={locale} t={t} />
  ));

  return (
    <main
      className="min-h-screen bg-black bg-cover bg-center bg-fixed px-4 pb-16 pt-24 text-white sm:px-6 sm:pt-28 lg:pb-20 lg:pt-28"
      data-dashboard-command-centre
      style={{
        backgroundImage:
          "linear-gradient(180deg,rgba(0,0,0,0.9),rgba(0,0,0,0.76) 44%,rgba(0,0,0,0.94)),linear-gradient(110deg,rgba(0,0,0,0.94),rgba(0,0,0,0.62),rgba(249,115,22,0.12),rgba(0,0,0,0.92)),url('/images/sfondi/7.jpg')",
        backgroundAttachment: "fixed",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        backgroundSize: "cover",
      }}
    >
      <div className="relative z-10 mx-auto max-w-7xl">
        <DashboardIdentity profile={profile} error={Boolean(profileResult.error)} locale={locale} t={t} showcaseEnabled={showcaseEnabled} />

        <div className="mt-6 grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(280px,0.48fr)]" data-dashboard-section="current-actions">
          <section className="min-w-0" aria-labelledby="dashboard-competition-title">
            <div className="mb-4">
              <h2 id="dashboard-competition-title" className="text-xl font-black tracking-tight text-white sm:text-2xl">
                {t("dashboard.competition.title")}
              </h2>
            </div>
            <DashboardNotifications
              key={[
                locale,
                ...career.notifications.map(
                  (notification) => `${notification.id}:${notification.status}`
                ),
              ].join("|")}
              presentation="competition"
              notifications={career.notifications}
              error={
                career.error
                  ? t(
                      career.error === "load-failed"
                        ? "dashboard.career.loadError"
                        : "dashboard.career.partialError"
                    )
                  : null
              }
            />
            <section className="mt-5" data-dashboard-section="registrations" aria-labelledby="dashboard-registrations-title">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 id="dashboard-registrations-title" className="text-base font-bold text-zinc-200">
                  {t("dashboard.competition.registrations")}
                </h3>
                {!registrationsResult.error && (
                  <p className="text-xs text-zinc-400">
                    {formatDashboardRegistrationCount(currentRegistrations.length, locale, t)}
                  </p>
                )}
              </div>
              {registrationsResult.error ? (
                <div className="mt-3"><DashboardError message={t("dashboard.registrations.loadError")} /></div>
              ) : currentRegistrations.length === 0 ? (
                <EmptyRegistrations t={t} />
              ) : (
                <div className="mt-3 grid gap-3">
                  {currentRegistrations.map((registration) => (
                    <RegistrationCard key={registration.id} registration={registration} locale={locale} t={t} />
                  ))}
                </div>
              )}
            </section>
            <PlayerDivisionInvitations
              invitations={divisionInvitationState.invitations}
              loadError={divisionInvitationState.status === "error"}
            />
          </section>
          <aside className="min-w-0" aria-label={t("dashboard.competition.updates")}>
            <InAppNotificationCenter
              key={[
                locale,
                playerNotifications.unreadCount,
                ...playerNotifications.notifications.map(
                  (notification) =>
                    `${notification.id}:${notification.readAt ?? ""}`
                ),
              ].join("|")}
              scope="player"
              presentation="dashboard"
              title={t("dashboard.competition.updates")}
              eyebrow={t("dashboard.notificationCenter.eyebrow")}
              description={t("dashboard.notificationCenter.description")}
              emptyMessage={t("dashboard.notificationCenter.empty")}
              notifications={playerNotifications.notifications}
              totalCount={playerNotifications.totalCount}
              unreadCount={playerNotifications.unreadCount}
              error={playerNotifications.error}
            />
          </aside>
        </div>

        {!career.error && (
          <DashboardPerformance
            statistics={career.statistics}
            locale={locale}
            t={t}
          />
        )}

        <DashboardBadgesSection
          badgeData={
            badgeRevealState.status === "success"
              ? badgeRevealState.badgeData
              : null
          }
          pendingReveals={
            badgeRevealState.status === "success"
              ? badgeRevealState.pendingReveals
              : []
          }
          acknowledgeRevealAction={acknowledgeBadgeReveal}
          loadError={badgeLoadError}
          revealLoadError={badgeRevealLoadError}
          dictionary={dictionaries.badges}
          locale={locale}
        />

        <DashboardCareerHistory
          matches={career.matchHistory}
          champions={career.champions}
          previousRegistrations={<div className="grid gap-3">{previousRegistrationNodes}</div>}
          previousRegistrationCount={previousRegistrations.length}
          loadError={career.error ? t(
            career.error === "load-failed"
              ? "dashboard.career.loadError"
              : "dashboard.career.partialError"
          ) : null}
          registrationLoadError={registrationsResult.error ? t("dashboard.registrations.loadError") : null}
        />

        <div
          id="community-polls"
          className="mt-8 scroll-mt-28"
          data-dashboard-section="community"
        >
          <PollsAndDecisions
            surface="community"
            density="compact"
            initialPolls={communityPolls.polls}
            initialError={communityPolls.error}
          />
        </div>

        {profile && (
          <section className="mt-8" aria-labelledby="dashboard-visibility-title" data-dashboard-section="profile-visibility">
            <h2 id="dashboard-visibility-title" className="text-xl font-bold text-white sm:text-2xl">
              {t("dashboard.utilities.title")}
            </h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <PublicProfileVisibilityCard initialEnabled={Boolean(profile.public_profile_enabled)} />
              <DiscordContactVisibilityCard
                initialEnabled={Boolean(profile.discord_public_enabled)}
                hasDiscordUsername={Boolean(profile.discord_username?.trim())}
              />
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

function DashboardError({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-3 border border-red-500/35 bg-red-500/10 p-5 text-red-300 shadow-xl shadow-black/20 backdrop-blur">
      <MapPin size={20} className="shrink-0" />
      <p>{message}</p>
    </div>
  );
}

function first<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}
