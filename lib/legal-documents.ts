import "server-only";

import type {
  RegistrationDocumentKind,
  RegistrationDocumentPresentation,
  RegistrationDocumentSet,
} from "@/lib/legal-document-types";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const DOCUMENT_KINDS: RegistrationDocumentKind[] = [
  "rulebook",
  "ppa",
  "terms",
  "privacy",
];
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;

export async function loadEffectiveRegistrationDocumentSet(
  supabase: SupabaseAdminClient
): Promise<RegistrationDocumentSet | null> {
  let result: { data: unknown; error: { message?: string } | null };

  try {
    result = await supabase
      .from("legal_documents")
      .select(
        "id, document_kind, version, immutable_url, status, effective_at, sha256"
      )
      .eq("status", "effective");
  } catch {
    console.error("Registration document set load failed unexpectedly.");
    return null;
  }

  if (result.error) {
    console.error("Registration document set load failed.");
    return null;
  }

  if (
    !Array.isArray(result.data) ||
    result.data.length !== DOCUMENT_KINDS.length
  ) {
    return null;
  }

  const documents = new Map<
    RegistrationDocumentKind,
    RegistrationDocumentPresentation
  >();

  for (const row of result.data) {
    if (!isRecord(row) || !isRegistrationDocumentKind(row.document_kind)) {
      return null;
    }

    if (
      row.status !== "effective" ||
      !isUuid(row.id) ||
      !isBoundedText(row.version, 120) ||
      !isBoundedText(row.immutable_url, 2_048) ||
      !isTimestamp(row.effective_at) ||
      Date.parse(row.effective_at) > Date.now() ||
      typeof row.sha256 !== "string" ||
      !SHA256_PATTERN.test(row.sha256) ||
      documents.has(row.document_kind)
    ) {
      return null;
    }

    documents.set(row.document_kind, {
      id: row.id,
      kind: row.document_kind,
      version: row.version,
      url: row.immutable_url,
      effectiveDate: row.effective_at,
      sha256: row.sha256,
    });
  }

  if (!DOCUMENT_KINDS.every((kind) => documents.has(kind))) {
    return null;
  }

  return {
    rulebook: documents.get("rulebook")!,
    ppa: documents.get("ppa")!,
    terms: documents.get("terms")!,
    privacy: documents.get("privacy")!,
  };
}

function isRegistrationDocumentKind(
  value: unknown
): value is RegistrationDocumentKind {
  return DOCUMENT_KINDS.some((kind) => kind === value);
}

function isBoundedText(value: unknown, maxLength: number): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= maxLength
  );
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
