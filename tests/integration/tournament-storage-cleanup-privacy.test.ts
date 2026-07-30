import { beforeEach, describe, expect, it, vi } from "vitest";
import { adminIdentity } from "@/tests/fixtures/auth";
import {
  buildTournamentBannerPublicUrl,
  parseTournamentBannerPath,
  parseTournamentBannerPublicUrl,
} from "@/lib/tournament-banner-storage";
import { mapTournamentRow, type TournamentRow } from "@/lib/tournaments";

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

import {
  deleteTournament,
  discardTournamentBannerUpload,
  retryTournamentStorageCleanup,
  saveTournament,
} from "@/app/admin/tournaments/actions";

const bannerPath = "banners/123e4567-e89b-42d3-a456-426614174000.png";
const bannerUrl =
  `http://127.0.0.1:54321/storage/v1/object/public/` +
  `tournament-banners/${bannerPath}`;

function createTournamentFormData(url: string) {
  const formData = new FormData();
  formData.set("tournamentId", "tournament-1");
  formData.set("title", "Privacy Cup");
  formData.set("description", "Description");
  formData.set("bannerImageUrl", url);
  formData.set("status", "upcoming");
  formData.set("format", "1v1");
  formData.set("ruleFormat", "format_a");
  formData.set("resultConfirmationWindowMinutes", "30");
  formData.set("prizePool", "");
  formData.set("academyEnabled", "on");
  formData.set("academyEloRules", "Below 1100 ELO");
  formData.set("academyMaxPlayers", "8");
  return formData;
}

