// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import BadgeSystemPreviewPage from "@/app/dev/badges/page";

const headersMock = vi.hoisted(() =>
  vi.fn(async () => new Headers([["host", "localhost:3000"]]))
);
const notFoundMock = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("not-found");
  })
);
const redirectMock = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  })
);

vi.mock("next/headers", () => ({
  headers: headersMock,
}));

vi.mock("next/navigation", () => ({
  notFound: notFoundMock,
  redirect: redirectMock,
}));

vi.mock("@/components/badges/Phase10PreviewPanel", () => ({
  default: () => (
    <section aria-label="Badge system mock preview">
      Phase 10 preview panel fixture
    </section>
  ),
}));

describe("badge system development preview page", () => {
  afterEach(() => {
    cleanup();
    headersMock.mockReset();
    headersMock.mockResolvedValue(new Headers([["host", "localhost:3000"]]));
    notFoundMock.mockClear();
    redirectMock.mockClear();
    vi.unstubAllEnvs();
  });

  it("renders development-only preview labels and the badge panel", async () => {
    render(await BadgeSystemPreviewPage());

    expect(
      screen.getByRole("heading", { name: "Badge System Preview" })
    ).toBeInTheDocument();
    expect(screen.getByText("Development / Mock Data")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Badge system mock preview")
    ).toHaveTextContent("Phase 10 preview panel fixture");
  });

  it("redirects loopback IP hosts to localhost in development", async () => {
    headersMock.mockResolvedValue(new Headers([["host", "127.0.0.1:3000"]]));

    await expect(BadgeSystemPreviewPage()).rejects.toThrow(
      "redirect:http://localhost:3000/dev/badges"
    );
    expect(redirectMock).toHaveBeenCalledWith(
      "http://localhost:3000/dev/badges"
    );
  });

  it("returns the not-found boundary in production", async () => {
    vi.stubEnv("NODE_ENV", "production");

    await expect(BadgeSystemPreviewPage()).rejects.toThrow("not-found");
    expect(notFoundMock).toHaveBeenCalledOnce();
  });
});
