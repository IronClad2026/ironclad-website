import { GitBranch } from "lucide-react";
import { WhoDisclosure } from "./OperationsRecords";
import { SectionShell, MetricBand, DistributionChart, SubsectionHeading } from "./OperationsPrimitives";
import type { AdminOperationsMetrics } from "@/lib/admin-operations-metrics";

export default function MatchesAnalytics({ metrics }: { metrics: AdminOperationsMetrics }) {
  return (
<SectionShell
          id="matches"
          eyebrow="Matches & Results"
          title="Match state, outcomes and result resolution"
          description="Launched-bracket Matches only. Active and playable states are distinct; factual outcomes are separate from result resolution."
          icon={GitBranch}
        >
          <MetricBand
            title="Match state · Now"
            metrics={[
              { label: "Active", value: metrics.matches.active },
              { label: "Playable now", value: metrics.matches.playable },
              {
                label: "Ready for activation",
                value: metrics.matches.readyForActivation,
              },
              { label: "Awaiting confirmation", value: metrics.matches.operationalHealth.awaitingConfirmation },
            ]}
          />

          <div className="mt-7 border-t border-white/10 pt-6">
            <SubsectionHeading
              title="Recorded operational conditions · Now"
              description="Current Match and waitlist conditions that may require intervention."
            />
            <MetricBand
              className="mt-4"
              title="Current recorded conditions"
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

<a href="#match-issues" className="my-4 inline-flex min-h-11 items-center text-sm text-orange-200 underline underline-offset-4">View current match attention and record previews above</a>
<MetricBand title="Retained Match records · All time" metrics={[{ label: "Total Match records", value: metrics.matches.total }, { label: "Completed Match records", value: metrics.matches.completed }]} />
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

          <div className="mt-5">
            
            <WhoDisclosure title="Confirmed no-shows" description="Recent factual no-show outcomes, distinct from withdrawals and forfeits." rows={metrics.matches.who.noShows} emptyMessage="No confirmed no-show rows are available." />
          </div>
        </SectionShell>
  );
}