function createQuery(result: { data: unknown; error: unknown }) {
  const query = {
    delete: vi.fn(),
    eq: vi.fn(),
    limit: vi.fn(),
    maybeSingle: vi.fn(async () => result),
    neq: vi.fn(),
    select: vi.fn(),
    then: (
      resolve: (value: typeof result) => unknown,
      reject: (reason: unknown) => unknown
    ) => Promise.resolve(result).then(resolve, reject),
    update: vi.fn(),
  };
  query.delete.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.limit.mockReturnValue(query);
  query.neq.mockReturnValue(query);
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

  it("accepts only exact current-project UUID banner URLs and paths", () => {
    expect(parseTournamentBannerPath(bannerPath)).toMatchObject({
      mimeType: "image/png",
      path: bannerPath,
    });
    expect(parseTournamentBannerPublicUrl(bannerUrl)).toMatchObject({
      path: bannerPath,
      publicUrl: bannerUrl,
    });
    expect(buildTournamentBannerPublicUrl(bannerPath)).toBe(bannerUrl);

    const malformedValues = [
      `https://foreign.supabase.co/storage/v1/object/public/tournament-banners/${bannerPath}`,
      `${bannerUrl}?token=not-allowed`,
      `${bannerUrl}#fragment`,
      bannerUrl.replace("banners/", "banners//"),
      bannerUrl.replace("banners/", "banners/alias/"),
      bannerUrl.replace("banners/", "banners%2F"),
      bannerUrl.replace("banners/", "banners/../"),
      bannerUrl.replace("-42d3-", "-12d3-"),
      bannerUrl.replace(".png", ".svg"),
      "/images/tournament-banner.png",
    ];

    for (const value of malformedValues) {
      expect(parseTournamentBannerPublicUrl(value)).toBeNull();
    }
  });

  it("deletes only the exact unreferenced opaque upload", async () => {
    const referenceQuery = createQuery({ data: [], error: null });
    const storageBucket = {
      list: vi.fn(async () => ({ data: [], error: null })),
      remove: vi.fn(async () => ({ data: [], error: null })),
    };
    const client = {
      from: vi.fn(() => referenceQuery),
      storage: {
        from: vi.fn(() => storageBucket),
      },
    };
    authMock.mockResolvedValue(adminIdentity);
    createSupabaseAdminClientMock.mockReturnValue(client);

    await expect(discardTournamentBannerUpload(bannerUrl)).resolves.toEqual({
      deleted: true,
    });
    expect(storageBucket.remove).toHaveBeenCalledWith([bannerPath]);
    expect(storageBucket.list).toHaveBeenCalledWith("banners", {
      limit: 1,
      search: "123e4567-e89b-42d3-a456-426614174000.png",
    });
  });

  it("does not delete a referenced or malformed banner", async () => {
    const referenceQuery = createQuery({
      data: [{ id: "another-tournament" }],
      error: null,
    });
    const storageFrom = vi.fn();
    const client = {
      from: vi.fn(() => referenceQuery),
      storage: { from: storageFrom },
    };
    authMock.mockResolvedValue(adminIdentity);
    createSupabaseAdminClientMock.mockReturnValue(client);

    await expect(discardTournamentBannerUpload(bannerUrl)).resolves.toEqual({
      deleted: false,
    });
    expect(storageFrom).not.toHaveBeenCalled();

    createSupabaseAdminClientMock.mockClear();
    await expect(
      discardTournamentBannerUpload(
        bannerUrl.replace("banners/", "banners/../")
      )
    ).resolves.toEqual({ deleted: false });
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it("replaces only the previous exact unreferenced banner after save", async () => {
    const previousPath =
      "banners/223e4567-e89b-42d3-a456-426614174000.png";
    const previousUrl =
      `http://127.0.0.1:54321/storage/v1/object/public/` +
      `tournament-banners/${previousPath}`;
    const existingQuery = createQuery({
      data: { slug: "privacy-cup", banner_image_url: previousUrl },
      error: null,
    });
    const unreferencedQuery = createQuery({ data: [], error: null });
    const savedQuery = createQuery({
      data: {
        id: "tournament-1",
        title: "Privacy Cup",
        slug: "privacy-cup",
        description: "Description",
        banner_image_url: bannerUrl,
        registration_open_at: null,
        grand_final_at: null,
        status: "upcoming",
        format: "1v1",
        rule_format: "format_a",
        result_confirmation_window_minutes: 30,
        prize_pool: "",
        rules_url: null,
        battlefy_url: null,
        registration_enabled: false,
      },
      error: null,
    });
    let referenceQueries = 0;
    const tournamentTable = {
      select: vi.fn((columns: string) => {
        if (columns === "slug, banner_image_url") return existingQuery;
        if (columns === "id") {
          referenceQueries += 1;
          return unreferencedQuery;
        }
        return savedQuery;
      }),
    };
    const storageBucket = {
      list: vi
        .fn()
        .mockResolvedValueOnce({
          data: [
            {
              name: bannerPath.slice("banners/".length),
              metadata: { mimetype: "image/png", size: 1024 },
            },
          ],
          error: null,
        })
        .mockResolvedValueOnce({ data: [], error: null }),
      remove: vi.fn(async () => ({ data: [], error: null })),
    };
    const client = {
      from: vi.fn(() => tournamentTable),
      rpc: vi.fn(async () => ({ data: "tournament-1", error: null })),
      storage: {
        from: vi.fn(() => storageBucket),
      },
    };
    authMock.mockResolvedValue(adminIdentity);
    createSupabaseAdminClientMock.mockReturnValue(client);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          Uint8Array.from([
            0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
          ]),
          { status: 206 }
        )
      )
    );
    const formData = new FormData();
    formData.set("tournamentId", "tournament-1");
    formData.set("title", "Privacy Cup");
    formData.set("description", "Description");
    formData.set("bannerImageUrl", bannerUrl);
    formData.set("status", "upcoming");
    formData.set("format", "1v1");
    formData.set("ruleFormat", "format_a");
    formData.set("resultConfirmationWindowMinutes", "30");
    formData.set("prizePool", "");
    formData.set("academyEnabled", "on");
    formData.set("academyEloRules", "Below 1100 ELO");
    formData.set("academyMaxPlayers", "8");

    await expect(
      saveTournament({ error: null }, formData)
    ).rejects.toThrow(
      "NEXT_REDIRECT:/admin/tournaments?selected=tournament-1&notice=saved"
    );
    expect(referenceQueries).toBe(2);
    expect(storageBucket.remove).toHaveBeenCalledWith([previousPath]);
    expect(storageBucket.remove).not.toHaveBeenCalledWith([bannerPath]);
  });

  it("removes only a new banner that fails uploaded-object verification", async () => {
    const previousPath =
      "banners/223e4567-e89b-42d3-a456-426614174000.png";
    const previousUrl =
      `http://127.0.0.1:54321/storage/v1/object/public/` +
      `tournament-banners/${previousPath}`;
    const unrelatedPath =
      "banners/323e4567-e89b-42d3-a456-426614174000.png";
    const existingQuery = createQuery({
      data: { slug: "privacy-cup", banner_image_url: previousUrl },
      error: null,
    });
    const unreferencedQuery = createQuery({ data: [], error: null });
    const tournamentTable = {
      select: vi.fn((columns: string) =>
        columns === "slug, banner_image_url"
          ? existingQuery
          : unreferencedQuery
      ),
    };
    const storageBucket = {
      list: vi
        .fn()
        .mockResolvedValueOnce({
          data: [
            {
              name: bannerPath.slice("banners/".length),
              metadata: { mimetype: "image/png", size: 1024 },
            },
          ],
          error: null,
        })
        .mockResolvedValueOnce({ data: [], error: null }),
      remove: vi.fn(async () => ({ data: [], error: null })),
    };
    const client = {
      from: vi.fn(() => tournamentTable),
      rpc: vi.fn(),
      storage: { from: vi.fn(() => storageBucket) },
    };
    authMock.mockResolvedValue(adminIdentity);
    createSupabaseAdminClientMock.mockReturnValue(client);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(Uint8Array.from([0, 1, 2, 3]), { status: 206 })
      )
    );

    await expect(
      saveTournament({ error: null }, createTournamentFormData(bannerUrl))
    ).resolves.toEqual({
      error:
        "The uploaded banner could not be verified. Re-upload a valid JPG, PNG, or WEBP image.",
    });
    expect(client.rpc).not.toHaveBeenCalled();
    expect(storageBucket.remove).toHaveBeenCalledExactlyOnceWith([bannerPath]);
    expect(storageBucket.remove).not.toHaveBeenCalledWith([previousPath]);
    expect(storageBucket.remove).not.toHaveBeenCalledWith([unrelatedPath]);
    expect(storageBucket.list).toHaveBeenLastCalledWith("banners", {
      limit: 1,
      search: bannerPath.slice("banners/".length),
    });
  });

  it("preserves an unchanged or separately referenced banner after failed verification", async () => {
    const currentQuery = createQuery({
      data: { slug: "privacy-cup", banner_image_url: bannerUrl },
      error: null,
    });
    const unreferencedQuery = createQuery({ data: [], error: null });
    const currentTable = {
      select: vi.fn((columns: string) =>
        columns === "slug, banner_image_url"
          ? currentQuery
          : unreferencedQuery
      ),
    };
    const storageBucket = {
      list: vi.fn(async () => ({
        data: [
          {
            name: bannerPath.slice("banners/".length),
            metadata: { mimetype: "image/png", size: 1024 },
          },
        ],
        error: null,
      })),
      remove: vi.fn(),
    };
    const currentClient = {
      from: vi.fn(() => currentTable),
      rpc: vi.fn(),
      storage: { from: vi.fn(() => storageBucket) },
    };
    authMock.mockResolvedValue(adminIdentity);
    createSupabaseAdminClientMock.mockReturnValue(currentClient);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(Uint8Array.from([0]), { status: 206 }))
    );

    await saveTournament(
      { error: null },
      createTournamentFormData(bannerUrl)
    );
    expect(storageBucket.remove).not.toHaveBeenCalled();

    const previousUrl = bannerUrl.replace(
      "123e4567-e89b-42d3-a456-426614174000",
      "223e4567-e89b-42d3-a456-426614174000"
    );
    const existingQuery = createQuery({
      data: { slug: "privacy-cup", banner_image_url: previousUrl },
      error: null,
    });
    const referencedQuery = createQuery({
      data: [{ id: "another-tournament" }],
      error: null,
    });
    let referenceQueryCount = 0;
    const referencedTable = {
      select: vi.fn((columns: string) => {
        if (columns === "slug, banner_image_url") return existingQuery;
        referenceQueryCount += 1;
        return referenceQueryCount === 1
          ? unreferencedQuery
          : referencedQuery;
      }),
    };
    const referencedStorageBucket = {
      list: vi.fn(async () => ({
        data: [
          {
            name: bannerPath.slice("banners/".length),
            metadata: { mimetype: "image/jpeg", size: 1024 },
          },
        ],
        error: null,
      })),
      remove: vi.fn(),
    };
    createSupabaseAdminClientMock.mockReturnValue({
      from: vi.fn(() => referencedTable),
      rpc: vi.fn(),
      storage: { from: vi.fn(() => referencedStorageBucket) },
    });

    await expect(
      saveTournament({ error: null }, createTournamentFormData(bannerUrl))
    ).resolves.toEqual({
      error:
        "The uploaded banner could not be verified. Re-upload a valid JPG, PNG, or WEBP image.",
    });
    expect(referenceQueryCount).toBe(2);
    expect(referencedStorageBucket.remove).not.toHaveBeenCalled();
  });

  it("keeps failed-verification cleanup provider values out of logs and errors", async () => {
    const previousUrl = bannerUrl.replace(
      "123e4567-e89b-42d3-a456-426614174000",
      "223e4567-e89b-42d3-a456-426614174000"
    );
    const existingQuery = createQuery({
      data: { slug: "privacy-cup", banner_image_url: previousUrl },
      error: null,
    });
    const unreferencedQuery = createQuery({ data: [], error: null });
    const tournamentTable = {
      select: vi.fn((columns: string) =>
        columns === "slug, banner_image_url"
          ? existingQuery
          : unreferencedQuery
      ),
    };
    const privateValues =
      `${bannerPath} user_private signed-token Bearer credential-value`;
    const storageBucket = {
      list: vi.fn(async () => ({
        data: [
          {
            name: bannerPath.slice("banners/".length),
            metadata: { mimetype: "image/jpeg", size: 1024 },
          },
        ],
        error: null,
      })),
      remove: vi.fn(async () => ({
        data: null,
        error: { message: privateValues },
      })),
    };
    const client = {
      from: vi.fn(() => tournamentTable),
      rpc: vi.fn(),
      storage: { from: vi.fn(() => storageBucket) },
    };
    authMock.mockResolvedValue(adminIdentity);
    createSupabaseAdminClientMock.mockReturnValue(client);

    const result = await saveTournament(
      { error: null },
      createTournamentFormData(bannerUrl)
    );
    const visibleOutput = JSON.stringify({
      logs: vi.mocked(console.error).mock.calls,
      result,
    });
    expect(visibleOutput).not.toContain(bannerPath);
    expect(visibleOutput).not.toContain("user_private");
    expect(visibleOutput).not.toContain("signed-token");
    expect(visibleOutput).not.toContain("Bearer");
    expect(visibleOutput).not.toContain("credential-value");
    expect(result.error).toBe(
      "The uploaded banner could not be verified. Re-upload a valid JPG, PNG, or WEBP image."
    );
  });

  it("deletes only the exact banner returned for the intended tournament", async () => {
    const unrelatedPath =
      "banners/323e4567-e89b-42d3-a456-426614174000.png";
    const targetQuery = createQuery({
      data: { banner_image_url: bannerUrl },
      error: null,
    });
    const referenceQuery = createQuery({ data: [], error: null });
    const jobDeleteQuery = createQuery({ data: null, error: null });
    const storageBucket = {
      list: vi.fn(async () => ({ data: [], error: null })),
      remove: vi.fn(async () => ({ data: [], error: null })),
    };
    let tournamentQueryCount = 0;
    const client = {
      from: vi.fn((table: string) => {
        if (table === "tournament_deletion_jobs") return jobDeleteQuery;
        tournamentQueryCount += 1;
        return tournamentQueryCount === 1 ? targetQuery : referenceQuery;
      }),
      rpc: vi.fn(async () => ({
        data: {
          job_id: "cleanup-job-delete",
          proof_paths: [],
          banner_paths: [bannerPath],
        },
        error: null,
      })),
      storage: {
        from: vi.fn(() => storageBucket),
      },
    };
    authMock.mockResolvedValue(adminIdentity);
    createSupabaseAdminClientMock.mockReturnValue(client);
    const formData = new FormData();
    formData.set("tournamentId", "tournament-1");
    formData.set("confirmation", "DELETE");

    await expect(deleteTournament(formData)).rejects.toThrow(
      "NEXT_REDIRECT:/admin/tournaments?notice=deleted"
    );
    expect(client.rpc).toHaveBeenCalledWith("delete_tournament_data", {
      p_tournament_id: "tournament-1",
      p_deleted_by: adminIdentity.userId,
    });
    expect(storageBucket.remove).toHaveBeenCalledExactlyOnceWith([bannerPath]);
    expect(storageBucket.remove).not.toHaveBeenCalledWith([unrelatedPath]);
    expect(jobDeleteQuery.delete).toHaveBeenCalledOnce();
    expect(jobDeleteQuery.eq).toHaveBeenCalledWith(
      "id",
      "cleanup-job-delete"
    );
  });

  it("refuses a malformed retained banner cleanup manifest", async () => {
    const jobQuery = createQuery({
      data: {
        id: "cleanup-job-2",
        proof_paths: [],
        banner_paths: ["banners/not-an-approved-object.png"],
      },
      error: null,
    });
    const updateQuery = createQuery({ data: null, error: null });
    let queryCount = 0;
    const storageFrom = vi.fn();
    const client = {
      from: vi.fn(() => {
        queryCount += 1;
        return queryCount === 1 ? jobQuery : updateQuery;
      }),
      storage: { from: storageFrom },
    };
    authMock.mockResolvedValue(adminIdentity);
    createSupabaseAdminClientMock.mockReturnValue(client);
    const formData = new FormData();
    formData.set("jobId", "cleanup-job-2");

    await expect(retryTournamentStorageCleanup(formData)).rejects.toThrow(
      "NEXT_REDIRECT:/admin/tournaments?notice=cleanup-failed"
    );
    expect(storageFrom).not.toHaveBeenCalled();
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
      "not-an-approved-object"
    );
  });

  it("keeps the stored public banner URL unchanged in public card mapping", () => {
    const row: TournamentRow = {
      id: "tournament-1",
      slug: "privacy-cup",
      title: "Privacy Cup",
      description: "Description",
      banner_image_url: bannerUrl,
      registration_open_at: null,
      registration_close_at: null,
      start_date: null,
      end_date: null,
      status: "upcoming",
      format: "1v1",
      rule_format: "format_a",
      result_confirmation_window_minutes: 30,
      prize_pool: "",
      rules_url: null,
      battlefy_url: null,
      registration_enabled: false,
      grand_final_at: null,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
      tournament_brackets: [],
    };

    expect(mapTournamentRow(row).image).toBe(bannerUrl);
  });
});
