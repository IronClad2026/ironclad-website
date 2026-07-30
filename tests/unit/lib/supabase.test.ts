import { afterEach, describe, expect, it, vi } from "vitest";
import { createNoStoreSupabaseClient } from "@/lib/supabase";

describe("createNoStoreSupabaseClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("forces publishable Supabase reads to bypass the fetch cache", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("[]", {
        status: 200,
        headers: {
          "Content-Range": "*/0",
          "Content-Type": "application/json",
        },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = createNoStoreSupabaseClient();
    await client.from("public_player_profiles").select("id");

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      cache: "no-store",
    });
  });
});
