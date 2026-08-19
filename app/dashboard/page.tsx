import { auth } from "@clerk/nextjs/server";
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  MapPin,
  ShieldAlert,
  Target,
  Trophy,
  UserRound,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import DashboardChampionHistory from "@/components/DashboardChampionHistory";
import DashboardMatchHistory from "@/components/DashboardMatchHistory";
import DashboardNotifications from "@/components/DashboardNotifications";
import HydrationSafeLocalDateTime from "@/components/HydrationSafeLocalDateTime";
import DiscordContactVisibilityCard from "@/components/DiscordContactVisibilityCard";
import PublicProfileVisibilityCard from "@/components/PublicProfileVisibilityCard";
import PlayerRegistrationActions from "@/components/PlayerRegistrationActions";
import PollsAndDecisions from "@/components/PollsAndDecisions";
import { getPlayerAvatarDisplayUrl } from "@/lib/avatar";
import {
  getLocalizedCountryName,
  getLocalizedPlayerRegion,
} from "@/lib/countries";
import InAppNotificationCenter from "@/components/InAppNotificationCenter";
import { loadPlayerNotifications } from "@/lib/notifications";
import type { Locale } from "@/lib/i18n/config";
import { formatNumber, selectPlural } from "@/lib/i18n/format";
import { loadDictionaries } from "@/lib/i18n/loaders";
import { getRequestLocale } from "@/lib/i18n/request";
import { translate } from "@/lib/i18n/translate";
import type { MessageValues } from "@/lib/i18n/types";
import { loadCommunityPollsForRequest } from "@/lib/player-polls";
import {
  loadPlayerCareerDashboard,
  type PlayerStatistics,
} from "@/lib/player-dashboard";
import {
  type PlayerProfile,
} from "@/lib/player-profile";
import { createAuthenticatedSupabaseClient } from "@/lib/supabase-server";
import {
  isTournamentTerminalStatus,
  type TournamentStatus,
} from "@/lib/tournaments";

export const dynamic = "force-dynamic";

type DashboardTranslator = (
  path: string,
  values?: MessageValues
) => string;

type RegistrationStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "manual_review"
  | "waitlisted"
  | "withdrawn";

type WaitlistOfferStatus =
  | "offered"
  | "accepted"
  | "declined"
  | "expired"
  | "cancelled"
  | null;

