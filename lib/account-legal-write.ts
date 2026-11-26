import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function recordCurrentAccountLegalAcceptance(
  userId: string,
  form: Pick<FormData, "get">,
  scope: "account" | "caster" = "account",
): Promise<"accepted" | "acceptance-required" | "unavailable"> {
  const termsId = form.get("termsDocumentId");
  const privacyId = form.get("privacyDocumentId");
  if (!isUuid(termsId) || !isUuid(privacyId) || form.get("termsAccepted") !== "accepted" ||
    form.get("privacyAcknowledged") !== "acknowledged") return "acceptance-required";

  try {
    const supabase = createSupabaseAdminClient();
    // The caster wrapper uses the same transaction under the durable account
    // closure lock. Its actor and document IDs can only come from this server.
    const result = scope === "caster"
      ? await supabase.rpc("caster_phase1_accept_legal", {
        p_actor: userId,
        p_terms_document_id: termsId,
        p_privacy_document_id: privacyId,
      }).abortSignal(AbortSignal.timeout(4_000))
      : await supabase.rpc("accept_current_account_legal_documents", {
        p_clerk_user_id: userId,
        p_expected_terms_document_id: termsId,
        p_expected_privacy_document_id: privacyId,
        p_terms_accepted: true,
        p_privacy_acknowledged: true,
      });
    if (!result.error && isAcceptanceResult(result.data, termsId, privacyId)) return "accepted";
  } catch {
    // A provider failure cannot establish that the current documents were accepted.
  }
  console.error("Account legal acceptance transaction failed.");
  return "unavailable";
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function isAcceptanceResult(value: unknown, termsId: string, privacyId: string): boolean {
  const candidate = Array.isArray(value) && value.length === 1 ? value[0] : null;
  return Boolean(candidate && typeof candidate === "object" &&
    isUuid(candidate.acceptance_id) && typeof candidate.accepted_at === "string" &&
    Number.isFinite(Date.parse(candidate.accepted_at)) &&
    candidate.terms_document_id === termsId && candidate.privacy_document_id === privacyId);
}
