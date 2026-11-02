"use server";

import { redirect } from "next/navigation";
import { requireCurrentAccountLegalAcceptance } from "@/lib/account-legal-mutation-guard";
import { isUuid, parseLegacyAssistanceScope, requireLegacyAssistanceAdmin } from "@/lib/admin-legacy-assistance";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export async function setLegacyAssistanceStatus(form: FormData) {
  const admin = await requireLegacyAssistanceAdmin();
  await requireCurrentAccountLegalAcceptance();
  let tournamentId: string | null;
  try {
    if (["kind", "tournamentId", "requestId", "version", "status"].some((key) => form.getAll(key).length > 1)) throw new Error();
    tournamentId = parseLegacyAssistanceScope(form.get("kind"), form.get("tournamentId"));
  } catch { redirect("/admin/notifications?notice=assistance-context-required"); }
  const params = new URLSearchParams({ kind: tournamentId ? "tournament" : "unassigned" });
  if (tournamentId) params.set("tournamentId", tournamentId);
  const id = form.get("requestId");
  const status = form.get("status");
  const version = Number(form.get("version"));
  let updated = false;
  if (isUuid(id) && typeof status === "string" && ["open", "in_progress", "resolved"].includes(status) && Number.isSafeInteger(version) && version > 0) {
    const { data, error } = await createSupabaseAdminClient().rpc("set_legacy_assistance_status", {
      p_id: id.toLowerCase(), p_tournament_id: tournamentId, p_status: status,
      p_expected_version: version, p_admin_clerk_id: admin,
    });
    updated = !error && data === true;
  }
  params.set("notice", updated ? "updated" : "stale");
  redirect("/admin/notifications/legacy-assistance?" + params.toString());
}