type PlayerRegistration = {
  id: string;
  tournament_title: string;
  bracket_name: string;
  registration_status: RegistrationStatus;
  tournament_bracket_id: string;
  elo_status: string;
  submitted_elo: number | null;
  withdrawn_at: string | null;
  waitlist_offer_status: WaitlistOfferStatus;
  waitlist_offer_created_at: string | null;
  waitlist_offer_expires_at: string | null;
  waitlist_offer_resolved_at: string | null;
  launched_at: string | null;
  tournament_status: TournamentStatus;
  created_at: string;
};

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
    ["account-dashboard"] as const
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
  const profileComplete = profile?.profile_completed === true;

  return (
    <main
      className="min-h-screen bg-black bg-cover bg-center bg-fixed px-6 pt-32 pb-20 text-white"
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
        <header
          className="relative overflow-hidden border border-orange-500/25 bg-black/70 p-8 shadow-[0_0_45px_rgba(0,0,0,0.55)] backdrop-blur md:p-10"
        >
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.045)_1px,transparent_1px)] bg-[length:52px_52px] opacity-25" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.12),rgba(0,0,0,0.82)),linear-gradient(110deg,rgba(0,0,0,0.94),rgba(249,115,22,0.13),rgba(0,0,0,0.9))]" />

          <div className="relative z-10">
            <p className="text-sm font-semibold uppercase tracking-[0.35em] text-orange-400">
              {t("dashboard.hero.eyebrow")}
            </p>
            <h1 className="mt-4 text-4xl font-bold tracking-tight md:text-6xl">
              {t("dashboard.hero.title")}
            </h1>
            <p className="mt-5 max-w-2xl leading-7 text-zinc-300">
              {t("dashboard.hero.description")}
            </p>
          </div>
        </header>

        <section className="mt-8 border border-orange-500/20 bg-black/65 p-6 shadow-2xl shadow-black/30 backdrop-blur-xl md:p-8">
          {profileResult.error ? (
            <DashboardError message={t("dashboard.profile.loadError")} />
          ) : profile ? (
            <div className="grid gap-8 lg:grid-cols-[auto_1fr_auto] lg:items-center">
              <PlayerAvatar
                avatarUrl={getPlayerAvatarDisplayUrl(profile)}
                avatarLabel={t("dashboard.profile.avatarLabel", {
                  name: profile.display_name,
                })}
              />

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-3xl font-black text-white">
                    {profile.display_name}
                  </h2>
                  <CompletionBadge
                    complete={profileComplete}
                    t={t}
                  />
                </div>
                <p className="mt-2 text-lg font-bold text-orange-300">
                  {profile.in_game_name}
                </p>

                <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <ProfileValue
                    label={t("dashboard.profile.country")}
                    value={
                      profile.country
                        ? getLocalizedCountryName(profile.country, locale)
                        : null
                    }
                    fallback={t("dashboard.notAvailable")}
                  />
                  <ProfileValue
                    label={t("dashboard.profile.region")}
                    value={
                      profile.region
                        ? getLocalizedPlayerRegion(profile.region, (path) =>
                            t(path)
                          )
                        : null
                    }
                    fallback={t("dashboard.notAvailable")}
                  />
                  <ProfileValue
                    label={t("dashboard.profile.timezone")}
                    value={profile.timezone}
                    fallback={t("dashboard.notAvailable")}
                  />
                  <ProfileValue
                    label={t("dashboard.profile.currentElo")}
                    value={
                      profile.current_elo === null
                        ? null
                        : formatNumber(profile.current_elo, locale)
                    }
                    fallback={t("dashboard.notAvailable")}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <Link
                  href="/profile"
                  className="border border-white/15 bg-white/[0.04] px-5 py-3 text-center font-bold text-white transition hover:border-orange-400/70 hover:bg-orange-500/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300"
                >
                  {t("dashboard.profile.viewEdit")}
                </Link>
                <Link
                  href="/tournaments"
                  className="border border-orange-400 bg-orange-500 px-5 py-3 text-center font-bold text-black transition hover:border-orange-300 hover:bg-orange-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300"
                >
                  {t("dashboard.profile.goTournaments")}
                </Link>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-2xl font-bold text-white">
                  {t("dashboard.profile.requiredTitle")}
                </h2>
                <p className="mt-2 text-zinc-400">
                  {t("dashboard.profile.requiredDescription")}
                </p>
              </div>
              <Link
                href="/profile"
                className="border border-orange-400 bg-orange-500 px-5 py-3 text-center font-bold text-black transition hover:border-orange-300 hover:bg-orange-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300"
              >
                {t("dashboard.profile.complete")}
              </Link>
            </div>
          )}
        </section>

        <div className="mt-8 grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)] lg:items-start">
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
            title={t("dashboard.notificationCenter.title")}
            eyebrow={t("dashboard.notificationCenter.eyebrow")}
            description={t("dashboard.notificationCenter.description")}
            emptyMessage={t("dashboard.notificationCenter.empty")}
            notifications={playerNotifications.notifications}
            totalCount={playerNotifications.totalCount}
            unreadCount={playerNotifications.unreadCount}
            error={playerNotifications.error}
            className="max-w-2xl !rounded-none !border-orange-500/20 !bg-black/65 !shadow-2xl !shadow-black/30 [&_button]:rounded-none [&_div]:rounded-none lg:max-w-none"
          />

          {profile && (
            <div className="grid gap-5">
              <PublicProfileVisibilityCard
                initialEnabled={Boolean(profile.public_profile_enabled)}
              />
              <DiscordContactVisibilityCard
                initialEnabled={Boolean(profile.discord_public_enabled)}
                hasDiscordUsername={Boolean(profile.discord_username?.trim())}
              />
            </div>
          )}
        </div>

        <DashboardNotifications
          key={[
            locale,
            ...career.notifications.map(
              (notification) => `${notification.id}:${notification.status}`
            ),
          ].join("|")}
          notifications={career.notifications}
        />

        <div id="community-polls" className="mt-8 scroll-mt-28">
          <PollsAndDecisions
            surface="community"
            initialPolls={communityPolls.polls}
            initialError={communityPolls.error}
          />
        </div>

        {career.error && (
          <div className="mt-6">
            <DashboardError
              message={t(
                career.error === "load-failed"
                  ? "dashboard.career.loadError"
                  : "dashboard.career.partialError"
              )}
            />
          </div>
        )}

        <PlayerStatisticsSection
          statistics={career.statistics}
          locale={locale}
          t={t}
        />
        <DashboardChampionHistory champions={career.champions} />
        <DashboardMatchHistory matches={career.matchHistory} />

        <section className="mt-8">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-orange-400">
                {t("dashboard.registrations.eyebrow")}
              </p>
              <h2 className="mt-3 text-3xl font-bold text-white">
                {t("dashboard.registrations.title")}
              </h2>
            </div>
            <p className="text-sm text-zinc-500">
              {registrationCount(registrations.length, locale, t)}
            </p>
          </div>

          {registrationsResult.error ? (
            <div className="mt-6">
              <DashboardError
                message={t("dashboard.registrations.loadError")}
              />
            </div>
          ) : registrations.length === 0 ? (
            <EmptyRegistrations t={t} />
          ) : (
            <div className="mt-6 grid gap-5 lg:grid-cols-2">
              {registrations.map((registration) => (
                <RegistrationCard
                  key={registration.id}
                  registration={registration}
                  locale={locale}
                  t={t}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function PlayerStatisticsSection({
  statistics,
  locale,
  t,
}: {
  statistics: PlayerStatistics;
  locale: Locale;
  t: DashboardTranslator;
}) {
  const values = [
    {
      label: t("dashboard.statistics.matchesPlayed"),
      value: formatNumber(statistics.matchesPlayed, locale),
    },
    {
      label: t("dashboard.statistics.matchesWon"),
      value: formatNumber(statistics.matchesWon, locale),
    },
    {
      label: t("dashboard.statistics.matchesLost"),
      value: formatNumber(statistics.matchesLost, locale),
    },
    {
      label: t("dashboard.statistics.winRate"),
      value: formatNumber(statistics.winRate / 100, locale, {
        style: "percent",
        maximumFractionDigits: 0,
      }),
    },
    {
      label: t("dashboard.statistics.tournamentsParticipated"),
      value: formatNumber(statistics.tournamentsParticipated, locale),
    },
    {
      label: t("dashboard.statistics.tournamentsWon"),
      value: formatNumber(statistics.tournamentsWon, locale),
    },
  ];

  return (
    <section className="mt-10">
      <SectionHeading
        eyebrow={t("dashboard.statistics.eyebrow")}
        title={t("dashboard.statistics.title")}
        icon={Target}
      />
      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {values.map((item) => (
          <div
            key={item.label}
            className="border border-white/12 bg-black/55 p-5 shadow-xl shadow-black/15 backdrop-blur"
          >
            <p className="text-2xl font-black text-white">{item.value}</p>
            <p className="mt-2 text-[10px] font-black uppercase tracking-wider text-zinc-500">
              {item.label}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function SectionHeading({
  eyebrow,
  title,
  icon: Icon,
}: {
  eyebrow: string;
  title: string;
  icon: typeof Trophy;
}) {
  return (
    <div>
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-orange-400">
        <Icon size={15} />
        {eyebrow}
      </p>
      <h2 className="mt-3 text-3xl font-bold text-white">{title}</h2>
    </div>
  );
}

function PlayerAvatar({
  avatarUrl,
  avatarLabel,
}: {
  avatarUrl: string | null;
  avatarLabel: string;
}) {
  return (
    <div
      role="img"
      aria-label={avatarLabel}
      className="grid h-32 w-32 shrink-0 place-items-center overflow-hidden rounded-full border-2 border-orange-500/50 bg-black/60 bg-cover bg-center shadow-[0_0_35px_rgba(249,115,22,0.2)]"
      style={
        avatarUrl ? { backgroundImage: `url("${avatarUrl}")` } : undefined
      }
    >
      {!avatarUrl && <UserRound size={48} className="text-zinc-600" />}
    </div>
  );
}

function CompletionBadge({
  complete,
  t,
}: {
  complete: boolean;
  t: DashboardTranslator;
}) {
  return (
    <span
      className={`rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wider ${
        complete
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
          : "border-orange-500/40 bg-orange-500/10 text-orange-300"
      }`}
    >
      {complete
        ? t("dashboard.profile.completeStatus")
        : t("dashboard.profile.incompleteStatus")}
    </span>
  );
}

function ProfileValue({
  label,
  value,
  fallback,
}: {
  label: string;
  value: string | null;
  fallback: string;
}) {
  return (
    <div className="border border-white/12 bg-black/45 p-4 shadow-inner shadow-black/20">
      <p className="text-xs uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="mt-2 break-words font-bold text-white">
        {value || fallback}
      </p>
    </div>
  );
}

function RegistrationCard({
  registration,
  locale,
  t,
}: {
  registration: PlayerRegistration;
  locale: Locale;
  t: DashboardTranslator;
}) {
  const terminalTournament = isTournamentTerminalStatus(
    registration.tournament_status
  );

  return (
    <article id={`registration-${registration.id}`} className="scroll-mt-28 border border-orange-500/20 bg-black/70 p-6 shadow-2xl shadow-black/25 backdrop-blur transition hover:border-orange-400/45 hover:bg-black/80">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-orange-300">
            <Trophy size={18} />
            <p className="text-xs font-black uppercase tracking-[0.22em]">
              {t("dashboard.registrations.cardEyebrow")}
            </p>
          </div>
          <h3 className="mt-3 break-words text-xl font-black text-white">
            {registration.tournament_title}
          </h3>
          <p className="mt-2 text-sm font-semibold text-zinc-400">
            {registration.bracket_name}
          </p>
        </div>
        <StatusBadge status={registration.registration_status} t={t} />
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <RegistrationValue
          label={t("dashboard.registrations.eloStatus")}
          value={eloStatusLabel(registration.elo_status, t)}
        />
        <RegistrationValue
          label={t("dashboard.registrations.submittedElo")}
          value={
            registration.submitted_elo === null
              ? t("dashboard.notAvailable")
              : formatNumber(registration.submitted_elo, locale)
          }
        />
        <RegistrationValue
          label={t("dashboard.registrations.submitted")}
          value={
            <HydrationSafeLocalDateTime
              value={registration.created_at}
              fallback={t("dashboard.notAvailable")}
            />
          }
        />
      </div>

      {terminalTournament ? (
        <div
          role="status"
          className="mt-5 border border-amber-400/30 bg-amber-950/20 p-4 text-amber-100"
        >
          <p className="text-sm font-black uppercase tracking-wider">
            {t("dashboard.registrations.historicalTitle")}
          </p>
          <p className="mt-2 text-sm leading-6">
            {t(
              registration.tournament_status === "cancelled"
                ? "dashboard.registrations.cancelledMessage"
                : "dashboard.registrations.voidedMessage"
            )}
          </p>
        </div>
      ) : (
        <RegistrationDecision registration={registration} t={t} />
      )}
      <PlayerRegistrationActions
        registrationId={registration.id}
        registrationStatus={registration.registration_status}
        waitlistOfferStatus={registration.waitlist_offer_status}
        waitlistOfferExpiresAt={registration.waitlist_offer_expires_at}
        launchedAt={registration.launched_at}
        tournamentStatus={registration.tournament_status}
      />
    </article>
  );
}

function RegistrationDecision({
  registration,
  t,
}: {
  registration: PlayerRegistration;
  t: DashboardTranslator;
}) {
  const waitlistContent = {
    offered: {
      title: t("dashboard.registrations.offerTitle"),
      message: t("dashboard.registrations.offerMessage"),
      className: "border-amber-400/40 bg-amber-500/10 text-amber-100",
    },
    declined: {
      title: t("dashboard.registrations.declinedTitle"),
      message: t("dashboard.registrations.declinedMessage"),
      className: "border-white/10 bg-white/[0.04] text-zinc-300",
    },
    expired: {
      title: t("dashboard.registrations.expiredTitle"),
      message: t("dashboard.registrations.expiredMessage"),
      className: "border-white/10 bg-white/[0.04] text-zinc-300",
    },
    cancelled: {
      title: t("dashboard.registrations.waitlistClosedTitle"),
      message: t("dashboard.registrations.waitlistClosedMessage"),
      className: "border-white/10 bg-white/[0.04] text-zinc-300",
    },
    accepted: {
      title: t("dashboard.registrations.acceptedTitle"),
      message: t("dashboard.registrations.acceptedMessage"),
      className:
        "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
    },
    waiting: registration.launched_at
      ? {
          title: t("dashboard.registrations.waitlistClosedTitle"),
          message: t("dashboard.registrations.launchedWaitlistMessage"),
          className: "border-white/10 bg-white/[0.04] text-zinc-300",
        }
      : {
          title: t("dashboard.registrations.waitlistedTitle"),
          message: t("dashboard.registrations.waitlistedMessage"),
          className: "border-amber-500/30 bg-amber-500/10 text-amber-200",
        },
  }[registration.waitlist_offer_status ?? "waiting"];
  const content = {
    approved: {
      title: t("dashboard.registrations.approvedTitle"),
      message: t("dashboard.registrations.approvedMessage"),
      className:
        "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
    },
    rejected: {
      title: t("dashboard.registrations.rejectedTitle"),
      message: t("dashboard.registrations.rejectedMessage"),
      className: "border-red-500/30 bg-red-500/10 text-red-200",
    },
    manual_review: {
      title: t("dashboard.registrations.manualReviewTitle"),
      message: t("dashboard.registrations.manualReviewMessage"),
      className:
        "border-orange-500/30 bg-orange-500/10 text-orange-200",
    },
    waitlisted: waitlistContent,
    withdrawn: {
      title: t("dashboard.registrations.withdrawnTitle"),
      message: t("dashboard.registrations.withdrawnMessage"),
      className: "border-white/10 bg-white/[0.04] text-zinc-300",
    },
    pending: {
      title: t("dashboard.registrations.pendingTitle"),
      message: t("dashboard.registrations.pendingMessage"),
      className: "border-white/10 bg-white/[0.04] text-zinc-300",
    },
  }[registration.registration_status] ?? {
    title: t("dashboard.registrations.fallbackTitle"),
    message: t("dashboard.registrations.fallbackMessage"),
    className: "border-white/10 bg-white/[0.04] text-zinc-300",
  };
  return (
    <div className={`mt-4 border p-4 ${content.className}`}>
      <p className="text-sm font-black uppercase tracking-wider">
        {content.title}
      </p>
      <p className="mt-2 text-sm leading-6 opacity-90">{content.message}</p>
    </div>
  );
}

function StatusBadge({
  status,
  t,
}: {
  status: RegistrationStatus;
  t: DashboardTranslator;
}) {
  const content = {
    approved: {
      label: t("dashboard.registrations.statusApproved"),
      icon: CheckCircle2,
      className:
        "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
    },
    rejected: {
      label: t("dashboard.registrations.statusRejected"),
      icon: XCircle,
      className: "border-red-500/40 bg-red-500/10 text-red-300",
    },
    manual_review: {
      label: t("dashboard.registrations.statusManualReview"),
      icon: ShieldAlert,
      className: "border-orange-500/40 bg-orange-500/10 text-orange-300",
    },
    waitlisted: {
      label: t("dashboard.registrations.statusWaitlisted"),
      icon: Clock3,
      className: "border-amber-500/40 bg-amber-500/10 text-amber-300",
    },
    withdrawn: {
      label: t("dashboard.registrations.statusWithdrawn"),
      icon: XCircle,
      className: "border-zinc-500/40 bg-zinc-500/10 text-zinc-300",
    },
    pending: {
      label: t("dashboard.registrations.statusPending"),
      icon: Clock3,
      className: "border-white/15 bg-white/5 text-zinc-300",
    },
  }[status] ?? {
    label: t("dashboard.registrations.statusPending"),
    icon: Clock3,
    className: "border-white/15 bg-white/5 text-zinc-300",
  };
  const Icon = content.icon;

  return (
    <span
      className={`inline-flex w-fit shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-xs font-black uppercase tracking-wider ${content.className}`}
    >
      <Icon size={14} />
      {content.label}
    </span>
  );
}

function RegistrationValue({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="border border-white/12 bg-black/45 p-4 shadow-inner shadow-black/20">
      <p className="text-xs uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="mt-2 break-words text-sm font-bold text-white">{value}</p>
    </div>
  );
}

function EmptyRegistrations({ t }: { t: DashboardTranslator }) {
  return (
    <div className="mt-6 border border-dashed border-orange-400/25 bg-black/60 px-6 py-16 text-center shadow-2xl shadow-black/25 backdrop-blur">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-full border border-orange-500/30 bg-orange-500/10 text-orange-300">
        <CalendarDays size={25} />
      </div>
      <h3 className="mt-5 text-xl font-bold text-white">
        {t("dashboard.registrations.emptyTitle")}
      </h3>
      <p className="mx-auto mt-2 max-w-lg leading-7 text-zinc-400">
        {t("dashboard.registrations.emptyDescription")}
      </p>
      <Link
        href="/tournaments"
        className="mt-6 inline-flex border border-orange-400 bg-orange-500 px-5 py-3 font-bold text-black transition hover:border-orange-300 hover:bg-orange-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300"
      >
        {t("dashboard.registrations.explore")}
      </Link>
    </div>
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

function eloStatusLabel(status: string, t: DashboardTranslator) {
  const path = {
    pending: "dashboard.registrations.eloPending",
    verified: "dashboard.registrations.eloVerified",
    rejected: "dashboard.registrations.eloRejected",
    failed: "dashboard.registrations.eloFailed",
    manual_review: "dashboard.registrations.eloManualReview",
  }[status.trim().toLowerCase()];

  return t(path ?? "dashboard.registrations.eloUnavailable");
}

function registrationCount(
  count: number,
  locale: Locale,
  t: DashboardTranslator
) {
  const category = selectPlural(count, locale);
  const suffix =
    category === "one" || category === "few" || category === "many"
      ? `${category[0].toUpperCase()}${category.slice(1)}`
      : "Other";

  return t(`dashboard.registrations.count${suffix}`, {
    count: formatNumber(count, locale),
  });
}

function first<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}
