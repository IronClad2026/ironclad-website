import { describe, expect, it } from "vitest";
import { createSupabaseQueryMock } from "@/tests/helpers/supabase-query-mock";

describe("Supabase query mock safety", () => {
  it("throws immediately for an unknown query method", () => {
    const { query } = createSupabaseQueryMock();
    const misspelledQuery = query as unknown as {
      udpate: (value: unknown) => unknown;
    };

    expect(() => misspelledQuery.udpate({ read_at: "now" })).toThrow(
      "Unsupported Supabase query mock method: udpate"
    );
  });
});
