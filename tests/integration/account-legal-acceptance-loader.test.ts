import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { anonymousIdentity, playerIdentity } from "@/tests/fixtures/auth";

const authMock = vi.hoisted(() => vi.fn());
const createSupabaseAdminClientMock = vi.hoisted(() => vi.fn());
const legalCorpusMock = vi.hoisted(() => ({ documents: [] as unknown[] }));
const legalSuccessorReleaseMock = vi.hoisted(() => ({
  schemaVersion: 1,
  status: "Final",
  predecessorDocuments: [] as unknown[],
  documents: [] as unknown[],
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("@/content/legal-successor-release.json", () => ({
  default: legalSuccessorReleaseMock,
}));
vi.mock("@/lib/legal-corpus-publication", () => ({
  legalCorpus: legalCorpusMock,
}));
vi.mock("@/lib/supabase-admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock,
}));

import {
  loadAccountLegalGateState,
  loadAccountLegalRuntimeState,
} from "@/lib/account-legal-acceptance";

const TERMS_ID = "11111111-1111-4111-8111-111111111111";
const PRIVACY_ID = "22222222-2222-4222-8222-222222222222";
const ACCEPTANCE_ID = "33333333-3333-4333-8333-333333333333";
const PRIVACY_V12_ID = "44444444-4444-4444-8444-444444444444";
const PRIVACY_V13_ID = "55555555-5555-4555-8555-555555555555";
const LEGAL_LOOKUP_TIMEOUT_MS = 4_000;
const PREVIEW_LEGAL_ORIGIN =
  "https://ironclad-website-legal-release.vercel.app";
const PREVIEW_LEGAL_SUCCESSOR_ORIGIN =
  "https://ironclad-website-legal-successor.vercel.app";
const originalVercelEnvironment = process.env.VERCEL_ENV;
const originalPreviewLegalOrigin =
  process.env.PREVIEW_LEGAL_DOCUMENT_ORIGIN;
const originalPreviewLegalOrigins =
  process.env.PREVIEW_LEGAL_DOCUMENT_ORIGINS;
const RELEASE_HASHES = {
  terms: {
    "1.0":
      "99442282625dc7b2600475df7edc5649520d5cef64f2fcfe99f6e8e6d4d08ba1",
    "1.1":
      "59d3dfa890a8e259ab8ed81e3b490589583e5d1f7ae53d9f9caa2d77078534f1",
  },
  privacy: {
    "1.0":
      "cedb9cb46d2ae7bbd7328c500ca466c237afef8f11626d3095329087ec6453f0",
    "1.1":
      "0c2e37499f8453bdf9962b6acfc018b5307995f0b7aa6763ae6036aeb34bbb91",
  },
} as const;

function documentPath(kind: "terms" | "privacy", version: string) {
  return kind === "terms"
    ? `/documents-rules-ppa/ironclad-terms-of-service-v${version}.pdf`
    : `/documents-rules-ppa/ironclad-privacy-policy-v${version}.pdf`;
}

function documentFilename(kind: "terms" | "privacy", version: string) {
  return documentPath(kind, version).split("/").at(-1) ?? "";
}

function deployedDocument(kind: "terms" | "privacy", version: string) {
  return {
    kind,
    version,
    status: "Effective",
    filename: documentFilename(kind, version),
    publicPath: documentPath(kind, version),
  };
}

function setDeployedDocumentPair(termsVersion: string, privacyVersion: string) {
  if (termsVersion === "1.1" && privacyVersion === "1.1") {
    setReleaseTransition("1.0", "1.0", termsVersion, privacyVersion);
    return;
  }

  if (termsVersion === "1.1" && privacyVersion === "1.2") {
    setReleaseTransition("1.1", "1.1", termsVersion, privacyVersion);
    return;
  }

  setBundledDocumentPair(termsVersion, privacyVersion);
}

function setBundledDocumentPair(termsVersion: string, privacyVersion: string) {
  legalCorpusMock.documents = [
    deployedDocument("terms", termsVersion),
    deployedDocument("privacy", privacyVersion),
  ];
}

function setReleaseTransition(
  predecessorTermsVersion: string,
  predecessorPrivacyVersion: string,
  successorTermsVersion: string,
  successorPrivacyVersion: string
) {
  legalSuccessorReleaseMock.predecessorDocuments = [
    releaseDocument("terms", predecessorTermsVersion),
    releaseDocument("privacy", predecessorPrivacyVersion),
  ];
  legalSuccessorReleaseMock.documents = [
    ...(predecessorTermsVersion === successorTermsVersion
      ? []
      : [releaseDocument("terms", successorTermsVersion)]),
    ...(predecessorPrivacyVersion === successorPrivacyVersion
      ? []
      : [releaseDocument("privacy", successorPrivacyVersion)]),
  ];
  setBundledDocumentPair(successorTermsVersion, successorPrivacyVersion);
}

function releaseDocument(kind: "terms" | "privacy", version: string) {
  return {
    kind,
    version,
    filename: documentFilename(kind, version),
    publicPath: documentPath(kind, version),
    sha256: documentHash(kind, version),
  };
}

function documentRows(
  termsVersion: string,
  privacyVersion: string,
  origin = "https://www.ironcladtournaments.com"
) {
  return [
    {
      id: TERMS_ID,
      document_kind: "terms",
      version: termsVersion,
      immutable_url: `${origin}${documentPath("terms", termsVersion)}`,
      status: "effective",
      effective_at: "2026-08-19T00:00:00.000Z",
      sha256: documentHash("terms", termsVersion),
    },
    {
      id:
        privacyVersion === "1.2"
          ? PRIVACY_V12_ID
          : privacyVersion === "1.3"
            ? PRIVACY_V13_ID
            : PRIVACY_ID,
      document_kind: "privacy",
      version: privacyVersion,
      immutable_url: `${origin}${documentPath("privacy", privacyVersion)}`,
      status: "effective",
      effective_at: "2026-08-19T00:00:00.000Z",
      sha256: documentHash("privacy", privacyVersion),
    },
  ];
}

function documentHash(kind: "terms" | "privacy", version: string) {
  if (version === "1.0" || version === "1.1") {
    return RELEASE_HASHES[kind][version];
  }

  if (kind === "privacy" && version === "1.2") return "a".repeat(64);
  if (kind === "terms" && version === "1.2") return "b".repeat(64);
  if (kind === "privacy" && version === "1.3") return "c".repeat(64);

  return "d".repeat(64);
}

function restoreEnvironmentVariable(
  name: string,
  value: string | undefined
) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}

