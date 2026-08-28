// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const navigationMock = vi.hoisted(() => ({ pathname: "/admin" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigationMock.pathname,
}));

import AdminLayout from "@/app/admin/layout";
import AdminSidebar from "@/components/admin/AdminSidebar";

const expectedLinks = [
  ["Command Center", "/admin"],
  ["Operations", "/admin/operations"],
  ["Registrations", "/admin/registrations"],
  ["Tournaments", "/admin/tournaments"],
  ["Announcements", "/admin/announcements"],
  ["Polls & Decisions", "/admin/polls"],
  ["Global Map Catalogue", "/admin/maps"],
  ["System & Recovery", "/admin/system"],
] as const;

describe("Admin desktop sidebar", () => {
  afterEach(() => {
    cleanup();
    navigationMock.pathname = "/admin";
    window.history.replaceState(null, "", "/admin");
  });

  it("renders the approved grouped Admin destinations in a semantic nav", () => {
    render(<AdminSidebar />);

    expect(
      screen.getByRole("navigation", { name: "Admin navigation" })
    ).toBeInTheDocument();

    for (const group of [
      "Overview",
      "Competition",
      "Communication",
      "Content",
      "Advanced",
    ]) {
      expect(screen.getByText(group, { exact: true })).toBeInTheDocument();
    }

    for (const [label, href] of expectedLinks) {
      expect(screen.getByRole("link", { name: label })).toHaveAttribute(
        "href",
        href
      );
    }
  });

  it("marks exact and nested destinations as the current page", () => {
    navigationMock.pathname = "/admin/tournaments/tournament-123";
    render(<AdminSidebar />);

    expect(screen.getByRole("link", { name: "Tournaments" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(
      screen.getByRole("link", { name: "Command Center" })
    ).not.toHaveAttribute("aria-current");
    expect(
      screen.getByRole("link", { name: "Registrations" })
    ).not.toHaveAttribute("aria-current");
  });

  it.each(["/admin/registrations", "/admin/registrations/registration-123"])(
    "marks the Registrations workspace current for %s",
    (pathname) => {
      navigationMock.pathname = pathname;
      render(<AdminSidebar />);

      expect(
        screen.getByRole("link", { name: "Registrations" })
      ).toHaveAttribute("aria-current", "page");
      expect(
        screen.getByRole("link", { name: "Command Center" })
      ).not.toHaveAttribute("aria-current");
    }
  );

  it("keeps the shell desktop-only, bounded, scrollable, and focus-visible", () => {
    const { container } = render(
      <AdminLayout>
        <main>Admin content</main>
      </AdminLayout>
    );

    const aside = container.querySelector("aside");
    expect(aside).toHaveClass(
      "hidden",
      "xl:block",
      "sticky",
      "top-24",
      "h-[calc(100dvh-6rem)]",
      "overflow-y-auto"
    );

    const shell = screen.getByText("Admin content").parentElement?.parentElement;
    expect(shell).toHaveClass(
      "xl:grid",
      "xl:max-w-[1680px]",
      "xl:grid-cols-[15rem_minmax(0,1fr)]"
    );
    expect(screen.getByText("Admin content").parentElement).toHaveClass(
      "min-w-0"
    );

    for (const [label] of expectedLinks) {
      expect(screen.getByRole("link", { name: label })).toHaveClass(
        "min-h-11",
        "focus-visible:ring-2",
        "focus-visible:ring-orange-400"
      );
    }
  });
});
