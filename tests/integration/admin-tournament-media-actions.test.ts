import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  adminIdentity,
  anonymousIdentity,
  playerIdentity,
} from "@/tests/fixtures/auth";

const authMock = vi.hoisted(() => vi.fn());
const createSupabaseAdminClientMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("@/lib/supabase-admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock,
}));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

import {
  createTournamentMedia,
  loadAdminTournamentMediaWorkspace,
  removeTournamentMedia,
  setTournamentMediaPublished,
  updateTournamentMedia,
} from "@/app/admin/tournaments/media-actions";

const tournamentId = "11111111-1111-4111-8111-111111111111";
const otherTournamentId = "22222222-2222-4222-8222-222222222222";
const mediaId = "33333333-3333-4333-8333-333333333333";
const matchId = "44444444-4444-4444-8444-444444444444";
const generatedBracketId = "55555555-5555-4555-8555-555555555555";
const tournamentBracketId = "66666666-6666-4666-8666-666666666666";
const matchTwoId = "77777777-7777-4777-8777-777777777777";
const matchTenId = "88888888-8888-4888-8888-888888888888";

const mediaRow = {
  id: mediaId,
  tournament_id: tournamentId,
  title: "Official cast",
  url: "https://video.example/cast",
  media_type: "match_cast",
  description: "Official Match cast.",
  match_id: matchId,
  published: true,
  created_at: "2026-08-31T00:00:00.000Z",
  updated_at: "2026-08-31T00:00:00.000Z",
};

const draft = {
  mediaId: null,
  tournamentId,
  title: "Official cast",
  url: "https://video.example/cast",
  mediaType: "match_cast" as const,
  description: "Official Match cast.",
  matchId,
  published: true,
};

type QueryResponse = { data: unknown; error: unknown };
type QueryCall = {
  table: string;
  operation: string | null;
  payload?: unknown;
  filters: Array<[string, unknown]>;
};

function createClient(
  responses: Record<string, QueryResponse[]>
): { client: { from: (table: string) => unknown }; calls: QueryCall[] } {
  const calls: QueryCall[] = [];
  const client = {
    from(table: string) {
      const response = responses[table]?.shift() ?? {
        data: null,
        error: null,
      };
      const call: QueryCall = { table, operation: null, filters: [] };
      calls.push(call);
      const query = {
        select() {
          call.operation ??= "select";
          return query;
        },
        insert(payload: unknown) {
          call.operation = "insert";
          call.payload = payload;
          return query;
        },
        update(payload: unknown) {
          call.operation = "update";
          call.payload = payload;
          return query;
        },
        delete() {
          call.operation = "delete";
          return query;
        },
        eq(field: string, value: unknown) {
          call.filters.push([field, value]);
          return query;
        },
        in(field: string, value: unknown) {
          call.filters.push([field, value]);
          return query;
        },
        order() {
          return query;
        },
        maybeSingle: async () => response,
        then<TResult1 = QueryResponse, TResult2 = never>(
          onfulfilled?: ((value: QueryResponse) => TResult1 | PromiseLike<TResult1>) | null,
          onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
        ) {
          return Promise.resolve(response).then(onfulfilled, onrejected);
        },
      };
      return query;
    },
  };
  return { client, calls };
}

