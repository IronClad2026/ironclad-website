import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import AdminOperationsDashboard from "@/components/admin/operations/AdminOperationsDashboard";
import AdminSidebar from "@/components/admin/AdminSidebar";
import { emptyOperationsMetrics } from "../../fixtures/admin-operations";
import { parseAdminOperationsPeriod, resolveAdminOperationsPeriod } from "@/lib/admin-operations-metrics";
import type { WebsiteTrafficAnalytics } from "@/lib/vercel-web-analytics-types";
import { blockNetwork } from "./runtime";
import "@/app/globals.css";
blockNetwork();
function Fixture() {
  const [refreshes, setRefreshes] = useState(0);
  useEffect(() => { const refresh = () => setRefreshes((count) => count + 1); window.addEventListener("operations-fixture-refresh", refresh); return () => window.removeEventListener("operations-fixture-refresh", refresh); }, []);
  const query = new URLSearchParams(location.search);
  const metrics = emptyOperationsMetrics();
  metrics.generatedAt = new Date(Date.UTC(2026, 8, 7, 12, refreshes)).toISOString();
  metrics.period = resolveAdminOperationsPeriod(parseAdminOperationsPeriod(query.get("period")), new Date(metrics.generatedAt));
  if (!query.has("empty")) {
    metrics.attention.forEach((item, index) => { item.count = [2, 1, 3, 1, 1, 1, 2][index]; });
    metrics.overview.openIssues.value = 11;
    metrics.overview.activeTournaments.value = metrics.tournaments.active = 3;
    metrics.tournaments.registrationOpenNow = 2;
    metrics.matches.active = 8; metrics.matches.playable = 4; metrics.matches.readyForActivation = 2;
    metrics.matches.operationalHealth.awaitingConfirmation = 3;
    Object.assign(metrics.matches.operationalHealth, { openDisputes: 2, underAdminReview: 1, pendingAdminAssistance: 3, overdueMatchActions: 1, expiredConfirmationActions: 1, expiredWaitlistOffers: 1, activeAdminHolds: 2 });
    metrics.registrations.statusGroups = [{ label: "Pending", value: 19 }, { label: "Manual review", value: 11 }, { label: "Approved", value: 63 }];
    metrics.players.total = 120; metrics.players.openAccounts = 112;
    metrics.players.completedProfiles = 104; metrics.players.steamLinked = 101; metrics.players.relicVerified = 96; metrics.players.publicProfiles = 78;
    metrics.players.growth = { current: 12, previous: 8, changePercent: 50 };
    metrics.registrations.growth = { current: 25, previous: 20, changePercent: 25 };
    metrics.players.daily = [{ date: "2026-09-01", label: "01 Sep", value: 2 }, { date: "2026-09-02", label: "02 Sep", value: 7 }, { date: "2026-09-07", label: "07 Sep", value: 3 }];
    metrics.registrations.daily = metrics.players.daily;
    metrics.registrations.withdrawalsDaily = [{ date: "2026-09-02", label: "02 Sep", value: 1 }, { date: "2026-09-07", label: "07 Sep", value: 0 }];
    const row = { id: "fixture-match", primary: query.has("long") ? "VeryLongUnbrokenPlayerName".repeat(5) : "Iron Vanguard vs Steel Division", secondary: "IronClad Open · Main / Pro", meta: "Open dispute", timestamp: metrics.generatedAt, href: "/tournaments?tournament=fixture-event&tab=brackets&match=fixture-match" };
    metrics.matches.who.disputed = [row];
    metrics.matches.who.underReview = [{ ...row, id: "review", meta: "Admin review" }];
    metrics.players.closedAccounts = [{ ...row, id: "closed", primary: "Retained closed account", href: "/admin/operations#who-left" }];
  }
  const point = { label: "/", visitors: 24, pageViews: 67 };
  const traffic: WebsiteTrafficAnalytics = query.has("unavailable") ? { status: "unavailable", reason: "provider-unavailable" } : {
    status: "available", timezone: "UTC", generatedAt: metrics.generatedAt,
    summary: { today: { visitors: 4, pageViews: 11 }, sevenDays: { visitors: 24, pageViews: 67 }, thirtyDays: { visitors: 95, pageViews: 210 } },
    trend: [{ date: "2026-09-01", visitors: 2, pageViews: 5 }, ...(query.has("single") ? [] : [{ date: "2026-09-02", visitors: 5, pageViews: 9 }, { date: "2026-09-07", visitors: 4, pageViews: 11 }])],
    breakdowns: { routes: [point], countries: [{ ...point, label: "Australia" }], referrers: [{ ...point, label: "example.com" }], devices: [{ ...point, label: "Desktop" }], browsers: [{ ...point, label: "Chrome" }], operatingSystems: [{ ...point, label: "Windows" }] },
  };
  return <><div className="fixed inset-x-0 top-0 z-50 flex h-24 items-center border-b border-white/10 bg-black px-6 font-bold text-white">IRONCLAD <span className="ml-3 text-xs font-normal text-zinc-400">Isolated presentation fixture</span></div><div className="w-full min-w-0 xl:mx-auto xl:grid xl:max-w-[1680px] xl:grid-cols-[15rem_minmax(0,1fr)] xl:items-start"><AdminSidebar /><AdminOperationsDashboard metrics={metrics} websiteTraffic={traffic} /></div></>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
