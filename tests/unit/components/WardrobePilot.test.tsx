// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import WardrobePilot from "@/components/ready/WardrobePilot";

const mocks = vi.hoisted(() => ({
  prepare: vi.fn(),
  commit: vi.fn(),
}));

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, sessionId: "test-session" }),
}));
vi.mock("@/components/ready/renderer", () => ({
  loadMascotRenderer: async () => ({ onStatus }: { onStatus: (status: string) => void }) => {
    onStatus("ready");
    return { setMode: vi.fn(), dispose: vi.fn(), prepareWardrobe: mocks.prepare };
  },
}));

afterEach(() => vi.unstubAllGlobals());

it("applies an Equip click while a passive permission refresh is still pending", async () => {
  const ids = ["face_clown_makeup"];
  const initial = { access: "admin", sessionId: "test-session", itemIds: [] } as const;
  let refreshSignal: AbortSignal | null | undefined;
  const request = vi.fn((_url: string, init: RequestInit) => {
    if (init.method === "POST") return Promise.resolve(Response.json({ ...initial, itemIds: ids }));
    refreshSignal = init.signal;
    return new Promise<Response>((_, reject) => {
      init.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
    });
  });
  vi.stubGlobal("fetch", request);
  mocks.prepare.mockResolvedValue({ commit: mocks.commit, discard: vi.fn() });

  render(<WardrobePilot initial={{ ...initial, itemIds: [] }} />);
  const button = screen.getByRole("button", { name: "Equip Clown Makeup" });
  await waitFor(() => {
    expect(button).toBeEnabled();
    expect(refreshSignal?.aborted).toBe(false);
  });
  fireEvent.click(button);

  expect(refreshSignal?.aborted).toBe(true);
  expect(await screen.findByRole("button", { name: "Remove Clown Makeup" })).toBeEnabled();
  expect(mocks.prepare).toHaveBeenCalledWith(ids, expect.any(AbortSignal));
  expect(request).toHaveBeenCalledWith("/api/ready/wardrobe", expect.objectContaining({
    method: "POST",
    body: JSON.stringify({ sessionId: "test-session", itemIds: ids }),
  }));
  expect(mocks.commit).toHaveBeenCalledOnce();
});
