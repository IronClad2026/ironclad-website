import { beforeEach, describe, expect, it, vi } from "vitest";
import { adminIdentity } from "@/tests/fixtures/auth";

const authMock = vi.hoisted(() => vi.fn());
const createSupabaseAdminClientMock = vi.hoisted(() => vi.fn());
const redirectMock = vi.hoisted(() =>
  vi.fn((href: string) => {
    throw new Error(`NEXT_REDIRECT:${href}`);
  })
);
const revalidatePathMock = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
}));

vi.mock("@/lib/supabase-admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

import { retryTournamentStorageCleanup } from "@/app/admin/tournaments/actions";

function createQuery(result: { data: unknown; error: unknown }) {
  const query = {
    eq: vi.fn(),
    maybeSingle: vi.fn(async () => result),
    select: vi.fn(),
    then: (
      resolve: (value: typeof result) => unknown,
      reject: (reason: unknown) => unknown
    ) => Promise.resolve(result).then(resolve, reject),
    update: vi.fn(),
  };
  query.eq.mockReturnValue(query);
  query.select.mockReturnValue(query);
  query.update.mockReturnValue(query);
  return query;
}

describe("tournament storage cleanup privacy", () => {
  beforeEach(() => {
    authMock.mockReset();
    createSupabaseAdminClientMock.mockReset();
    redirectMock.mockClear();
    revalidatePathMock.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("does not persist or log a historical identity-bearing proof path", async () => {
    const secretPath =
      "match-1/user_secret_clerk/private-historical-proof.rec";
    const jobQuery = createQuery({
      data: {
        id: "cleanup-job-1",
        proof_paths: [secretPath],
        banner_paths: [],
      },
      error: null,
    });
    const updatedRows: Record<string, unknown>[] = [];
    const updateQuery = createQuery({ data: null, error: null });
    updateQuery.update.mockImplementation((values) => {
      updatedRows.push(values);
      return updateQuery;
    });
    const storageBucket = {
      list: vi.fn(async () => ({
        data: [{ name: "private-historical-proof.rec" }],
        error: null,
      })),
      remove: vi.fn(async () => ({ data: [], error: null })),
    };
    let deletionJobQueryCount = 0;
    const client = {
      from: vi.fn(() => {
        deletionJobQueryCount += 1;
        return deletionJobQueryCount === 1 ? jobQuery : updateQuery;
      }),
      storage: {
        from: vi.fn(() => storageBucket),
      },
    };
    authMock.mockResolvedValue(adminIdentity);
    createSupabaseAdminClientMock.mockReturnValue(client);
    const formData = new FormData();
    formData.set("jobId", "cleanup-job-1");

    await expect(retryTournamentStorageCleanup(formData)).rejects.toThrow(
      "NEXT_REDIRECT:/admin/tournaments?notice=cleanup-failed"
    );

    expect(updatedRows).toContainEqual({
      error_message: "Tournament storage cleanup could not be verified.",
    });
    const visibleOutput = JSON.stringify({
      updates: updatedRows,
      logs: vi.mocked(console.error).mock.calls,
      redirects: redirectMock.mock.calls,
    });
    expect(visibleOutput).not.toContain(secretPath);
    expect(visibleOutput).not.toContain("user_secret_clerk");
  });
});
