import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import AdminOperationsDashboard from "@/components/admin/operations/AdminOperationsDashboard";
import { loadAdminOperationsMetrics } from "@/lib/admin-operations";
import { parseAdminOperationsPeriod } from "@/lib/admin-operations-metrics";
import { hasCurrentPatch2AdminAccess } from "@/lib/patch2-admin-access";
import { loadAdminWebsiteTraffic } from "@/lib/vercel-web-analytics";

type AdminOperationsPageProps = {
  searchParams: Promise<{ period?: string | string[] }>;
};

export default async function AdminOperationsPage({
  searchParams,
}: AdminOperationsPageProps) {
  const { userId, sessionClaims, sessionId } = await auth();
  if (!await hasCurrentPatch2AdminAccess(userId, sessionClaims, sessionId)) redirect("/");

  const params = await searchParams;
  const period = parseAdminOperationsPeriod(params.period);
  const [metrics, websiteTraffic] = await Promise.all([
    loadAdminOperationsMetrics(period),
    loadAdminWebsiteTraffic(),
  ]);

  if (!metrics || !websiteTraffic) redirect("/");

  return (
    <AdminOperationsDashboard
      metrics={metrics}
      websiteTraffic={websiteTraffic}
    />
  );
}
