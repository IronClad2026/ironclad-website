import { Trophy, HeartPulse } from "lucide-react";
import { SectionShell, MetricBand, TrendChart, DistributionChart } from "./OperationsPrimitives";
import type { AdminOperationsMetrics } from "@/lib/admin-operations-metrics";
const chartColors = ["#fb923c", "#38bdf8"];
const formatOptionalPercent = (value: number | null) => value === null ? "Not available" : new Intl.NumberFormat("en-AU", { maximumFractionDigits: 1 }).format(value) + "%";

export default function TournamentsAnalytics({ metrics }: { metrics: AdminOperationsMetrics }) {
  const periodLabel = metrics.period.label;
  return (
<div className="space-y-5"><SectionShell
          id="tournaments"
          eyebrow="Tournaments"
          title="Event lifecycle and Division delivery"
          description="Current Tournament state is separated from Events completed in the selected period."
          icon={Trophy}
        >
          <MetricBand
            title="Tournament state · Now"
            metrics={[
              { label: "Active", value: metrics.tournaments.active },
              {
                label: "Registration open now",
                value: metrics.tournaments.registrationOpenNow,
              },
              { label: "Total created", value: metrics.tournaments.total, qualifier: "All time" },
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

          <div className="mt-5 grid gap-5 lg:grid-cols-2">
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
<a href="#division-participation" className="inline-flex min-h-11 items-center text-sm text-orange-200 underline underline-offset-4">Approved participation by Division → Players</a>
          </div>
        </SectionShell><SectionShell
          id="platform-health"
          eyebrow="Historical reference"
          title="Participation & Completion"
          description="Retained participation and completion indicators, not infrastructure health or uptime."
          icon={HeartPulse}
        >
          <MetricBand
            title="All-time participation and completion"
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
        </SectionShell></div>
  );
}
