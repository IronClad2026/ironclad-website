// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const navigationState = vi.hoisted(() => ({ pathname: "/" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigationState.pathname,
}));

import SiteMusicPlayer from "@/components/SiteMusicPlayer";

describe("SiteMusicPlayer route boundary", () => {
  afterEach(() => {
    cleanup();
    navigationState.pathname = "/";
  });

  it.each(["/admin", "/admin/operations", "/admin/tournaments"])(
    "does not render the floating music control on %s",
    (pathname) => {
      navigationState.pathname = pathname;

      render(<SiteMusicPlayer />);

      expect(
        screen.queryByRole("complementary", {
          name: "IronClad theme music player",
        })
      ).not.toBeInTheDocument();
    }
  );

  it.each(["/tournaments", "/dashboard"])(
    "retains the existing music control on %s",
    (pathname) => {
      navigationState.pathname = pathname;

      render(<SiteMusicPlayer />);

      expect(
        screen.getByRole("complementary", {
          name: "IronClad theme music player",
        })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Play IronClad theme" })
      ).toBeInTheDocument();
    }
  );
});
