"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@clerk/nextjs";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import InstallAppPrompt from "@/components/InstallAppPrompt";

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

const baseNavItems: NavItem[] = [
  { href: "/", label: "Home" },
  { href: "/tournaments", label: "Tournaments" },
  { href: "/players", label: "Players" },
  { href: "/rules", label: "Rules" },
  { href: "/rankings", label: "Leaderboard & Ranking" },
  { href: "/about", label: "About" },
];

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
  const pathname = usePathname();
  const { isSignedIn, sessionClaims } = useAuth();

  const role = (sessionClaims as CustomClaims | null)?.metadata?.role;
  const isAdmin = role === "admin";

  const navItems: NavItem[] = [
    ...baseNavItems,
    ...(isSignedIn ? [{ href: "/dashboard", label: "Dashboard" }] : []),
    ...(isAdmin
      ? [{ href: "/admin", label: "Admin", emphasis: true }]
      : []),
  ];

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
            aria-label="Close mobile navigation"
            className="fixed inset-0 z-[80] block h-full w-full cursor-default bg-black/55 backdrop-blur-sm md:hidden"
            onPointerDown={() => setIsOpen(false)}
          />,
          document.body
        )
      : null;

  return (
    <>
      {backdrop}

      <header className="fixed top-0 left-0 z-[90] w-full border-b border-white/10 bg-black/20 backdrop-blur-md">
        <nav className="relative z-[95] mx-auto flex max-w-7xl items-center justify-between px-6 py-5 text-white">
          <Link
            href="/"
            className="flex items-center"
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

          <div className="hidden items-center gap-8 text-sm font-medium text-zinc-300 md:flex">
            {navItems.map((item) => {
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

          <button
            type="button"
            className="border border-white/10 bg-white/[0.04] p-2 text-zinc-200 transition hover:border-orange-400/40 hover:text-orange-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400 md:hidden"
            onClick={() => setIsOpen((current) => !current)}
            aria-label={
              isOpen
                ? "Close navigation menu"
                : "Open navigation menu"
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
            aria-label="Mobile navigation"
            className="relative z-[95] mx-4 mb-4 max-h-[calc(100dvh-120px)] overflow-y-auto border border-white/10 bg-black/95 p-5 text-white shadow-[0_0_60px_rgba(0,0,0,0.8)] md:hidden"
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