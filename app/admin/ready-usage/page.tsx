import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { loadReadyUsageReport, type ReadyUsageSearchParams } from "@/lib/ready/usage-admin";
import ReadyUsageDashboard from "./dashboard";

export const metadata: Metadata = {
  title: "Ready usage | IronClad Admin",
  robots: { index: false, follow: false },
};

export default async function AdminReadyUsagePage({ searchParams }: { searchParams: Promise<ReadyUsageSearchParams> }) {
  const result = await loadReadyUsageReport(await searchParams);
  if (result.status === "unauthorized") redirect("/");
  return <ReadyUsageDashboard result={result} />;
}
