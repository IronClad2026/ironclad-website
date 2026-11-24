import { auth } from "@clerk/nextjs/server";
import { ArrowUpRight, Award, ChevronDown, ChevronRight, ClipboardList, Eye, Flag, Images, ListChecks, MapPin, UserRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import DashboardNotifications from "@/components/DashboardNotifications";
import DashboardBadgesSection from "@/components/badges/DashboardBadgesSection";
import DiscordContactVisibilityCard from "@/components/DiscordContactVisibilityCard";
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
import { isReadyWardrobePilotEnabled } from "@/lib/wardrobe/environment";
import DashboardIdentity from "@/components/dashboard/DashboardIdentity";
import DashboardCareerHistory from "@/components/dashboard/DashboardCareerHistory";
import DashboardRegistrationNavigation from "@/components/dashboard/DashboardRegistrationNavigation";
import DashboardPerformance from "@/components/dashboard/DashboardPerformance";
import DashboardOverviewEvent from "@/components/dashboard/DashboardOverviewEvent";
import { loadDashboardOverviewEvents } from "@/components/dashboard/overview-event-data";
import { buildDashboardOverviewEvent } from "@/components/dashboard/overview-event-presentation";
import { EmptyRegistrations, RegistrationCard } from "@/components/dashboard/DashboardRegistrations";
import { groupDashboardRegistrations, type PlayerRegistration } from "@/components/dashboard/registration-presentation";
import { getCompetitionPriority, type CompetitionSection } from "@/components/dashboard/competition-presentation";
import DashboardSections from "./DashboardSections";
import styles from "./Dashboard.module.css";

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
    eventState,
  ] =
    await Promise.all([
      supabase
        .from("players")
        .select(
          "id, clerk_user_id, display_name, in_game_name, discord_username, steam_username, coh3_player_card_url, country, region, timezone, current_elo, avatar_url, bio, profile_completed, discord_public_enabled, created_at, updated_at"
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
      loadDashboardOverviewEvents(),
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
  const [divisionInvitationState, badgeRevealState] = await Promise.all([
    profileResult.error
      ? { status: "error" as const, invitations: [] }
      : !profile
        ? { status: "success" as const, invitations: [] }
        : loadPlayerTournamentDivisionInvitations(userId, profile.id),
    profileResult.error
      ? { status: "error" as const, code: "award-load-failed" as const }
      : loadPlayerBadgeRevealDashboardState(
        supabase,
        profile?.id ?? null
      ),
  ]);
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

  const { current: currentRegistrations, previous: pastRegistrations } =
    groupDashboardRegistrations(registrations);
  const spotlight = buildDashboardOverviewEvent({
    notifications: career.notifications,
    registrations: currentRegistrations,
    events: eventState.events,
    profileCompleted: profile?.profile_completed === true,
  });
  const priority = getCompetitionPriority(
    career.error ? [] : career.notifications,
    currentRegistrations,
    divisionInvitationState.invitations,
  );
  const sections: CompetitionSection[] = ["registrations", "invitations", "matches"];
  const competitionOrder = priority
    ? [priority.section, ...sections.filter(section => section !== priority.section)]
    : sections;
  const visibleRegistrations = priority?.registrationId
    ? [...currentRegistrations].sort((left, right) =>
      Number(right.id === priority.registrationId) - Number(left.id === priority.registrationId))
    : currentRegistrations;
  const competition = {
    matches: <div id="dashboard-match-actions" className={styles.anchor}><DashboardNotifications
      key={[locale, ...career.notifications.map(notification => `${notification.id}:${notification.status}`)].join("|")}
      presentation="dashboard-overview"
      notifications={career.notifications}
      error={career.error ? t(career.error === "load-failed"
        ? "dashboard.career.loadError" : "dashboard.career.partialError") : null}
    /></div>,
    registrations: <DashboardDisclosure
      icon={Flag}
      title={t("dashboard.competition.registrations")}
      detail={registrationsResult.error ? undefined : formatDashboardRegistrationCount(currentRegistrations.length, locale, t)}
      open={priority?.section === "registrations" || Boolean(registrationsResult.error)}
      name="registrations"
    >
      {registrationsResult.error ? (
        <div className="mt-2"><DashboardError message={t("dashboard.registrations.loadError")} /></div>
      ) : visibleRegistrations.length === 0 ? (
        <EmptyRegistrations t={t} />
      ) : (
        <div className="mt-2 grid gap-2">
          {visibleRegistrations.map(registration => (
            <RegistrationCard key={registration.id} registration={registration} locale={locale} t={t} />
          ))}
        </div>
      )}
      {pastRegistrations.length > 0 && (
        <DashboardDisclosure icon={ClipboardList} title="Past registrations" detail={formatDashboardRegistrationCount(pastRegistrations.length, locale, t)}>
          <div className="grid gap-2">
            {pastRegistrations.map(registration => (
              <RegistrationCard key={registration.id} registration={registration} locale={locale} t={t} historical />
            ))}
          </div>
        </DashboardDisclosure>
      )}
    </DashboardDisclosure>,
    invitations: <DashboardDisclosure
      icon={ClipboardList}
      title={t("dashboard.competition.invitations")}
      open={priority?.section === "invitations" || divisionInvitationState.status === "error"}
    ><PlayerDivisionInvitations
      invitations={divisionInvitationState.invitations}
      loadError={divisionInvitationState.status === "error"}
    /></DashboardDisclosure>,
  };

  const careerError = career.error ? t(career.error === "load-failed"
    ? "dashboard.career.loadError" : "dashboard.career.partialError") : null;

  return (
    <main
      className={`${styles.dashboard} min-h-screen px-3 pb-16 pt-20 sm:px-6 sm:pt-24 lg:pb-20`}
      data-dashboard-command-centre
    >
      <DashboardRegistrationNavigation key={currentRegistrations.map(registration => registration.id).join("|")} />
      <DashboardSections
        wardrobeEnabled={isReadyWardrobePilotEnabled()}
        profileHref={profile ? `/players/${encodeURIComponent(profile.id)}` : null}
        introduction={<>
          <DashboardIdentity profile={profile} error={Boolean(profileResult.error)} locale={locale} t={t} />
          <DashboardOverviewEvent event={spotlight} locale={locale} />
        </>}
        overview={<div className={styles.overviewGrid} data-dashboard-section="current-actions">
          <section className={styles.panel} aria-labelledby="dashboard-competition-title">
            <div className={styles.panelHeading}>
              <h2 id="dashboard-competition-title">
                {t("dashboard.competition.title")}
              </h2>
              <Link
                href="/tournaments"
                className={styles.textAction}
              >
                {t("dashboard.profile.goTournaments")} <ArrowUpRight size={14} aria-hidden="true" />
              </Link>
            </div>
            <div>
              {competitionOrder.map(section => (
                <div key={section} data-competition-group={section}
                  className={priority?.section === section ? styles.priority : undefined}>
                  {competition[section]}
                </div>
              ))}
            </div>
          </section>
          <aside id="player-notifications" className={`${styles.anchor} ${styles.updates}`} aria-label={t("dashboard.competition.updates")}>
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
        </div>}
        hub={<div className={styles.hub}>
          <h1 className={styles.viewHeading}>Player hub</h1>
          {career.error
            ? <DashboardError message={careerError ?? t("dashboard.career.loadError")} />
            : <DashboardPerformance statistics={career.statistics} locale={locale} t={t} />}
          <div className={styles.hubGrid}>
            <section className={styles.panel} aria-labelledby="dashboard-career-community">
              <div className={styles.panelHeading}><h2 id="dashboard-career-community">Career &amp; community</h2></div>
              <DashboardDisclosure icon={Flag} title={t("dashboard.career.title")} description="Tournaments, championships and match details">
                <DashboardCareerHistory matches={career.matchHistory} champions={career.champions} loadError={careerError} />
              </DashboardDisclosure>
              <DashboardDisclosure icon={Award} title="Badge collection" description="Earned badges, details and pending reveals">
                <DashboardBadgesSection
              badgeData={badgeRevealState.status === "success" ? badgeRevealState.badgeData : null}
              pendingReveals={badgeRevealState.status === "success" ? badgeRevealState.pendingReveals : []}
              acknowledgeRevealAction={acknowledgeBadgeReveal}
              loadError={badgeLoadError}
              revealLoadError={badgeRevealLoadError}
              dictionary={dictionaries.badges}
              locale={locale}
                />
              </DashboardDisclosure>

              <DashboardDisclosure icon={ListChecks} title="Community polls" description="Ballots and published results">
                <div id="community-polls" className={styles.anchor} data-dashboard-section="community">
                  <PollsAndDecisions
                surface="community"
                density="compact"
                initialPolls={communityPolls.polls}
                initialError={communityPolls.error}
                  />
                </div>
              </DashboardDisclosure>
            </section>
            <section className={styles.panel} aria-labelledby="dashboard-profile-settings">
              <div className={styles.panelHeading}><h2 id="dashboard-profile-settings">Profile &amp; settings</h2></div>
              <DashboardLink icon={UserRound} href="/profile" title={t(profile?.profile_completed ? "dashboard.profile.viewEdit" : "dashboard.profile.complete")} description="Player details and linked accounts" />
              {showcaseEnabled && <DashboardLink icon={Images} href="/dashboard/showcase" title={t("showcase.manage")} description="Current Thought and featured achievement" />}
              {profile && <DashboardDisclosure icon={Eye} title="Profile visibility" description="Discord contact preferences">
                <div id="dashboard-visibility" className={styles.anchor} data-dashboard-section="profile-visibility">
                  <DiscordContactVisibilityCard
                    initialEnabled={Boolean(profile.discord_public_enabled)}
                    hasDiscordUsername={Boolean(profile.discord_username?.trim())}
                  />
                </div>
              </DashboardDisclosure>}
            </section>
          </div>
        </div>}
      />
    </main>
  );
}

function DashboardDisclosure({ icon: Icon, title, description, detail, name, open, children }: {
  icon: LucideIcon;
  title: string;
  description?: string;
  detail?: string;
  name?: string;
  open?: boolean;
  children: ReactNode;
}) {
  return (
    <details className={styles.disclosure} open={open} data-dashboard-section={name}>
      <summary className={styles.row}>
        <Icon aria-hidden size={17} className={styles.rowIcon} />
        <span className={styles.rowTitle}>
          <strong>{title}</strong>
          {description && <small>{description}</small>}
        </span>
        {detail && <small>{detail}</small>}
        <ChevronDown aria-hidden size={15} className={styles.chevron} />
      </summary>
      <div className={styles.disclosureBody}>{children}</div>
    </details>
  );
}

function DashboardLink({ icon: Icon, title, description, href }: {
  icon: LucideIcon;
  title: string;
  description: string;
  href: string;
}) {
  return (
    <Link href={href} className={styles.row} prefetch={false}>
      <Icon aria-hidden size={17} className={styles.rowIcon} />
      <span className={styles.rowTitle}><strong>{title}</strong><small>{description}</small></span>
      <ChevronRight aria-hidden size={15} className={styles.chevron} />
    </Link>
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
