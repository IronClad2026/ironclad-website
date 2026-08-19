import "server-only";

import { auth } from "@clerk/nextjs/server";
import { legalCorpus } from "@/lib/legal-corpus-publication";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export const ACCOUNT_LEGAL_SUCCESSOR_VERSIONS = Object.freeze({
  terms: "1.1",
  privacy: "1.1",
});

const PREVIOUS_ACCOUNT_LEGAL_VERSIONS = Object.freeze({
  terms: "1.0",
  privacy: "1.0",
});
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AccountLegalGateDocument = {
  id: string;
  version: string;
  url: string;
};

export type AccountLegalGateState =
  | { status: "inactive"; reason: "anonymous" | "predecessor" }
  | { status: "satisfied" }
  | { status: "unavailable" }
  | {
      status: "required";
      terms: AccountLegalGateDocument;
      privacy: AccountLegalGateDocument;
    };

type EffectiveLegalDocument = AccountLegalGateDocument & {
  kind: "terms" | "privacy";
  effectiveAt: string;
  sha256: string;
};

type DeployedLegalDocument = {
  kind: "terms" | "privacy";
  version: string;
  path: string;
};

export async function loadAccountLegalGateState(): Promise<AccountLegalGateState> {
  let userId: string | null;

  try {
    ({ userId } = await auth());
  } catch {
    console.error("Account legal gate authentication failed.");
    return { status: "unavailable" };
  }

  if (!userId) {
    return { status: "inactive", reason: "anonymous" };
  }

  const deployedDocuments = readDeployedDocumentPair();

  if (!deployedDocuments) {
    console.error("Account legal gate deployed document set was invalid.");
    return { status: "unavailable" };
  }

  let supabase: ReturnType<typeof createSupabaseAdminClient>;

  try {
    supabase = createSupabaseAdminClient();
  } catch {
    console.error("Account legal gate service configuration failed.");
    return { status: "unavailable" };
  }

  let documentResult: { data: unknown; error: unknown };

  try {
    documentResult = await supabase
      .from("legal_documents")
      .select(
        "id, document_kind, version, immutable_url, status, effective_at, sha256"
      )
      .eq("status", "effective")
      .in("document_kind", ["terms", "privacy"]);
  } catch {
    console.error("Account legal gate document lookup failed unexpectedly.");
    return { status: "unavailable" };
  }

  if (documentResult.error) {
    console.error("Account legal gate document lookup failed.");
    return { status: "unavailable" };
  }

  const documents = parseEffectiveDocumentPair(documentResult.data);

  if (!documents) {
    console.error("Account legal gate document set was invalid.");
    return { status: "unavailable" };
  }

  if (!documentPairsMatch(deployedDocuments, documents)) {
    console.error("Account legal gate document sources were not aligned.");
    return { status: "unavailable" };
  }

  if (
    documents.terms.version === PREVIOUS_ACCOUNT_LEGAL_VERSIONS.terms &&
    documents.privacy.version === PREVIOUS_ACCOUNT_LEGAL_VERSIONS.privacy
  ) {
    return { status: "inactive", reason: "predecessor" };
  }

  if (
    documents.terms.version !== ACCOUNT_LEGAL_SUCCESSOR_VERSIONS.terms ||
    documents.privacy.version !== ACCOUNT_LEGAL_SUCCESSOR_VERSIONS.privacy
  ) {
    console.error("Account legal gate encountered an unsupported document pair.");
    return { status: "unavailable" };
  }

  let acceptanceResult: { data: unknown; error: unknown };

  try {
    acceptanceResult = await supabase
      .from("account_legal_acceptances")
      .select(
        "id, terms_document_id, privacy_document_id, terms_accepted, privacy_acknowledged"
      )
      .eq("clerk_user_id", userId)
      .eq("terms_document_id", documents.terms.id)
      .eq("privacy_document_id", documents.privacy.id)
      .maybeSingle();
  } catch {
    console.error("Account legal acceptance lookup failed unexpectedly.");
    return { status: "unavailable" };
  }

  if (acceptanceResult.error) {
    console.error("Account legal acceptance lookup failed.");
    return { status: "unavailable" };
  }

  if (
    isSatisfiedAcceptance(
      acceptanceResult.data,
      documents.terms.id,
      documents.privacy.id
    )
  ) {
    return { status: "satisfied" };
  }

  if (acceptanceResult.data !== null) {
    console.error("Account legal acceptance evidence was invalid.");
    return { status: "unavailable" };
  }

  return {
    status: "required",
    terms: presentDocument(documents.terms, deployedDocuments.terms.path),
    privacy: presentDocument(documents.privacy, deployedDocuments.privacy.path),
  };
}

