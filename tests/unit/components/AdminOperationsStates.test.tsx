// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const refreshMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

import AdminOperationsError from "@/app/admin/operations/error";
import AdminOperationsLoading from "@/app/admin/operations/loading";
import OperationsRefreshButton from "@/components/admin/operations/OperationsRefreshButton";

describe("Admin Operations route states", () => {
  beforeEach(() => {
    refreshMock.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("announces a responsive loading state without inventing metric values", () => {
    const { container } = render(<AdminOperationsLoading />);
    const main = screen.getByRole("main");

    expect(main).toHaveAttribute("aria-busy", "true");
    expect(main).toHaveAttribute("aria-live", "polite");
    expect(main).toHaveClass("min-w-0", "px-4", "sm:px-6", "lg:px-8");
    expect(
      screen.getByText("Loading Admin Operations & Analytics…")
    ).toBeInTheDocument();
    expect(container.querySelector("[class~='sm:grid-cols-2']"))
      .toBeInTheDocument();
    expect(container.textContent).not.toMatch(/\b0\b/);
  });

  it("keeps provider details private while retaining retry and Admin access", () => {
    const reset = vi.fn();
    const providerDetail =
      "relation registrations failed with private provider detail";
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    render(<AdminOperationsError error={new Error(providerDetail)} reset={reset} />);

    expect(
      screen.getByRole("heading", {
        name: "The operational dashboard could not load.",
      })
    ).toBeInTheDocument();
    expect(screen.queryByText(providerDetail)).not.toBeInTheDocument();
    expect(
      screen.getByText(/Registration and Tournament administration remain available/)
    ).toBeInTheDocument();

    const retry = screen.getByRole("button", { name: "Try again" });
    const adminLink = screen.getByRole("link", { name: "Return to Admin" });
    expect(retry).toHaveClass("min-h-11", "w-full", "sm:w-auto");
    expect(adminLink).toHaveAttribute("href", "/admin");
    expect(adminLink).toHaveClass("min-h-11", "w-full", "sm:w-auto");

    fireEvent.click(retry);
    expect(reset).toHaveBeenCalledOnce();
  });

  it("refreshes on demand and exposes its pending-state contract", async () => {
    render(<OperationsRefreshButton />);

    const refresh = screen.getByRole("button", { name: "Refresh" });
    expect(refresh).toHaveAttribute("type", "button");
    expect(refresh).toHaveClass("min-h-11", "w-full", "sm:w-auto");
    fireEvent.click(refresh);

    await waitFor(() => expect(refreshMock).toHaveBeenCalledOnce());

    const source = readFileSync(
      resolve(
        process.cwd(),
        "components/admin/operations/OperationsRefreshButton.tsx"
      ),
      "utf8"
    );
    expect(source).toContain("disabled={pending}");
    expect(source).toContain('pending ? "Refreshing…" : "Refresh"');
    expect(source).toContain("router.refresh()");
  });
});