describe("Admin Tournament media actions", () => {
  beforeEach(() => {
    authMock.mockReset();
    createSupabaseAdminClientMock.mockReset();
    revalidatePathMock.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("rejects a signed-out create before creating a trusted client", async () => {
    authMock.mockResolvedValue(anonymousIdentity);

    await expect(createTournamentMedia(draft)).rejects.toThrow("Unauthorized");
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it("independently denies every mutation to a non-Admin", async () => {
    authMock.mockResolvedValue(playerIdentity);

    await expect(createTournamentMedia(draft)).rejects.toThrow("Unauthorized");
    await expect(
      updateTournamentMedia({ ...draft, mediaId })
    ).rejects.toThrow("Unauthorized");
    await expect(
      setTournamentMediaPublished({ tournamentId, mediaId, published: false })
    ).rejects.toThrow("Unauthorized");
    await expect(
      removeTournamentMedia({ tournamentId, mediaId })
    ).rejects.toThrow("Unauthorized");
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it("creates an explicitly published link only after Tournament and Match scope checks", async () => {
    const { client, calls } = createClient({
      tournaments: [{ data: { id: tournamentId }, error: null }],
      tournament_matches: [
        {
          data: { id: matchId, generated_bracket_id: generatedBracketId },
          error: null,
        },
      ],
      generated_brackets: [
        {
          data: {
            id: generatedBracketId,
            tournament_bracket_id: tournamentBracketId,
          },
          error: null,
        },
      ],
      tournament_brackets: [
        {
          data: { id: tournamentBracketId, tournament_id: tournamentId },
          error: null,
        },
      ],
      tournament_media: [{ data: mediaRow, error: null }],
    });
    authMock.mockResolvedValue(adminIdentity);
    createSupabaseAdminClientMock.mockReturnValue(client);

    await expect(createTournamentMedia(draft)).resolves.toEqual({ ok: true });
    expect(calls.find((call) => call.operation === "insert")?.payload).toEqual({
      tournament_id: tournamentId,
      title: "Official cast",
      url: "https://video.example/cast",
      media_type: "match_cast",
      description: "Official Match cast.",
      match_id: matchId,
      published: true,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith(
      `/admin/tournaments/${tournamentId}`,
      "page"
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/tournaments", "page");
  });

  it("rejects a Match that does not belong to the selected Tournament", async () => {
    const { client, calls } = createClient({
      tournaments: [{ data: { id: tournamentId }, error: null }],
      tournament_matches: [
        {
          data: { id: matchId, generated_bracket_id: generatedBracketId },
          error: null,
        },
      ],
      generated_brackets: [
        {
          data: {
            id: generatedBracketId,
            tournament_bracket_id: tournamentBracketId,
          },
          error: null,
        },
      ],
      tournament_brackets: [
        {
          data: {
            id: tournamentBracketId,
            tournament_id: otherTournamentId,
          },
          error: null,
        },
      ],
    });
    authMock.mockResolvedValue(adminIdentity);
    createSupabaseAdminClientMock.mockReturnValue(client);

    await expect(createTournamentMedia(draft)).resolves.toEqual({
      ok: false,
      message: "Select a Match from this Tournament or leave it unassigned.",
    });
    expect(calls.some((call) => call.operation === "insert")).toBe(false);
  });

  it("scopes update, publication, and removal by both Tournament and media ID", async () => {
    authMock.mockResolvedValue(adminIdentity);

    const updateClient = createClient({
      tournaments: [{ data: { id: tournamentId }, error: null }],
      tournament_media: [
        { data: { id: mediaId, tournament_id: tournamentId }, error: null },
        { data: { ...mediaRow, match_id: null }, error: null },
      ],
    });
    createSupabaseAdminClientMock.mockReturnValueOnce(updateClient.client);
    await expect(
      updateTournamentMedia({ ...draft, mediaId, matchId: null })
    ).resolves.toEqual({ ok: true });
    expect(
      updateClient.calls.find((call) => call.operation === "update")?.filters
    ).toEqual([
      ["id", mediaId],
      ["tournament_id", tournamentId],
    ]);

    const publicationClient = createClient({
      tournaments: [{ data: { id: tournamentId }, error: null }],
      tournament_media: [
        { data: { id: mediaId, tournament_id: tournamentId }, error: null },
        { data: { ...mediaRow, published: false }, error: null },
      ],
    });
    createSupabaseAdminClientMock.mockReturnValueOnce(publicationClient.client);
    await expect(
      setTournamentMediaPublished({ tournamentId, mediaId, published: false })
    ).resolves.toEqual({ ok: true });
    expect(
      publicationClient.calls.find((call) => call.operation === "update")
        ?.filters
    ).toEqual([
      ["id", mediaId],
      ["tournament_id", tournamentId],
    ]);

    const removalClient = createClient({
      tournaments: [{ data: { id: tournamentId }, error: null }],
      tournament_media: [
        { data: { id: mediaId, tournament_id: tournamentId }, error: null },
        { data: { id: mediaId }, error: null },
      ],
    });
    createSupabaseAdminClientMock.mockReturnValueOnce(removalClient.client);
    await expect(
      removeTournamentMedia({ tournamentId, mediaId })
    ).resolves.toEqual({ ok: true });
    expect(
      removalClient.calls.find((call) => call.operation === "delete")?.filters
    ).toEqual([
      ["id", mediaId],
      ["tournament_id", tournamentId],
    ]);
  });

  it("loads only Match options reached through the current Tournament brackets", async () => {
    const { client, calls } = createClient({
      tournament_media: [{ data: [], error: null }],
      tournament_brackets: [
        { data: [{ id: tournamentBracketId, name: "Main" }], error: null },
      ],
      generated_brackets: [
        {
          data: [
            {
              id: generatedBracketId,
              tournament_bracket_id: tournamentBracketId,
            },
          ],
          error: null,
        },
      ],
      tournament_matches: [
        {
          data: [
            {
              id: matchTenId,
              generated_bracket_id: generatedBracketId,
              match_number: 10,
            },
            {
              id: matchId,
              generated_bracket_id: generatedBracketId,
              match_number: 7,
            },
            {
              id: matchTwoId,
              generated_bracket_id: generatedBracketId,
              match_number: 2,
            },
          ],
          error: null,
        },
      ],
    });
    authMock.mockResolvedValue(adminIdentity);
    createSupabaseAdminClientMock.mockReturnValue(client);

    await expect(loadAdminTournamentMediaWorkspace(tournamentId)).resolves.toEqual({
      items: [],
      matchOptions: [
        { id: matchTwoId, label: "Main / Pro Bracket · Match 2" },
        { id: matchId, label: "Main / Pro Bracket · Match 7" },
        { id: matchTenId, label: "Main / Pro Bracket · Match 10" },
      ],
    });
    expect(
      calls.find((call) => call.table === "tournament_brackets")?.filters
    ).toContainEqual(["tournament_id", tournamentId]);
    expect(
      calls.find((call) => call.table === "tournament_matches")?.filters
    ).toContainEqual(["generated_bracket_id", [generatedBracketId]]);
  });
});
