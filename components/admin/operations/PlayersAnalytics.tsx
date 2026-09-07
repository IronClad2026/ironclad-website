import { Users } from "lucide-react";
import { WhoDisclosure } from "./OperationsRecords";
import { SectionShell, MetricBand, TrendChart, GrowthCard, DistributionChart } from "./OperationsPrimitives";
import type { AdminOperationsMetrics } from "@/lib/admin-operations-metrics";
const chartColors = ["#fb923c", "#38bdf8"];

export default function PlayersAnalytics({ metrics }: { metrics: AdminOperationsMetrics }) {
  const periodLabel = metrics.period.label;
  return (
<SectionShell
          id="players"
          eyebrow="Players"
          title="Player readiness and participation"
          description="Independent readiness counts, not a sequential onboarding funnel. New-player activity follows below."
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

          <div className="mt-4 flex flex-col gap-4">
            <GrowthCard
              title="New-Player growth"
              periodLabel={periodLabel}
              growth={metrics.players.growth}
            />
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

          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-2">
            <div id="division-participation"><DistributionChart
              title="Approved participation by Division"
              description="Approved Tournament participation records, grouped by Division."
              points={metrics.players.participationByDivision}
            /></div>
            <WhoDisclosure
              id="who-left"
              title="Retained account-closure records"
              description="Bounded retained history, not an account-churn total. Separate from registration withdrawals, rejections, expiries and no-shows."
              rows={metrics.players.closedAccounts}
              emptyMessage="No retained account-closure rows are available."
            />
          </div>
        </SectionShell>
  );
}
