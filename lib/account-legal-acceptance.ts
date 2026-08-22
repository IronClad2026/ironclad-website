import "server-only";

import { auth } from "@clerk/nextjs/server";
import rawLegalSuccessorRelease from "@/content/legal-successor-release.json";
import { legalCorpus } from "@/lib/legal-corpus-publication";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const CANONICAL_LEGAL_ORIGIN = "https://www.ironcladtournaments.com";
const PREVIEW_LEGAL_DOCUMENT_ORIGIN_ENV = "PREVIEW_LEGAL_DOCUMENT_ORIGIN";
const VERCEL_PREVIEW_HOST_PATTERN =
  /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.vercel\.app$/;
const ACCOUNT_LEGAL_LOOKUP_TIMEOUT_MS = 4_000;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AccountLegalGateDocument = {
  id: string;
  version: string;
  url: string;
};

export type AccountLegalGateState =
  | { status: "inactive"; reason: "anonymous" }
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

type LegalDocumentKind = "terms" | "privacy";

type EffectiveLegalDocument = AccountLegalGateDocument & {
  kind: LegalDocumentKind;
  effectiveAt: string;
  sha256: string;
};

type ReleaseDocumentIdentity = {
  kind: LegalDocumentKind;
  version: string;
  filename: string;
  path: string;
  sha256: string;
};

type DeployedLegalDocument = ReleaseDocumentIdentity & {
  url: string;
};

type DeployedLegalDocumentPair = {
  terms: DeployedLegalDocument;
  privacy: DeployedLegalDocument;
};

