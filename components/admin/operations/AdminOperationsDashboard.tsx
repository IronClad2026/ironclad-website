import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  GitBranch,
  HeartPulse,
  ShieldAlert,
  Trophy,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import OperationsRefreshButton from "@/components/admin/operations/OperationsRefreshButton";
import type {
  AdminOperationsAttentionItem,
  AdminOperationsDailyPoint,
  AdminOperationsGroupPoint,
  AdminOperationsGrowth,
  AdminOperationsMetric,
  AdminOperationsMetrics,
  AdminOperationsPeriod,
  AdminOperationsRow,
} from "@/lib/admin-operations-metrics";

const numberFormatter = new Intl.NumberFormat("en-AU");
const percentFormatter = new Intl.NumberFormat("en-AU", {
  maximumFractionDigits: 1,
  minimumFractionDigits: 0,
});

const periodOptions: Array<{
  key: AdminOperationsPeriod;
  label: string;
}> = [
  { key: "today", label: "Today" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "all", label: "All time" },
];

const chartColors = ["#fb923c", "#38bdf8", "#34d399", "#facc15"];
const barColors = [
  "bg-orange-400",
  "bg-sky-400",
  "bg-emerald-400",
  "bg-amber-300",
  "bg-violet-400",
  "bg-rose-400",
  "bg-cyan-300",
];

