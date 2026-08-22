"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@clerk/nextjs";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { setLocalePreference } from "@/app/locale-actions";
import InstallAppPrompt from "@/components/InstallAppPrompt";
import LanguageSelector, {
  LanguageSelectorTrigger,
  type LanguageSelectorCopy,
} from "@/components/i18n/LanguageSelector";
import LocalePreferenceSync from "@/components/i18n/LocalePreferenceSync";
import {
  useOptionalLocale,
  useOptionalTranslations,
} from "@/components/i18n/LocaleProvider";
import { LOCALE_OPTIONS } from "@/lib/i18n/config";
import englishCommon from "@/lib/i18n/dictionaries/en/common";
import { translate } from "@/lib/i18n/translate";
import type { MessageValues } from "@/lib/i18n/types";

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

function navLinkClass(isActive: boolean, emphasis = false) {
  const activeClass =
    "font-bold text-orange-300 after:absolute after:left-0 after:-bottom-2 after:h-px after:w-full after:bg-orange-400 after:shadow-[0_0_12px_rgba(251,146,60,0.5)] hover:text-orange-200";

  if (isActive) {
    return `relative transition ${activeClass}`;
  }

  if (emphasis) {
    return "relative text-orange-400 transition hover:text-orange-300";
  }

  return "relative transition hover:text-white";
}

function mobileNavLinkClass(isActive: boolean, emphasis = false) {
  const activeClass =
    "font-bold text-orange-300 after:absolute after:left-0 after:-bottom-1 after:h-px after:w-10 after:bg-orange-400 after:shadow-[0_0_12px_rgba(251,146,60,0.45)]";

  if (isActive) {
    return `relative transition ${activeClass}`;
  }

  if (emphasis) {
    return "relative text-orange-400 transition hover:text-orange-300";
  }

  return "relative transition hover:text-white";
}

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const pathname = usePathname();
  const { isSignedIn, sessionClaims } = useAuth();
  const selectedLocale = useOptionalLocale();
  const selectedTranslator = useOptionalTranslations("common", englishCommon);
  const languageReturnFocusRef = useRef<HTMLElement | null>(null);
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);

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

  const playerNavItems: NavItem[] = [
    { href: "/", label: t("nav.home") },
    { href: "/tournaments", label: t("nav.tournaments") },
    { href: "/players", label: t("nav.players") },
    { href: "/rules", label: t("nav.rules") },
    { href: "/rankings", label: t("nav.leaderboardAndRankings") },
    { href: "/about", label: t("nav.about") },
  ];
  const accountNavItems: NavItem[] = [
    ...(isSignedIn
      ? [{ href: "/dashboard", label: t("nav.dashboard") }]
      : []),
    ...(isAdmin
      ? [{ href: "/admin", label: t("nav.admin"), emphasis: true }]
      : []),
  ];
  const navItems = [...playerNavItems, ...accountNavItems];
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
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const backdrop =
    isOpen && typeof document !== "undefined"
      ? createPortal(
          <button
            type="button"
            aria-label={t("nav.closeMenu")}
            className="fixed inset-0 z-[80] block h-full w-full cursor-default bg-black/55 backdrop-blur-sm xl:hidden"
            onPointerDown={() => setIsOpen(false)}
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
          className="relative z-[95] mx-auto flex max-w-7xl items-center justify-between px-6 py-5 text-white"
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
              className="h-14 w-auto sm:h-16"
              priority
            />
          </Link>

          <div className="hidden min-w-0 flex-1 items-center pl-8 text-sm font-medium text-zinc-300 xl:flex">
            <div className="ml-auto flex items-center gap-5 2xl:gap-7">
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
              {accountNavItems.map((item) => {
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
            </div>
            <div className="ml-5 shrink-0 border-l border-white/10 pl-5 2xl:ml-7 2xl:pl-7">
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
            </div>
          </div>

          <button
            ref={mobileMenuButtonRef}
            type="button"
            className="border border-white/10 bg-white/[0.04] p-2 text-zinc-200 transition hover:border-orange-400/40 hover:text-orange-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400 xl:hidden"
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
            id="mobile-navigation"
            role="dialog"
            aria-modal="true"
            aria-label={t("nav.mobileNavigation")}
            className="relative z-[95] mx-4 mb-4 max-h-[calc(100dvh-120px)] overflow-y-auto border border-white/10 bg-black/95 p-5 text-white shadow-[0_0_60px_rgba(0,0,0,0.8)] xl:hidden"
          >
            <div className="flex flex-col gap-4 text-sm font-medium">
              {navItems.map((item) => {
                const isActive = isActiveRoute(pathname, item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setIsOpen(false)}
                    className={mobileNavLinkClass(
                      isActive,
                      item.emphasis
                    )}
                    aria-current={isActive ? "page" : undefined}
                  >
                    {item.label}
                  </Link>
                );
              })}

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
