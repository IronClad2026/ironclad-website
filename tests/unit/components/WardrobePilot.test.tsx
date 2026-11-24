// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import WardrobePilot from "@/components/ready/WardrobePilot";
import type { WardrobeState } from "@/lib/wardrobe/catalogue";

const mocks = vi.hoisted(() => ({
  prepare: vi.fn(),
  commit: vi.fn(),
}));
const initial = { access: "admin", sessionId: "test-session", itemIds: [] } as const;

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, sessionId: "test-session" }),
}));
vi.mock("@/components/ready/renderer", () => ({
  loadMascotRenderer: async () => ({ onStatus }: { onStatus: (status: string) => void }) => {
    onStatus("ready");
    return { setMode: vi.fn(), dispose: vi.fn(), prepareWardrobe: mocks.prepare };
  },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it("applies an Equip click while a passive permission refresh is still pending", async () => {
  const ids = ["face_clown_makeup"];
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

it("aborts obsolete preparation and saves only the latest outfit", async () => {
  mocks.prepare.mockImplementationOnce((_ids, signal: AbortSignal) =>
    new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true })),
  ).mockResolvedValueOnce({ commit: mocks.commit, discard: vi.fn() });
  const request = vi.fn((_url: string, init: RequestInit) => Promise.resolve(Response.json({
    ...initial, ...(init.method === "POST" ? JSON.parse(String(init.body)) : {}),
  })));
  vi.stubGlobal("fetch", request);
  render(<WardrobePilot initial={{ ...initial, itemIds: [] }} />);
  const first = screen.getByRole("button", { name: "Equip Smoked Aviators" });
  await waitFor(() => expect(first).toBeEnabled());
  fireEvent.click(first);
  fireEvent.click(screen.getByRole("button", { name: "Equip Tanker Dust Goggles" }));
  await waitFor(() => expect(mocks.commit).toHaveBeenCalledOnce());
  expect(request.mock.calls.filter(([, init]) => init.method === "POST")).toEqual([
    ["/api/ready/wardrobe", expect.objectContaining({
      body: JSON.stringify({ sessionId: initial.sessionId, itemIds: ["eyewear_tanker_dust_goggles"] }),
    })],
  ]);
});

it("leaves the prior outfit visible and saves nothing if a set resource fails", async () => {
  mocks.prepare.mockRejectedValueOnce(new Error("Missing set component"));
  const request = vi.fn(() => Promise.resolve(Response.json(initial)));
  vi.stubGlobal("fetch", request);
  render(<WardrobePilot initial={{ ...initial, itemIds: [] }} />);
  const equip = screen.getByRole("button", { name: "Equip Dynamite Set" });
  await waitFor(() => expect(equip).toBeEnabled());
  fireEvent.click(equip);
  expect(await screen.findByText("Could not update Ready’s look. Try again.")).toBeVisible();
  expect(screen.getByRole("button", { name: "Equip Dynamite Set" })).toBeEnabled();
  expect(mocks.commit).not.toHaveBeenCalled();
  expect(request).toHaveBeenCalledTimes(1);
});

it("filters the catalogue without remounting the preview and keeps hidden saved items in Equipped", async () => {
  const outfit: WardrobeState = { ...initial, itemIds: ["eyewear_smoked_aviators", "headwear_wwii_full_face_helmet"] };
  const request = vi.fn((_url: string, init: RequestInit) => Promise.resolve(Response.json({
    ...outfit, ...(init.method === "POST" ? JSON.parse(String(init.body)) : {}),
  })));
  vi.stubGlobal("fetch", request);
  mocks.prepare.mockResolvedValue({ commit: mocks.commit, discard: vi.fn() });
  render(<WardrobePilot initial={outfit} />);
  expect(screen.queryByRole("button", { name: "Browse items" })).not.toBeInTheDocument();

  const canvas = await screen.findByRole("img", { name: "Ready 3D preview" });
  await waitFor(() => expect(mocks.commit).toHaveBeenCalledOnce());
  fireEvent.change(screen.getByRole("combobox", { name: "Category" }), { target: { value: "Helmet accessories" } });
  expect(screen.getByRole("button", { name: "Equip Tanker’s Crown" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "Remove Smoked Aviators" })).not.toBeInTheDocument();
  expect(screen.getByRole("img", { name: "Ready 3D preview" })).toBe(canvas);

  fireEvent.click(screen.getByRole("button", { name: "Equipped (2)" }));
  expect(screen.getByRole("button", { name: "Remove Smoked Aviators" })).toBeVisible();
  expect(screen.getByText("Hidden by WWII Full-Face Helmet")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Equip Tanker’s Crown" })).not.toBeInTheDocument();
  expect(screen.getByRole("img", { name: "Ready 3D preview" })).toBe(canvas);
  expect(mocks.prepare).toHaveBeenCalledOnce();
  expect(request).toHaveBeenCalledOnce();

  const remove = screen.getByRole("button", { name: "Remove Smoked Aviators" });
  remove.focus();
  fireEvent.click(remove);
  await waitFor(() => expect(screen.getByRole("button", { name: "Equipped (1)" })).toHaveFocus());
});

it("starts the dashboard preview without item rows and preserves the catalogue across hide and show", async () => {
  const outfit: WardrobeState = { ...initial, itemIds: ["eyewear_smoked_aviators"] };
  const request = vi.fn(() => Promise.resolve(Response.json(outfit)));
  vi.stubGlobal("fetch", request);
  mocks.prepare.mockResolvedValue({ commit: mocks.commit, discard: vi.fn() });
  render(<WardrobePilot initial={outfit} embedded />);

  const canvas = await screen.findByRole("img", { name: "Ready 3D preview" });
  await waitFor(() => expect(mocks.commit).toHaveBeenCalledOnce());
  const browse = screen.getByRole("button", { name: "Browse items" });
  const scrollToggle = vi.fn();
  Object.defineProperty(browse, "scrollIntoView", { value: scrollToggle });
  const panel = document.getElementById(browse.getAttribute("aria-controls") ?? "");
  expect(panel).not.toBeVisible();
  expect(panel).toBeEmptyDOMElement();
  expect(browse).toHaveAttribute("aria-expanded", "false");

  fireEvent.click(browse);
  expect(browse).toHaveAccessibleName("Hide items");
  expect(browse.closest("section")?.nextElementSibling).toBe(panel);
  expect(browse.closest("section")).toContainElement(canvas);
  expect(panel).toBeVisible();
  fireEvent.change(screen.getByRole("combobox", { name: "Category" }), { target: { value: "Helmet accessories" } });
  expect(screen.getByRole("button", { name: "Equip Tanker’s Crown" })).toBeVisible();

  fireEvent.click(browse);
  expect(panel).not.toBeVisible();
  expect(screen.queryByRole("button", { name: "Equip Tanker’s Crown" })).not.toBeInTheDocument();
  await waitFor(() => expect(scrollToggle).toHaveBeenCalledWith({ block: "nearest", inline: "nearest" }));
  fireEvent.click(browse);
  expect(screen.getByRole("combobox", { name: "Category" })).toHaveValue("Helmet accessories");

  fireEvent.click(screen.getByRole("button", { name: "Equipped (1)" }));
  const remove = screen.getByRole("button", { name: "Remove Smoked Aviators" });
  fireEvent.click(browse);
  fireEvent.click(browse);
  expect(screen.getByRole("button", { name: "Equipped (1)" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Remove Smoked Aviators" })).toBe(remove);
  expect(screen.getByRole("img", { name: "Ready 3D preview" })).toBe(canvas);
  expect(mocks.prepare).toHaveBeenCalledOnce();
  expect(request).toHaveBeenCalledOnce();
});
