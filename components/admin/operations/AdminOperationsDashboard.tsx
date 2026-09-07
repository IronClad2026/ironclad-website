import AnalyticsWorkspace from "./AnalyticsWorkspace";
import PlayersAnalytics from "./PlayersAnalytics";
import RegistrationsAnalytics from "./RegistrationsAnalytics";
import TournamentsAnalytics from "./TournamentsAnalytics";
import MatchesAnalytics from "./MatchesAnalytics";
import WebsiteTrafficSection from "@/components/admin/operations/WebsiteTrafficSection";
import OperationsLiveOverview from "@/components/admin/operations/OperationsLiveOverview";
import type { AdminOperationsMetrics } from "@/lib/admin-operations-metrics";
import type { WebsiteTrafficAnalytics } from "@/lib/vercel-web-analytics-types";
import styles from "./operations.module.css";

const sections = [["operations-overview", "Current operations"], ["attention-required", "Attention"], ["competition-context", "Competition"], ["players", "Players"], ["registrations", "Registrations"], ["tournaments", "Tournaments"], ["matches", "Matches"], ["website-traffic", "Traffic"], ["platform-health", "Participation"]];

export default function AdminOperationsDashboard({ metrics, websiteTraffic }: { metrics: AdminOperationsMetrics; websiteTraffic: WebsiteTrafficAnalytics }) {
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
        <AnalyticsWorkspace period={metrics.period} panels={{
          players: <PlayersAnalytics metrics={metrics} />,
          registrations: <RegistrationsAnalytics metrics={metrics} />,
          tournaments: <TournamentsAnalytics metrics={metrics} />,
          matches: <MatchesAnalytics metrics={metrics} />,
          "website-traffic": <WebsiteTrafficSection analytics={websiteTraffic} />,
        }} />
      </div>
    </main>
  );
}