function clientFixture({
  documents,
  acceptance = null,
  documentError = null,
  acceptanceError = null,
}: {
  documents: unknown;
  acceptance?: unknown;
  documentError?: unknown;
  acceptanceError?: unknown;
}) {
  const documentQuery: Record<string, ReturnType<typeof vi.fn>> = {};
  documentQuery.select = vi.fn(() => documentQuery);
  documentQuery.eq = vi.fn(() => documentQuery);
  documentQuery.in = vi.fn(() => documentQuery);
  documentQuery.abortSignal = vi.fn(async () => ({
    data: documents,
    error: documentError,
  }));

  const acceptanceQuery: Record<string, ReturnType<typeof vi.fn>> = {};
  acceptanceQuery.select = vi.fn(() => acceptanceQuery);
  acceptanceQuery.eq = vi.fn(() => acceptanceQuery);
  acceptanceQuery.abortSignal = vi.fn(() => acceptanceQuery);
  acceptanceQuery.maybeSingle = vi.fn(async () => ({
    data: acceptance,
    error: acceptanceError,
  }));

  const from = vi.fn((table: string) =>
    table === "legal_documents" ? documentQuery : acceptanceQuery
  );
  createSupabaseAdminClientMock.mockReturnValue({ from });

  return { from, documentQuery, acceptanceQuery };
}

