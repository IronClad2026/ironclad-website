// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PublicProfileVisibilityCard from "@/components/PublicProfileVisibilityCard";

const updatePublicProfileEnabledMock = vi.hoisted(() => vi.fn());
const routerRefreshMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/dashboard/public-profile-actions", () => ({
  updatePublicProfileEnabled: updatePublicProfileEnabledMock,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: routerRefreshMock,
  }),
}));

describe("PublicProfileVisibilityCard", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    updatePublicProfileEnabledMock.mockReset();
    routerRefreshMock.mockReset();
  });

  it("enables a private profile after a successful action", async () => {
    updatePublicProfileEnabledMock.mockResolvedValue({
      status: "success",
      message: "Your player profile is now public.",
      enabled: true,
    });
    render(<PublicProfileVisibilityCard initialEnabled={false} />);

    const visibilitySwitch = screen.getByRole("switch");
    expect(visibilitySwitch).toHaveAttribute("aria-checked", "false");

    fireEvent.click(visibilitySwitch);

    await waitFor(() => {
      expect(updatePublicProfileEnabledMock).toHaveBeenCalledWith(true);
      expect(visibilitySwitch).toHaveAttribute("aria-checked", "true");
    });
    expect(
      screen.getByText("Your player profile is now public.")
    ).toBeInTheDocument();
    expect(routerRefreshMock).toHaveBeenCalledOnce();
  });

  it("keeps the current state when the action fails", async () => {
    updatePublicProfileEnabledMock.mockResolvedValue({
      status: "error",
      message: "Public profile visibility could not be updated.",
      enabled: true,
    });
    render(<PublicProfileVisibilityCard initialEnabled={false} />);

    const visibilitySwitch = screen.getByRole("switch");
    fireEvent.click(visibilitySwitch);

    await waitFor(() => {
      expect(
        screen.getByText("Public profile visibility could not be updated.")
      ).toBeInTheDocument();
    });
    expect(visibilitySwitch).toHaveAttribute("aria-checked", "false");
    expect(routerRefreshMock).not.toHaveBeenCalled();
  });
});
