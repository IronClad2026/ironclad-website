import "server-only";

import { auth } from "@clerk/nextjs/server";
import rawLegalSuccessorRelease from "@/content/legal-successor-release.json";
import { legalCorpus } from "@/lib/legal-corpus-publication";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export const ACCOUNT_LEGAL_CURRENT_VERSIONS = Object.freeze({
  terms: "1.1",
  privacy: "1.1",
});

export const ACCOUNT_LEGAL_NEXT_VERSIONS = Object.freeze({
  terms: "1.1",
  privacy: "1.2",
});

const PREVIOUS_ACCOUNT_LEGAL_VERSIONS = Object.freeze({
  terms: "1.0",
  privacy: "1.0",
});
const CANONICAL_LEGAL_ORIGIN = "https://www.ironcladtournaments.com";
const PREVIEW_LEGAL_DOCUMENT_ORIGIN_ENV = "PREVIEW_LEGAL_DOCUMENT_ORIGIN";
const VERCEL_PREVIEW_HOST_PATTERN =
  /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.vercel\.app$/;
const ACCOUNT_LEGAL_LOOKUP_TIMEOUT_MS = 4_000;
const LOCKED_ACCOUNT_LEGAL_RELEASES = Object.freeze({
  terms: {
    "1.0": {
      kind: "terms",
      version: "1.0",
      path: "/documents-rules-ppa/ironclad-terms-of-service-v1.0.pdf",
      sha256:
        "99442282625dc7b2600475df7edc5649520d5cef64f2fcfe99f6e8e6d4d08ba1",
    },
    "1.1": {
      kind: "terms",
      version: "1.1",
      path: "/documents-rules-ppa/ironclad-terms-of-service-v1.1.pdf",
      sha256:
        "59d3dfa890a8e259ab8ed81e3b490589583e5d1f7ae53d9f9caa2d77078534f1",
    },
  },
  privacy: {
    "1.0": {
      kind: "privacy",
      version: "1.0",
      path: "/documents-rules-ppa/ironclad-privacy-policy-v1.0.pdf",
      sha256:
        "cedb9cb46d2ae7bbd7328c500ca466c237afef8f11626d3095329087ec6453f0",
    },
    "1.1": {
      kind: "privacy",
      version: "1.1",
      path: "/documents-rules-ppa/ironclad-privacy-policy-v1.1.pdf",
      sha256:
        "0c2e37499f8453bdf9962b6acfc018b5307995f0b7aa6763ae6036aeb34bbb91",
    },
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

  const trustedLegalOrigin = readTrustedLegalOrigin();

  if (!trustedLegalOrigin) {
    console.error("Account legal gate document origin was invalid.");
    return unavailableRuntime(userId);
  }

  const bundledDocuments = readBundledDocumentPair(trustedLegalOrigin);

  if (!bundledDocuments) {
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

  const documents = parseEffectiveDocumentPair(
    documentResult.data,
    trustedLegalOrigin
  );

  if (!documents) {
    console.error("Account legal gate document set was invalid.");
    return unavailableRuntime(userId);
  }

  const approvedDocuments = readApprovedDocumentPair(
    documents.terms.version,
    documents.privacy.version,
    trustedLegalOrigin
  );

  if (
    !approvedDocuments ||
    !documentPairsMatch(approvedDocuments, documents) ||
    !bundledPairCanServeEffectivePair(bundledDocuments, documents)
  ) {
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
    !isSupportedSuccessorVersionPair(documents.terms, documents.privacy)
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
      terms: presentDocument(documents.terms, approvedDocuments.terms.path),
      privacy: presentDocument(documents.privacy, approvedDocuments.privacy.path),
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

function readBundledDocumentPair(trustedLegalOrigin: string): {
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

    const terms = parseDeployedDocument(
      termsCandidates[0],
      "terms",
      trustedLegalOrigin
    );
    const privacy = parseDeployedDocument(
      privacyCandidates[0],
      "privacy",
      trustedLegalOrigin
    );

    if (
      !terms ||
      !privacy ||
      !isSupportedVersionPair(terms, privacy) ||
      !runtimeManifestMatchesBundledPair(terms, privacy)
    ) {
      return null;
    }

    return { terms, privacy };
  } catch {
    return null;
  }
}

function parseDeployedDocument(
  value: unknown,
  expectedKind: "terms" | "privacy",
  trustedLegalOrigin: string
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
    !isSupportedDocumentVersion(expectedKind, value.version) ||
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
    url: `${trustedLegalOrigin}${path}`,
  };
}

function readReleaseDocument(
  expectedKind: "terms" | "privacy",
  version: string
): Pick<DeployedLegalDocument, "kind" | "version" | "path" | "sha256"> | null {
  const locked = readLockedReleaseDocument(expectedKind, version);

  if (locked) {
    return locked;
  }

  if (
    expectedKind !== "privacy" ||
    version !== ACCOUNT_LEGAL_NEXT_VERSIONS.privacy
  ) {
    return null;
  }

  return readPrivacyV12ReleaseDocument();
}

function readLockedReleaseDocument(
  expectedKind: "terms" | "privacy",
  version: string
): Pick<DeployedLegalDocument, "kind" | "version" | "path" | "sha256"> | null {
  if (expectedKind === "terms") {
    if (version === "1.0") return LOCKED_ACCOUNT_LEGAL_RELEASES.terms["1.0"];
    if (version === "1.1") return LOCKED_ACCOUNT_LEGAL_RELEASES.terms["1.1"];
    return null;
  }

  if (version === "1.0") return LOCKED_ACCOUNT_LEGAL_RELEASES.privacy["1.0"];
  if (version === "1.1") return LOCKED_ACCOUNT_LEGAL_RELEASES.privacy["1.1"];
  return null;
}

function readPrivacyV12ReleaseDocument(): Pick<
  DeployedLegalDocument,
  "kind" | "version" | "path" | "sha256"
> | null {
  const manifest: unknown = rawLegalSuccessorRelease;

  if (
    !isRecord(manifest) ||
    manifest.schemaVersion !== 1 ||
    manifest.status !== "Final" ||
    !Array.isArray(manifest.documents) ||
    manifest.documents.length !== 1
  ) {
    return null;
  }

  const document = parsePrivacyV12ReleaseDocument(manifest.documents[0]);
  if (!document) {
    return null;
  }

  return document;
}

function parsePrivacyV12ReleaseDocument(
  value: unknown
): Pick<
  DeployedLegalDocument,
  "kind" | "version" | "path" | "sha256"
> | null {
  if (
    !isRecord(value) ||
    value.kind !== "privacy" ||
    value.version !== ACCOUNT_LEGAL_NEXT_VERSIONS.privacy ||
    typeof value.sha256 !== "string" ||
    !SHA256_PATTERN.test(value.sha256) ||
    !isBoundedText(value.publicPath, 2_048)
  ) {
    return null;
  }

  const path = parseDeployedDocumentPath(value.publicPath);

  if (
    path !==
    "/documents-rules-ppa/ironclad-privacy-policy-v1.2.pdf"
  ) {
    return null;
  }

  return {
    kind: value.kind,
    version: value.version,
    path,
    sha256: value.sha256,
  };
}

function runtimeManifestMatchesBundledPair(
  terms: Pick<DeployedLegalDocument, "version">,
  privacy: Pick<DeployedLegalDocument, "version">
) {
  if (
    terms.version === PREVIOUS_ACCOUNT_LEGAL_VERSIONS.terms &&
    privacy.version === PREVIOUS_ACCOUNT_LEGAL_VERSIONS.privacy
  ) {
    return true;
  }

  if (
    terms.version === ACCOUNT_LEGAL_CURRENT_VERSIONS.terms &&
    privacy.version === ACCOUNT_LEGAL_CURRENT_VERSIONS.privacy
  ) {
    const manifest: unknown = rawLegalSuccessorRelease;
    if (
      !isRecord(manifest) ||
      manifest.schemaVersion !== 1 ||
      manifest.status !== "Final" ||
      !Array.isArray(manifest.documents) ||
      manifest.documents.length !== 2
    ) {
      return false;
    }

    const parsed = manifest.documents.map(parseCurrentReleaseDocument);
    return (
      parsed.every((document) => document !== null) &&
      parsed.filter((document) => document?.kind === "terms").length === 1 &&
      parsed.filter((document) => document?.kind === "privacy").length === 1
    );
  }

  return (
    terms.version === ACCOUNT_LEGAL_NEXT_VERSIONS.terms &&
    privacy.version === ACCOUNT_LEGAL_NEXT_VERSIONS.privacy &&
    readPrivacyV12ReleaseDocument() !== null
  );
}

function parseCurrentReleaseDocument(
  value: unknown
): Pick<
  DeployedLegalDocument,
  "kind" | "version" | "path" | "sha256"
> | null {
  if (
    !isRecord(value) ||
    (value.kind !== "terms" && value.kind !== "privacy") ||
    value.version !== ACCOUNT_LEGAL_CURRENT_VERSIONS[value.kind] ||
    typeof value.sha256 !== "string" ||
    !SHA256_PATTERN.test(value.sha256) ||
    !isBoundedText(value.publicPath, 2_048)
  ) {
    return null;
  }

  const locked = readLockedReleaseDocument(value.kind, value.version);
  const path = parseDeployedDocumentPath(value.publicPath);
  if (!locked || path !== locked.path || value.sha256 !== locked.sha256) {
    return null;
  }

  return locked;
}

function readApprovedDocumentPair(
  termsVersion: string,
  privacyVersion: string,
  trustedLegalOrigin: string
): { terms: DeployedLegalDocument; privacy: DeployedLegalDocument } | null {
  if (
    !isSupportedVersionPair(
      { version: termsVersion },
      { version: privacyVersion }
    )
  ) {
    return null;
  }

  const terms = readReleaseDocument("terms", termsVersion);
  const privacy = readReleaseDocument("privacy", privacyVersion);
  if (!terms || !privacy) {
    return null;
  }

  return {
    terms: { ...terms, url: `${trustedLegalOrigin}${terms.path}` },
    privacy: { ...privacy, url: `${trustedLegalOrigin}${privacy.path}` },
  };
}

function isSupportedDocumentVersion(kind: "terms" | "privacy", value: string) {
  return kind === "terms"
    ? value === "1.0" || value === "1.1"
    : value === "1.0" || value === "1.1" || value === "1.2";
}

function isSupportedVersionPair(
  terms: Pick<DeployedLegalDocument, "version">,
  privacy: Pick<DeployedLegalDocument, "version">
) {
  return (
    (terms.version === PREVIOUS_ACCOUNT_LEGAL_VERSIONS.terms &&
      privacy.version === PREVIOUS_ACCOUNT_LEGAL_VERSIONS.privacy) ||
    isSupportedSuccessorVersionPair(terms, privacy)
  );
}

function isSupportedSuccessorVersionPair(
  terms: Pick<DeployedLegalDocument, "version">,
  privacy: Pick<DeployedLegalDocument, "version">
) {
  return (
    (terms.version === ACCOUNT_LEGAL_CURRENT_VERSIONS.terms &&
      privacy.version === ACCOUNT_LEGAL_CURRENT_VERSIONS.privacy) ||
    (terms.version === ACCOUNT_LEGAL_NEXT_VERSIONS.terms &&
      privacy.version === ACCOUNT_LEGAL_NEXT_VERSIONS.privacy)
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

function bundledPairCanServeEffectivePair(
  bundled: { terms: DeployedLegalDocument; privacy: DeployedLegalDocument },
  effective: { terms: EffectiveLegalDocument; privacy: EffectiveLegalDocument }
) {
  if (
    bundled.terms.version === effective.terms.version &&
    bundled.privacy.version === effective.privacy.version
  ) {
    return true;
  }

  return (
    bundled.terms.version === ACCOUNT_LEGAL_NEXT_VERSIONS.terms &&
    bundled.privacy.version === ACCOUNT_LEGAL_NEXT_VERSIONS.privacy &&
    effective.terms.version === ACCOUNT_LEGAL_CURRENT_VERSIONS.terms &&
    effective.privacy.version === ACCOUNT_LEGAL_CURRENT_VERSIONS.privacy
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

function readTrustedLegalOrigin(): string | null {
  if (process.env.VERCEL_ENV === "production") {
    return CANONICAL_LEGAL_ORIGIN;
  }

  const configuredOrigin = process.env[PREVIEW_LEGAL_DOCUMENT_ORIGIN_ENV];

  if (!configuredOrigin) {
    return CANONICAL_LEGAL_ORIGIN;
  }

  if (process.env.VERCEL_ENV !== "preview") {
    return null;
  }

  try {
    const parsed = new URL(configuredOrigin);

    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      parsed.port ||
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash ||
      configuredOrigin !== parsed.origin ||
      !VERCEL_PREVIEW_HOST_PATTERN.test(parsed.hostname)
    ) {
      return null;
    }

    return parsed.origin;
  } catch {
    return null;
  }
}

function parseTrustedEffectiveDocumentUrl(
  value: string,
  trustedLegalOrigin: string
) {
  try {
    const url = new URL(value);

    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      url.search ||
      url.hash ||
      url.origin !== trustedLegalOrigin ||
      value !== `${trustedLegalOrigin}${url.pathname}`
    ) {
      return null;
    }

    return value;
  } catch {
    return null;
  }
}

function parseEffectiveDocumentPair(
  value: unknown,
  trustedLegalOrigin: string
): {
  terms: EffectiveLegalDocument;
  privacy: EffectiveLegalDocument;
} | null {
  if (!Array.isArray(value) || value.length !== 2) {
    return null;
  }

  const parsed = value.map((document) =>
    parseEffectiveDocument(document, trustedLegalOrigin)
  );

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

function parseEffectiveDocument(
  value: unknown,
  trustedLegalOrigin: string
): EffectiveLegalDocument | null {
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

  const url = parseTrustedEffectiveDocumentUrl(
    value.immutable_url,
    trustedLegalOrigin
  );

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
