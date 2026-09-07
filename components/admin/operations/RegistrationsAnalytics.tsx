import { UserPlus } from "lucide-react";
import { WhoDisclosure } from "./OperationsRecords";
import { SectionShell, MetricBand, TrendChart, GrowthCard, DistributionChart } from "./OperationsPrimitives";
import type { AdminOperationsMetrics } from "@/lib/admin-operations-metrics";
const chartColors = ["#fb923c", "#38bdf8"];
const formatOptionalPercent = (value: number | null) => value === null ? "Not available" : new Intl.NumberFormat("en-AU", { maximumFractionDigits: 1 }).format(value) + "%";

export default function RegistrationsAnalytics({ metrics }: { metrics: AdminOperationsMetrics; }) {
  const periodLabel = metrics.period.label;
  return (
    <SectionShell
      id="registrations"
      eyebrow="Registrations"
      title="Registration flow and current decisions"
      description="Selected-period registration and withdrawal flows are kept separate from current decision and waitlist states."
      icon={UserPlus}
    >
      <MetricBand title="Registration decisions · Now" metrics={["Pending", "Manual review", "Raw waitlisted"].map((label) => ({ label, value: metrics.registrations.statusGroups.find((point) => point.label === label)?.value ?? 0 }))} />
      <MetricBand className="mt-3" title="Waiting and open offers · Now" metrics={["Waiting Now", "Offered Now"].map((label) => ({ label, value: metrics.registrations.waitlistOfferGroups.find((point) => point.label === label)?.value ?? 0 }))} />
      <p className="mt-3 text-xs text-zinc-400">Counts are complete aggregates; previews show at most eight recent records per group. Open offers below are distinct from past-due offers in Attention Required.</p>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">              <WhoDisclosure
        title="Pending · Now"
        description="Registrations currently awaiting an Admin decision."
        dateLabel="Created" rows={metrics.registrations.who.pending}
        emptyMessage="No recent pending-registration preview rows are available."
      />
        <WhoDisclosure
          title="Manual review · Now"
          description="Registrations currently marked for manual review."
          dateLabel="Created" rows={metrics.registrations.who.manualReview}
          emptyMessage="No recent manual-review preview rows are available."
        />
        <WhoDisclosure
          title="Waiting Now"
          description="Waitlisted registrations with no vacancy-offer state."
          dateLabel="Created" rows={metrics.registrations.who.waitlisted}
          emptyMessage="No recent waiting-registration preview rows are available."
        />
        <WhoDisclosure
          title="Vacancy offered · Now"
          description="Waitlisted registrations with a current vacancy offer."
          dateLabel="Offered / created" rows={metrics.registrations.who.vacancyOffered}
          emptyMessage="No recent open-offer preview rows are available."
        /></div>
      <MetricBand className="mt-5" title={`Selected period · ${periodLabel}`} metrics={[{ label: "Registrations submitted", value: metrics.registrations.registeredInPeriod }, { label: "Withdrawn", value: metrics.registrations.withdrawnInPeriod }]} />
      <div className="mt-4 flex flex-col gap-4">
        <GrowthCard
          title="Registration growth"
          periodLabel={periodLabel}
          growth={metrics.registrations.growth}
        />
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

      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">              <WhoDisclosure
        title={`Registered · ${periodLabel}`}
        description="Recent registrations created in the selected period."
        dateLabel="Created" rows={metrics.registrations.who.registered}
        emptyMessage="No registrations were created in this period."
      />
        <WhoDisclosure
          title={`Withdrawn · ${periodLabel}`}
          description="Registration withdrawals recorded in the selected period."
          dateLabel="Withdrawn" rows={metrics.registrations.who.withdrawn}
          emptyMessage="No registration withdrawals were recorded in this period."
        />
        <WhoDisclosure
          title={`Vacancy accepted · ${periodLabel}`}
          description="Retained acceptances resolved in the selected period."
          dateLabel="Resolved" rows={metrics.registrations.who.vacancyAccepted}
          emptyMessage="No accepted vacancy-offer rows are available."
        />
        <WhoDisclosure
          title={`Vacancy declined · ${periodLabel}`}
          description="Retained declines resolved in the selected period."
          dateLabel="Resolved" rows={metrics.registrations.who.vacancyDeclined}
          emptyMessage="No declined vacancy-offer rows are available."
        />
        <WhoDisclosure
          title={`Vacancy expired · ${periodLabel}`}
          description="Retained expiries resolved in the selected period."
          dateLabel="Resolved" rows={metrics.registrations.who.vacancyExpired}
          emptyMessage="No expired vacancy-offer rows are available."
        /></div>
      <details className="mt-5 rounded-xl border border-white/10 p-4"><summary className="min-h-11 cursor-pointer content-center font-semibold">Retained registration history and distributions</summary>
        <MetricBand title="All-time registration records" metrics={[{ label: "All registration records", value: metrics.registrations.total }, { label: "Withdrawal / registration rate", value: formatOptionalPercent(metrics.registrations.withdrawalRate), qualifier: "All time" }]} />
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

        <WhoDisclosure
          title="Rejected · Now"
          description="Registrations currently retained with a rejected decision."
          dateLabel="Created" rows={metrics.registrations.who.rejected}
          emptyMessage="No recent rejected-registration preview rows are available."
        /></details>
    </SectionShell>
  );
}
