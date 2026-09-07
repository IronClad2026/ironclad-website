import { GitBranch, HeartPulse, Trophy, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import WebsiteTrafficSection from "@/components/admin/operations/WebsiteTrafficSection";
import OperationsLiveOverview from "@/components/admin/operations/OperationsLiveOverview";
import { WhoDisclosure } from "@/components/admin/operations/OperationsRecords";
import { SectionShell, MetricBand, TrendChart, GrowthCard, DistributionChart, SubsectionHeading } from "@/components/admin/operations/OperationsPrimitives";
import type { AdminOperationsMetrics } from "@/lib/admin-operations-metrics";
import type { WebsiteTrafficAnalytics } from "@/lib/vercel-web-analytics-types";
import styles from "./operations.module.css";

const chartColors = ["#fb923c", "#38bdf8", "#34d399", "#facc15"];
const periodOptions = [{ key: "today", label: "Today" }, { key: "7d", label: "7 days" }, { key: "30d", label: "30 days" }, { key: "all", label: "All time" }];
const sections = [["operations-overview", "Current operations"], ["attention-required", "Attention"], ["competition-context", "Competition"], ["players", "Players"], ["registrations", "Registrations"], ["tournaments", "Tournaments"], ["matches", "Matches"], ["website-traffic", "Traffic"], ["platform-health", "Participation"]];
const formatOptionalPercent = (value: number | null) => value === null ? "Not available" : new Intl.NumberFormat("en-AU", { maximumFractionDigits: 1 }).format(value) + "%";

export default function AdminOperationsDashboard({ metrics, websiteTraffic }: { metrics: AdminOperationsMetrics; websiteTraffic: WebsiteTrafficAnalytics }) {
  const periodLabel = metrics.period.label;
  return (
    <main lang="en" className={styles.workspace + " relative z-10 min-h-screen min-w-0 bg-black px-4 pb-16 pt-28 text-white sm:px-6 sm:pt-32 lg:px-8"}>
      <a href="#operations-overview" className="sr-only focus:not-sr-only">Skip to current operations</a>
      <div className="mx-auto max-w-7xl space-y-6">
        <OperationsLiveOverview metrics={metrics} navigation={<details className="rounded-xl border border-white/10 bg-zinc-950">
          <summary className="flex min-h-11 cursor-pointer items-center px-4 text-sm font-semibold">Jump to section</summary>
          <nav aria-label="Operations sections" className="grid grid-cols-2 gap-1 border-t border-white/10 p-2 sm:grid-cols-3 lg:grid-cols-5">
            {sections.map(([id, label]) => <a key={id} href={`#${id}`} className="flex min-h-11 items-center rounded-lg px-3 text-sm text-zinc-300 hover:bg-white/5">{label}</a>)}
          </nav>
        </details>} />
        <section aria-label="Dashboard period" className="rounded-xl border border-white/10 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="font-bold">Activity period · {periodLabel}</h2><p className="mt-1 text-sm text-zinc-400">UTC activity period. Current-state values are unaffected. Traffic uses fixed windows.</p></div>
            <nav aria-label="Choose dashboard period" className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
              {periodOptions.map((option) => <Link key={option.key} href={`/admin/operations?period=${option.key}`} aria-current={metrics.period.key === option.key ? "page" : undefined} className={`inline-flex min-h-11 items-center justify-center rounded-lg border px-3 text-sm font-semibold ${metrics.period.key === option.key ? "border-orange-400 bg-orange-500/15 text-orange-100" : "border-white/10 text-zinc-300"}`}>{option.label}</Link>)}
            </nav>
          </div>
        </section>
        <WebsiteTrafficSection analytics={websiteTraffic} />

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

          <div className="mt-5">
            <a href="#match-issues" className="text-sm font-semibold text-orange-300 underline underline-offset-4">View current match attention above</a>
            <WhoDisclosure title="Confirmed no-shows" description="Recent factual no-show outcomes, distinct from withdrawals and forfeits." rows={metrics.matches.who.noShows} emptyMessage="No confirmed no-show rows are available." />
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
