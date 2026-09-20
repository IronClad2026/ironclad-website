"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@clerk/nextjs";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, UserRound, X } from "lucide-react";
import { setLocalePreference } from "@/app/locale-actions";
import announcementStyles from "@/components/AnnouncementsNavLink.module.css";
import InstallAppPrompt from "@/components/InstallAppPrompt";
import IronCladUserButton from "@/components/IronCladUserButton";
import NavbarMoreMenu from "@/components/NavbarMoreMenu";
import NavbarSupportPopover from "@/components/NavbarSupportPopover";
import LanguageSelector, {
  LanguageSelectorTrigger,
  type LanguageSelectorCopy,
} from "@/components/i18n/LanguageSelector";
import LocalePreferenceSync from "@/components/i18n/LocalePreferenceSync";
import { useAnnouncementUnreadState } from "@/components/useAnnouncementUnreadState";
import {
  useOptionalLocale,
  useOptionalTranslations,
} from "@/components/i18n/LocaleProvider";
import { LOCALE_OPTIONS } from "@/lib/i18n/config";
import englishCommon from "@/lib/i18n/dictionaries/en/common";
import { translate } from "@/lib/i18n/translate";
import type { MessageValues } from "@/lib/i18n/types";
import { OFFICIAL_DISCORD_SUPPORT_CHANNEL_URL } from "@/lib/support";

type CustomClaims = {
  metadata?: {
    role?: string;
  };
};

type NavItem = {
  href: string;
  label: string;
  emphasis?: boolean;
};

