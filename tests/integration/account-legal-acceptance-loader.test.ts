import { beforeEach, describe, expect, it, vi } from "vitest";
import { anonymousIdentity, playerIdentity } from "@/tests/fixtures/auth";

const authMock = vi.hoisted(() => vi.fn());
const createSupabaseAdminClientMock = vi.hoisted(() => vi.fn());
const legalCorpusMock = vi.hoisted(() => ({ documents: [] as unknown[] }));

vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
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
const HASH = "a".repeat(64);

function documentPath(kind: "terms" | "privacy", version: string) {
  return kind === "terms"
    ? `/documents-rules-ppa/ironclad-terms-of-service-v${version}.pdf`
    : `/documents-rules-ppa/ironclad-privacy-policy-v${version}.pdf`;
}

function deployedDocument(kind: "terms" | "privacy", version: string) {
  return {
    kind,
    version,
    status: "Effective",
    publicPath: documentPath(kind, version),
  };
}

function setDeployedDocumentPair(termsVersion: string, privacyVersion: string) {
  legalCorpusMock.documents = [
    deployedDocument("terms", termsVersion),
    deployedDocument("privacy", privacyVersion),
  ];
}

function documentRows(termsVersion: string, privacyVersion: string) {
  return [
    {
      id: TERMS_ID,
      document_kind: "terms",
      version: termsVersion,
      immutable_url: `https://www.ironcladtournaments.com${documentPath(
        "terms",
        termsVersion
      )}`,
      status: "effective",
      effective_at: "2026-08-19T00:00:00.000Z",
      sha256: HASH,
    },
    {
      id: PRIVACY_ID,
      document_kind: "privacy",
      version: privacyVersion,
      immutable_url: `https://www.ironcladtournaments.com${documentPath(
        "privacy",
        privacyVersion
      )}`,
      status: "effective",
      effective_at: "2026-08-19T00:00:00.000Z",
      sha256: HASH,
    },
  ];
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
  documentQuery.in = vi.fn(async () => ({
    data: documents,
    error: documentError,
  }));

  const acceptanceQuery: Record<string, ReturnType<typeof vi.fn>> = {};
  acceptanceQuery.select = vi.fn(() => acceptanceQuery);
  acceptanceQuery.eq = vi.fn(() => acceptanceQuery);
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
    setDeployedDocumentPair("1.0", "1.0");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
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

  it.each([
    ["predecessor database", "1.1", "1.1", "1.0", "1.0"],
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

  it("keeps the Effective v1.0 pair inactive", async () => {
    authMock.mockResolvedValue(playerIdentity);
    const fixture = clientFixture({ documents: documentRows("1.0", "1.0") });

    await expect(loadAccountLegalGateState()).resolves.toEqual({
      status: "inactive",
      reason: "predecessor",
    });
    expect(authMock.mock.invocationCallOrder[0]).toBeLessThan(
      createSupabaseAdminClientMock.mock.invocationCallOrder[0]
    );
    expect(fixture.from).toHaveBeenCalledTimes(1);
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
    ["successor web with predecessor database", "1.1", "1.1", "1.0", "1.0"],
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
      expect(fixture.from).toHaveBeenCalledTimes(
        webTerms === webPrivacy ? 1 : 0
      );
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
});
