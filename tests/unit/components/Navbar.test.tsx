// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const useAuthMock = vi.hoisted(() => vi.fn());
const usePathnameMock = vi.hoisted(() => vi.fn());
const loadAnnouncementNavigationStateMock = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs", () => ({
  useAuth: useAuthMock,
  UserButton: () => <button type="button" aria-label="Clerk account control" />,
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
vi.mock("@/components/i18n/LocalePreferenceSync", () => ({ default: () => null }));

import Navbar from "@/components/Navbar";
import LocaleProvider from "@/components/i18n/LocaleProvider";
import italianCommon from "@/lib/i18n/dictionaries/it/common";
import frenchCommon from "@/lib/i18n/dictionaries/fr/common";

const LANGUAGE_TRIGGER_NAME = "Scegli la lingua. Lingua attuale: Italiano";

function renderItalianNavbar() {
  return render(
    <LocaleProvider locale="it" dictionaries={{ common: italianCommon }}>
      <Navbar />
    </LocaleProvider>
  );
}

function getArea(name: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(`[data-navbar-area="${name}"]`);
  if (!element) throw new Error(`Missing navbar area: ${name}`);
  return element;
}

function hrefs(element: HTMLElement) {
  return Array.from(element.querySelectorAll("a")).map((link) => link.getAttribute("href"));
}

function openItalianMobileMenu() {
  fireEvent.click(screen.getByRole("button", { name: "Apri il menu di navigazione" }));
  return screen.getByRole("dialog", { name: "Navigazione mobile" });
}

function expectBefore(first: Element, second: Element) {
  expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
}

