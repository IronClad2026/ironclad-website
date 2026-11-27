import { notFound } from "next/navigation";
import AdminAccessRequired from "@/components/admin/AdminAccessRequired";
import { isCasterProgramEnabled } from "@/lib/caster/environment";
import { casterRpc } from "@/lib/caster/server";
import { requireCurrentPatch2Admin } from "@/lib/patch2-admin-access";
import CasterAdminNavigation from "../CasterAdminNavigation";
import type { CasterAdminApplicationList } from "../admin-application-contracts";
import { casterAdminFrame } from "../admin-application-styles";
import ApplicationsQueue from "./ApplicationsQueue";

export const dynamic = "force-dynamic";

export default async function ApplicationsPage() {
  if (!isCasterProgramEnabled()) notFound();
  let actor: string;
  try {
    actor = await requireCurrentPatch2Admin();
  } catch {
    return <AdminAccessRequired />;
  }

  const result = await casterRpc<CasterAdminApplicationList>("caster_phase2_admin_list", {
    p_actor: actor,
    p_status: "submitted",
    p_query: null,
    p_offset: 0,
  });

  return (
    <main className={casterAdminFrame}>
      <h1 className="text-3xl font-black sm:text-4xl">Caster applications</h1>
      <CasterAdminNavigation current="applications" />
      <ApplicationsQueue initialSnapshot={result?.status === "ok" ? result : null} />
    </main>
  );
}