function readDeployedDocumentPair(): {
  terms: DeployedLegalDocument;
  privacy: DeployedLegalDocument;
} | null {
  try {
    const corpus: unknown = legalCorpus;

    if (!isRecord(corpus) || !Array.isArray(corpus.documents)) {
      return null;
    }

    const termsCandidates = corpus.documents.filter(
      (document) => isRecord(document) && document.kind === "terms"
    );
    const privacyCandidates = corpus.documents.filter(
      (document) => isRecord(document) && document.kind === "privacy"
    );

    if (termsCandidates.length !== 1 || privacyCandidates.length !== 1) {
      return null;
    }

    const terms = parseDeployedDocument(termsCandidates[0], "terms");
    const privacy = parseDeployedDocument(privacyCandidates[0], "privacy");

    if (!terms || !privacy || !isSupportedVersionPair(terms, privacy)) {
      return null;
    }

    return { terms, privacy };
  } catch {
    return null;
  }
}

function parseDeployedDocument(
  value: unknown,
  expectedKind: "terms" | "privacy"
): DeployedLegalDocument | null {
  if (
    !isRecord(value) ||
    value.kind !== expectedKind ||
    value.status !== "Effective" ||
    !isBoundedText(value.version, 120) ||
    !isBoundedText(value.publicPath, 2_048)
  ) {
    return null;
  }

  const path = parseDeployedDocumentPath(value.publicPath);

  return path
    ? {
        kind: expectedKind,
        version: value.version,
        path,
      }
    : null;
}

function isSupportedVersionPair(
  terms: Pick<DeployedLegalDocument, "version">,
  privacy: Pick<DeployedLegalDocument, "version">
) {
  return (
    (terms.version === PREVIOUS_ACCOUNT_LEGAL_VERSIONS.terms &&
      privacy.version === PREVIOUS_ACCOUNT_LEGAL_VERSIONS.privacy) ||
    (terms.version === ACCOUNT_LEGAL_SUCCESSOR_VERSIONS.terms &&
      privacy.version === ACCOUNT_LEGAL_SUCCESSOR_VERSIONS.privacy)
  );
}

function documentPairsMatch(
  deployed: { terms: DeployedLegalDocument; privacy: DeployedLegalDocument },
  effective: { terms: EffectiveLegalDocument; privacy: EffectiveLegalDocument }
) {
  return (
    deployed.terms.version === effective.terms.version &&
    deployed.privacy.version === effective.privacy.version &&
    deployed.terms.path === parseEffectiveDocumentPath(effective.terms.url) &&
    deployed.privacy.path === parseEffectiveDocumentPath(effective.privacy.url)
  );
}

function parseDeployedDocumentPath(value: string) {
  try {
    if (!value.startsWith("/") || value.startsWith("//")) {
      return null;
    }

    const baseUrl = "https://ironclad.invalid";
    const url = new URL(value, baseUrl);

    if (
      url.origin !== baseUrl ||
      url.search ||
      url.hash ||
      url.pathname !== value
    ) {
      return null;
    }

    return url.pathname;
  } catch {
    return null;
  }
}

function parseEffectiveDocumentPath(value: string) {
  try {
    const url = new URL(value);

    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !url.hostname
    ) {
      return null;
    }

    return url.pathname;
  } catch {
    return null;
  }
}

function parseEffectiveDocumentPair(value: unknown): {
  terms: EffectiveLegalDocument;
  privacy: EffectiveLegalDocument;
} | null {
  if (!Array.isArray(value) || value.length !== 2) {
    return null;
  }

  const parsed = value.map(parseEffectiveDocument);

  if (parsed.some((document) => document === null)) {
    return null;
  }

  const documents = parsed as EffectiveLegalDocument[];
  const terms = documents.find((document) => document.kind === "terms");
  const privacy = documents.find((document) => document.kind === "privacy");

  if (!terms || !privacy) {
    return null;
  }

  return { terms, privacy };
}

function parseEffectiveDocument(value: unknown): EffectiveLegalDocument | null {
  if (
    !isRecord(value) ||
    !isUuid(value.id) ||
    (value.document_kind !== "terms" && value.document_kind !== "privacy") ||
    !isBoundedText(value.version, 120) ||
    !isBoundedText(value.immutable_url, 2_048) ||
    value.status !== "effective" ||
    !isTimestamp(value.effective_at) ||
    Date.parse(value.effective_at) > Date.now() ||
    typeof value.sha256 !== "string" ||
    !SHA256_PATTERN.test(value.sha256)
  ) {
    return null;
  }

  return {
    id: value.id,
    kind: value.document_kind,
    version: value.version,
    url: value.immutable_url,
    effectiveAt: value.effective_at,
    sha256: value.sha256,
  };
}

function isSatisfiedAcceptance(
  value: unknown,
  expectedTermsDocumentId: string,
  expectedPrivacyDocumentId: string
) {
  return Boolean(
    isRecord(value) &&
      isUuid(value.id) &&
      value.terms_document_id === expectedTermsDocumentId &&
      value.privacy_document_id === expectedPrivacyDocumentId &&
      value.terms_accepted === true &&
      value.privacy_acknowledged === true
  );
}

function presentDocument(
  document: EffectiveLegalDocument,
  deployedPath: string
): AccountLegalGateDocument {
  return {
    id: document.id,
    version: document.version,
    url: deployedPath,
  };
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