describe("Navbar grouped navigation", () => {
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

  it("puts Announcements and News beside the logo and only core destinations in the middle", () => {
    renderItalianNavbar();
    const updates = getArea("updates");
    const primary = getArea("primary");
    const utilities = getArea("utilities");
    expect(hrefs(updates)).toEqual(["/announcements", "/news"]);
    expect(hrefs(primary)).toEqual(["/tournaments", "/players", "/rankings", "/rules"]);
    expect(within(primary).getByRole("button", { name: italianCommon.nav.more })).toBeInTheDocument();
    expectBefore(updates, primary);
    expectBefore(primary, utilities);
    expect(document.querySelectorAll('a[href="/"]')).toHaveLength(1);
    expect(document.querySelector('a[href="/"] img')).toHaveAttribute("alt", "IronClad");
    expect(screen.queryByRole("link", { name: italianCommon.nav.home })).not.toBeInTheDocument();
  });

  it("retains account links and Language, Account, Support ordering", () => {
    renderItalianNavbar();
    const utilities = getArea("utilities");
    const dashboard = within(utilities).getByRole("link", { name: italianCommon.nav.dashboard });
    const admin = within(utilities).getByRole("link", { name: italianCommon.nav.admin });
    const language = within(utilities).getByRole("button", { name: LANGUAGE_TRIGGER_NAME });
    const account = within(utilities).getByRole("button", { name: "Clerk account control" });
    const support = within(utilities).getByRole("button", { name: "Apri l’assistenza" });
    expectBefore(dashboard, admin);
    expectBefore(admin, language);
    expectBefore(language, account);
    expectBefore(account, support);
    expect(within(language).getByText("🇮🇹")).toHaveAttribute("aria-hidden", "true");
    expect(within(language).getByText("Italiano")).toHaveAttribute("lang", "it");
  });

  it("retains the player Dashboard without exposing Admin to a normal signed-in player", () => {
    useAuthMock.mockReturnValue({ isLoaded: true, isSignedIn: true, sessionClaims: {} });
    renderItalianNavbar();
    expect(hrefs(getArea("account-links"))).toEqual(["/dashboard"]);
    expect(document.querySelector('a[href="/admin"]')).toBeNull();
  });

  it("retains canonical sign-in controls for signed-out visitors", () => {
    useAuthMock.mockReturnValue({ isLoaded: true, isSignedIn: false, sessionClaims: null });
    renderItalianNavbar();
    expect(getArea("utilities").querySelector('a[href="/sign-in"]')).not.toBeNull();
    expect(document.querySelector('a[href="/dashboard"]')).toBeNull();
    expect(document.querySelector('a[href="/admin"]')).toBeNull();
    expect(openItalianMobileMenu().querySelector('a[href="/sign-in"]')).not.toBeNull();
  });

  it("uses readable desktop links and one responsive boundary for all surfaces", () => {
    renderItalianNavbar();
    expect(getArea("primary")).toHaveClass("text-sm", "hidden", "min-[1440px]:flex");
    expect(getArea("primary")).not.toHaveClass("text-[11px]");
    expect(getArea("updates")).toHaveClass("hidden", "min-[1440px]:flex");
    expect(getArea("utilities")).toHaveClass("hidden", "min-[1440px]:flex");
    expect(screen.getByRole("button", { name: "Apri il menu di navigazione" })).toHaveClass("min-[1440px]:hidden");
    expect(openItalianMobileMenu()).toHaveClass("min-[1440px]:hidden");
    const backdrop = screen.getAllByRole("button", { name: "Chiudi il menu di navigazione" })
      .find((button) => button.classList.contains("fixed"));
    expect(backdrop).toHaveClass("min-[1440px]:hidden");
  });

  it("reserves extra room for long localized desktop labels", () => {
    render(<LocaleProvider locale="fr" dictionaries={{ common: frenchCommon }}><Navbar /></LocaleProvider>);
    expect(getArea("primary")).toHaveClass("text-sm", "min-[1600px]:flex");
    expect(getArea("updates")).toHaveClass("min-[1600px]:flex");
    expect(getArea("utilities")).toHaveClass("min-[1600px]:flex");
    expect(screen.getByRole("button", { name: frenchCommon.nav.openMenu })).toHaveClass("min-[1600px]:hidden");
  });

  it("uses the English navigation boundary on admin routes", () => {
    usePathnameMock.mockReturnValue("/admin/announcements");
    render(<LocaleProvider locale="fr" dictionaries={{ common: frenchCommon }}><Navbar /></LocaleProvider>);
    expect(getArea("primary")).toHaveClass("min-[1440px]:flex");
    expect(within(getArea("updates")).getByRole("link", { name: "News" })).toHaveAttribute("href", "/news");
    expect(document.querySelector("header")).toHaveAttribute("lang", "en");
  });

  it("groups mobile destinations into Updates, Compete, Information and Account", () => {
    renderItalianNavbar();
    const menu = openItalianMobileMenu();
    const updates = within(menu).getByRole("region", { name: italianCommon.nav.updates });
    const compete = within(menu).getByRole("region", { name: italianCommon.nav.compete });
    const information = within(menu).getByRole("region", { name: italianCommon.nav.information });
    const account = within(menu).getByRole("region", { name: italianCommon.nav.account });
    expect(hrefs(updates)).toEqual(["/announcements", "/news"]);
    expect(hrefs(compete)).toEqual(["/tournaments", "/players", "/rankings", "/rules"]);
    expect(hrefs(information)).toEqual(["/about"]);
    expect(hrefs(account)).toEqual(["/dashboard", "/admin"]);
    expectBefore(updates, compete);
    expectBefore(compete, information);
    expectBefore(information, account);
    expect(menu.querySelector('a[href="/"]')).toBeNull();
    expect(menu.querySelector('a[href="/announcements"]')).toHaveFocus();
  });

  it("closes mobile navigation on Escape and restores focus and page scrolling", () => {
    renderItalianNavbar();
    const menu = openItalianMobileMenu();
    fireEvent.keyDown(menu.querySelector('a[href="/announcements"]')!, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Navigazione mobile" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apri il menu di navigazione" })).toHaveFocus();
    expect(document.body.style.overflow).toBe("");
  });

  it("keeps keyboard focus inside the open mobile dialog", () => {
    renderItalianNavbar();
    const menu = openItalianMobileMenu();
    const first = menu.querySelector<HTMLAnchorElement>('a[href="/announcements"]')!;
    const last = within(menu).getByRole("button", { name: "Apri l’assistenza" });
    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();
    fireEvent.keyDown(last, { key: "Tab" });
    expect(first).toHaveFocus();
  });

  it("closes the mobile dialog after selecting News", () => {
    renderItalianNavbar();
    fireEvent.click(within(openItalianMobileMenu()).getByRole("link", { name: italianCommon.nav.news }));
    expect(screen.queryByRole("dialog", { name: "Navigazione mobile" })).not.toBeInTheDocument();
  });

  it("preserves localized Support and its approved direct Discord link", () => {
    renderItalianNavbar();
    fireEvent.click(within(getArea("utilities")).getByRole("button", { name: "Apri l’assistenza" }));
    const dialog = screen.getByRole("dialog", { name: "Assistenza" });
    expect(dialog).toHaveAccessibleDescription("Apri un ticket con noi su Discord per ricevere assistenza.");
    expect(within(dialog).getByRole("link", { name: "Apri l’assistenza Discord" })).toHaveAttribute(
      "href", "https://discord.com/channels/1440092095619662105/1440201093110960137"
    );
  });

  it("closes only the top Support layer on mobile Escape and returns focus", () => {
    renderItalianNavbar();
    const menu = openItalianMobileMenu();
    const trigger = within(menu).getByRole("button", { name: "Apri l’assistenza" });
    fireEvent.click(trigger);
    const action = within(menu).getByRole("link", { name: "Apri l’assistenza Discord" });
    expect(action).toHaveFocus();
    fireEvent.keyDown(action, { key: "Escape" });
    expect(menu).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Assistenza" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("preserves unread Announcements on both surfaces without applying it to News", async () => {
    usePathnameMock.mockReturnValue("/news");
    loadAnnouncementNavigationStateMock.mockResolvedValue({
      ok: true,
      viewer: "authenticated",
      latest: { id: "123e4567-e89b-42d3-a456-426614174000", publishedAt: "2026-08-26T00:00:00.000Z" },
      unread: true,
    });
    renderItalianNavbar();
    await waitFor(() => expect(screen.getByRole("link", { name: "Annunci — nuovo annuncio ufficiale" })).toBeInTheDocument());
    const updates = getArea("updates");
    const desktopNews = within(updates).getByRole("link", { name: italianCommon.nav.news });
    expect(within(updates).getByText("Annunci").className).toMatch(/unread/);
    expect(desktopNews).toHaveAttribute("aria-current", "page");
    expect(desktopNews.className).not.toMatch(/unread|shadow|glow/);
    expect(desktopNews.querySelector('[aria-hidden="true"]')).toBeNull();
    const menu = openItalianMobileMenu();
    expect(within(menu).getByRole("link", { name: "Annunci — nuovo annuncio ufficiale" }).querySelector('[aria-hidden="true"]')).not.toBeNull();
    expect(within(menu).getByRole("link", { name: italianCommon.nav.news }).className).not.toMatch(/unread|shadow|glow/);
  });

  it("leaves read Announcements without an unread label or dot", async () => {
    renderItalianNavbar();
    await waitFor(() => expect(loadAnnouncementNavigationStateMock).toHaveBeenCalled());
    const announcement = within(getArea("updates")).getByRole("link", { name: "Annunci" });
    expect(within(announcement).getByText("Annunci").className).not.toMatch(/unread/);
    expect(announcement.querySelector('[aria-hidden="true"]')).toBeNull();
  });
});
