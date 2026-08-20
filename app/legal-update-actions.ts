"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AccountLegalAcceptanceActionState = {
  status: "idle" | "error" | "success";
  code:
    | "idle"
    | "auth-required"
    | "acceptance-required"
    | "unavailable"
    | "accepted";
};

export async function acceptAccountLegalUpdate(
  _previousState: AccountLegalAcceptanceActionState,
  formData: FormData
): Promise<AccountLegalAcceptanceActionState> {
  let userId: string | null;

  try {
    ({ userId } = await auth());
  } catch {
    console.error("Account legal acceptance authentication failed.");
    return { status: "error", code: "auth-required" };
  }

  if (!userId) {
    return { status: "error", code: "auth-required" };
  }

  const expectedTermsDocumentId = formData.get("termsDocumentId");
  const expectedPrivacyDocumentId = formData.get("privacyDocumentId");
  const termsAccepted = formData.get("termsAccepted") === "accepted";
  const privacyAcknowledged =
    formData.get("privacyAcknowledged") === "acknowledged";

  if (
    !isUuid(expectedTermsDocumentId) ||
    !isUuid(expectedPrivacyDocumentId) ||
    !termsAccepted ||
    !privacyAcknowledged
  ) {
    return { status: "error", code: "acceptance-required" };
  }

  let supabase: ReturnType<typeof createSupabaseAdminClient>;

  try {
    supabase = createSupabaseAdminClient();
  } catch {
    console.error("Account legal acceptance service configuration failed.");
    return { status: "error", code: "unavailable" };
  }

  let result: { data: unknown; error: unknown };

  try {
    result = await supabase.rpc("accept_current_account_legal_documents", {
      p_clerk_user_id: userId,
      p_expected_terms_document_id: expectedTermsDocumentId,
      p_expected_privacy_document_id: expectedPrivacyDocumentId,
      p_terms_accepted: true,
      p_privacy_acknowledged: true,
    });
  } catch {
    console.error("Account legal acceptance transaction failed unexpectedly.");
    return { status: "error", code: "unavailable" };
  }

  if (
    result.error ||
    !isAcceptanceResult(
      result.data,
      expectedTermsDocumentId,
      expectedPrivacyDocumentId
    )
  ) {
    console.error("Account legal acceptance transaction failed.");
    return { status: "error", code: "unavailable" };
  }

  try {
    revalidatePath("/", "layout");
  } catch {
    console.error("Account legal acceptance cache invalidation failed.");
  }

  return { status: "success", code: "accepted" };
}

function isAcceptanceResult(
  value: unknown,
  expectedTermsDocumentId: string,
  expectedPrivacyDocumentId: string
) {
  const candidate =
    Array.isArray(value) && value.length === 1 ? value[0] : null;

  return Boolean(
    isRecord(candidate) &&
      isUuid(candidate.acceptance_id) &&
      isTimestamp(candidate.accepted_at) &&
      candidate.terms_document_id === expectedTermsDocumentId &&
      candidate.privacy_document_id === expectedPrivacyDocumentId
  );
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
