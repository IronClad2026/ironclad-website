"use client";

import {
  ClipboardList,
  Clapperboard,
  GitBranch,
  LayoutDashboard,
  Map,
  Menu,
  Pencil,
  Settings,
  Swords,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

export type TournamentManagementSection =
  | "overview"
  | "edit"
  | "registrations"
  | "players-waitlist"
  | "bracket"
  | "matches"
  | "media"
  | "map-pool"
  | "controls";

type TournamentManagementMenuItem = {
  icon: LucideIcon;
  label: string;
  section: TournamentManagementSection;
  separated?: boolean;
};

export const TOURNAMENT_MANAGEMENT_SECTIONS: readonly TournamentManagementMenuItem[] =
  [
    { icon: LayoutDashboard, label: "Overview", section: "overview" },
    { icon: Pencil, label: "Edit Tournament", section: "edit" },
    {
      icon: ClipboardList,
      label: "Registrations",
      section: "registrations",
    },
    {
      icon: Users,
      label: "Players / Waitlist",
      section: "players-waitlist",
    },
    { icon: GitBranch, label: "Bracket", section: "bracket" },
    { icon: Swords, label: "Matches / Results", section: "matches" },
    { icon: Clapperboard, label: "Media", section: "media" },
    { icon: Map, label: "Map Pool", section: "map-pool" },
    {
      icon: Settings,
      label: "Tournament Controls",
      section: "controls",
      separated: true,
    },
  ];

const dialogFocusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export default function TournamentManagementMenu({
  activeSection,
  tournamentId,
}: {
  activeSection: TournamentManagementSection;
  tournamentId: string;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const returnFocusOnCloseRef = useRef(true);
  const reactId = useId();
  const idSuffix = reactId.replaceAll(":", "");
  const dialogId = `tournament-management-menu-${idSuffix}`;
  const titleId = `${dialogId}-title`;
  const descriptionId = `${dialogId}-description`;
  const portalRoot = typeof document === "undefined" ? null : document.body;

  const closeMenu = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    const returnTarget = triggerRef.current;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => {
      closeButtonRef.current?.focus({ preventScroll: true });
    }, 0);

    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;

      if (returnFocusOnCloseRef.current && returnTarget?.isConnected) {
        window.setTimeout(
          () => returnTarget.focus({ preventScroll: true }),
          0
        );
      }

      returnFocusOnCloseRef.current = true;
    };
  }, [open]);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;

    const desktopQuery = window.matchMedia("(min-width: 80rem)");
    const closeAtDesktop = (event: MediaQueryListEvent) => {
      if (!event.matches) return;

      returnFocusOnCloseRef.current = false;
      setOpen(false);
    };

    desktopQuery.addEventListener("change", closeAtDesktop);
    return () => desktopQuery.removeEventListener("change", closeAtDesktop);
  }, []);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu();
        return;
      }

      if (event.key !== "Tab") return;

      const dialog = dialogRef.current;
      const focusable = Array.from(
        dialog?.querySelectorAll<HTMLElement>(dialogFocusableSelector) ?? []
      );

      if (!dialog || focusable.length === 0) {
        event.preventDefault();
        dialog?.focus({ preventScroll: true });
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeElement = document.activeElement;

      if (!activeElement || !dialog.contains(activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [closeMenu, open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Open Tournament management menu"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={dialogId}
        onClick={() => {
          returnFocusOnCloseRef.current = true;
          setOpen(true);
        }}
        className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/15 bg-black/55 text-zinc-200 shadow-lg backdrop-blur-md transition hover:border-orange-400/60 hover:bg-orange-500/10 hover:text-orange-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300 xl:hidden"
      >
        <Menu aria-hidden="true" size={20} />
      </button>

      {portalRoot &&
        open &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex justify-end">
            <button
              type="button"
              tabIndex={-1}
              aria-label="Close Tournament management menu backdrop"
              onClick={closeMenu}
              className="absolute inset-0 h-full w-full cursor-default bg-black/75 backdrop-blur-sm"
            />

            <section
              ref={dialogRef}
              id={dialogId}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              aria-describedby={descriptionId}
              tabIndex={-1}
              className="relative h-[100dvh] w-[min(22rem,100vw)] overflow-y-auto border-l border-white/15 bg-[radial-gradient(circle_at_top_right,rgba(249,115,22,0.14),transparent_38%),linear-gradient(160deg,rgba(9,9,11,0.99),rgba(3,7,18,0.99))] shadow-[-24px_0_80px_rgba(0,0,0,0.65)] [padding-bottom:max(1rem,env(safe-area-inset-bottom))] [padding-left:max(1rem,env(safe-area-inset-left))] [padding-right:max(1rem,env(safe-area-inset-right))] [padding-top:max(1rem,env(safe-area-inset-top))]"
            >
              <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-5">
                <div className="min-w-0">
                  <p className="text-xs font-black uppercase tracking-[0.24em] text-orange-300">
                    Admin workspace
                  </p>
                  <h2
                    id={titleId}
                    className="mt-2 text-xl font-black text-white"
                  >
                    Manage Tournament
                  </h2>
                  <p
                    id={descriptionId}
                    className="mt-1 text-sm leading-6 text-zinc-400"
                  >
                    Choose one management area.
                  </p>
                </div>
                <button
                  ref={closeButtonRef}
                  type="button"
                  aria-label="Close Tournament management menu"
                  onClick={closeMenu}
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/5 text-zinc-300 transition hover:border-orange-400/50 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300"
                >
                  <X aria-hidden="true" size={19} />
                </button>
              </div>

              <nav
                aria-label="Tournament management sections"
                className="pt-4"
              >
                <ul className="space-y-1.5">
                  {TOURNAMENT_MANAGEMENT_SECTIONS.map((item) => {
                    const Icon = item.icon;
                    const active = activeSection === item.section;
                    return (
                      <li
                        key={item.section}
                        data-management-group={
                          item.separated ? "tournament-controls" : "standard"
                        }
                        className={
                          item.separated
                            ? "mt-5 border-t border-red-500/25 pt-5"
                            : undefined
                        }
                      >
                        <Link
                          href={`/admin/tournaments/${encodeURIComponent(
                            tournamentId
                          )}?section=${item.section}`}
                          aria-current={active ? "page" : undefined}
                          onClick={closeMenu}
                          className={`flex min-h-11 items-center gap-3 rounded-xl border px-3.5 py-3 text-sm font-black transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300 ${
                            item.separated
                              ? active
                                ? "border-red-400/50 bg-red-500/15 text-red-100"
                                : "border-red-500/20 bg-red-500/[0.06] text-red-300 hover:border-red-400/50 hover:bg-red-500/15 hover:text-red-100"
                              : active
                                ? "border-orange-400/50 bg-orange-500/15 text-orange-100"
                                : "border-transparent text-zinc-300 hover:border-white/10 hover:bg-white/[0.06] hover:text-white"
                          }`}
                        >
                          <Icon aria-hidden="true" size={18} />
                          <span>{item.label}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </nav>
            </section>
          </div>,
          portalRoot
        )}
    </>
  );
}

export function TournamentDesktopSectionNavigation({
  activeSection,
  tournamentId,
}: {
  activeSection: TournamentManagementSection;
  tournamentId: string;
}) {
  return (
    <nav
      aria-label="Tournament management sections"
      className="mt-4 hidden border-t border-white/10 pt-4 xl:block"
    >
      <ul className="grid grid-cols-3 gap-1.5 2xl:grid-cols-9">
        {TOURNAMENT_MANAGEMENT_SECTIONS.map((item) => {
          const Icon = item.icon;
          const active = activeSection === item.section;

          return (
            <li
              key={item.section}
              data-management-group={
                item.separated ? "tournament-controls" : "standard"
              }
              className="min-w-0"
            >
              <Link
                href={`/admin/tournaments/${encodeURIComponent(
                  tournamentId
                )}?section=${item.section}`}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-center text-[11px] font-black leading-4 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300 ${
                  item.separated
                    ? active
                      ? "border-red-400/50 bg-red-500/15 text-red-100"
                      : "border-red-500/20 bg-red-500/[0.06] text-red-300 hover:border-red-400/50 hover:bg-red-500/15 hover:text-red-100"
                    : active
                      ? "border-orange-400/50 bg-orange-500/15 text-orange-100"
                      : "border-transparent bg-black/20 text-zinc-400 hover:border-white/10 hover:bg-white/[0.06] hover:text-white"
                }`}
              >
                <Icon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                <span className="min-w-0 break-words">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
