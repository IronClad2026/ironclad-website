// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const useAuthMock = vi.hoisted(() => vi.fn());
const usePathnameMock = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs", () => ({ useAuth: useAuthMock }));
vi.mock("next/navigation", () => ({ usePathname: usePathnameMock }));
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
      isSignedIn: true,
      sessionClaims: { metadata: { role: "admin" } },
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
      "ml-5",
      "shrink-0",
      "border-l",
      "border-white/10",
      "pl-5",
      "2xl:ml-7",
      "2xl:pl-7"
    );
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