type LegalReleaseTransition = {
  predecessor: DeployedLegalDocumentPair;
  successor: DeployedLegalDocumentPair;
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

  const releaseTransition = readLegalReleaseTransition(trustedLegalOrigin);

  if (!releaseTransition) {
    console.error("Account legal gate release transition was invalid.");
    return unavailableRuntime(userId);
  }

  const bundledDocuments = readBundledDocumentPair(
    trustedLegalOrigin,
    releaseTransition.successor
  );

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

  const approvedDocuments = selectApprovedEffectivePair(
    releaseTransition,
    documents
  );

  if (!approvedDocuments) {
    console.error("Account legal gate document sources were not aligned.");
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

function readLegalReleaseTransition(
  trustedLegalOrigin: string
): LegalReleaseTransition | null {
  const manifest: unknown = rawLegalSuccessorRelease;

  if (
    !isRecord(manifest) ||
    manifest.schemaVersion !== 1 ||
    manifest.status !== "Final" ||
    !Array.isArray(manifest.predecessorDocuments) ||
    !Array.isArray(manifest.documents) ||
    manifest.documents.length < 1 ||
    manifest.documents.length > 2
  ) {
    return null;
  }

  const predecessorIdentities = parseReleaseDocumentPair(
    manifest.predecessorDocuments
  );
  const changedDocuments = manifest.documents.map(parseReleaseDocumentIdentity);

  if (
    !predecessorIdentities ||
    changedDocuments.some((document) => document === null)
  ) {
    return null;
  }

  const changes = changedDocuments as ReleaseDocumentIdentity[];
  if (new Set(changes.map((document) => document.kind)).size !== changes.length) {
    return null;
  }

  const successorIdentities = {
    terms: predecessorIdentities.terms,
    privacy: predecessorIdentities.privacy,
  };

  for (const document of changes) {
    const predecessor = predecessorIdentities[document.kind];
    if (
      releaseDocumentIdentitiesMatch(predecessor, document) ||
      predecessor.version === document.version ||
      predecessor.path === document.path ||
      predecessor.sha256 === document.sha256
    ) {
      return null;
    }

    successorIdentities[document.kind] = document;
  }

  return {
    predecessor: deployDocumentPair(
      predecessorIdentities,
      trustedLegalOrigin
    ),
    successor: deployDocumentPair(successorIdentities, trustedLegalOrigin),
  };
}

function parseReleaseDocumentPair(value: unknown): {
  terms: ReleaseDocumentIdentity;
  privacy: ReleaseDocumentIdentity;
} | null {
  if (!Array.isArray(value) || value.length !== 2) {
    return null;
  }

  const parsed = value.map(parseReleaseDocumentIdentity);
  if (parsed.some((document) => document === null)) {
    return null;
  }

  const documents = parsed as ReleaseDocumentIdentity[];
  const terms = documents.filter((document) => document.kind === "terms");
  const privacy = documents.filter((document) => document.kind === "privacy");

  if (terms.length !== 1 || privacy.length !== 1) {
    return null;
  }

  return { terms: terms[0], privacy: privacy[0] };
}

function parseReleaseDocumentIdentity(
  value: unknown
): ReleaseDocumentIdentity | null {
  if (
    !isRecord(value) ||
    (value.kind !== "terms" && value.kind !== "privacy") ||
    !isBoundedText(value.version, 120) ||
    value.version !== value.version.trim() ||
    !isBoundedText(value.filename, 255) ||
    value.filename !== value.filename.trim() ||
    typeof value.sha256 !== "string" ||
    !SHA256_PATTERN.test(value.sha256) ||
    !isBoundedText(value.publicPath, 2_048)
  ) {
    return null;
  }

  const path = parseDeployedDocumentPath(value.publicPath);
  if (!path || value.filename !== path.slice(path.lastIndexOf("/") + 1)) {
    return null;
  }

  return {
    kind: value.kind,
    version: value.version,
    filename: value.filename,
    path,
    sha256: value.sha256,
  };
}

function deployDocumentPair(
  pair: {
    terms: ReleaseDocumentIdentity;
    privacy: ReleaseDocumentIdentity;
  },
  trustedLegalOrigin: string
): DeployedLegalDocumentPair {
  return {
    terms: {
      ...pair.terms,
      url: `${trustedLegalOrigin}${pair.terms.path}`,
    },
    privacy: {
      ...pair.privacy,
      url: `${trustedLegalOrigin}${pair.privacy.path}`,
    },
  };
}

function releaseDocumentIdentitiesMatch(
  left: ReleaseDocumentIdentity,
  right: ReleaseDocumentIdentity
) {
  return (
    left.kind === right.kind &&
    left.version === right.version &&
    left.filename === right.filename &&
    left.path === right.path &&
    left.sha256 === right.sha256
  );
}

function readBundledDocumentPair(
  trustedLegalOrigin: string,
  expected: DeployedLegalDocumentPair
): DeployedLegalDocumentPair | null {
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

    const terms = parseBundledDocument(
      termsCandidates[0],
      expected.terms,
      trustedLegalOrigin
    );
    const privacy = parseBundledDocument(
      privacyCandidates[0],
      expected.privacy,
      trustedLegalOrigin
    );

    if (!terms || !privacy) {
      return null;
    }

    return { terms, privacy };
  } catch {
    return null;
  }
}

function parseBundledDocument(
  value: unknown,
  expected: DeployedLegalDocument,
  trustedLegalOrigin: string
): DeployedLegalDocument | null {
  if (
    !isRecord(value) ||
    value.kind !== expected.kind ||
    value.status !== "Effective" ||
    value.version !== expected.version ||
    value.filename !== expected.filename ||
    !isBoundedText(value.publicPath, 2_048)
  ) {
    return null;
  }

  const path = parseDeployedDocumentPath(value.publicPath);
  if (!path || path !== expected.path) {
    return null;
  }

  return {
    ...expected,
    url: `${trustedLegalOrigin}${expected.path}`,
  };
}

function selectApprovedEffectivePair(
  transition: LegalReleaseTransition,
  effective: { terms: EffectiveLegalDocument; privacy: EffectiveLegalDocument }
): DeployedLegalDocumentPair | null {
  if (documentPairsMatch(transition.predecessor, effective)) {
    return transition.predecessor;
  }

  if (documentPairsMatch(transition.successor, effective)) {
    return transition.successor;
  }

  return null;
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
