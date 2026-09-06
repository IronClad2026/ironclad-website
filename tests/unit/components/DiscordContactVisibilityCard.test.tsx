// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const updateDiscordPublicEnabledMock = vi.hoisted(() => vi.fn());
const refreshMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/dashboard/actions", () => ({
  updateDiscordPublicEnabled: updateDiscordPublicEnabledMock,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

import DiscordContactVisibilityCard from "@/components/DiscordContactVisibilityCard";

describe("DiscordContactVisibilityCard", () => {
  beforeEach(() => {
    updateDiscordPublicEnabledMock.mockReset();
    refreshMock.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("keeps visibility disabled when no Discord username is available", () => {
    render(
      <DiscordContactVisibilityCard
        initialEnabled
        hasDiscordUsername={false}
      />
    );

    const visibilitySwitch = screen.getByRole("switch");

    expect(
      document.querySelector('[data-profile-visibility-control="discord"]')
    ).not.toBeNull();
    expect(visibilitySwitch).toHaveClass(
      "min-h-11",
      "focus-visible:ring-2"
    );
    expect(visibilitySwitch).toBeDisabled();
    expect(visibilitySwitch).toHaveAttribute("aria-checked", "false");
    expect(visibilitySwitch).toHaveTextContent("Add Discord in Profile");
    expect(updateDiscordPublicEnabledMock).not.toHaveBeenCalled();
  });

  it("preserves the enabled-state update and feedback flow", async () => {
    updateDiscordPublicEnabledMock.mockResolvedValue({
      status: "success",
      code: "enabled",
      message: "Your Discord contact is now visible.",
      enabled: true,
    });
    render(
      <DiscordContactVisibilityCard
        initialEnabled={false}
        hasDiscordUsername
      />
    );

    const visibilitySwitch = screen.getByRole("switch");
    fireEvent.click(visibilitySwitch);

    await waitFor(() => {
      expect(updateDiscordPublicEnabledMock).toHaveBeenCalledWith(true);
      expect(visibilitySwitch).toHaveAttribute("aria-checked", "true");
    });
    expect(
      screen.getByText("Discord contact is visible on your public profile.")
    ).toBeVisible();
    expect(refreshMock).toHaveBeenCalledOnce();
  });
});