export default function AdminOperationsDashboard({
  metrics,
}: {
  metrics: AdminOperationsMetrics;
}) {
  const hasActiveAttention = metrics.attention.some((item) => item.count > 0);
  const periodLabel = metrics.period.label;

  return (
    <main
      lang="en"
      className="min-h-screen min-w-0 bg-black px-4 pb-20 pt-28 text-white sm:px-6 sm:pt-32 lg:px-8"
    >
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="relative overflow-hidden rounded-3xl border border-orange-500/30 bg-[radial-gradient(circle_at_top_right,rgba(249,115,22,0.18),transparent_36%),linear-gradient(145deg,#18181b,#09090b)] p-5 shadow-2xl shadow-orange-950/20 sm:p-8">
          <div className="absolute inset-y-0 left-0 w-1 bg-orange-500 shadow-[0_0_24px_rgba(249,115,22,0.85)]" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0 max-w-4xl">
              <p className="text-xs font-black uppercase tracking-[0.3em] text-orange-400">
                Private Admin Area
              </p>
              <h1 className="mt-4 break-words text-3xl font-black tracking-tight sm:text-4xl md:text-5xl">
                Operations &amp; Analytics
              </h1>
              <p className="mt-4 max-w-3xl leading-7 text-zinc-300">
                A concise operational view of Players, registrations,
                Tournaments, Matches and the queues that need Admin action.
              </p>
            </div>

            <div className="grid w-full gap-3 sm:flex sm:w-auto sm:flex-wrap lg:justify-end">
              <OperationsRefreshButton />
              <Link
                href="/admin"
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-orange-400/40 bg-orange-500/10 px-4 py-2.5 text-sm font-black text-orange-100 transition hover:border-orange-300 hover:bg-orange-500/20 sm:w-auto"
              >
                Admin Command Centre
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </header>

        <section
          aria-label="Dashboard period"
          className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 sm:p-5"
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-zinc-500">
                Selected period
              </p>
              <p className="mt-1 break-words font-black text-white">
                {periodLabel}
              </p>
              <p className="mt-1 text-xs leading-5 text-zinc-500">
                Period flows use UTC boundaries. Cards marked “Now” show the
                current operational state regardless of the selected period.
              </p>
            </div>

            <nav
              aria-label="Choose dashboard period"
              className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap"
            >
              {periodOptions.map((option) => {
                const active = metrics.period.key === option.key;
                return (
                  <Link
                    key={option.key}
                    href={`/admin/operations?period=${option.key}`}
                    aria-current={active ? "page" : undefined}
                    className={`inline-flex min-h-11 items-center justify-center rounded-xl border px-4 py-2 text-sm font-black transition ${
                      active
                        ? "border-orange-400 bg-orange-500/20 text-orange-100"
                        : "border-white/10 bg-black/30 text-zinc-400 hover:border-orange-400/40 hover:text-white"
                    }`}
                  >
                    {option.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <p className="mt-4 border-t border-white/10 pt-3 text-xs text-zinc-500">
            Data refreshed{" "}
            <time dateTime={metrics.generatedAt}>
              {formatAdminDateTime(metrics.generatedAt)}
            </time>
            .
          </p>
        </section>

        <section aria-labelledby="operations-overview-title">
          <SectionHeading
            id="operations-overview-title"
            eyebrow="Overview"
            title="The operational picture"
            description="Headline counts link to the existing Admin workflows where a direct drill-down is available."
            icon={Activity}
          />
          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <OverviewCard
              label="New Player Profiles"
              qualifier={periodLabel}
              metric={metrics.overview.players}
              icon={Users}
            />
            <OverviewCard
              label="Registrations Submitted"
              qualifier={periodLabel}
              metric={metrics.overview.registrations}
              icon={UserPlus}
            />
            <OverviewCard
              label="Active Tournaments"
              qualifier="Now"
              metric={metrics.overview.activeTournaments}
              icon={Trophy}
            />
            <OverviewCard
              label="Completed Events"
              qualifier="All time"
              metric={metrics.overview.completedTournaments}
              icon={CheckCircle2}
            />
            <OverviewCard
              label="Open operational issues"
              qualifier="Now"
              metric={metrics.overview.openIssues}
              icon={ShieldAlert}
              urgent={metrics.overview.openIssues.value > 0}
            />
          </div>
        </section>

        <section
          id="attention-required"
          aria-labelledby="attention-required-title"
          className="scroll-mt-28 rounded-3xl border border-amber-500/25 bg-[radial-gradient(circle_at_top_right,rgba(245,158,11,0.12),transparent_36%),linear-gradient(145deg,rgba(24,24,27,0.96),rgba(9,9,11,0.98))] p-4 sm:p-6"
        >
          <SectionHeading
            id="attention-required-title"
            eyebrow="Attention Required"
            title="Actionable Admin queues"
            description="These are live operational conditions, not notification read counts. Open an item to continue in the existing workflow."
            icon={AlertTriangle}
          />

          {!hasActiveAttention ? (
            <div className="mt-5 flex items-start gap-3 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-4 text-emerald-100">
              <CheckCircle2
                aria-hidden="true"
                className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300"
              />
              <div>
                <p className="font-black">No open operational issues.</p>
                <p className="mt-1 text-sm leading-6 text-emerald-100/75">
                  No dispute, review, assistance, deadline, vacancy-offer or
                  Admin-hold queue currently needs attention.
                </p>
              </div>
            </div>
          ) : null}
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {metrics.attention.map((item) => (
              <AttentionCard key={item.key} item={item} />
            ))}
          </div>
        </section>

        <SectionShell
          id="players"
          eyebrow="Players"
          title="Player readiness and participation"
          description="Current profile readiness is separated from new-Player activity in the selected period."
          icon={Users}
        >
          <MetricBand
            title="Current state · Now"
            metrics={[
              {
                label: "Retained player records",
                value: metrics.players.total,
              },
              {
                label: "Open Player Accounts",
                value: metrics.players.openAccounts,
              },
              {
                label: "Completed profiles",
                value: metrics.players.completedProfiles,
              },
              {
                label: "Steam-linked Players",
                value: metrics.players.steamLinked,
              },
              {
                label: "Relic-verified Players",
                value: metrics.players.relicVerified,
              },
              {
                label: "Public profiles",
                value: metrics.players.publicProfiles,
              },
            ]}
          />

          <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
            <TrendChart
              id="new-player-trend"
              title={`New Player profiles · ${periodLabel}`}
              description="Daily Player profiles created within the selected UTC period."
              series={[
                {
                  label: "New Player Profiles",
                  points: metrics.players.daily,
                  color: chartColors[0],
                },
              ]}
            />
            <GrowthCard
              title="New-Player growth"
              periodLabel={periodLabel}
              growth={metrics.players.growth}
            />
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-2">
            <DistributionChart
              title="Approved participation by Division"
              description="Approved Tournament participation records, grouped by Division."
              points={metrics.players.participationByDivision}
            />
            <WhoDisclosure
              id="who-left"
              title="Retained account-closure records"
              description="Closed accounts remain distinct from registration withdrawals, rejections, expiries and no-shows."
              rows={metrics.players.closedAccounts}
              emptyMessage="No retained account-closure rows are available."
            />
          </div>
        </SectionShell>

        <SectionShell
          id="registrations"
          eyebrow="Registrations"
          title="Registration flow and current decisions"
          description="Selected-period registration and withdrawal flows are kept separate from current decision and waitlist states."
          icon={UserPlus}
        >
          <MetricBand
            title={`Selected period · ${periodLabel}`}
            metrics={[
              {
                label: "Registrations submitted",
                value: metrics.registrations.registeredInPeriod,
              },
              {
                label: "Withdrawn",
                value: metrics.registrations.withdrawnInPeriod,
              },
              {
                label: "Withdrawal / registration rate",
                value: formatOptionalPercent(
                  metrics.registrations.withdrawalRate
                ),
                qualifier: "All time",
              },
              {
                label: "All registration records",
                value: metrics.registrations.total,
                qualifier: "All time",
              },
            ]}
          />

          <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
            <TrendChart
              id="registration-flow-trend"
              title={`Registration activity · ${periodLabel}`}
              description="Daily registrations and withdrawals within the selected UTC period."
              series={[
                {
                  label: "Registrations submitted",
                  points: metrics.registrations.daily,
                  color: chartColors[0],
                },
                {
                  label: "Withdrawn",
                  points: metrics.registrations.withdrawalsDaily,
                  color: chartColors[1],
                },
              ]}
            />
            <GrowthCard
              title="Registration growth"
              periodLabel={periodLabel}
              growth={metrics.registrations.growth}
            />
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-2">
            <DistributionChart
              title="Registration decisions · Now"
              description="Current registration status for every retained registration record."
              points={metrics.registrations.statusGroups}
            />
            <DistributionChart
              title="Waitlist vacancy offers · Now"
              description="Current vacancy-offer state for waitlisted registrations."
              points={metrics.registrations.waitlistOfferGroups}
            />
          </div>

          <div className="mt-7 border-t border-white/10 pt-6">
            <SubsectionHeading
              title="Who registered, withdrew or changed state"
              description="Each group is bounded to recent Admin-safe rows and links to the existing registration review."
            />
            <div className="mt-4 grid gap-3 xl:grid-cols-2">
              <WhoDisclosure
                title={`Registered · ${periodLabel}`}
                description="Recent registrations created in the selected period."
                rows={metrics.registrations.who.registered}
                emptyMessage="No registrations were created in this period."
                defaultOpen
              />
              <WhoDisclosure
                title="Pending · Now"
                description="Registrations currently awaiting an Admin decision."
                rows={metrics.registrations.who.pending}
                emptyMessage="No registrations are currently pending."
                defaultOpen
              />
              <WhoDisclosure
                title="Manual review · Now"
                description="Registrations currently marked for manual review."
                rows={metrics.registrations.who.manualReview}
                emptyMessage="No registrations currently need manual review."
              />
              <WhoDisclosure
                title={`Withdrawn · ${periodLabel}`}
                description="Registration withdrawals recorded in the selected period."
                rows={metrics.registrations.who.withdrawn}
                emptyMessage="No registration withdrawals were recorded in this period."
                defaultOpen
              />
              <WhoDisclosure
                title="Rejected · Now"
                description="Registrations currently retained with a rejected decision."
                rows={metrics.registrations.who.rejected}
                emptyMessage="No registrations are currently rejected."
              />
              <WhoDisclosure
                title="Waiting Now"
                description="Waitlisted registrations with no vacancy-offer state."
                rows={metrics.registrations.who.waitlisted}
                emptyMessage="No registrations are currently waitlisted."
              />
              <WhoDisclosure
                title="Vacancy offered · Now"
                description="Waitlisted registrations with a current vacancy offer."
                rows={metrics.registrations.who.vacancyOffered}
                emptyMessage="No vacancy offers are currently open."
              />
              <WhoDisclosure
                title="Vacancy accepted"
                description="Recent retained vacancy-offer acceptances."
                rows={metrics.registrations.who.vacancyAccepted}
                emptyMessage="No accepted vacancy-offer rows are available."
              />
              <WhoDisclosure
                title="Vacancy declined"
                description="Recent retained vacancy-offer declines."
                rows={metrics.registrations.who.vacancyDeclined}
                emptyMessage="No declined vacancy-offer rows are available."
              />
              <WhoDisclosure
                title="Vacancy expired"
                description="Recent retained vacancy-offer expiries."
                rows={metrics.registrations.who.vacancyExpired}
                emptyMessage="No expired vacancy-offer rows are available."
              />
            </div>
          </div>
        </SectionShell>

        <SectionShell
          id="tournaments"
          eyebrow="Tournaments"
          title="Event lifecycle and Division delivery"
          description="Current Tournament state is separated from Events completed in the selected period."
          icon={Trophy}
        >
          <MetricBand
            title="Tournament state · Now"
            metrics={[
              { label: "Total created", value: metrics.tournaments.total },
              { label: "Active", value: metrics.tournaments.active },
              {
                label: "Registration open",
                value: metrics.tournaments.registrationOpenNow,
              },
              { label: "Launched", value: metrics.tournaments.launched },
              { label: "Completed", value: metrics.tournaments.completed },
              { label: "Cancelled", value: metrics.tournaments.cancelled },
              { label: "Void", value: metrics.tournaments.voided },
            ]}
          />

          <MetricBand
            title={`Selected period · ${periodLabel}`}
            className="mt-4"
            metrics={[
              {
                label: "Tournaments created",
                value: metrics.tournaments.createdInPeriod,
              },
              {
                label: "Tournaments completed",
                value: metrics.tournaments.completedInPeriod,
              },
              {
                label: "Completed-Tournament rate",
                value: formatOptionalPercent(metrics.tournaments.completionRate),
              },
            ]}
          />

          <div className="mt-6">
            <TrendChart
              id="completed-tournament-trend"
              title={`Completed Tournaments · ${periodLabel}`}
              description="Daily completed Tournament events within the selected UTC period."
              series={[
                {
                  label: "Completed Tournaments",
                  points: metrics.tournaments.dailyCompleted,
                  color: chartColors[0],
                },
              ]}
            />
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
            <DistributionChart
              title="Tournament states · Now"
              description="Current lifecycle state of all retained Tournaments."
              points={metrics.tournaments.statusGroups}
            />
            <DistributionChart
              title="Completed Events by Division"
              description="Completed Division Events, kept distinct from whole-Tournament completion."
              points={metrics.tournaments.completedByDivision}
            />
            <DistributionChart
              title="Approved participation by Division"
              description="Approved registration participation grouped by Division."
              points={metrics.tournaments.participationByDivision}
            />
          </div>
        </SectionShell>

        <SectionShell
          id="matches"
          eyebrow="Matches & Results"
          title="Match state, outcomes and result resolution"
          description="Played Matches, byes, walkovers, no-shows and forfeits remain separate factual outcomes."
          icon={GitBranch}
        >
          <MetricBand
            title="Match state · Now"
            metrics={[
              { label: "Total Match records", value: metrics.matches.total },
              { label: "Playable now", value: metrics.matches.playable },
              {
                label: "Ready for activation",
                value: metrics.matches.readyForActivation,
              },
              { label: "Active", value: metrics.matches.active },
              {
                label: "Completed Match records",
                value: metrics.matches.completed,
              },
            ]}
          />

          <div className="mt-5 grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
            <DistributionChart
              title="Match states · Now"
              description="Current stored Match lifecycle states."
              points={metrics.matches.statusGroups}
            />
            <DistributionChart
              title="Factual Match outcomes"
              description="Played and automatic outcomes are not merged together."
              points={[
                { label: "Played", value: metrics.matches.outcomes.played },
                {
                  label: "Confirmed no-show",
                  value: metrics.matches.outcomes.confirmedNoShows,
                },
                {
                  label: "Double forfeit",
                  value: metrics.matches.outcomes.doubleForfeits,
                },
                { label: "Bye", value: metrics.matches.outcomes.byes },
                {
                  label: "Walkover",
                  value: metrics.matches.outcomes.walkovers,
                },
                {
                  label: "Empty feeder",
                  value: metrics.matches.outcomes.emptyFeeders,
                },
              ]}
            />
            <DistributionChart
              title="Result resolution"
              description="How official results reached their final state."
              points={[
                {
                  label: "Opponent Confirmed",
                  value: metrics.matches.resultResolution.playerConfirmed,
                },
                {
                  label: "Automatically confirmed",
                  value:
                    metrics.matches.resultResolution.automaticallyConfirmed,
                },
                {
                  label: "Admin Approved / Override",
                  value: metrics.matches.resultResolution.adminApproved,
                },
                {
                  label: "Direct legacy Admin",
                  value: metrics.matches.resultResolution.directLegacyAdmin,
                },
              ]}
            />
          </div>

          <div className="mt-7 border-t border-white/10 pt-6">
            <SubsectionHeading
              title="Operational health · Now"
              description="Current Match and waitlist conditions that may require intervention."
            />
            <MetricBand
              className="mt-4"
              title="Live operational conditions"
              metrics={[
                {
                  label: "Awaiting confirmation",
                  value:
                    metrics.matches.operationalHealth.awaitingConfirmation,
                },
                {
                  label: "Open disputes",
                  value: metrics.matches.operationalHealth.openDisputes,
                },
                {
                  label: "Under Admin review",
                  value: metrics.matches.operationalHealth.underAdminReview,
                },
                {
                  label: "Admin Assistance",
                  value:
                    metrics.matches.operationalHealth.pendingAdminAssistance,
                },
                {
                  label: "Overdue Match actions",
                  value: metrics.matches.operationalHealth.overdueMatchActions,
                },
                {
                  label: "Active Admin holds",
                  value: metrics.matches.operationalHealth.activeAdminHolds,
                },
                {
                  label: "Expired confirmations",
                  value:
                    metrics.matches.operationalHealth.expiredConfirmationActions,
                },
                {
                  label: "Expired vacancy offers",
                  value:
                    metrics.matches.operationalHealth.expiredWaitlistOffers,
                },
              ]}
            />
          </div>

          <div
            id="match-issues"
            className="mt-7 scroll-mt-28 border-t border-white/10 pt-6"
          >
            <SubsectionHeading
              title="Who needs Match attention"
              description="Bounded Admin-safe rows deep-link into the existing Tournament Match workflow."
            />
            <div className="mt-4 grid gap-3 xl:grid-cols-2">
              <WhoDisclosure
                title="Open disputes · Now"
                description="Player result disputes awaiting resolution."
                rows={metrics.matches.who.disputed}
                emptyMessage="No Matches currently have an open dispute."
                defaultOpen
              />
              <WhoDisclosure
                title="Under Admin review · Now"
                description="Matches in an unresolved Admin review workflow."
                rows={metrics.matches.who.underReview}
                emptyMessage="No Matches are currently under Admin review."
                defaultOpen
              />
              <WhoDisclosure
                title="Overdue actions · Now"
                description="Matches past a deadline and eligible for operational action."
                rows={metrics.matches.who.overdue}
                emptyMessage="No Match actions are currently overdue."
              />
              <WhoDisclosure
                title="Confirmed no-shows"
                description="Recent factual no-show outcomes, distinct from withdrawals and forfeits."
                rows={metrics.matches.who.noShows}
                emptyMessage="No confirmed no-show rows are available."
              />
              <WhoDisclosure
                title="Admin Assistance · Now"
                description="Player requests that remain visible to Admin."
                rows={metrics.matches.who.adminAssistance}
                emptyMessage="No Admin Assistance requests are currently pending."
              />
            </div>
          </div>
        </SectionShell>

        <SectionShell
          id="platform-health"
          eyebrow="Retention & Health"
          title="Small-scale launch health"
          description="Simple participation and completion indicators derived from existing operational records."
          icon={HeartPulse}
        >
          <MetricBand
            title="Operational health"
            metrics={[
              {
                label: "Repeat approved-roster Players",
                value: metrics.health.repeatApprovedParticipants,
              },
              {
                label: "Completed-Tournament rate",
                value: formatOptionalPercent(
                  metrics.health.completedTournamentRate
                ),
              },
              {
                label: "Registration withdrawal rate",
                value: formatOptionalPercent(metrics.health.withdrawalRate),
              },
            ]}
          />
          <div className="mt-5">
            <DistributionChart
              title="Registrations per Tournament"
              description="Retained registration records grouped by Tournament."
              points={metrics.health.registrationsPerTournament}
            />
          </div>
        </SectionShell>
      </div>
    </main>
  );
}

function SectionShell({
  id,
  eyebrow,
  title,
  description,
  icon,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="scroll-mt-28 rounded-3xl border border-white/10 bg-white/[0.04] p-4 shadow-xl shadow-black/20 sm:p-6"
    >
      <SectionHeading
        id={`${id}-title`}
        eyebrow={eyebrow}
        title={title}
        description={description}
        icon={icon}
      />
      <div className="mt-6">{children}</div>
    </section>
  );
}

function SectionHeading({
  id,
  eyebrow,
  title,
  description,
  icon: Icon,
}: {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  icon: LucideIcon;
}) {
  return (
    <div className="flex min-w-0 items-start gap-3 sm:gap-4">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-orange-500/30 bg-orange-500/10 text-orange-300">
        <Icon aria-hidden="true" className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-black uppercase tracking-[0.24em] text-orange-400">
          {eyebrow}
        </p>
        <h2 id={id} className="mt-2 break-words text-2xl font-black sm:text-3xl">
          {title}
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
          {description}
        </p>
      </div>
    </div>
  );
}

function SubsectionHeading({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div>
      <h3 className="break-words text-xl font-black text-white">{title}</h3>
      <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-400">
        {description}
      </p>
    </div>
  );
}

function OverviewCard({
  label,
  qualifier,
  metric,
  icon: Icon,
  urgent = false,
}: {
  label: string;
  qualifier: string;
  metric: AdminOperationsMetric;
  icon: LucideIcon;
  urgent?: boolean;
}) {
  const className = `group min-w-0 rounded-2xl border p-5 transition ${
    urgent
      ? "border-red-500/35 bg-red-500/10 hover:border-red-400/60"
      : "border-white/10 bg-white/[0.04] hover:border-orange-400/50 hover:bg-orange-500/10"
  }`;
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border ${
            urgent
              ? "border-red-400/30 bg-red-500/10 text-red-200"
              : "border-orange-500/30 bg-orange-500/10 text-orange-300"
          }`}
        >
          <Icon aria-hidden="true" className="h-5 w-5" />
        </span>
        {metric.href ? (
          <ArrowRight
            aria-hidden="true"
            className="h-4 w-4 shrink-0 text-zinc-600 transition group-hover:translate-x-0.5 group-hover:text-orange-300"
          />
        ) : null}
      </div>
      <p className="mt-5 text-3xl font-black text-white">
        {numberFormatter.format(metric.value)}
      </p>
      <p className="mt-1 break-words text-sm font-bold text-zinc-200">{label}</p>
      <p className="mt-1 text-[10px] font-black uppercase tracking-wider text-zinc-500">
        {qualifier}
      </p>
      {metric.detail ? (
        <p className="mt-3 text-xs leading-5 text-zinc-500">{metric.detail}</p>
      ) : null}
      {metric.changePercent !== undefined ? (
        <ChangeLine value={metric.changePercent} />
      ) : null}
    </>
  );

  return metric.href ? (
    <Link href={metric.href} className={className}>
      {content}
    </Link>
  ) : (
    <article className={className}>{content}</article>
  );
}

function ChangeLine({ value }: { value: number | null }) {
  if (value === null) {
    return (
      <p className="mt-3 text-xs font-bold text-zinc-500">
        No comparable previous period
      </p>
    );
  }

  const positive = value > 0;
  const negative = value < 0;
  const Icon = positive ? ArrowUpRight : negative ? ArrowDownRight : Activity;

  return (
    <p
      className={`mt-3 inline-flex items-center gap-1 text-xs font-black ${
        positive
          ? "text-emerald-300"
          : negative
            ? "text-amber-300"
            : "text-zinc-400"
      }`}
    >
      <Icon aria-hidden="true" className="h-3.5 w-3.5" />
      {formatSignedPercent(value)} vs previous period
    </p>
  );
}

function AttentionCard({ item }: { item: AdminOperationsAttentionItem }) {
  const styles = {
    critical:
      "border-red-500/35 bg-red-500/10 text-red-100 hover:border-red-400/60",
    warning:
      "border-amber-500/35 bg-amber-500/10 text-amber-100 hover:border-amber-300/60",
    info: "border-sky-500/30 bg-sky-500/10 text-sky-100 hover:border-sky-300/60",
  }[item.tone];

  return (
    <Link
      href={item.href}
      className={`group flex min-h-11 min-w-0 items-start gap-3 rounded-2xl border p-4 transition ${styles}`}
    >
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <strong className="text-2xl font-black">
            {numberFormatter.format(item.count)}
          </strong>
          <span className="break-words text-sm font-black">{item.label}</span>
        </span>
        <span className="mt-2 block text-xs leading-5 opacity-75">
          {item.description}
        </span>
      </span>
      <ArrowRight
        aria-hidden="true"
        className="mt-1 h-4 w-4 shrink-0 opacity-60 transition group-hover:translate-x-0.5 group-hover:opacity-100"
      />
    </Link>
  );
}

function MetricBand({
  title,
  metrics,
  className = "",
}: {
  title: string;
  metrics: Array<{
    label: string;
    value: number | string;
    qualifier?: string;
  }>;
  className?: string;
}) {
  return (
    <section
      aria-label={title}
      className={`rounded-2xl border border-white/10 bg-black/25 p-4 ${className}`}
    >
      <h3 className="text-xs font-black uppercase tracking-[0.2em] text-zinc-500">
        {title}
      </h3>
      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {metrics.map((metric) => (
          <div
            key={metric.label}
            className="min-w-0 rounded-xl border border-white/10 bg-white/[0.035] p-3"
          >
            <dt className="break-words text-[10px] font-black uppercase tracking-wider text-zinc-500">
              {metric.label}
            </dt>
            <dd className="mt-2 break-words text-xl font-black text-white sm:text-2xl">
              {typeof metric.value === "number"
                ? numberFormatter.format(metric.value)
                : metric.value}
            </dd>
            {metric.qualifier ? (
              <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-zinc-600">
                {metric.qualifier}
              </p>
            ) : null}
          </div>
        ))}
      </dl>
    </section>
  );
}

function GrowthCard({
  title,
  periodLabel,
  growth,
}: {
  title: string;
  periodLabel: string;
  growth: AdminOperationsGrowth;
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-black/25 p-4 sm:p-5">
      <p className="text-xs font-black uppercase tracking-[0.2em] text-orange-300">
        {title}
      </p>
      <p className="mt-4 text-3xl font-black text-white">
        {numberFormatter.format(growth.current)}
      </p>
      <p className="mt-1 text-xs text-zinc-500">Current · {periodLabel}</p>

      <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.035] p-3">
        <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
          Previous comparable period
        </p>
        <p className="mt-2 text-xl font-black text-zinc-200">
          {growth.previous === null
            ? "Not available"
            : numberFormatter.format(growth.previous)}
        </p>
      </div>
      <ChangeLine value={growth.changePercent} />
    </section>
  );
}

type TrendSeries = {
  label: string;
  points: AdminOperationsDailyPoint[];
  color: string;
};

function TrendChart({
  id,
  title,
  description,
  series,
}: {
  id: string;
  title: string;
  description: string;
  series: TrendSeries[];
}) {
  const axis = series.reduce<AdminOperationsDailyPoint[]>(
    (longest, item) => (item.points.length > longest.length ? item.points : longest),
    []
  );
  const values = series.flatMap((item) => item.points.map((point) => point.value));
  const maximum = Math.max(1, ...values);
  const hasData = axis.length > 0;

  return (
    <figure
      aria-labelledby={`${id}-title`}
      className="min-w-0 rounded-2xl border border-white/10 bg-black/25 p-4 sm:p-5"
    >
      <figcaption>
        <h3
          id={`${id}-title`}
          className="break-words font-black text-white"
        >
          {title}
        </h3>
        <p className="mt-1 text-xs leading-5 text-zinc-500">{description}</p>
      </figcaption>

      {hasData ? (
        <>
          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-bold text-zinc-400">
            {series.map((item) => (
              <span key={item.label} className="inline-flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                {item.label}
              </span>
            ))}
            <span className="ml-auto text-zinc-500">
              Peak {numberFormatter.format(Math.max(0, ...values))}
            </span>
          </div>

          <div className="mt-4 rounded-xl border border-white/10 bg-zinc-950/80 p-2 sm:p-3">
            <svg
              aria-hidden="true"
              className="h-44 w-full"
              preserveAspectRatio="none"
              viewBox="0 0 720 180"
            >
              {[0, 1, 2, 3].map((line) => (
                <line
                  key={line}
                  x1="0"
                  x2="720"
                  y1={12 + line * 52}
                  y2={12 + line * 52}
                  stroke="rgba(255,255,255,0.08)"
                  strokeWidth="1"
                />
              ))}
              {series.map((item) => (
                <g key={item.label}>
                  <path
                    d={buildTrendPath(item.points, maximum)}
                    fill="none"
                    stroke={item.color}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="3"
                    vectorEffect="non-scaling-stroke"
                  />
                  {item.points.map((point, index) => {
                    const coordinate = trendCoordinate(
                      point.value,
                      index,
                      item.points.length,
                      maximum
                    );
                    return (
                      <circle
                        key={`${item.label}-${point.date}`}
                        cx={coordinate.x}
                        cy={coordinate.y}
                        fill={item.color}
                        r="3"
                        vectorEffect="non-scaling-stroke"
                      />
                    );
                  })}
                </g>
              ))}
            </svg>
          </div>

          <div className="mt-2 flex items-center justify-between gap-4 text-[10px] font-black uppercase tracking-wider text-zinc-600">
            <span>{axis[0]?.label}</span>
            <span>{axis.at(-1)?.label}</span>
          </div>

          <table className="sr-only">
            <caption>{title}</caption>
            <thead>
              <tr>
                <th>Date</th>
                {series.map((item) => (
                  <th key={item.label}>{item.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {axis.map((point, index) => (
                <tr key={point.date}>
                  <th>{point.label}</th>
                  {series.map((item) => (
                    <td key={item.label}>{item.points[index]?.value ?? 0}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <EmptyPanel className="mt-4">
          No daily activity is available for this period.
        </EmptyPanel>
      )}
    </figure>
  );
}

function DistributionChart({
  title,
  description,
  points,
}: {
  title: string;
  description: string;
  points: AdminOperationsGroupPoint[];
}) {
  const total = points.reduce((sum, point) => sum + point.value, 0);

  return (
    <figure className="min-w-0 rounded-2xl border border-white/10 bg-black/25 p-4 sm:p-5">
      <figcaption>
        <h3 className="break-words font-black text-white">{title}</h3>
        <p className="mt-1 text-xs leading-5 text-zinc-500">{description}</p>
      </figcaption>

      {points.length > 0 && total > 0 ? (
        <div className="mt-5 space-y-4">
          {points.map((point, index) => {
            const share = (point.value / total) * 100;
            return (
              <div key={point.label}>
                <div className="flex min-w-0 items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 break-words font-bold text-zinc-300">
                    {point.label}
                  </span>
                  <span className="shrink-0 font-black text-white">
                    {numberFormatter.format(point.value)}
                    <span className="ml-1 text-[10px] text-zinc-600">
                      {percentFormatter.format(share)}%
                    </span>
                  </span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/[0.07]">
                  <div
                    aria-hidden="true"
                    className={`h-full rounded-full ${barColors[index % barColors.length]}`}
                    style={{ width: `${Math.max(share, point.value > 0 ? 2 : 0)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyPanel className="mt-4">
          No records are available for this view.
        </EmptyPanel>
      )}
    </figure>
  );
}

function WhoDisclosure({
  id,
  title,
  description,
  rows,
  emptyMessage,
  defaultOpen = false,
}: {
  id?: string;
  title: string;
  description: string;
  rows: AdminOperationsRow[];
  emptyMessage: string;
  defaultOpen?: boolean;
}) {
  return (
    <details
      id={id}
      open={defaultOpen && rows.length > 0}
      className="group min-w-0 rounded-2xl border border-white/10 bg-black/25 open:border-orange-500/25"
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-start justify-between gap-3 p-4 marker:hidden sm:p-5">
        <span className="min-w-0">
          <span className="block break-words font-black text-white">{title}</span>
          <span className="mt-1 block text-xs leading-5 text-zinc-500">
            {description}
          </span>
        </span>
        <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-zinc-400">
          {rows.length} recent shown
        </span>
      </summary>

      <div className="border-t border-white/10 p-3 sm:p-4">
        {rows.length > 0 ? (
          <div className="grid gap-2">
            {rows.map((row) => (
              <WhoRow key={row.id} row={row} />
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-white/10 p-4 text-sm leading-6 text-zinc-500">
            {emptyMessage}
          </p>
        )}
      </div>
    </details>
  );
}

function WhoRow({ row }: { row: AdminOperationsRow }) {
  return (
    <Link
      href={row.href}
      className="group/row flex min-h-11 min-w-0 flex-col gap-3 rounded-xl border border-white/10 bg-white/[0.035] p-3 transition hover:border-orange-400/40 hover:bg-orange-500/10 sm:flex-row sm:items-center sm:justify-between"
    >
      <span className="min-w-0">
        <strong className="block break-words text-sm text-white">
          {row.primary}
        </strong>
        <span className="mt-1 block break-words text-xs text-zinc-400">
          {row.secondary}
        </span>
        <span className="mt-1 block break-words text-[10px] font-black uppercase tracking-wider text-zinc-600">
          {row.meta}
        </span>
      </span>
      <span className="flex shrink-0 items-center justify-between gap-3 sm:justify-end">
        <time
          dateTime={row.timestamp}
          className="text-xs font-bold text-zinc-500"
        >
          {formatAdminDateTime(row.timestamp)}
        </time>
        <ArrowRight
          aria-hidden="true"
          className="h-4 w-4 text-zinc-600 transition group-hover/row:translate-x-0.5 group-hover/row:text-orange-300"
        />
      </span>
    </Link>
  );
}

function EmptyPanel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={`rounded-xl border border-dashed border-white/10 p-4 text-sm leading-6 text-zinc-500 ${className}`}
    >
      {children}
    </p>
  );
}

function trendCoordinate(
  value: number,
  index: number,
  length: number,
  maximum: number
) {
  const x = length <= 1 ? 360 : (index / (length - 1)) * 720;
  const y = 168 - (value / maximum) * 156;
  return { x, y };
}

function buildTrendPath(
  points: AdminOperationsDailyPoint[],
  maximum: number
) {
  return points
    .map((point, index) => {
      const coordinate = trendCoordinate(
        point.value,
        index,
        points.length,
        maximum
      );
      return `${index === 0 ? "M" : "L"}${coordinate.x},${coordinate.y}`;
    })
    .join(" ");
}

function formatOptionalPercent(value: number | null) {
  return value === null ? "Not available" : `${percentFormatter.format(value)}%`;
}

function formatSignedPercent(value: number) {
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${percentFormatter.format(value)}%`;
}

function formatAdminDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time unavailable";

  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(date);
}
