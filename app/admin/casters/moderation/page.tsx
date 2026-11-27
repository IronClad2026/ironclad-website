import { notFound } from "next/navigation";
import AdminAccessRequired from "@/components/admin/AdminAccessRequired";
import { requireCurrentAccountLegalAcceptance } from "@/lib/account-legal-mutation-guard";
import { isCasterProgramEnabled } from "@/lib/caster/environment";
import { casterRpc } from "@/lib/caster/server";
import { requireCurrentPatch2Admin } from "@/lib/patch2-admin-access";
import CasterAdminNavigation from "../CasterAdminNavigation";
import { casterAdminFrame } from "../admin-application-styles";
import type { CasterModerationList } from "../moderation-contracts";
import ModerationQueue from "./ModerationQueue";

export const dynamic = "force-dynamic";

export default async function CasterModerationPage() {
  if (!isCasterProgramEnabled()) notFound();
  let actor: string;
  try {
    actor = await requireCurrentPatch2Admin();
    await requireCurrentAccountLegalAcceptance();
  } catch {
    return <AdminAccessRequired />;
  }

  const snapshot = await casterRpc<CasterModerationList>("caster_phase3_admin_list", {
    p_actor: actor, p_status: null, p_query: null, p_offset: 0,
  });

  return (
    <main className={casterAdminFrame}>
      <h1 className="text-3xl font-black sm:text-4xl">Caster moderation</h1>
      <CasterAdminNavigation current="moderation" />
      <ModerationQueue initialSnapshot={snapshot?.status === "ok" ? snapshot : null} />
    </main>
  );
}
