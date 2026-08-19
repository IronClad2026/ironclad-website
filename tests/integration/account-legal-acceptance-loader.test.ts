import { beforeEach, describe, expect, it, vi } from "vitest";
import { anonymousIdentity, playerIdentity } from "@/tests/fixtures/auth";

const authMock = vi.hoisted(() => vi.fn());
const createSupabaseAdminClientMock = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("@/lib/supabase-admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock,
}));

import { loadAccountLegalGateState } from "@/lib/account-legal-acceptance";

const TERMS_ID = "11111111-1111-4111-8111-111111111111";
const PRIVACY_ID = "22222222-2222-4222-8222-222222222222";
const ACCEPTANCE_ID = "33333333-3333-4333-8333-333333333333";
const HASH = "a".repeat(64);

function documentRows(termsVersion: string, privacyVersion: string) {
  return [
    {
      id: TERMS_ID,
      document_kind: "terms",
      version: termsVersion,
      immutable_url: `/documents-rules-ppa/terms-v${termsVersion}.pdf`,
      status: "effective",
      effective_at: "2026-08-19T00:00:00.000Z",
      sha256: HASH,
    },
    {
      id: PRIVACY_ID,
      document_kind: "privacy",
      version: privacyVersion,
      immutable_url: `/documents-rules-ppa/privacy-v${privacyVersion}.pdf`,
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

  it("does not let an old or absent acceptance satisfy the v1.1 pair", async () => {
    authMock.mockResolvedValue(playerIdentity);
    const fixture = clientFixture({ documents: documentRows("1.1", "1.1") });

    await expect(loadAccountLegalGateState()).resolves.toEqual({
      status: "required",
      terms: {
        id: TERMS_ID,
        version: "1.1",
        url: "/documents-rules-ppa/terms-v1.1.pdf",
      },
      privacy: {
        id: PRIVACY_ID,
        version: "1.1",
        url: "/documents-rules-ppa/privacy-v1.1.pdf",
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

  it("fails closed and does not expose provider failures", async () => {
    authMock.mockResolvedValue(playerIdentity);
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