describe("account legal acceptance gate loader", () => {
  beforeEach(() => {
    authMock.mockReset();
    createSupabaseAdminClientMock.mockReset();
    setReleaseTransition("1.1", "1.1", "1.1", "1.2");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    restoreEnvironmentVariable("VERCEL_ENV", originalVercelEnvironment);
    restoreEnvironmentVariable(
      "PREVIEW_LEGAL_DOCUMENT_ORIGIN",
      originalPreviewLegalOrigin
    );
    restoreEnvironmentVariable(
      "PREVIEW_LEGAL_DOCUMENT_ORIGINS",
      originalPreviewLegalOrigins
    );
    vi.useRealTimers();
  });

  it("leaves anonymous public browsing untouched before trusted-client construction", async () => {
    authMock.mockResolvedValue(anonymousIdentity);

    await expect(loadAccountLegalGateState()).resolves.toEqual({
      status: "inactive",
      reason: "anonymous",
    });
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it("makes analytics available to anonymous browsing only for an aligned v1.1 pair", async () => {
    authMock.mockResolvedValue(anonymousIdentity);
    setDeployedDocumentPair("1.1", "1.1");
    const fixture = clientFixture({ documents: documentRows("1.1", "1.1") });

    await expect(
      loadAccountLegalRuntimeState({ includeAnalytics: true })
    ).resolves.toEqual({
      accountGate: { status: "inactive", reason: "anonymous" },
      analyticsAvailable: true,
    });
    expect(fixture.from).toHaveBeenCalledTimes(1);
  });

  it("accepts one exact configured immutable Preview origin for Staging", async () => {
    process.env.VERCEL_ENV = "preview";
    process.env.PREVIEW_LEGAL_DOCUMENT_ORIGIN = PREVIEW_LEGAL_ORIGIN;
    authMock.mockResolvedValue(playerIdentity);
    setDeployedDocumentPair("1.1", "1.1");
    clientFixture({
      documents: documentRows("1.1", "1.1", PREVIEW_LEGAL_ORIGIN),
    });

    await expect(loadAccountLegalGateState()).resolves.toMatchObject({
      status: "required",
      terms: { version: "1.1" },
      privacy: { version: "1.1" },
    });
  });

  it("accepts an exact bounded Preview-origin set across a successor transition", async () => {
    process.env.VERCEL_ENV = "preview";
    process.env.PREVIEW_LEGAL_DOCUMENT_ORIGIN = PREVIEW_LEGAL_ORIGIN;
    process.env.PREVIEW_LEGAL_DOCUMENT_ORIGINS =
      PREVIEW_LEGAL_SUCCESSOR_ORIGIN;
    authMock.mockResolvedValue(playerIdentity);
    setDeployedDocumentPair("1.1", "1.2");
    const documents = documentRows("1.1", "1.2", PREVIEW_LEGAL_ORIGIN);
    documents[1].immutable_url = `${PREVIEW_LEGAL_SUCCESSOR_ORIGIN}${documentPath(
      "privacy",
      "1.2"
    )}`;
    clientFixture({ documents });

    await expect(loadAccountLegalGateState()).resolves.toMatchObject({
      status: "required",
      terms: { version: "1.1" },
      privacy: { version: "1.2" },
    });
  });

  it("keeps the Preview predecessor pair satisfied before mixed-origin activation", async () => {
    process.env.VERCEL_ENV = "preview";
    process.env.PREVIEW_LEGAL_DOCUMENT_ORIGIN = PREVIEW_LEGAL_ORIGIN;
    process.env.PREVIEW_LEGAL_DOCUMENT_ORIGINS =
      PREVIEW_LEGAL_SUCCESSOR_ORIGIN;
    authMock.mockResolvedValue(playerIdentity);
    setDeployedDocumentPair("1.1", "1.2");
    clientFixture({
      documents: documentRows("1.1", "1.1", PREVIEW_LEGAL_ORIGIN),
      acceptance: {
        id: ACCEPTANCE_ID,
        terms_document_id: TERMS_ID,
        privacy_document_id: PRIVACY_ID,
        terms_accepted: true,
        privacy_acknowledged: true,
      },
    });

    await expect(loadAccountLegalGateState()).resolves.toEqual({
      status: "satisfied",
    });
  });

  it("does not let a configured Preview origin weaken Production", async () => {
    process.env.VERCEL_ENV = "production";
    process.env.PREVIEW_LEGAL_DOCUMENT_ORIGIN = PREVIEW_LEGAL_ORIGIN;
    process.env.PREVIEW_LEGAL_DOCUMENT_ORIGINS =
      PREVIEW_LEGAL_SUCCESSOR_ORIGIN;
    authMock.mockResolvedValue(playerIdentity);
    setDeployedDocumentPair("1.1", "1.1");
    clientFixture({ documents: documentRows("1.1", "1.1") });

    await expect(loadAccountLegalGateState()).resolves.toMatchObject({
      status: "required",
    });
  });

  it("rejects Preview-origin legal rows in Production", async () => {
    process.env.VERCEL_ENV = "production";
    process.env.PREVIEW_LEGAL_DOCUMENT_ORIGIN = PREVIEW_LEGAL_ORIGIN;
    process.env.PREVIEW_LEGAL_DOCUMENT_ORIGINS =
      PREVIEW_LEGAL_SUCCESSOR_ORIGIN;
    authMock.mockResolvedValue(playerIdentity);
    setDeployedDocumentPair("1.1", "1.1");
    clientFixture({
      documents: documentRows("1.1", "1.1", PREVIEW_LEGAL_ORIGIN),
    });

    await expect(loadAccountLegalGateState()).resolves.toEqual({
      status: "unavailable",
    });
  });

  it.each([
    "http://ironclad-website-legal-release.vercel.app",
    "https://ironclad-website-legal-release.vercel.app/",
    "https://nested.ironclad-website-legal-release.vercel.app",
    "https://www.ironcladtournaments.com",
    "https://ironclad-website-legal-release.vercel.app:8443",
    "https://ironclad-website-legal-release.vercel.app/path",
  ])("fails closed for an invalid configured Preview legal origin: %s", async (origin) => {
    process.env.VERCEL_ENV = "preview";
    process.env.PREVIEW_LEGAL_DOCUMENT_ORIGIN = origin;
    authMock.mockResolvedValue(playerIdentity);
    setDeployedDocumentPair("1.1", "1.1");

    await expect(loadAccountLegalGateState()).resolves.toEqual({
      status: "unavailable",
    });
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it("rejects a different Preview origin than the configured immutable release", async () => {
    process.env.VERCEL_ENV = "preview";
    process.env.PREVIEW_LEGAL_DOCUMENT_ORIGIN = PREVIEW_LEGAL_ORIGIN;
    authMock.mockResolvedValue(playerIdentity);
    setDeployedDocumentPair("1.1", "1.1");
    clientFixture({
      documents: documentRows(
        "1.1",
        "1.1",
        "https://ironclad-website-other-release.vercel.app"
      ),
    });

    await expect(loadAccountLegalGateState()).resolves.toEqual({
      status: "unavailable",
    });
  });

  it.each([
    "https://ironclad-website-valid.vercel.app, https://ironclad-website-other.vercel.app",
    "https://ironclad-website-valid.vercel.app,",
    "https://ironclad-website-valid.vercel.app,https://nested.ironclad-website.vercel.app",
    "https://ironclad-website-valid.vercel.app,https://www.ironcladtournaments.com",
  ])("fails closed for an invalid Preview legal-origin set: %s", async (origins) => {
    process.env.VERCEL_ENV = "preview";
    process.env.PREVIEW_LEGAL_DOCUMENT_ORIGINS = origins;
    authMock.mockResolvedValue(playerIdentity);

    await expect(loadAccountLegalGateState()).resolves.toEqual({
      status: "unavailable",
    });
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it("caps the Preview legal-origin allowlist at four exact origins", async () => {
    process.env.VERCEL_ENV = "preview";
    process.env.PREVIEW_LEGAL_DOCUMENT_ORIGINS = [1, 2, 3, 4, 5]
      .map((index) => `https://ironclad-website-legal-${index}.vercel.app`)
      .join(",");
    authMock.mockResolvedValue(playerIdentity);

    await expect(loadAccountLegalGateState()).resolves.toEqual({
      status: "unavailable",
    });
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it("keeps the current pair satisfied while a non-effective Privacy v1.2 draft exists", async () => {
    authMock.mockResolvedValue(playerIdentity);
    setDeployedDocumentPair("1.1", "1.1");
    const fixture = clientFixture({
      documents: documentRows("1.1", "1.1"),
      acceptance: {
        id: ACCEPTANCE_ID,
        terms_document_id: TERMS_ID,
        privacy_document_id: PRIVACY_ID,
        terms_accepted: true,
        privacy_acknowledged: true,
      },
    });

    await expect(loadAccountLegalGateState()).resolves.toEqual({
      status: "satisfied",
    });
    expect(fixture.documentQuery.eq).toHaveBeenCalledWith(
      "status",
      "effective"
    );
  });

  it("supports deploying the v1.2-compatible application before activation", async () => {
    authMock.mockResolvedValue(playerIdentity);
    setDeployedDocumentPair("1.1", "1.2");
    clientFixture({
      documents: documentRows("1.1", "1.1"),
      acceptance: {
        id: ACCEPTANCE_ID,
        terms_document_id: TERMS_ID,
        privacy_document_id: PRIVACY_ID,
        terms_accepted: true,
        privacy_acknowledged: true,
      },
    });

    await expect(loadAccountLegalGateState()).resolves.toEqual({
      status: "satisfied",
    });
  });

  it("requires exact new evidence when Privacy v1.2 becomes Effective", async () => {
    authMock.mockResolvedValue(playerIdentity);
    setDeployedDocumentPair("1.1", "1.2");
    const fixture = clientFixture({ documents: documentRows("1.1", "1.2") });

    await expect(loadAccountLegalGateState()).resolves.toEqual({
      status: "required",
      terms: {
        id: TERMS_ID,
        version: "1.1",
        url: documentPath("terms", "1.1"),
      },
      privacy: {
        id: PRIVACY_V12_ID,
        version: "1.2",
        url: documentPath("privacy", "1.2"),
      },
    });
    expect(fixture.acceptanceQuery.eq).toHaveBeenCalledWith(
      "terms_document_id",
      TERMS_ID
    );
    expect(fixture.acceptanceQuery.eq).toHaveBeenCalledWith(
      "privacy_document_id",
      PRIVACY_V12_ID
    );
  });

  it("satisfies the v1.2 gate only with exact v1.1/v1.2 evidence", async () => {
    authMock.mockResolvedValue(playerIdentity);
    setDeployedDocumentPair("1.1", "1.2");
    clientFixture({
      documents: documentRows("1.1", "1.2"),
      acceptance: {
        id: ACCEPTANCE_ID,
        terms_document_id: TERMS_ID,
        privacy_document_id: PRIVACY_V12_ID,
        terms_accepted: true,
        privacy_acknowledged: true,
      },
    });

    await expect(loadAccountLegalGateState()).resolves.toEqual({
      status: "satisfied",
    });
  });

  it("supports a generic future transition without application version branches", async () => {
    authMock.mockResolvedValue(playerIdentity);
    setReleaseTransition("1.2", "1.2", "1.2", "1.3");
    clientFixture({ documents: documentRows("1.2", "1.3") });

    await expect(loadAccountLegalGateState()).resolves.toEqual({
      status: "required",
      terms: {
        id: TERMS_ID,
        version: "1.2",
        url: documentPath("terms", "1.2"),
      },
      privacy: {
        id: PRIVACY_V13_ID,
        version: "1.3",
        url: documentPath("privacy", "1.3"),
      },
    });
  });

  it("supports a Terms-only future transition", async () => {
    authMock.mockResolvedValue(playerIdentity);
    setReleaseTransition("1.1", "1.2", "1.2", "1.2");
    clientFixture({ documents: documentRows("1.2", "1.2") });

    await expect(loadAccountLegalGateState()).resolves.toEqual({
      status: "required",
      terms: {
        id: TERMS_ID,
        version: "1.2",
        url: documentPath("terms", "1.2"),
      },
      privacy: {
        id: PRIVACY_V12_ID,
        version: "1.2",
        url: documentPath("privacy", "1.2"),
      },
    });
  });

  it("supports a future transition that changes both documents", async () => {
    authMock.mockResolvedValue(playerIdentity);
    setReleaseTransition("1.1", "1.2", "1.2", "1.3");
    clientFixture({ documents: documentRows("1.2", "1.3") });

    await expect(loadAccountLegalGateState()).resolves.toEqual({
      status: "required",
      terms: {
        id: TERMS_ID,
        version: "1.2",
        url: documentPath("terms", "1.2"),
      },
      privacy: {
        id: PRIVACY_V13_ID,
        version: "1.3",
        url: documentPath("privacy", "1.3"),
      },
    });
  });

  it("accepts exact evidence for a generic future transition predecessor", async () => {
    authMock.mockResolvedValue(playerIdentity);
    setReleaseTransition("1.2", "1.2", "1.2", "1.3");
    clientFixture({
      documents: documentRows("1.2", "1.2"),
      acceptance: {
        id: ACCEPTANCE_ID,
        terms_document_id: TERMS_ID,
        privacy_document_id: PRIVACY_V12_ID,
        terms_accepted: true,
        privacy_acknowledged: true,
      },
    });

    await expect(loadAccountLegalGateState()).resolves.toEqual({
      status: "satisfied",
    });
  });

  it.each([
    [
      "missing predecessor pair",
      () => {
        legalSuccessorReleaseMock.predecessorDocuments = [];
      },
    ],
    [
      "duplicate predecessor kind",
      () => {
        legalSuccessorReleaseMock.predecessorDocuments = [
          releaseDocument("terms", "1.1"),
          releaseDocument("terms", "1.0"),
        ];
      },
    ],
    [
      "missing changed successor",
      () => {
        legalSuccessorReleaseMock.documents = [];
      },
    ],
    [
      "duplicate changed kind",
      () => {
        legalSuccessorReleaseMock.documents = [
          releaseDocument("privacy", "1.2"),
          releaseDocument("privacy", "1.3"),
        ];
      },
    ],
    [
      "no-op changed document",
      () => {
        legalSuccessorReleaseMock.documents = [
          releaseDocument("privacy", "1.1"),
        ];
      },
    ],
    [
      "reused successor version",
      () => {
        legalSuccessorReleaseMock.documents = [
          {
            ...releaseDocument("privacy", "1.2"),
            version: "1.1",
          },
        ];
      },
    ],
    [
      "reused successor path",
      () => {
        legalSuccessorReleaseMock.documents = [
          {
            ...releaseDocument("privacy", "1.2"),
            filename: documentFilename("privacy", "1.1"),
            publicPath: documentPath("privacy", "1.1"),
          },
        ];
      },
    ],
    [
      "reused successor bytes",
      () => {
        legalSuccessorReleaseMock.documents = [
          {
            ...releaseDocument("privacy", "1.2"),
            sha256: documentHash("privacy", "1.1"),
          },
        ];
      },
    ],
    [
      "filename and public path mismatch",
      () => {
        legalSuccessorReleaseMock.documents = [
          {
            ...releaseDocument("privacy", "1.2"),
            filename: "different-file.pdf",
          },
        ];
      },
    ],
    [
      "malformed successor hash",
      () => {
        legalSuccessorReleaseMock.documents = [
          {
            ...releaseDocument("privacy", "1.2"),
            sha256: "not-a-sha256",
          },
        ];
      },
    ],
  ])("fails closed for a %s in the Final release manifest", async (_, mutate) => {
    authMock.mockResolvedValue(playerIdentity);
    mutate();

    await expect(loadAccountLegalGateState()).resolves.toEqual({
      status: "unavailable",
    });
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it("fails closed when the bundled corpus is not the derived successor", async () => {
    authMock.mockResolvedValue(playerIdentity);
    setBundledDocumentPair("1.1", "1.1");

    await expect(loadAccountLegalGateState()).resolves.toEqual({
      status: "unavailable",
    });
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it("fails closed when an old application observes the new Effective pair", async () => {
    authMock.mockResolvedValue(playerIdentity);
    setDeployedDocumentPair("1.1", "1.1");
    clientFixture({ documents: documentRows("1.1", "1.2") });

    await expect(loadAccountLegalGateState()).resolves.toEqual({
      status: "unavailable",
    });
  });

  it.each([
    ["successor database with predecessor web", "1.0", "1.0", "1.1", "1.1"],
    ["mixed deployed pair", "1.1", "1.0", "1.1", "1.0"],
  ])(
    "keeps anonymous browsing available but analytics off for %s",
    async (_, webTerms, webPrivacy, databaseTerms, databasePrivacy) => {
      authMock.mockResolvedValue(anonymousIdentity);
      setDeployedDocumentPair(webTerms, webPrivacy);
      clientFixture({
        documents: documentRows(databaseTerms, databasePrivacy),
      });

      await expect(
        loadAccountLegalRuntimeState({ includeAnalytics: true })
      ).resolves.toEqual({
        accountGate: { status: "inactive", reason: "anonymous" },
        analyticsAvailable: false,
      });
    }
  );

  it("keeps anonymous analytics available for an exact release predecessor", async () => {
    authMock.mockResolvedValue(anonymousIdentity);
    setDeployedDocumentPair("1.1", "1.1");
    clientFixture({ documents: documentRows("1.0", "1.0") });

    await expect(
      loadAccountLegalRuntimeState({ includeAnalytics: true })
    ).resolves.toEqual({
      accountGate: { status: "inactive", reason: "anonymous" },
      analyticsAvailable: true,
    });
  });

  it("keeps anonymous browsing available when the optional alignment lookup fails", async () => {
    authMock.mockResolvedValue(anonymousIdentity);
    setDeployedDocumentPair("1.1", "1.1");
    clientFixture({
      documents: null,
      documentError: new Error("provider detail"),
    });

    await expect(
      loadAccountLegalRuntimeState({ includeAnalytics: true })
    ).resolves.toEqual({
      accountGate: { status: "inactive", reason: "anonymous" },
      analyticsAvailable: false,
    });
  });

  it("requires acceptance for an exact release predecessor instead of bypassing it", async () => {
    authMock.mockResolvedValue(playerIdentity);
    setDeployedDocumentPair("1.1", "1.1");
    const fixture = clientFixture({ documents: documentRows("1.0", "1.0") });

    await expect(loadAccountLegalGateState()).resolves.toEqual({
      status: "required",
      terms: {
        id: TERMS_ID,
        version: "1.0",
        url: documentPath("terms", "1.0"),
      },
      privacy: {
        id: PRIVACY_ID,
        version: "1.0",
        url: documentPath("privacy", "1.0"),
      },
    });
    expect(authMock.mock.invocationCallOrder[0]).toBeLessThan(
      createSupabaseAdminClientMock.mock.invocationCallOrder[0]
    );
    expect(fixture.from).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["mixed", "1.1", "1.0"],
    ["unknown", "1.2", "1.2"],
  ])("fails closed for a %s Effective pair", async (_, terms, privacy) => {
    authMock.mockResolvedValue(playerIdentity);
    clientFixture({ documents: documentRows(terms, privacy) });

    await expect(loadAccountLegalGateState()).resolves.toEqual({
      status: "unavailable",
    });
  });

  it.each([
    ["predecessor web with successor database", "1.0", "1.0", "1.1", "1.1"],
    ["mixed deployed Terms successor", "1.1", "1.0", "1.1", "1.0"],
    ["mixed deployed Privacy successor", "1.0", "1.1", "1.0", "1.1"],
  ])(
    "fails closed for %s",
    async (_, webTerms, webPrivacy, databaseTerms, databasePrivacy) => {
      authMock.mockResolvedValue(playerIdentity);
      setDeployedDocumentPair(webTerms, webPrivacy);
      const fixture = clientFixture({
        documents: documentRows(databaseTerms, databasePrivacy),
      });

      await expect(loadAccountLegalGateState()).resolves.toEqual({
        status: "unavailable",
      });
      expect(fixture.from).not.toHaveBeenCalled();
    }
  );

  it.each([
    ["missing deployed document", [deployedDocument("terms", "1.1")]],
    [
      "duplicate deployed document",
      [
        deployedDocument("terms", "1.1"),
        deployedDocument("terms", "1.1"),
        deployedDocument("privacy", "1.1"),
      ],
    ],
    [
      "malformed deployed path",
      [
        {
          ...deployedDocument("terms", "1.1"),
          publicPath:
            "https://example.test/documents-rules-ppa/ironclad-terms-of-service-v1.1.pdf",
        },
        deployedDocument("privacy", "1.1"),
      ],
    ],
  ])("fails closed for a %s", async (_, deployedDocuments) => {
    authMock.mockResolvedValue(playerIdentity);
    legalCorpusMock.documents = deployedDocuments;

    await expect(loadAccountLegalGateState()).resolves.toEqual({
      status: "unavailable",
    });
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it.each([
    ["partial database pair", documentRows("1.1", "1.1").slice(0, 1)],
    [
      "duplicate database pair",
      [
        ...documentRows("1.1", "1.1"),
        { ...documentRows("1.1", "1.1")[0], id: ACCEPTANCE_ID },
      ],
    ],
    [
      "malformed database URL",
      documentRows("1.1", "1.1").map((document, index) =>
        index === 0
          ? {
              ...document,
              immutable_url: `http://example.test${documentPath(
                "terms",
                "1.1"
              )}`,
            }
          : document
      ),
    ],
  ])("fails closed for a %s", async (_, documents) => {
    authMock.mockResolvedValue(playerIdentity);
    setDeployedDocumentPair("1.1", "1.1");
    clientFixture({ documents });

    await expect(loadAccountLegalGateState()).resolves.toEqual({
      status: "unavailable",
    });
  });

  it.each([
    [
      "foreign HTTPS host",
      () =>
        documentRows("1.1", "1.1").map((document, index) =>
          index === 0
            ? {
                ...document,
                immutable_url: `https://foreign.example${documentPath(
                  "terms",
                  "1.1"
                )}`,
              }
            : document
        ),
    ],
    [
      "noncanonical IronClad host",
      () =>
        documentRows("1.1", "1.1").map((document, index) =>
          index === 0
            ? {
                ...document,
                immutable_url: `https://ironcladtournaments.com${documentPath(
                  "terms",
                  "1.1"
                )}`,
              }
            : document
        ),
    ],
    [
      "alternate IronClad subdomain",
      () =>
        documentRows("1.1", "1.1").map((document, index) =>
          index === 0
            ? {
                ...document,
                immutable_url: `https://preview.ironcladtournaments.com${documentPath(
                  "terms",
                  "1.1"
                )}`,
              }
            : document
        ),
    ],
    [
      "non-default alternate port",
      () =>
        documentRows("1.1", "1.1").map((document, index) =>
          index === 0
            ? {
                ...document,
                immutable_url: `https://www.ironcladtournaments.com:8443${documentPath(
                  "terms",
                  "1.1"
                )}`,
              }
            : document
        ),
    ],
    [
      "explicit default port",
      () =>
        documentRows("1.1", "1.1").map((document, index) =>
          index === 0
            ? {
                ...document,
                immutable_url: `https://www.ironcladtournaments.com:443${documentPath(
                  "terms",
                  "1.1"
                )}`,
              }
            : document
        ),
    ],
    [
      "arbitrary valid-looking hash",
      () =>
        documentRows("1.1", "1.1").map((document, index) =>
          index === 0 ? { ...document, sha256: "a".repeat(64) } : document
        ),
    ],
    [
      "uppercase hash",
      () =>
        documentRows("1.1", "1.1").map((document, index) =>
          index === 0
            ? { ...document, sha256: document.sha256.toUpperCase() }
            : document
        ),
    ],
    [
      "malformed hash",
      () =>
        documentRows("1.1", "1.1").map((document, index) =>
          index === 0 ? { ...document, sha256: "not-a-sha256" } : document
        ),
    ],
    [
      "one-character hash difference",
      () =>
        documentRows("1.1", "1.1").map((document, index) =>
          index === 0
            ? {
                ...document,
                sha256: `${document.sha256.slice(0, -1)}0`,
              }
            : document
        ),
    ],
    [
      "swapped Terms and Privacy hashes",
      () => {
        const rows = documentRows("1.1", "1.1");
        return [
          { ...rows[0], sha256: RELEASE_HASHES.privacy["1.1"] },
          { ...rows[1], sha256: RELEASE_HASHES.terms["1.1"] },
        ];
      },
    ],
    [
      "correct hash with wrong path",
      () =>
        documentRows("1.1", "1.1").map((document, index) =>
          index === 0
            ? {
                ...document,
                immutable_url: `https://www.ironcladtournaments.com${documentPath(
                  "privacy",
                  "1.1"
                )}`,
              }
            : document
        ),
    ],
    [
      "correct path and hash with wrong version",
      () =>
        documentRows("1.1", "1.1").map((document, index) =>
          index === 0 ? { ...document, version: "1.0" } : document
        ),
    ],
    ["mixed versions", () => documentRows("1.1", "1.0")],
    [
      "duplicate pair",
      () => [
        ...documentRows("1.1", "1.1"),
        { ...documentRows("1.1", "1.1")[0], id: ACCEPTANCE_ID },
      ],
    ],
    ["missing pair", () => documentRows("1.1", "1.1").slice(0, 1)],
    [
      "malformed URL",
      () =>
        documentRows("1.1", "1.1").map((document, index) =>
          index === 0 ? { ...document, immutable_url: "not a URL" } : document
        ),
    ],
    [
      "credentials on legal URL",
      () =>
        documentRows("1.1", "1.1").map((document, index) =>
          index === 0
            ? {
                ...document,
                immutable_url: `https://user:password@www.ironcladtournaments.com${documentPath(
                  "terms",
                  "1.1"
                )}`,
              }
            : document
        ),
    ],
    [
      "query on legal URL",
      () =>
        documentRows("1.1", "1.1").map((document, index) =>
          index === 0
            ? { ...document, immutable_url: `${document.immutable_url}?x=1` }
            : document
        ),
    ],
    [
      "fragment on legal URL",
      () =>
        documentRows("1.1", "1.1").map((document, index) =>
          index === 1
            ? { ...document, immutable_url: `${document.immutable_url}#x` }
            : document
        ),
    ],
  ])(
    "keeps analytics off and the authenticated gate fail-closed for a %s",
    async (_, rows) => {
      authMock.mockResolvedValue(playerIdentity);
      setDeployedDocumentPair("1.1", "1.1");
      clientFixture({ documents: rows() });

      await expect(
        loadAccountLegalRuntimeState({ includeAnalytics: true })
      ).resolves.toEqual({
        accountGate: { status: "unavailable" },
        analyticsAvailable: false,
      });
    }
  );

  it("does not let an old or absent acceptance satisfy the v1.1 pair", async () => {
    authMock.mockResolvedValue(playerIdentity);
    setDeployedDocumentPair("1.1", "1.1");
    const fixture = clientFixture({ documents: documentRows("1.1", "1.1") });

    await expect(loadAccountLegalGateState()).resolves.toEqual({
      status: "required",
      terms: {
        id: TERMS_ID,
        version: "1.1",
        url: documentPath("terms", "1.1"),
      },
      privacy: {
        id: PRIVACY_ID,
        version: "1.1",
        url: documentPath("privacy", "1.1"),
      },
    });
    expect(fixture.acceptanceQuery.eq).toHaveBeenCalledWith(
      "terms_document_id",
      TERMS_ID
    );
    expect(fixture.acceptanceQuery.eq).toHaveBeenCalledWith(
      "privacy_document_id",
      PRIVACY_ID
    );
  });

  it("accepts only an exact v1.1 account-wide evidence row", async () => {
    authMock.mockResolvedValue(playerIdentity);
    setDeployedDocumentPair("1.1", "1.1");
    clientFixture({
      documents: documentRows("1.1", "1.1"),
      acceptance: {
        id: ACCEPTANCE_ID,
        terms_document_id: TERMS_ID,
        privacy_document_id: PRIVACY_ID,
        terms_accepted: true,
        privacy_acknowledged: true,
      },
    });

    await expect(loadAccountLegalGateState()).resolves.toEqual({
      status: "satisfied",
    });
  });

  it.each([
    ["required", null],
    [
      "satisfied",
      {
        id: ACCEPTANCE_ID,
        terms_document_id: TERMS_ID,
        privacy_document_id: PRIVACY_ID,
        terms_accepted: true,
        privacy_acknowledged: true,
      },
    ],
  ])(
    "shares one aligned legal read with the signed-in %s gate state",
    async (expectedStatus, acceptance) => {
      authMock.mockResolvedValue(playerIdentity);
      setDeployedDocumentPair("1.1", "1.1");
      const fixture = clientFixture({
        documents: documentRows("1.1", "1.1"),
        acceptance,
      });

      const runtime = await loadAccountLegalRuntimeState({
        includeAnalytics: true,
      });

      expect(runtime.accountGate.status).toBe(expectedStatus);
      expect(runtime.analyticsAvailable).toBe(true);
      expect(fixture.from).toHaveBeenCalledTimes(2);
    }
  );

  it("fails closed and does not expose provider failures", async () => {
    authMock.mockResolvedValue(playerIdentity);
    setDeployedDocumentPair("1.1", "1.1");
    const privateMessage = "private relation and credential detail";
    clientFixture({
      documents: documentRows("1.1", "1.1"),
      acceptanceError: new Error(privateMessage),
    });

    await expect(loadAccountLegalGateState()).resolves.toEqual({
      status: "unavailable",
    });
    expect(console.error).not.toHaveBeenCalledWith(
      expect.stringContaining(privateMessage)
    );
  });

  it("aborts a stalled Effective-document read and keeps anonymous browsing available", async () => {
    vi.useFakeTimers();
    authMock.mockResolvedValue(anonymousIdentity);
    setDeployedDocumentPair("1.1", "1.1");
    const fixture = clientFixture({ documents: documentRows("1.1", "1.1") });
    let suppliedSignal: AbortSignal | undefined;

    fixture.documentQuery.abortSignal.mockImplementation(
      (signal: AbortSignal) => {
        suppliedSignal = signal;
        return new Promise((resolve) => {
          signal.addEventListener(
            "abort",
            () => resolve({ data: null, error: new Error("aborted") }),
            { once: true }
          );
        });
      }
    );

    const runtimePromise = loadAccountLegalRuntimeState({
      includeAnalytics: true,
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(suppliedSignal).toBeDefined();
    expect(suppliedSignal?.aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(LEGAL_LOOKUP_TIMEOUT_MS);

    await expect(runtimePromise).resolves.toEqual({
      accountGate: { status: "inactive", reason: "anonymous" },
      analyticsAvailable: false,
    });
    expect(suppliedSignal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("aborts a stalled signed-in Effective-document read and resolves fail-closed", async () => {
    vi.useFakeTimers();
    authMock.mockResolvedValue(playerIdentity);
    setDeployedDocumentPair("1.1", "1.1");
    const fixture = clientFixture({ documents: documentRows("1.1", "1.1") });
    let suppliedSignal: AbortSignal | undefined;

    fixture.documentQuery.abortSignal.mockImplementation(
      (signal: AbortSignal) => {
        suppliedSignal = signal;
        return new Promise((resolve) => {
          signal.addEventListener(
            "abort",
            () => resolve({ data: null, error: new Error("aborted") }),
            { once: true }
          );
        });
      }
    );

    const runtimePromise = loadAccountLegalRuntimeState({
      includeAnalytics: true,
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(suppliedSignal).toBeDefined();
    expect(suppliedSignal?.aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(LEGAL_LOOKUP_TIMEOUT_MS);

    await expect(runtimePromise).resolves.toEqual({
      accountGate: { status: "unavailable" },
      analyticsAvailable: false,
    });
    expect(suppliedSignal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("aborts a stalled signed-in acceptance read and resolves fail-closed", async () => {
    vi.useFakeTimers();
    authMock.mockResolvedValue(playerIdentity);
    setDeployedDocumentPair("1.1", "1.1");
    const fixture = clientFixture({ documents: documentRows("1.1", "1.1") });
    let suppliedSignal: AbortSignal | undefined;

    fixture.acceptanceQuery.abortSignal.mockImplementation(
      (signal: AbortSignal) => {
        suppliedSignal = signal;
        return fixture.acceptanceQuery;
      }
    );
    fixture.acceptanceQuery.maybeSingle.mockImplementation(
      () =>
        new Promise((resolve) => {
          suppliedSignal?.addEventListener(
            "abort",
            () => resolve({ data: null, error: new Error("aborted") }),
            { once: true }
          );
        })
    );

    const runtimePromise = loadAccountLegalRuntimeState({
      includeAnalytics: true,
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(suppliedSignal).toBeDefined();
    expect(suppliedSignal?.aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(LEGAL_LOOKUP_TIMEOUT_MS);

    await expect(runtimePromise).resolves.toEqual({
      accountGate: { status: "unavailable" },
      analyticsAvailable: false,
    });
    expect(suppliedSignal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears each deadline after immediate successful reads", async () => {
    vi.useFakeTimers();
    authMock.mockResolvedValue(playerIdentity);
    setDeployedDocumentPair("1.1", "1.1");
    const fixture = clientFixture({
      documents: documentRows("1.1", "1.1"),
      acceptance: {
        id: ACCEPTANCE_ID,
        terms_document_id: TERMS_ID,
        privacy_document_id: PRIVACY_ID,
        terms_accepted: true,
        privacy_acknowledged: true,
      },
    });

    await expect(loadAccountLegalGateState()).resolves.toEqual({
      status: "satisfied",
    });
    expect(fixture.documentQuery.abortSignal).toHaveBeenCalledWith(
      expect.any(AbortSignal)
    );
    expect(fixture.acceptanceQuery.abortSignal).toHaveBeenCalledWith(
      expect.any(AbortSignal)
    );
    expect(vi.getTimerCount()).toBe(0);
  });
});
