// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const useAuthMock = vi.hoisted(() => vi.fn());
const usePathnameMock = vi.hoisted(() => vi.fn());
const loadAnnouncementNavigationStateMock = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs", () => ({ useAuth: useAuthMock }));
vi.mock("next/navigation", () => ({ usePathname: usePathnameMock }));
vi.mock("@/app/announcements/actions", () => ({
  loadAnnouncementNavigationState: loadAnnouncementNavigationStateMock,
}));
vi.mock("@/app/locale-actions", () => ({
  setLocalePreference: vi.fn(),
  syncLocalePreferenceAfterAuth: vi.fn(),
}));
vi.mock("@/components/InstallAppPrompt", () => ({ default: () => null }));
vi.mock("@/components/i18n/LocalePreferenceSync", () => ({
  default: () => null,
}));

import Navbar from "@/components/Navbar";
import LocaleProvider from "@/components/i18n/LocaleProvider";
import italianCommon from "@/lib/i18n/dictionaries/it/common";

const LANGUAGE_TRIGGER_NAME =
  "Scegli la lingua. Lingua attuale: Italiano";

function renderItalianAdminNavbar() {
  return render(
    <LocaleProvider locale="it" dictionaries={{ common: italianCommon }}>
      <Navbar />
    </LocaleProvider>
  );
}

function requireElement<T extends Element>(
  value: T | null,
  message: string
): T {
  if (!value) {
    throw new Error(message);
  }

  return value;
}

function expectBefore(first: Element, second: Element) {
  expect(
    first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING
  ).toBeTruthy();
}

