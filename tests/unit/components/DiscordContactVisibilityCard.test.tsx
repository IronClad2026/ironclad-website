// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

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

    expect(visibilitySwitch).toBeDisabled();
    expect(visibilitySwitch).toHaveAttribute("aria-checked", "false");
    expect(visibilitySwitch).toHaveTextContent("Add Discord in Profile");
    expect(updateDiscordPublicEnabledMock).not.toHaveBeenCalled();
  });
});
