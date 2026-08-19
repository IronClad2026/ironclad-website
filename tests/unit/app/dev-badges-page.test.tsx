// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import BadgeSystemPreviewPage from "@/app/dev/badges/page";

const notFoundMock = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("not-found");
  })
);

vi.mock("next/navigation", () => ({
  notFound: notFoundMock,
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
    notFoundMock.mockClear();
    vi.unstubAllEnvs();
  });

  it("renders development-only preview labels and the badge panel", () => {
    render(<BadgeSystemPreviewPage />);

    expect(
      screen.getByRole("heading", { name: "Badge System Preview" })
    ).toBeInTheDocument();
    expect(screen.getByText("Development / Mock Data")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Badge system mock preview")
    ).toHaveTextContent("Phase 10 preview panel fixture");
  });

  it("returns the not-found boundary in production", () => {
    vi.stubEnv("NODE_ENV", "production");

    expect(() => BadgeSystemPreviewPage()).toThrow("not-found");
    expect(notFoundMock).toHaveBeenCalledOnce();
  });
});