function isActiveRoute(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

function navLinkClass(isActive: boolean, emphasis = false, calm = false) {
  const activeClass =
    `font-bold text-orange-300 after:absolute after:left-0 after:bottom-1 after:h-px after:w-full after:bg-orange-400 ${calm ? "" : "after:shadow-[0_0_12px_rgba(251,146,60,0.5)]"} hover:text-orange-200`;
  const baseClass = "relative inline-flex min-h-11 items-center whitespace-nowrap transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300";

  if (isActive) {
    return `${baseClass} ${activeClass}`;
  }

  if (emphasis) {
    return `${baseClass} text-orange-400 hover:text-orange-300`;
  }

  return `${baseClass} hover:text-white`;
}

function mobileNavLinkClass(isActive: boolean, emphasis = false, calm = false) {
  const activeClass =
    `font-bold text-orange-300 after:absolute after:left-0 after:bottom-1 after:h-px after:w-10 after:bg-orange-400 ${calm ? "" : "after:shadow-[0_0_12px_rgba(251,146,60,0.45)]"}`;
  const baseClass = "relative flex min-h-11 items-center break-words py-2 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300";

  if (isActive) {
    return `${baseClass} ${activeClass}`;
  }

  if (emphasis) {
    return `${baseClass} text-orange-400 hover:text-orange-300`;
  }

  return `${baseClass} hover:text-white`;
}

function AnnouncementNavLabel({
  label,
  unread,
}: {
  label: string;
  unread: boolean;
}) {
  return (
    <span
      className={`${announcementStyles.label} ${
        unread ? announcementStyles.unread : ""
      }`}
    >
      {label}
      {unread ? (
        <span className={announcementStyles.dot} aria-hidden="true" />
      ) : null}
    </span>
  );
}

function NavbarAccountControl({
  isLoaded,
  isSignedIn,
  signInLabel,
  onSignIn,
}: {
  isLoaded: boolean;
  isSignedIn: boolean;
  signInLabel: string;
  onSignIn?: () => void;
}) {
  if (!isLoaded) {
    return (
      <span
        aria-hidden="true"
        className="block h-11 w-11 shrink-0 rounded-full border border-white/10 bg-white/[0.04]"
      />
    );
  }

  if (isSignedIn) {
    return (
      <div className="inline-flex h-11 w-11 shrink-0 items-center justify-center">
        <IronCladUserButton />
      </div>
    );
  }

  return (
    <Link
      href="/sign-in"
      aria-label={signInLabel}
      onClick={onSignIn}
      className="inline-grid h-11 w-11 shrink-0 place-items-center rounded-full border border-white/15 bg-white/[0.04] text-zinc-300 transition hover:border-orange-400/55 hover:bg-orange-500/10 hover:text-orange-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400"
    >
      <UserRound aria-hidden="true" size={19} />
    </Link>
  );
}

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const pathname = usePathname();
  const { isLoaded, isSignedIn, sessionClaims } = useAuth();
  const selectedLocale = useOptionalLocale();
  const selectedTranslator = useOptionalTranslations("common", englishCommon);
  const languageReturnFocusRef = useRef<HTMLElement | null>(null);
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/");
  const t = useMemo(
    () =>
      isAdminRoute
        ? (path: string, values?: MessageValues) =>
            translate(englishCommon, path, values)
        : selectedTranslator,
    [isAdminRoute, selectedTranslator]
  );

  const role = (sessionClaims as CustomClaims | null)?.metadata?.role;
  const isAdmin = role === "admin";
  const announcementUnread = useAnnouncementUnreadState({
    isLoaded,
    isSignedIn,
    pathname,
  });
  const announcementHref = "/announcements";
  const announcementActive = isActiveRoute(pathname, announcementHref);
  const newsActive = isActiveRoute(pathname, "/news");
  // Longer localized labels need room for the unchanged account controls.
  const wideLabels = !isAdminRoute && ["fr", "pt-BR", "ru"].includes(selectedLocale);
  const desktopDisplay = wideLabels ? "hidden min-[1600px]:flex" : "hidden min-[1440px]:flex";
  const mobileDisplay = wideLabels ? "min-[1600px]:hidden" : "min-[1440px]:hidden";

  const playerNavItems: NavItem[] = [
    { href: "/tournaments", label: t("nav.tournaments") },
    { href: "/players", label: t("nav.players") },
    { href: "/rankings", label: t("nav.leaderboards") },
    { href: "/rules", label: t("nav.rules") },
  ];
  const accountNavItems: NavItem[] = [
    ...(isSignedIn
      ? [{ href: "/dashboard", label: t("nav.dashboard") }]
      : []),
    ...(isAdmin
      ? [{ href: "/admin", label: t("nav.admin"), emphasis: true }]
      : []),
  ];
  const selectedLocaleLabel =
    LOCALE_OPTIONS.find((option) => option.id === selectedLocale)?.label ??
    LOCALE_OPTIONS[0].label;
  const languageCopy = useMemo<LanguageSelectorCopy>(
    () => ({
      triggerAriaLabel: t("selector.triggerAriaLabel", {
        language: selectedLocaleLabel,
      }),
      languageRowLabel: t("selector.languageRowLabel"),
      title: t("selector.title"),
      description: t("selector.description"),
      closeLabel: t("selector.closeLabel"),
      selectedLabel: t("selector.selectedLabel"),
      savingLabel: t("selector.savingLabel"),
      saveError: t("selector.saveError"),
      translationReviewNotice: t("selector.translationReviewNotice"),
      privacyHeading: t("selector.privacyHeading"),
      privacyCookie: t("selector.privacyCookie"),
      privacyClerk: t("selector.privacyClerk"),
      privacyNoTracking: t("selector.privacyNoTracking"),
      privacyNotEvidence: t("selector.privacyNotEvidence"),
      privacyChange: t("selector.privacyChange"),
      privacyPolicyLink: t("selector.privacyPolicyLink"),
    }),
    [selectedLocaleLabel, t]
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key === "Escape") {
        setIsOpen(false);
        mobileMenuButtonRef.current?.focus({ preventScroll: true });
      }
      if (event.key === "Tab") {
        const items = mobileMenuRef.current?.querySelectorAll<HTMLElement>("a[href], button:not([disabled])");
        if (!items?.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    mobileMenuRef.current?.querySelector<HTMLElement>("a[href]")?.focus({ preventScroll: true });

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const desktop = window.matchMedia(`(min-width: ${wideLabels ? 1600 : 1440}px)`);
    const closeAtDesktop = () => {
      if (desktop.matches) setIsOpen(false);
    };
    desktop.addEventListener("change", closeAtDesktop);
    return () => desktop.removeEventListener("change", closeAtDesktop);
  }, [wideLabels]);

  const backdrop =
    isOpen && typeof document !== "undefined"
      ? createPortal(
          <button
            type="button"
            aria-label={t("nav.closeMenu")}
            className={`fixed inset-0 z-[80] block h-full w-full cursor-default bg-black/55 backdrop-blur-sm ${mobileDisplay}`}
            onPointerDown={() => {
              setIsOpen(false);
              mobileMenuButtonRef.current?.focus({ preventScroll: true });
            }}
          />,
          document.body
        )
      : null;

  return (
    <>
      {backdrop}
      <LocalePreferenceSync
        isSignedIn={isSignedIn === true}
        locale={selectedLocale}
      />
      <LanguageSelector
        copy={languageCopy}
        currentLocale={selectedLocale}
        languageBoundary={isAdminRoute ? "en" : undefined}
        onOpenChange={setLanguageOpen}
        open={languageOpen}
        returnFocusRef={languageReturnFocusRef}
        setLocalePreference={setLocalePreference}
      />

      <header
        className="fixed top-0 left-0 z-[90] w-full border-b border-white/10 bg-black/20 backdrop-blur-md"
        lang={isAdminRoute ? "en" : undefined}
      >
        <nav
          aria-label={t("nav.primaryNavigation")}
          className="relative z-[95] mx-auto flex w-full max-w-[1600px] items-center justify-between gap-6 px-5 py-5 text-white sm:px-6 min-[1800px]:gap-8"
        >
          <div
            data-navbar-area="brand"
            className="flex min-w-0 shrink-0 items-center text-sm font-medium text-zinc-300"
          >
            <Link
              href="/"
              className="flex shrink-0 items-center"
              onClick={() => setIsOpen(false)}
            >
              <Image
                src="/images/ironclad-logo.png"
                alt="IronClad"
                width={1365}
                height={768}
                className="h-14 w-auto sm:h-16 min-[1440px]:h-14 min-[1800px]:h-16"
                priority
              />
            </Link>

            <div
              data-navbar-area="updates"
              className={`ml-4 shrink-0 items-center gap-5 border-l border-white/10 pl-4 ${desktopDisplay} min-[1800px]:ml-6 min-[1800px]:pl-6`}
            >
              <Link
                href={announcementHref}
                className={`${navLinkClass(announcementActive)} whitespace-nowrap`}
                aria-current={announcementActive ? "page" : undefined}
                aria-label={
                  announcementUnread
                    ? t("nav.announcementsUnread")
                    : undefined
                }
              >
                <AnnouncementNavLabel
                  label={t("nav.announcements")}
                  unread={announcementUnread}
                />
              </Link>
              <Link
                href="/news"
                className={navLinkClass(newsActive, false, true)}
                aria-current={newsActive ? "page" : undefined}
              >
                {t("nav.news")}
              </Link>
            </div>
          </div>

          <div
            data-navbar-area="primary"
            className={`min-w-0 items-center justify-center text-sm font-medium text-zinc-300 ${desktopDisplay}`}
          >
            <div className="flex items-center justify-center gap-5 min-[1800px]:gap-6">
              {playerNavItems.map((item) => {
                const isActive = isActiveRoute(pathname, item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={navLinkClass(isActive, item.emphasis)}
                    aria-current={isActive ? "page" : undefined}
                  >
                    {item.label}
                  </Link>
                );
              })}
              <NavbarMoreMenu
                key={pathname}
                label={t("nav.more")}
                aboutLabel={t("nav.about")}
                active={isActiveRoute(pathname, "/about")}
              />
            </div>
          </div>

          <div
            data-navbar-area="utilities"
            className={`shrink-0 items-center gap-2 text-xs font-medium text-zinc-300 ${desktopDisplay} min-[1800px]:gap-3`}
          >
            {accountNavItems.length > 0 ? (
              <div
                data-navbar-area="account-links"
                className="mr-1 flex items-center gap-4 border-r border-white/10 pr-4 text-sm"
              >
                {accountNavItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={navLinkClass(isActiveRoute(pathname, item.href), item.emphasis)}
                    aria-current={isActiveRoute(pathname, item.href) ? "page" : undefined}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            ) : null}
            <LanguageSelectorTrigger
              currentLocale={selectedLocale}
              copy={languageCopy}
              onOpen={(trigger) => {
                languageReturnFocusRef.current = trigger;
                setLanguageOpen(true);
              }}
              open={languageOpen}
              variant="desktop"
            />
            <div className="shrink-0 border-l border-white/10 pl-2 min-[1800px]:pl-3">
              <NavbarAccountControl
                isLoaded={isLoaded}
                isSignedIn={isSignedIn === true}
                signInLabel={t("nav.signIn")}
              />
            </div>
            <div className="shrink-0 border-l border-white/10 pl-2 min-[1800px]:pl-3">
              <NavbarSupportPopover
                href={OFFICIAL_DISCORD_SUPPORT_CHANNEL_URL}
                triggerLabel={t("nav.supportTrigger")}
                title={t("nav.support")}
                copy={t("nav.supportMessage")}
                actionLabel={t("nav.openDiscordSupport")}
              />
            </div>
          </div>

          <button
            ref={mobileMenuButtonRef}
            type="button"
            className={`border border-white/10 bg-white/[0.04] p-2 text-zinc-200 transition hover:border-orange-400/40 hover:text-orange-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400 ${mobileDisplay}`}
            onClick={() => setIsOpen((current) => !current)}
            aria-label={
              isOpen ? t("nav.closeMenu") : t("nav.openMenu")
            }
            aria-expanded={isOpen}
            aria-controls="mobile-navigation"
          >
            {isOpen ? (
              <X size={24} aria-hidden="true" />
            ) : (
              <Menu size={24} aria-hidden="true" />
            )}
          </button>
        </nav>

        {isOpen && (
          <div
            ref={mobileMenuRef}
            id="mobile-navigation"
            role="dialog"
            aria-modal="true"
            aria-label={t("nav.mobileNavigation")}
            className={`relative z-[95] mx-4 mb-4 max-h-[calc(100dvh-120px)] overflow-y-auto border border-white/10 bg-black/95 p-5 text-white shadow-[0_0_60px_rgba(0,0,0,0.8)] ${mobileDisplay}`}
          >
            <div className="flex flex-col gap-4 text-sm font-medium">
              <section aria-labelledby="mobile-updates-label" className="border-b border-white/10 pb-3">
                <h2 id="mobile-updates-label" className="mb-1 text-xs font-bold uppercase tracking-wider text-zinc-500">{t("nav.updates")}</h2>
                <Link
                  href={announcementHref}
                  onClick={() => setIsOpen(false)}
                  className={mobileNavLinkClass(announcementActive)}
                  aria-current={announcementActive ? "page" : undefined}
                  aria-label={
                    announcementUnread
                      ? t("nav.announcementsUnread")
                      : undefined
                  }
                >
                  <AnnouncementNavLabel
                    label={t("nav.announcements")}
                    unread={announcementUnread}
                  />
                </Link>
                <Link
                  href="/news"
                  onClick={() => setIsOpen(false)}
                  className={mobileNavLinkClass(newsActive, false, true)}
                  aria-current={newsActive ? "page" : undefined}
                >
                  {t("nav.news")}
                </Link>
              </section>

              <section aria-labelledby="mobile-compete-label" className="border-b border-white/10 pb-3">
                <h2 id="mobile-compete-label" className="mb-1 text-xs font-bold uppercase tracking-wider text-zinc-500">{t("nav.compete")}</h2>
                {playerNavItems.map((item) => {
                  const isActive = isActiveRoute(pathname, item.href);

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setIsOpen(false)}
                      className={mobileNavLinkClass(isActive, item.emphasis)}
                      aria-current={isActive ? "page" : undefined}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </section>
              <section aria-labelledby="mobile-information-label">
                <h2 id="mobile-information-label" className="mb-1 text-xs font-bold uppercase tracking-wider text-zinc-500">{t("nav.information")}</h2>
                <Link
                  href="/about"
                  onClick={() => setIsOpen(false)}
                  className={mobileNavLinkClass(isActiveRoute(pathname, "/about"))}
                  aria-current={isActiveRoute(pathname, "/about") ? "page" : undefined}
                >
                  {t("nav.about")}
                </Link>
              </section>
              {accountNavItems.length > 0 ? (
                <section aria-labelledby="mobile-account-label" className="border-t border-white/10 pt-3">
                  <h2 id="mobile-account-label" className="mb-1 text-xs font-bold uppercase tracking-wider text-zinc-500">{t("nav.account")}</h2>
                  {accountNavItems.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setIsOpen(false)}
                      className={mobileNavLinkClass(isActiveRoute(pathname, item.href), item.emphasis)}
                      aria-current={isActiveRoute(pathname, item.href) ? "page" : undefined}
                    >
                      {item.label}
                    </Link>
                  ))}
                </section>
              ) : null}

              <div className="mt-2 border-t border-white/10 pt-4">
                <LanguageSelectorTrigger
                  currentLocale={selectedLocale}
                  copy={languageCopy}
                  onOpen={() => {
                    languageReturnFocusRef.current = mobileMenuButtonRef.current;
                    setIsOpen(false);
                    setLanguageOpen(true);
                  }}
                  open={languageOpen}
                  variant="mobile"
                />
              </div>

              <div className="flex min-h-12 items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.035] px-4 py-1 text-zinc-200">
                <span>{t("nav.account")}</span>
                <NavbarAccountControl
                  isLoaded={isLoaded}
                  isSignedIn={isSignedIn === true}
                  signInLabel={t("nav.signIn")}
                  onSignIn={() => setIsOpen(false)}
                />
              </div>

              <div className="flex min-h-12 items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.035] px-4 py-1 text-zinc-200">
                <span>{t("nav.support")}</span>
                <NavbarSupportPopover
                  href={OFFICIAL_DISCORD_SUPPORT_CHANNEL_URL}
                  triggerLabel={t("nav.supportTrigger")}
                  title={t("nav.support")}
                  copy={t("nav.supportMessage")}
                  actionLabel={t("nav.openDiscordSupport")}
                  placement="above"
                />
              </div>

              <div className="border-t border-white/10 pt-4">
                <InstallAppPrompt
                  onOpenChange={(open) => {
                    if (!open) {
                      setIsOpen(false);
                    }
                  }}
                />
              </div>
            </div>
          </div>
        )}
      </header>
    </>
  );
}