describe("Navbar language and responsive ordering", () => {
  beforeEach(() => {
    usePathnameMock.mockReturnValue("/dashboard");
    useAuthMock.mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      sessionClaims: { metadata: { role: "admin" } },
    });
    loadAnnouncementNavigationStateMock.mockResolvedValue({
      ok: true,
      viewer: "authenticated",
      latest: null,
      unread: false,
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    document.body.style.overflow = "";
  });

  it("renders the shared Italian indicator and native label in the desktop trigger", () => {
    renderItalianAdminNavbar();

    const trigger = screen.getByRole("button", {
      name: LANGUAGE_TRIGGER_NAME,
    });

    expect(within(trigger).getByText("🇮🇹")).toHaveAttribute(
      "aria-hidden",
      "true"
    );
    expect(within(trigger).getByText("Italiano")).toHaveAttribute("lang", "it");
  });

  it("keeps Dashboard then Admin before the final separated desktop language utility", () => {
    renderItalianAdminNavbar();

    const trigger = screen.getByRole("button", {
      name: LANGUAGE_TRIGGER_NAME,
    });
    const utilityGroup = requireElement(
      trigger.parentElement,
      "Desktop language utility group was not rendered."
    );
    const desktopShell = requireElement(
      utilityGroup.parentElement,
      "Desktop navigation shell was not rendered."
    );
    const linkGroup = requireElement(
      utilityGroup.previousElementSibling,
      "Desktop navigation link group was not rendered."
    );
    const dashboard = requireElement(
      desktopShell.querySelector('a[href="/dashboard"]'),
      "Desktop Dashboard link was not rendered."
    );
    const admin = requireElement(
      desktopShell.querySelector('a[href="/admin"]'),
      "Desktop Admin link was not rendered."
    );

    expectBefore(dashboard, admin);
    expectBefore(admin, trigger);
    expect(desktopShell.lastElementChild).toBe(utilityGroup);
    expect(desktopShell).toHaveClass("min-w-0", "flex-1", "xl:flex");
    expect(linkGroup).toHaveClass("ml-auto", "flex", "items-center");
    expect(utilityGroup).toHaveClass(
      "ml-3",
      "shrink-0",
      "border-l",
      "border-white/10",
      "pl-3",
      "min-[1800px]:ml-7",
      "min-[1800px]:pl-7"
    );
  });

  it("keeps the 1280–1536 desktop tier compact and restores spacious geometry at 1800px", () => {
    renderItalianAdminNavbar();

    const primaryNavigation = screen.getByRole("navigation", {
      name: "Navigazione principale",
    });
    const logo = screen.getByRole("img", { name: "IronClad" });
    const brandGroup = requireElement(
      logo.closest("div"),
      "Brand and announcement group was not rendered."
    );
    const announcementGroup = requireElement(
      brandGroup.querySelector('a[href="/announcements"]')?.parentElement ??
        null,
      "Desktop Announcements group was not rendered."
    );
    const desktopTrigger = screen.getByRole("button", {
      name: LANGUAGE_TRIGGER_NAME,
    });
    const utilityGroup = requireElement(
      desktopTrigger.parentElement,
      "Desktop language utility group was not rendered."
    );
    const desktopShell = requireElement(
      utilityGroup.parentElement,
      "Desktop navigation shell was not rendered."
    );
    const linkGroup = requireElement(
      utilityGroup.previousElementSibling,
      "Desktop navigation link group was not rendered."
    );

    expect(primaryNavigation).toHaveClass(
      "max-w-7xl",
      "min-[1800px]:max-w-[1600px]"
    );
    expect(brandGroup).toHaveClass(
      "text-xs",
      "font-medium",
      "text-zinc-300",
      "min-[1800px]:text-sm"
    );
    expect(logo).toHaveClass("xl:h-14", "min-[1800px]:h-16");
    expect(announcementGroup).toHaveClass(
      "ml-3",
      "pl-3",
      "min-[1800px]:ml-7",
      "min-[1800px]:pl-7"
    );
    expect(desktopShell).toHaveClass(
      "pl-4",
      "text-xs",
      "min-[1800px]:pl-8",
      "min-[1800px]:text-sm"
    );
    expect(linkGroup).toHaveClass("gap-3", "min-[1800px]:gap-7");
    expect(utilityGroup).toHaveClass(
      "ml-3",
      "pl-3",
      "min-[1800px]:ml-7",
      "min-[1800px]:pl-7"
    );
  });

  it("isolates Italian Announcements beside the logo before the ordinary desktop cluster", () => {
    renderItalianAdminNavbar();

    const logo = screen.getByRole("img", { name: "IronClad" });
    const brandGroup = requireElement(
      logo.closest("div"),
      "Brand and announcement group was not rendered."
    );
    const announcements = requireElement(
      brandGroup.querySelector('a[href="/announcements"]'),
      "Desktop Announcements link was not rendered beside the logo."
    );
    const home = requireElement(
      document.querySelector('a[href="/"]:not(:has(img))'),
      "Ordinary Home navigation link was not rendered."
    );

    expect(announcements).toHaveTextContent("Annunci");
    expect(announcements.parentElement).toHaveClass("border-l", "shrink-0");
    expectBefore(announcements, home);
  });

  it("keeps Dashboard then Admin then the Italian language selector on mobile", () => {
    renderItalianAdminNavbar();

    fireEvent.click(
      screen.getByRole("button", { name: "Apri il menu di navigazione" })
    );

    const mobileMenu = screen.getByRole("dialog", {
      name: "Navigazione mobile",
    });
    const dashboard = requireElement(
      mobileMenu.querySelector('a[href="/dashboard"]'),
      "Mobile Dashboard link was not rendered."
    );
    const admin = requireElement(
      mobileMenu.querySelector('a[href="/admin"]'),
      "Mobile Admin link was not rendered."
    );
    const language = within(mobileMenu).getByRole("button", {
      name: LANGUAGE_TRIGGER_NAME,
    });
    const announcements = requireElement(
      mobileMenu.querySelector('a[href="/announcements"]'),
      "Mobile Announcements link was not rendered."
    );
    const home = requireElement(
      mobileMenu.querySelector('a[href="/"]'),
      "Mobile Home link was not rendered."
    );

    expectBefore(announcements, home);
    expectBefore(dashboard, admin);
    expectBefore(admin, language);
    expect(within(language).getByText("🇮🇹")).toHaveAttribute(
      "aria-hidden",
      "true"
    );
    expect(within(language).getByText("Italiano")).toHaveAttribute(
      "lang",
      "it"
    );
  });

  it("uses the label itself as a slow accessible unread cue", async () => {
    loadAnnouncementNavigationStateMock.mockResolvedValue({
      ok: true,
      viewer: "authenticated",
      latest: {
        id: "123e4567-e89b-42d3-a456-426614174000",
        publishedAt: "2026-08-26T00:00:00.000Z",
      },
      unread: true,
    });
    renderItalianAdminNavbar();

    await waitFor(() => {
      expect(
        screen.getByRole("link", {
          name: "Annunci — nuovo annuncio ufficiale",
        })
      ).toBeInTheDocument();
    });
    const unreadLabel = screen.getByText("Annunci");
    expect(unreadLabel.className).toMatch(/unread/);
    expect(unreadLabel.querySelector('[aria-hidden="true"]')).toBeTruthy();
  });

  it("uses the coupled xl visibility boundary for desktop and mobile surfaces", () => {
    renderItalianAdminNavbar();

    const desktopTrigger = screen.getByRole("button", {
      name: LANGUAGE_TRIGGER_NAME,
    });
    const desktopShell = requireElement(
      desktopTrigger.parentElement?.parentElement ?? null,
      "Desktop navigation shell was not rendered."
    );
    const menuToggle = screen.getByRole("button", {
      name: "Apri il menu di navigazione",
    });

    expect(desktopShell).toHaveClass("hidden", "xl:flex");
    expect(desktopShell).not.toHaveClass("md:flex");
    expect(menuToggle).toHaveClass("xl:hidden");
    expect(menuToggle).not.toHaveClass("md:hidden");

    fireEvent.click(menuToggle);

    const mobileMenu = screen.getByRole("dialog", {
      name: "Navigazione mobile",
    });
    const backdrop = screen
      .getAllByRole("button", { name: "Chiudi il menu di navigazione" })
      .find((button) => button.classList.contains("fixed"));

    expect(mobileMenu).toHaveClass("xl:hidden");
    expect(mobileMenu).not.toHaveClass("md:hidden");
    expect(backdrop).toHaveClass("xl:hidden");
    expect(backdrop).not.toHaveClass("md:hidden");
  });
});
