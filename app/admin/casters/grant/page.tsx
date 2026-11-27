import { notFound } from "next/navigation";
import AdminAccessRequired from "@/components/admin/AdminAccessRequired";
import { isCasterProgramEnabled } from "@/lib/caster/environment";
import { requireCurrentPatch2Admin } from "@/lib/patch2-admin-access";
import CasterAdminNavigation from "../CasterAdminNavigation";
import { casterAdminFrame } from "../admin-application-styles";
import GrantCasterAccess from "./GrantCasterAccess";

export const dynamic = "force-dynamic";

export default async function CasterGrantPage() {
  if (!isCasterProgramEnabled()) notFound();
  try {
    await requireCurrentPatch2Admin();
  } catch {
    return <AdminAccessRequired />;
  }

  return (
    <main className={casterAdminFrame}>
      <h1 className="text-3xl font-black sm:text-4xl">Grant caster access</h1>
      <CasterAdminNavigation current="grants" />
      <GrantCasterAccess />
    </main>
  );
}
