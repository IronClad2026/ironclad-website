import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import AdminOperationsDashboard from "@/components/admin/operations/AdminOperationsDashboard";
import { loadAdminOperationsMetrics } from "@/lib/admin-operations";
import { parseAdminOperationsPeriod } from "@/lib/admin-operations-metrics";

type CustomClaims = { metadata?: { role?: string } };
type AdminOperationsPageProps = {
  searchParams: Promise<{ period?: string | string[] }>;
};

export default async function AdminOperationsPage({
  searchParams,
}: AdminOperationsPageProps) {
  const { userId, sessionClaims } = await auth();
  const role = (sessionClaims as CustomClaims | null)?.metadata?.role;

  if (!userId || role !== "admin") redirect("/");

  const params = await searchParams;
  const period = parseAdminOperationsPeriod(params.period);
  const metrics = await loadAdminOperationsMetrics(period);

  if (!metrics) redirect("/");

  return <AdminOperationsDashboard metrics={metrics} />;
}
