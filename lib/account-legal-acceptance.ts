import "server-only";

import { auth } from "@clerk/nextjs/server";
import rawLegalSuccessorRelease from "@/content/legal-successor-release.json";
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
const CANONICAL_LEGAL_ORIGIN = "https://www.ironcladtournaments.com";
const ACCOUNT_LEGAL_LOOKUP_TIMEOUT_MS = 4_000;
const PREVIOUS_ACCOUNT_LEGAL_RELEASES = Object.freeze({
  terms: {
    kind: "terms",
    version: "1.0",
    path: "/documents-rules-ppa/ironclad-terms-of-service-v1.0.pdf",
    sha256:
      "99442282625dc7b2600475df7edc5649520d5cef64f2fcfe99f6e8e6d4d08ba1",
  },
  privacy: {
    kind: "privacy",
    version: "1.0",
    path: "/documents-rules-ppa/ironclad-privacy-policy-v1.0.pdf",
    sha256:
      "cedb9cb46d2ae7bbd7328c500ca466c237afef8f11626d3095329087ec6453f0",
  },
} as const);
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

export type AccountLegalRuntimeState = {
  accountGate: AccountLegalGateState;
  analyticsAvailable: boolean;
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
  sha256: string;
  url: string;
};

export async function loadAccountLegalGateState(): Promise<AccountLegalGateState> {
  const runtime = await loadLegalRuntimeState(false);
  return runtime.accountGate;
}

export async function loadAccountLegalRuntimeState({
  includeAnalytics,
}: {
  includeAnalytics: boolean;
}): Promise<AccountLegalRuntimeState> {
  return loadLegalRuntimeState(includeAnalytics);
}

async function loadLegalRuntimeState(
  includeAnalytics: boolean
): Promise<AccountLegalRuntimeState> {
  let userId: string | null;

  try {
    ({ userId } = await auth());
  } catch {
    console.error("Account legal gate authentication failed.");
    return {
      accountGate: { status: "unavailable" },
      analyticsAvailable: false,
    };
  }

  if (!userId && !includeAnalytics) {
    return anonymousRuntime();
  }

  const deployedDocuments = readDeployedDocumentPair();

  if (!deployedDocuments) {
    console.error("Account legal gate deployed document set was invalid.");
    return unavailableRuntime(userId);
  }

  let supabase: ReturnType<typeof createSupabaseAdminClient>;

  try {
    supabase = createSupabaseAdminClient();
  } catch {
    console.error("Account legal gate service configuration failed.");
    return unavailableRuntime(userId);
  }

  let documentResult: { data: unknown; error: unknown };

  try {
    documentResult = await withLegalLookupDeadline((signal) =>
      supabase
        .from("legal_documents")
        .select(
          "id, document_kind, version, immutable_url, status, effective_at, sha256"
        )
        .eq("status", "effective")
        .in("document_kind", ["terms", "privacy"])
        .abortSignal(signal)
    );
  } catch {
    console.error("Account legal gate document lookup failed unexpectedly.");
    return unavailableRuntime(userId);
  }

  if (documentResult.error) {
    console.error("Account legal gate document lookup failed.");
    return unavailableRuntime(userId);
  }

  const documents = parseEffectiveDocumentPair(documentResult.data);

  if (!documents) {
    console.error("Account legal gate document set was invalid.");
    return unavailableRuntime(userId);
  }

  if (!documentPairsMatch(deployedDocuments, documents)) {
    console.error("Account legal gate document sources were not aligned.");
    return unavailableRuntime(userId);
  }

  if (
    documents.terms.version === PREVIOUS_ACCOUNT_LEGAL_VERSIONS.terms &&
    documents.privacy.version === PREVIOUS_ACCOUNT_LEGAL_VERSIONS.privacy
  ) {
    return {
      accountGate: userId
        ? { status: "inactive", reason: "predecessor" }
        : { status: "inactive", reason: "anonymous" },
      analyticsAvailable: false,
    };
  }

  if (
    documents.terms.version !== ACCOUNT_LEGAL_SUCCESSOR_VERSIONS.terms ||
    documents.privacy.version !== ACCOUNT_LEGAL_SUCCESSOR_VERSIONS.privacy
  ) {
    console.error("Account legal gate encountered an unsupported document pair.");
    return unavailableRuntime(userId);
  }

  if (!userId) {
    return {
      accountGate: { status: "inactive", reason: "anonymous" },
      analyticsAvailable: true,
    };
  }

  let acceptanceResult: { data: unknown; error: unknown };

  try {
    acceptanceResult = await withLegalLookupDeadline((signal) =>
      supabase
        .from("account_legal_acceptances")
        .select(
          "id, terms_document_id, privacy_document_id, terms_accepted, privacy_acknowledged"
        )
        .eq("clerk_user_id", userId)
        .eq("terms_document_id", documents.terms.id)
        .eq("privacy_document_id", documents.privacy.id)
        .abortSignal(signal)
        .maybeSingle()
    );
  } catch {
    console.error("Account legal acceptance lookup failed unexpectedly.");
    return unavailableRuntime(userId);
  }

  if (acceptanceResult.error) {
    console.error("Account legal acceptance lookup failed.");
    return unavailableRuntime(userId);
  }

  if (
    isSatisfiedAcceptance(
      acceptanceResult.data,
      documents.terms.id,
      documents.privacy.id
    )
  ) {
    return {
      accountGate: { status: "satisfied" },
      analyticsAvailable: true,
    };
  }

  if (acceptanceResult.data !== null) {
    console.error("Account legal acceptance evidence was invalid.");
    return unavailableRuntime(userId);
  }

  return {
    accountGate: {
      status: "required",
      terms: presentDocument(documents.terms, deployedDocuments.terms.path),
      privacy: presentDocument(documents.privacy, deployedDocuments.privacy.path),
    },
    analyticsAvailable: true,
  };
}

