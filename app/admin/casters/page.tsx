import { notFound } from "next/navigation";
import AdminAccessRequired from "@/components/admin/AdminAccessRequired";
import type { CasterInvitation, CasterInvitationEvent } from "@/lib/caster/contracts";
import { isCasterProgramEnabled } from "@/lib/caster/environment";
import { casterRpc } from "@/lib/caster/server";
import { requireCurrentPatch2Admin } from "@/lib/patch2-admin-access";
import InvitationManagement from "./InvitationManagement";

export const dynamic = "force-dynamic";

export default async function CasterManagement({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  if (!isCasterProgramEnabled()) notFound();

  let actor: string;
  try {
    actor = await requireCurrentPatch2Admin();
  } catch {
    return <AdminAccessRequired />;
  }

  const { page: rawPage } = await searchParams;
  const page = typeof rawPage === "string" && /^\d{1,3}$/.test(rawPage) ? Math.max(1, Number(rawPage)) : 1;
  const snapshot = await casterRpc<{
    invitations: CasterInvitation[]; events: CasterInvitationEvent[]; has_more_invitations: boolean; has_more_events: boolean;
  }>("caster_phase1_admin_snapshot", { p_actor: actor, p_offset: (page - 1) * 100 });
  if (!snapshot) {
    return <main className="px-5 pb-10 pt-28 text-white"><h1 className="text-3xl font-bold">Caster Management</h1>
      <p className="mt-4" role="alert">Invitations are temporarily unavailable. Reload this page to retry.</p></main>;
  }

  return <InvitationManagement invitations={snapshot.invitations} events={snapshot.events} page={page}
    hasMore={page < 999 && (snapshot.has_more_invitations || snapshot.has_more_events)} />;
}
