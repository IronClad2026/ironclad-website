// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const useAuthMock = vi.hoisted(() => vi.fn());
const usePathnameMock = vi.hoisted(() => vi.fn());
const loadAnnouncementNavigationStateMock = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs", () => ({
  useAuth: useAuthMock,
  UserButton: () => (
    <button type="button" aria-label="Clerk account control" />
  ),
}));
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

  it("keeps brand, centered navigation, then Language, Account, and Support in separate desktop areas", () => {
    renderItalianAdminNavbar();

    const primaryNavigation = screen.getByRole("navigation", {
      name: "Navigazione principale",
    });
    const brandGroup = requireElement(
      primaryNavigation.querySelector('[data-navbar-area="brand"]'),
      "Desktop brand area was not rendered."
    );
    const primaryGroup = requireElement(
      primaryNavigation.querySelector('[data-navbar-area="primary"]'),
      "Desktop primary navigation area was not rendered."
    );
    const utilityGroup = requireElement(
      primaryNavigation.querySelector<HTMLElement>(
        '[data-navbar-area="utilities"]'
      ),
      "Desktop utility area was not rendered."
    );
    const trigger = screen.getByRole("button", {
      name: LANGUAGE_TRIGGER_NAME,
    });
    const dashboard = requireElement(
      primaryGroup.querySelector('a[href="/dashboard"]'),
      "Desktop Dashboard link was not rendered."
    );
    const admin = requireElement(
      primaryGroup.querySelector('a[href="/admin"]'),
      "Desktop Admin link was not rendered."
    );
    const account = within(utilityGroup).getByRole("button", {
      name: "Clerk account control",
    });
    const support = within(utilityGroup).getByRole("button", {
      name: "Apri l’assistenza",
    });

    expectBefore(brandGroup, primaryGroup);
    expectBefore(primaryGroup, utilityGroup);
    expectBefore(dashboard, admin);
    expectBefore(trigger, account);
    expectBefore(account, support);
    expect(primaryNavigation).toHaveClass(
      "xl:grid",
      "xl:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]"
    );
    expect(brandGroup).toHaveClass("justify-self-start");
    expect(primaryGroup).toHaveClass("justify-center", "xl:flex");
    expect(utilityGroup).toHaveClass(
      "shrink-0",
      "justify-self-end",
      "xl:flex"
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
    const primaryGroup = requireElement(
      primaryNavigation.querySelector('[data-navbar-area="primary"]'),
      "Desktop primary navigation area was not rendered."
    );
    const utilityGroup = requireElement(
      primaryNavigation.querySelector('[data-navbar-area="utilities"]'),
      "Desktop utility area was not rendered."
    );
    const linkGroup = requireElement(
      primaryGroup.firstElementChild,
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
    expect(primaryGroup).toHaveClass(
      "text-[11px]",
      "min-[1480px]:text-xs",
      "min-[1800px]:text-sm"
    );
    expect(linkGroup).toHaveClass(
      "gap-2",
      "min-[1480px]:gap-3",
      "min-[1800px]:gap-7"
    );
    expect(utilityGroup).toHaveClass(
      "gap-2",
      "min-[1800px]:gap-3"
    );
    expect(desktopTrigger.parentElement).toBe(utilityGroup);
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

  it("keeps Announcements first and makes Language, Account, and Support reachable on mobile", () => {
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
    const account = within(mobileMenu).getByRole("button", {
      name: "Clerk account control",
    });
    const support = within(mobileMenu).getByRole("button", {
      name: "Apri l’assistenza",
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
    expectBefore(language, account);
    expectBefore(account, support);
    expect(within(language).getByText("🇮🇹")).toHaveAttribute(
      "aria-hidden",
      "true"
    );
    expect(within(language).getByText("Italiano")).toHaveAttribute(
      "lang",
      "it"
    );
  });

  it("opens the localized Support popover on the approved direct Discord channel", () => {
    renderItalianAdminNavbar();

    const utilities = requireElement(
      document.querySelector<HTMLElement>('[data-navbar-area="utilities"]'),
      "Desktop utility area was not rendered."
    );
    fireEvent.click(
      within(utilities).getByRole("button", { name: "Apri l’assistenza" })
    );

    const dialog = screen.getByRole("dialog", { name: "Assistenza" });
    expect(dialog).toHaveAccessibleDescription(
      "Apri un ticket con noi su Discord per ricevere assistenza."
    );
    expect(
      within(dialog).getByRole("link", {
        name: "Apri l’assistenza Discord",
      })
    ).toHaveAttribute(
      "href",
      "https://discord.com/channels/1440092095619662105/1440201093110960137"
    );
  });

  it("closes only the top Support layer on mobile Escape and returns focus", () => {
    renderItalianAdminNavbar();

    fireEvent.click(
      screen.getByRole("button", { name: "Apri il menu di navigazione" })
    );
    const mobileMenu = screen.getByRole("dialog", {
      name: "Navigazione mobile",
    });
    const supportTrigger = within(mobileMenu).getByRole("button", {
      name: "Apri l’assistenza",
    });

    fireEvent.click(supportTrigger);
    const supportAction = within(mobileMenu).getByRole("link", {
      name: "Apri l’assistenza Discord",
    });
    expect(supportAction).toHaveFocus();

    fireEvent.keyDown(supportAction, { key: "Escape" });

    expect(
      screen.getByRole("dialog", { name: "Navigazione mobile" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: "Assistenza" })
    ).not.toBeInTheDocument();
    expect(supportTrigger).toHaveFocus();
  });

  it("links the signed-out desktop and mobile Account controls to the canonical Clerk sign-in route", () => {
    useAuthMock.mockReturnValue({
      isLoaded: true,
      isSignedIn: false,
      sessionClaims: null,
    });
    renderItalianAdminNavbar();

    const utilities = requireElement(
      document.querySelector('[data-navbar-area="utilities"]'),
      "Desktop utility area was not rendered."
    );
    expect(utilities.querySelector('a[href="/sign-in"]')).not.toBeNull();
    expect(document.querySelector('a[href="/dashboard"]')).toBeNull();
    expect(document.querySelector('a[href="/admin"]')).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: "Apri il menu di navigazione" })
    );

    const mobileMenu = screen.getByRole("dialog", {
      name: "Navigazione mobile",
    });
    expect(mobileMenu.querySelector('a[href="/sign-in"]')).not.toBeNull();
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

    const primaryNavigation = screen.getByRole("navigation", {
      name: "Navigazione principale",
    });
    const desktopShell = requireElement(
      primaryNavigation.querySelector('[data-navbar-area="primary"]'),
      "Desktop primary navigation area was not rendered."
    );
    const desktopUtilities = requireElement(
      primaryNavigation.querySelector('[data-navbar-area="utilities"]'),
      "Desktop utility area was not rendered."
    );
    const menuToggle = screen.getByRole("button", {
      name: "Apri il menu di navigazione",
    });

    expect(desktopShell).toHaveClass("hidden", "xl:flex");
    expect(desktopShell).not.toHaveClass("md:flex");
    expect(desktopUtilities).toHaveClass("hidden", "xl:flex");
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
