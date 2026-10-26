import { describe, expect, it, vi } from "vitest";
import {
  CompetitionReadError,
  readCompetitionRows,
} from "@/lib/competition-read-models/shared";

describe("bounded competition reads", () => {
  it.each([0, -1, 1.5, 1000, NaN, Infinity])(
    "refuses unsafe row bound %s before a query",
    async (bound) => {
      const then = vi.fn();
      await expect(
        readCompetitionRows({ then } as never, bound, String),
      ).rejects.toMatchObject({ code: "INVALID_DATA" });
      expect(then).not.toHaveBeenCalled();
    },
  );

  it("drops unselected secrets through the explicit row parser", async () => {
    const rows = await readCompetitionRows(
      Promise.resolve({
        data: [
          {
            alias: "Commander",
            email: "must-not-leak",
            clerk_user_id: "private",
            proof_path: "private/path",
          },
        ],
        error: null,
      }),
      1,
      (row) => ({ alias: (row as { alias: string }).alias }),
    );
    expect(rows).toEqual([{ alias: "Commander" }]);
  });

  it("fails rather than reporting truncated competition statistics", async () => {
    const parse = vi.fn();
    await expect(
      readCompetitionRows(
        Promise.resolve({ data: [{}, {}], error: null }),
        1,
        parse,
      ),
    ).rejects.toMatchObject({ code: "LIMIT_EXCEEDED" });
    expect(parse).not.toHaveBeenCalled();
  });

  it.each([null, "not-an-array", {}])(
    "rejects invalid row responses",
    async (data) => {
      await expect(
        readCompetitionRows(Promise.resolve({ data, error: null }), 1, String),
      ).rejects.toBeInstanceOf(CompetitionReadError);
    },
  );

  it("redacts database error details", async () => {
    const operation = readCompetitionRows(
      Promise.resolve({
        data: null,
        error: { message: "private-player-identifier" },
      }),
      1,
      String,
    );
    await expect(operation).rejects.toMatchObject({
      code: "QUERY_FAILED",
      message: "Competition data is unavailable.",
    });
  });

  it("redacts rejected network details", async () => {
    await expect(
      readCompetitionRows(
        Promise.reject(new Error("private-provider-token")),
        1,
        String,
      ),
    ).rejects.toMatchObject({
      code: "QUERY_FAILED",
      message: "Competition data is unavailable.",
    });
  });

  it("redacts unexpected parser failures", async () => {
    await expect(
      readCompetitionRows(
        Promise.resolve({ data: [{}], error: null }),
        1,
        () => {
          throw new Error("private-row-content");
        },
      ),
    ).rejects.toMatchObject({
      code: "INVALID_DATA",
      message: "Competition data returned an invalid row.",
    });
  });
});
