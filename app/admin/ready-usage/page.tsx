import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { loadReadySuggestions, readySuggestionFilters } from "@/lib/ready/suggestions-admin";
import { loadReadyUsageReport, type ReadyUsageSearchParams } from "@/lib/ready/usage-admin";
import ReadyUsageDashboard, { ReadyUsageFrame } from "./dashboard";
import ReadySuggestionsDashboard from "./suggestions";

export const metadata: Metadata = {
  title: "Ready usage | IronClad Admin",
  robots: { index: false, follow: false },
};

export default async function AdminReadyUsagePage({ searchParams }: { searchParams: Promise<ReadyUsageSearchParams> }) {
  const params = await searchParams;
  if (params.view === "suggestions") {
    const result = await loadReadySuggestions(readySuggestionFilters(params.suggestionStatus, params.suggestionPage));
    if (result.status === "unauthorized") redirect("/");
    return <ReadyUsageFrame view="suggestions"><ReadySuggestionsDashboard result={result} notice={params.notice} /></ReadyUsageFrame>;
  }
  const result = await loadReadyUsageReport(params);
  if (result.status === "unauthorized") redirect("/");
  return <ReadyUsageFrame view="activity"><ReadyUsageDashboard result={result} /></ReadyUsageFrame>;
}