function anonymousRuntime(): AccountLegalRuntimeState {
  return {
    accountGate: { status: "inactive", reason: "anonymous" },
    analyticsAvailable: false,
  };
}

function unavailableRuntime(
  userId?: string | null
): AccountLegalRuntimeState {
  return userId
    ? {
        accountGate: { status: "unavailable" },
        analyticsAvailable: false,
      }
    : anonymousRuntime();
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
  const release = readReleaseDocument(expectedKind, value.version);

  if (
    !path ||
    !isSupportedDocumentVersion(value.version) ||
    !release ||
    path !== release.path
  ) {
    return null;
  }

  return {
    kind: expectedKind,
    version: value.version,
    path,
    sha256: release.sha256,
    url: `${CANONICAL_LEGAL_ORIGIN}${path}`,
  };
}

function readReleaseDocument(
  expectedKind: "terms" | "privacy",
  version: string
): Pick<DeployedLegalDocument, "kind" | "version" | "path" | "sha256"> | null {
  if (version === PREVIOUS_ACCOUNT_LEGAL_VERSIONS[expectedKind]) {
    return PREVIOUS_ACCOUNT_LEGAL_RELEASES[expectedKind];
  }

  if (version !== ACCOUNT_LEGAL_SUCCESSOR_VERSIONS[expectedKind]) {
    return null;
  }

  const manifest: unknown = rawLegalSuccessorRelease;

  if (
    !isRecord(manifest) ||
    manifest.schemaVersion !== 1 ||
    manifest.status !== "Final" ||
    !Array.isArray(manifest.documents) ||
    manifest.documents.length !== 2
  ) {
    return null;
  }

  const parsed = manifest.documents.map(parseSuccessorReleaseDocument);

  if (parsed.some((document) => document === null)) {
    return null;
  }

  const documents = parsed as Pick<
    DeployedLegalDocument,
    "kind" | "version" | "path" | "sha256"
  >[];
  const terms = documents.filter((document) => document.kind === "terms");
  const privacy = documents.filter((document) => document.kind === "privacy");

  if (terms.length !== 1 || privacy.length !== 1) {
    return null;
  }

  return expectedKind === "terms" ? terms[0] : privacy[0];
}

function parseSuccessorReleaseDocument(
  value: unknown
): Pick<
  DeployedLegalDocument,
  "kind" | "version" | "path" | "sha256"
> | null {
  if (
    !isRecord(value) ||
    (value.kind !== "terms" && value.kind !== "privacy") ||
    value.version !== ACCOUNT_LEGAL_SUCCESSOR_VERSIONS[value.kind] ||
    typeof value.sha256 !== "string" ||
    !SHA256_PATTERN.test(value.sha256) ||
    !isBoundedText(value.publicPath, 2_048)
  ) {
    return null;
  }

  const path = parseDeployedDocumentPath(value.publicPath);

  if (!path) {
    return null;
  }

  return {
    kind: value.kind,
    version: value.version,
    path,
    sha256: value.sha256,
  };
}

function isSupportedDocumentVersion(value: string): value is "1.0" | "1.1" {
  return value === "1.0" || value === "1.1";
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
    deployed.terms.url === effective.terms.url &&
    deployed.privacy.url === effective.privacy.url &&
    deployed.terms.sha256 === effective.terms.sha256 &&
    deployed.privacy.sha256 === effective.privacy.sha256
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

function parseCanonicalEffectiveDocumentUrl(value: string) {
  try {
    const url = new URL(value);

    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      url.search ||
      url.hash ||
      url.origin !== CANONICAL_LEGAL_ORIGIN ||
      value !== `${CANONICAL_LEGAL_ORIGIN}${url.pathname}`
    ) {
      return null;
    }

    return value;
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

  const url = parseCanonicalEffectiveDocumentUrl(value.immutable_url);

  if (!url) {
    return null;
  }

  return {
    id: value.id,
    kind: value.document_kind,
    version: value.version,
    url,
    effectiveAt: value.effective_at,
    sha256: value.sha256,
  };
}

async function withLegalLookupDeadline<T>(
  lookup: (signal: AbortSignal) => PromiseLike<T>
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    ACCOUNT_LEGAL_LOOKUP_TIMEOUT_MS
  );

  try {
    return await lookup(controller.signal);
  } finally {
    clearTimeout(timeout);
  }
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
