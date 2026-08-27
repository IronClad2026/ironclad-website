// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const userButtonMock = vi.hoisted(() => vi.fn(() => null));

vi.mock("@clerk/nextjs", () => ({
  UserButton: userButtonMock,
}));

import IronCladUserButton from "@/components/IronCladUserButton";

describe("IronCladUserButton", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("sizes the real Clerk trigger and avatar to a 44px touch target", () => {
    render(<IronCladUserButton />);

    expect(userButtonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        appearance: {
          elements: {
            avatarBox: "h-11 w-11",
            userButtonTrigger: expect.stringContaining("h-11 w-11"),
          },
        },
      }),
      undefined
    );
  });
});
