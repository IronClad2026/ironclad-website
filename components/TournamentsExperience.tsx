"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode, ElementType } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { createPortal } from "react-dom";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { submitTournamentRegistration } from "@/app/tournaments/actions";
import { rollMatchDice } from "@/app/tournaments/dice-actions";
import MatchDiceRollOff, {
  type MatchDiceLoadResult,
} from "@/components/MatchDiceRollOff";
import PollsAndDecisions from "@/components/PollsAndDecisions";
import MatchResultControls, {
  AdminResetMatchForm,
  ReportGroupReview,
  ResultEntryForm,
} from "@/components/MatchResultControls";
import AdminMatchResultSummaries from "@/components/AdminMatchResultSummaries";
import AdminMatchDeadlineControls from "@/components/AdminMatchDeadlineControls";
import HydrationSafeLocalDateTime from "@/components/HydrationSafeLocalDateTime";
import ScrollReveal from "@/components/ScrollReveal";
import TournamentMapPools from "@/components/TournamentMapPools";
import { createAuthenticatedBrowserSupabaseClient } from "@/lib/supabase-browser";
import { parseMatchDiceSnapshot } from "@/lib/match-dice";
import type { PlayerProfile } from "@/lib/player-profile";
import type { PollViewerProjection } from "@/lib/polls";
import {
  getPublicTournamentNavigation,
  getTournamentBracketDisplayName,
  getTournamentTerminalPublicMessage,
  formatTournamentParticipantFact,
  isTournamentTerminalStatus,
  isTournamentRegistrationOpen,
  tournamentParticipantMatchesQuery,
  WAITLIST_DISCLOSURE_MESSAGE,
} from "@/lib/tournaments";
import type {
  GeneratedTournamentBracket,
  GeneratedTournamentMatch,
  MatchResultReportGroup,
  MatchResultSubmission,
  TournamentCard,
  TournamentParticipant,
} from "@/lib/tournaments";
import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Crown,
  Info,
  LayoutDashboard,
  MessageCircle,
  PlayCircle,
  Radio,
  Search,
  Swords,
  Trophy,
  Users,
  Vote,
  X,
} from "lucide-react";

/**
 * app/tournaments/page.tsx
 * ------------------------------------------------------------
 * IronClad tournament page built as a single editable TSX page.
 * The visual structure is preserved: sidebar, hero, tabs, overview,
 * participants, brackets, media, announcements, and mobile menu.
 */

type TabKey =
  | "overview"
  | "participants"
  | "brackets"
  | "decisions"
  | "media"
  | "announcements";
type OverviewPanelKey = "details" | "rules" | "prizes" | "schedule" | "contact";

type ArchiveEvent = {
  title: string;
  image: string;
  description?: string;
  battlefy: string;
};

type MatchTeam = {
  seed: number;
  name: string;
  score?: number;
  winner?: boolean;
};

type Match = {
  id: string;
  round: string;
  status: "complete" | "live" | "pending_review" | "upcoming";
  teamA: MatchTeam;
  teamB: MatchTeam;
};

const archiveEvents: ArchiveEvent[] = [
  {
    title: "Beta Blitz Tournament",
    image: "/images/tournaments/1v1-beta-blitz-tournament.png",
    description: "An early IronClad 1v1 tournament from the Battlefy era.",
    battlefy: "https://battlefy.com/ironclad-tournaments/beta-blitz-tournament/695bc9ee265bc4002fd64e4d/info?infoTab=details",
  },
  {
    title: "Council of War",
    image: "/images/tournaments/1v1-council-of-war.jpeg",
    description: "A completed IronClad 1v1 event preserved on Battlefy.",
    battlefy: "https://battlefy.com/ironclad-tournaments/council-of-war/69839d804b1a19002fe7533f/info?infoTab=details",
  },
  {
    title: "Shadow War",
    image: "/images/tournaments/1v1-shadow-war.jpeg",
    description: "A completed monthly IronClad 1v1 tournament.",
    battlefy: "https://battlefy.com/ironclad-tournaments/shadow-war/69a8514962c9f7002f97d606/info?infoTab=details",
  },
  {
    title: "The Art of War",
    image: "/images/tournaments/1v1-the-art-of-war.jpeg",
    description: "A completed IronClad 1v1 event with its original details on Battlefy.",
    battlefy: "https://battlefy.com/ironclad-tournaments/the-art-of-war/69cbf56ac45e5100728854a9/info?infoTab=details",
  },
  {
    title: "Operation Skyfall",
    image: "/images/tournaments/1v1-operation-skyfall.jpeg",
    description: "The final featured 1v1 event from the pre-launch Battlefy archive.",
    battlefy: "https://battlefy.com/ironclad-tournaments/operation-skyfall/69ebc7641259b1002120aeb0/info?infoTab=details",
  },
  {
    title: "4v4 Beta Tournament",
    image: "/images/tournaments/4v4-beta-tournament.jpeg",
    description: "IronClad's original team-format beta tournament.",
    battlefy: "https://battlefy.com/ironclad-tournaments/4-vs-4-beta-tournament/69fba46252cae7002ffb6701/info?infoTab=details",
  },
];

const tabs: { key: TabKey; label: string; icon: ElementType }[] = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "participants", label: "Participants", icon: Users },
  { key: "brackets", label: "Brackets", icon: Swords },
  { key: "decisions", label: "Polls & Decisions", icon: Vote },
  { key: "media", label: "Media", icon: PlayCircle },
  { key: "announcements", label: "Announcements", icon: Radio },
];

const overviewPanels: { key: OverviewPanelKey; label: string }[] = [
  { key: "details", label: "Details" },
  { key: "rules", label: "Rules" },
  { key: "prizes", label: "Prizes" },
  { key: "schedule", label: "Schedule" },
  { key: "contact", label: "Contact" },
];

function getValidTab(value: string | null): TabKey {
  return tabs.some((tab) => tab.key === value) ? (value as TabKey) : "overview";
}

function getValidOverviewPanel(value: string | null): OverviewPanelKey {
  return overviewPanels.some((panel) => panel.key === value)
    ? (value as OverviewPanelKey)
    : "details";
}

function findTournamentFromUrl(
  tournaments: TournamentCard[],
  value: string | null
) {
  if (!value) return null;

  return (
    tournaments.find(
      (tournament) => tournament.slug === value || tournament.id === value
    ) ?? null
  );
}

function getTournamentUrlValue(tournament: TournamentCard) {
  return tournament.slug || tournament.id;
}

function classNames(...classes: Array<string | false | undefined | null>) {
  return classes.filter(Boolean).join(" ");
}

const interactiveHover = "transform-gpu transition-all duration-300 ease-out hover:scale-[1.03] hover:border-orange-500/70 hover:shadow-lg hover:shadow-orange-950/20 active:scale-[0.99]";
const tournamentCardClass =
  "group relative overflow-hidden border border-white/12 bg-[linear-gradient(145deg,rgba(255,255,255,0.06),rgba(8,8,8,0.86))] shadow-2xl shadow-black/30 backdrop-blur transition hover:-translate-y-1 hover:border-orange-400/35 before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-orange-300/55 before:opacity-0 before:transition before:content-[''] hover:before:opacity-100";
const tournamentInsetCardClass =
  "border border-white/12 bg-black/45 shadow-xl shadow-black/10 transition hover:border-orange-400/35";
const tournamentTableClass =
  "overflow-hidden border border-white/12 shadow-2xl shadow-black/25 transition hover:border-orange-400/35";

function StatusPill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "green" | "red" | "amber" | "gray" }) {
  const tones = {
    neutral: "border-white/12 bg-black/45 text-zinc-300",
    green: "border-emerald-400/40 bg-emerald-500/10 text-emerald-200",
    red: "border-orange-400/40 bg-orange-500/10 text-orange-200",
    amber: "border-amber-400/40 bg-amber-500/10 text-amber-200",
    gray: "border-slate-500/50 bg-slate-700/30 text-zinc-300",
  };

  return <span className={classNames("inline-flex items-center rounded border px-2 py-1 text-xs font-semibold uppercase tracking-wide", tones[tone])}>{children}</span>;
}

function Sidebar({
  selectedTournament,
  tournaments,
  onSelectTournament,
}: {
  selectedTournament: TournamentCard;
  tournaments: TournamentCard[];
  onSelectTournament: (tournament: TournamentCard) => void;
}) {
  const [eventsOpen, setEventsOpen] = useState(true);
  const eventsByMonth = Array.from(
    tournaments.reduce((groups, tournament) => {
      const group = groups.get(tournament.month) ?? [];
      group.push(tournament);
      groups.set(tournament.month, group);
      return groups;
    }, new Map<string, TournamentCard[]>())
  ).map(([month, events]) => ({ month, events }));

  return (
    <aside className="hidden w-72 shrink-0 border-r border-orange-500/20 bg-black/70 shadow-2xl shadow-black/30 backdrop-blur-xl lg:block">
      <div className="sticky top-20 h-[calc(100vh-5rem)] overflow-y-auto">
        <div className="border-b border-orange-500/15 p-5">
          <div className="h-32 border border-white/12 bg-center bg-no-repeat shadow-xl shadow-black/20" style={{ backgroundImage: "linear-gradient(135deg,rgba(0,0,0,0.42),rgba(0,0,0,0.84)),url(/images/ironclad-background.jpg)", backgroundSize: "100% auto" }} />
          <div className="mt-4">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-500">Organizer</p>
            <h2 className="mt-1 text-lg font-black text-white">IronClad Tournaments</h2>
            <p className="mt-1 text-sm text-zinc-400">Company of Heroes 3 Events</p>
          </div>
        </div>

        <nav className="p-3">
          <button
            onClick={() => setEventsOpen((current) => !current)}
            className={classNames("group mb-1 flex w-full items-center justify-between rounded-lg px-3 py-3 text-left text-sm font-semibold text-zinc-400 hover:bg-orange-500/10 hover:text-white", interactiveHover)}
          >
            <span className="flex items-center gap-3">
              <CalendarDays size={17} className="text-orange-400" />
              Events
            </span>
            <ChevronDown size={14} className={classNames("text-zinc-500 transition", eventsOpen && "rotate-180")} />
          </button>

          {eventsOpen && (
            <div className="mt-2 space-y-4 border border-white/12 bg-black/45 p-3 shadow-inner shadow-black/20">
              {eventsByMonth.map((group) => (
                <div key={group.month}>
                  <p className="mb-2 text-xs font-black uppercase tracking-wider text-zinc-500">{group.month}</p>
                  <div className="space-y-2">
                    {group.events.map((event) => {
                      const selected = selectedTournament.title === event.title;
                      return (
                        <button
                          key={event.title}
                          onClick={() => onSelectTournament(event)}
                          className={classNames("relative block w-full overflow-hidden border border-white/12 bg-cover bg-center p-3 text-left shadow-2xl shadow-black/30 backdrop-blur transition hover:-translate-y-1 hover:border-orange-400/35 before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-orange-300/55 before:opacity-0 before:transition before:content-[''] hover:before:opacity-100", selected && "ring-2 ring-orange-500")}
                          style={{ backgroundImage: `linear-gradient(145deg,rgba(255,255,255,0.06),rgba(8,8,8,0.86)),linear-gradient(135deg,rgba(0,0,0,0.96),rgba(0,0,0,0.9)),url(${event.image})` }}
                        >
                          <p className="break-words text-sm font-black text-white">{event.title}</p>
                          <p className="mt-1 text-xs text-zinc-300">{event.format} - {event.status}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </nav>
      </div>
    </aside>
  );
}

function MobileTournamentDrawer({
  open,
  selectedTournament,
  tournaments,
  onClose,
  onSelectTournament,
}: {
  open: boolean;
  selectedTournament: TournamentCard;
  tournaments: TournamentCard[];
  onClose: () => void;
  onSelectTournament: (tournament: TournamentCard) => void;
}) {
  const eventsByMonth = Array.from(
    tournaments.reduce((groups, tournament) => {
      const group = groups.get(tournament.month) ?? [];
      group.push(tournament);
      groups.set(tournament.month, group);
      return groups;
    }, new Map<string, TournamentCard[]>())
  ).map(([month, events]) => ({ month, events }));

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose, open]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[80] lg:hidden">
          <motion.button
            type="button"
            aria-label="Close tournament menu"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="absolute inset-0 z-0 h-full w-full cursor-default bg-black/80 backdrop-blur-sm"
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-tournament-menu-title"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 360, damping: 36 }}
            className="fixed bottom-0 right-0 top-[104px] z-10 flex h-auto w-[min(88vw,380px)] max-w-[380px] flex-col border-l border-orange-400/30 bg-[linear-gradient(145deg,rgba(14,14,14,0.98),rgba(0,0,0,0.99))] p-4 text-zinc-100 shadow-[0_0_80px_rgba(0,0,0,0.78)] backdrop-blur-2xl"
            style={{
              paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
              paddingRight: "max(1rem, env(safe-area-inset-right))",
            }}
          >
            <header className="flex shrink-0 items-start justify-between gap-4 border-b border-white/10 pb-4">
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-[0.24em] text-orange-300">
                  IronClad
                </p>
                <h2
                  id="mobile-tournament-menu-title"
                  className="mt-1 break-words text-xl font-black text-white"
                >
                  Tournament Menu
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-white/12 bg-white/10 text-zinc-200 shadow-xl shadow-black/25 transition hover:border-orange-300/55 hover:bg-orange-500/15 hover:text-white"
                aria-label="Close tournament menu"
              >
                <X size={20} />
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto pt-5">
              <nav aria-label="Tournament navigation">
                <p className="text-xs font-black uppercase tracking-[0.22em] text-zinc-500">
                  Tournaments
                </p>
                <div className="mt-3 space-y-5">
                  {eventsByMonth.map((group) => (
                    <div key={group.month}>
                      <p className="mb-2 text-[11px] font-black uppercase tracking-[0.22em] text-orange-300">
                        {group.month}
                      </p>
                      <div className="space-y-2">
                        {group.events.map((event) => {
                          const selected = event.id === selectedTournament.id;
                          return (
                            <button
                              key={event.id}
                              type="button"
                              onClick={() => {
                                onSelectTournament(event);
                                onClose();
                              }}
                              className={classNames(
                                "flex min-h-11 w-full min-w-0 items-center gap-3 rounded-lg border px-3 py-3 text-left shadow-lg shadow-black/15 transition",
                                selected
                                  ? "border-orange-400/70 bg-orange-500/15 text-white"
                                  : "border-white/12 bg-white/[0.06] text-zinc-300 hover:border-orange-400/45 hover:bg-orange-500/10 hover:text-white"
                              )}
                            >
                              <CalendarDays
                                size={16}
                                className="shrink-0 text-orange-300"
                              />
                              <span className="min-w-0">
                                <span className="block break-words text-sm font-black">
                                  {event.title}
                                </span>
                                <span className="mt-1 block break-words text-xs text-zinc-500">
                                  {event.format} - {event.status}
                                </span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </nav>
            </div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}

function Hero({
  tournament,
  viewerRegistration,
  verifiedDivision,
  onRegisterClick,
}: {
  tournament: TournamentCard;
  viewerRegistration: TournamentViewerRegistration | null;
  verifiedDivision: RelicVerifiedDivision | null;
  onRegisterClick: () => void;
}) {
  const registrationAvailability = getRegistrationDivisionAvailability(
    tournament,
    verifiedDivision
  );
  const registrationOpen =
    registrationAvailability === "open" ||
    registrationAvailability === "waitlist";
  const divisionLaunched = registrationAvailability === "launched";
  const publicStatus = getPublicTournamentStatus(tournament);
  const registrationIsWaitlistOnly = registrationAvailability === "waitlist";
  const actionLabel = divisionLaunched
    ? "Registration closed — this division has started."
    : registrationOpen
      ? registrationIsWaitlistOnly
      ? "Join Waitlist"
      : "Register"
    : publicStatus;
  const registrationState = viewerRegistration
    ? getViewerRegistrationDisplay(tournament, viewerRegistration)
    : null;
  const terminalTournament = isTournamentTerminalStatus(
    tournament.statusValue
  ) || tournament.statusValue === "completed";

  return (
    <section className="relative overflow-hidden border-b border-orange-500/20 bg-black">
      <motion.div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-55"
        style={{
          backgroundImage: `url(${tournament.image})`,
        }}
        animate={{ backgroundPositionY: ["0%", "100%", "0%"] }}
        transition={{ duration: 36, repeat: Infinity, ease: "easeInOut" }}
      />
      <div className="absolute inset-0 bg-black/68" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.24),rgba(0,0,0,0.92)),linear-gradient(108deg,rgba(0,0,0,0.96),rgba(0,0,0,0.62),rgba(249,115,22,0.16))]" />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[length:64px_64px] opacity-20" />
      <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black to-transparent" />
      <div className="relative z-10 px-5 py-8 lg:px-8 lg:py-10">
        <TournamentTerminalBanner tournament={tournament} />
        <div className="flex flex-col gap-8 xl:flex-row xl:items-start xl:justify-between">
          <ScrollReveal>
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill
                tone={
                  publicStatus === "Open" ||
                  publicStatus === "In Progress"
                    ? "green"
                    : "gray"
                }
              >
                {publicStatus}
              </StatusPill>
              <StatusPill tone="neutral">{tournament.format}</StatusPill>
              <StatusPill tone="amber">{tournament.ruleFormatLabel}</StatusPill>
              <StatusPill tone="gray">{tournament.region}</StatusPill>
            </div>
            <h1 className="mt-5 max-w-4xl text-3xl font-black tracking-tight text-white sm:text-5xl">{tournament.title}</h1>
            <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-zinc-300">
              <span className="flex items-center gap-2">
                <svg
                  aria-hidden="true"
                  className="text-orange-300"
                  fill="none"
                  height={16}
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.8}
                  viewBox="0 0 24 24"
                  width={16}
                >
                  <rect x="2.5" y="4.5" width="11.5" height="8.5" />
                  <circle cx="11.9" cy="10.8" r="0.55" />
                  <path d="M8.25 13v2.15" />
                  <path d="M5.9 15.15h4.7" />
                  <path d="M3.25 18.1h11.2l1.05 2.1H2.2z" />
                  <path d="M5.9 18.7v0.8" />
                  <path d="M8.75 18.55v1.05" />
                  <path d="M11.6 18.7v0.8" />
                  <rect x="17" y="4.5" width="4.4" height="15.7" />
                  <path d="M18.15 6.7h2.1" />
                  <path d="M18.15 8.45h2.1" />
                  <circle cx="19.2" cy="12" r="1.05" />
                  <circle cx="19.2" cy="15" r="0.45" />
                  <path d="M18.05 17.65h0.9" />
                  <path d="M19.75 17.65h0.9" />
                </svg>
                {tournament.game}
              </span>
              <span className="flex items-center gap-2"><CalendarDays size={16} className="text-orange-300" /> {tournament.month} Tournament</span>
              <span className="flex items-center gap-2"><Clock3 size={16} className="text-orange-300" /> {tournament.time}</span>
              <span className="flex items-center gap-2"><Users size={16} className="text-orange-300" /> {tournament.players}/{tournament.maxPlayers} approved slots</span>
            </div>
          </ScrollReveal>
          <div className="w-full max-w-full sm:max-w-sm xl:w-80 xl:flex-none">
            {terminalTournament ? (
              <TournamentReadOnlyCard />
            ) : registrationState ? (
              <RegistrationStateCard state={registrationState} />
            ) : (
              <ActionCard
                label={actionLabel}
                description={
                  divisionLaunched
                    ? "Division in progress"
                    : registrationOpen
                    ? registrationIsWaitlistOnly
                      ? "Waitlist open"
                      : "Open events"
                    : "Check the tournament schedule"
                }
                icon={registrationOpen ? CheckCircle2 : Clock3}
                onClick={onRegisterClick}
                disabled={divisionLaunched}
              />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function TournamentTerminalBanner({
  tournament,
}: {
  tournament: TournamentCard;
}) {
  const message = getTournamentTerminalPublicMessage(tournament.statusValue);

  if (!message) {
    return null;
  }

  return (
    <div
      role="status"
      className="mb-6 border border-amber-300/45 bg-amber-500/10 p-4 shadow-xl shadow-black/20"
    >
      <p className="text-xs font-black uppercase tracking-[0.22em] text-amber-200">
        {tournament.statusValue === "cancelled"
          ? "Cancelled Tournament"
          : "Voided Tournament"}
      </p>
      <p className="mt-2 max-w-4xl text-sm leading-6 text-zinc-100">
        {message}
      </p>
      <p className="mt-2 text-xs font-bold uppercase tracking-wider text-zinc-400">
        Read-only historical record
      </p>
    </div>
  );
}

function TournamentReadOnlyCard() {
  return (
    <div className="min-h-[104px] w-full min-w-0 border border-amber-300/35 bg-black/65 p-4 text-left shadow-xl shadow-black/20 backdrop-blur">
      <Info size={18} className="text-amber-200" />
      <p className="mt-3 break-words text-sm font-black uppercase leading-5 tracking-wider text-white">
        Historical record
      </p>
      <p className="mt-1 break-words text-xs font-semibold leading-5 text-zinc-300">
        Registration and result actions are unavailable for terminal
        tournaments.
      </p>
    </div>
  );
}

export type ViewerRegistrationDisplay = {
  title: string;
  description: string;
  tone: "green" | "amber" | "red" | "neutral";
  icon: ElementType;
  details: string[];
};

function RegistrationStateCard({ state }: { state: ViewerRegistrationDisplay }) {
  const tones = {
    green: "border-emerald-400/45 bg-emerald-500/10 text-emerald-100",
    amber: "border-amber-400/45 bg-amber-500/10 text-amber-100",
    red: "border-red-400/45 bg-red-500/10 text-red-100",
    neutral: "border-white/12 bg-black/45 text-zinc-200",
  };
  const Icon = state.icon;

  return (
    <div
      className={classNames(
        "min-h-[104px] w-full min-w-0 overflow-hidden border p-4 text-left shadow-xl shadow-black/20 backdrop-blur transition hover:border-orange-400/35",
        tones[state.tone]
      )}
    >
      <Icon size={18} className="shrink-0" />
      <p className="mt-3 break-words text-sm font-black uppercase leading-5 tracking-wider text-white">
        {state.title}
      </p>
      <p className="mt-1 break-words text-xs font-semibold leading-5 opacity-90">
        {state.description}
      </p>
      {state.details.length > 0 && (
        <div className="mt-3 space-y-1 text-[11px] font-semibold leading-4 opacity-80">
          {state.details.map((detail) => (
            <p key={detail}>{detail}</p>
          ))}
        </div>
      )}
    </div>
  );
}

export function getViewerRegistrationDisplay(
  tournament: TournamentCard,
  registration: TournamentViewerRegistration
): ViewerRegistrationDisplay {
  const details = [
    `Registration Status: ${formatRegistrationStatus(registration.status)}`,
    registration.bracketName ? `Bracket: ${registration.bracketName}` : null,
    registration.createdAt
      ? `Registration Date: ${new Date(registration.createdAt).toLocaleDateString()}`
      : null,
  ].filter((detail) => detail !== null);

  if (registration.status === "approved") {
    return {
      title: `Registered - ${tournament.title}`,
      description: `You are registered for ${tournament.title}.`,
      tone: "green",
      icon: CheckCircle2,
      details,
    };
  }

  if (registration.status === "waitlisted") {
    const divisionLaunched = tournament.brackets.some(
      (bracket) =>
        bracket.id === registration.tournamentBracketId &&
        Boolean(bracket.launchedAt)
    );

    if (divisionLaunched) {
      return {
        title: "Waitlist Closed",
        description:
          "This division launched before a place became available. Your waitlist registration is now closed.",
        tone: "neutral",
        icon: X,
        details,
      };
    }

    if (
      registration.waitlistOfferStatus === "declined" ||
      registration.waitlistOfferStatus === "expired" ||
      registration.waitlistOfferStatus === "cancelled"
    ) {
      const terminalOfferCopy = {
        declined: {
          title: "Waitlist Offer Declined",
          description:
            "You declined the available place. This waitlist registration is now closed.",
        },
        expired: {
          title: "Waitlist Offer Expired",
          description:
            "The deadline to accept the available place has passed. This waitlist registration is now closed.",
        },
        cancelled: {
          title: "Waitlist Offer Cancelled",
          description:
            "The available place was cancelled. This waitlist registration is now closed.",
        },
      }[registration.waitlistOfferStatus];

      return {
        ...terminalOfferCopy,
        tone: "neutral",
        icon: X,
        details,
      };
    }

    if (registration.waitlistOfferStatus === "accepted") {
      return {
        title: "Waitlist Offer Accepted",
        description:
          "Your accepted place is awaiting tournament administrator review.",
        tone: "neutral",
        icon: Info,
        details,
      };
    }

    const offerAvailable = registration.waitlistOfferStatus === "offered";
    return {
      title: offerAvailable
        ? `Spot Available - ${tournament.title}`
        : `Waitlisted - ${tournament.title}`,
      description: offerAvailable
        ? "A tournament place is available. Open your dashboard before the offer deadline to accept or decline."
        : `You are currently on the waitlist for ${tournament.title}.`,
      tone: "amber",
      icon: Clock3,
      details: [
        ...details,
        registration.waitlistPosition !== null
          ? `Waitlist Position: #${registration.waitlistPosition}`
          : null,
      ].filter((detail) => detail !== null),
    };
  }

  if (registration.status === "rejected") {
    return {
      title: "Registration Not Approved",
      description:
        "This registration was not approved by tournament administration.",
      tone: "red",
      icon: X,
      details,
    };
  }

  if (registration.status === "withdrawn") {
    return {
      title: "Registration Withdrawn",
      description:
        "You withdrew from this tournament. This registration is final and cannot be reopened.",
      tone: "neutral",
      icon: X,
      details,
    };
  }

  if (registration.status === "manual_review") {
    return {
      title: "Registration Under Manual Review",
      description:
        "Tournament administration is reviewing your registration details.",
      tone: "neutral",
      icon: Info,
      details,
    };
  }

  return {
    title: "Registration Submitted - Awaiting Review",
    description:
      "Your tournament registration has been submitted and is awaiting administrator review.",
    tone: "neutral",
    icon: Clock3,
    details,
  };
}

function formatRegistrationStatus(status: TournamentViewerRegistration["status"]) {
  return status
    .replace("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function ActionCard({ label, description, icon: Icon, onClick, disabled = false }: { label: string; description: string; icon: ElementType; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-disabled={disabled} className={classNames("flex min-h-[104px] w-full min-w-0 flex-col justify-start overflow-hidden border p-4 text-left shadow-xl shadow-black/20 backdrop-blur", disabled ? "cursor-not-allowed border-zinc-700 bg-zinc-900/80 text-zinc-500" : classNames("border-white/12 bg-[linear-gradient(145deg,rgba(255,255,255,0.06),rgba(8,8,8,0.86))] hover:bg-orange-500/10", interactiveHover))}>
      <Icon size={18} className={classNames("shrink-0", disabled ? "text-zinc-500" : "text-orange-300")} />
      <p className={classNames("mt-3 break-words text-sm font-black uppercase leading-5 tracking-wider", disabled ? "text-zinc-400" : "text-white")}>{label}</p>
      <p className="mt-1 break-words text-xs font-semibold leading-5 text-zinc-400">{description}</p>
    </button>
  );
}

function TopTabs({ activeTab, setActiveTab }: { activeTab: TabKey; setActiveTab: (tab: TabKey) => void }) {
  return (
    <div className="overflow-visible border-b border-orange-500/20 bg-black/70 px-5 py-2 shadow-xl shadow-black/20 backdrop-blur-xl lg:px-8">
      <div className="flex gap-8 overflow-x-auto overflow-y-visible px-1 py-2">
        {tabs.map((tab) => {
          const selected = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={classNames(
                "relative shrink-0 transform-gpu rounded-md px-1 py-4 text-xs font-black uppercase tracking-wider transition-all duration-300 ease-out hover:scale-[1.04] active:scale-[0.99]",
                selected ? "text-white" : "text-zinc-500 hover:text-zinc-200"
              )}
            >
              {tab.label}
              {selected && <motion.span layoutId="active-tab" className="absolute inset-x-0 bottom-0 h-0.5 bg-orange-500" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Overview({
  tournament,
  tournaments,
  activePanel,
  setActivePanel,
}: {
  tournament: TournamentCard;
  tournaments: TournamentCard[];
  activePanel: OverviewPanelKey;
  setActivePanel: (panel: OverviewPanelKey) => void;
}) {
  const panels = overviewPanels.filter(
    (item) => item.key !== "prizes" || hasPrize(tournament)
  );
  const visiblePanel =
    activePanel === "prizes" && !hasPrize(tournament)
      ? "details"
      : activePanel;

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
      <div className="space-y-6">
        <Card>
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center border border-orange-400/25 bg-orange-500/10 text-orange-300"><Info size={20} /></div>
            <div>
              <h2 className="text-xl font-black text-white">IronClad Company of Heroes 3 Tournaments</h2>
              <p className="mt-2 leading-7 text-zinc-300">{tournament.details}</p>
            </div>
          </div>
        </Card>

        {tournament.mapPools.length > 0 ? (
          <TournamentMapPools pools={tournament.mapPools} />
        ) : null}

        <Card>
          <div className="flex gap-3 overflow-x-auto overflow-y-visible border-b border-slate-800 px-1 py-3">
            {panels.map((item) => (
              <button
                key={item.key}
                onClick={() => setActivePanel(item.key)}
                className={classNames("shrink-0 rounded border px-4 py-2 text-xs font-black uppercase tracking-wide", interactiveHover, visiblePanel === item.key ? "border-orange-500 bg-orange-500/10 text-white" : "border-slate-700 text-zinc-400 hover:text-white")}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="mt-5">{renderOverviewPanel(visiblePanel, tournament)}</div>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <h3 className="text-sm font-black uppercase tracking-wider text-white">Published Tournaments</h3>
          <div className="mt-4 space-y-3">
            {tournaments.map((item) => (
              <TournamentLinkCard key={item.title} item={item} />
            ))}
          </div>
        </Card>
        <Card>
          <h3 className="text-sm font-black uppercase tracking-wider text-white">Tournament Archive</h3>
          <p className="mt-2 text-xs leading-5 text-zinc-400">
            Battlefy remains the historical reference for events held before the new IronClad platform launch.
          </p>
          <div className="mt-4 space-y-3">
            {archiveEvents.map((item) => (
              <a key={item.title} href={item.battlefy} target="_blank" rel="noreferrer" className="group relative block overflow-hidden border border-white/12 bg-cover bg-center p-4 shadow-2xl shadow-black/30 backdrop-blur transition hover:-translate-y-1 hover:border-orange-400/35 before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-orange-300/55 before:opacity-0 before:transition before:content-[''] hover:before:opacity-100" style={{ backgroundImage: `linear-gradient(145deg,rgba(255,255,255,0.06),rgba(8,8,8,0.86)),linear-gradient(135deg,rgba(0,0,0,0.96),rgba(0,0,0,0.9)),url(${item.image})` }}>
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-white">{item.title}</p>
                    {item.description && <p className="mt-1 text-xs leading-5 text-zinc-300">{item.description}</p>}
                    <p className="mt-3 text-xs font-black uppercase tracking-wider text-orange-300">View on Battlefy</p>
                  </div>
                  <MessageCircle size={16} className="mt-1 shrink-0 text-orange-300" />
                </div>
              </a>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function TournamentLinkCard({ item }: { item: TournamentCard }) {
  return (
    <div className={classNames("block p-3", tournamentCardClass)}>
      <div className="flex items-center gap-3">
        <div className="h-12 w-16 shrink-0 bg-cover bg-center" style={{ backgroundImage: `url(${item.image})` }} />
        <div className="min-w-0 flex-1">
          <p className="font-bold text-white">{item.title}</p>
                  <p className="text-xs text-zinc-500">{item.month} - {item.format} - {item.status}</p>
        </div>
      </div>
      <p className="mt-3 text-xs leading-5 text-zinc-400">{item.description}</p>
    </div>
  );
}

function renderOverviewPanel(panel: OverviewPanelKey, tournament: TournamentCard) {
  const shared = "leading-7 text-zinc-300";
  if (panel === "rules") {
    return (
      <div className="space-y-4">
        <Detail label="Tournament Rule Format" value={tournament.ruleFormatLabel} />
        <p className={shared}>{tournament.rules}</p>
      </div>
    );
  }
  if (panel === "prizes") {
    return (
      <div className={classNames("p-5", tournamentInsetCardClass)}>
        <Trophy className="text-amber-300" size={24} />
        <p className="mt-4 text-sm font-black uppercase tracking-wider text-amber-200">
          Prizes
        </p>
        <p className="mt-3 whitespace-pre-line break-words text-lg font-bold leading-8 text-white">
          {tournament.prizePool}
        </p>
      </div>
    );
  }
  if (panel === "schedule") {
    return <Timeline tournament={tournament} />;
  }
  if (panel === "contact") {
    return <div className={shared}>{tournament.contact}</div>;
  }
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Detail label="Event" value={tournament.title} />
      <Detail label="Format" value={tournament.format} />
      <Detail label="Rule Format" value={tournament.ruleFormatLabel} />
      <Detail label="Registration Status" value={getPublicTournamentStatus(tournament)} />
      <Detail label="Registration Opens" value={formatOptionalDateTime(tournament.registrationOpenAt, "When status is Open")} />
      <Detail label="Registration Closes" value={formatOptionalDateTime(tournament.registrationCloseAt, "Until closed by an administrator")} />
      <Detail label="Grand Final" value={formatOptionalDateTime(tournament.grandFinalAt, "Grand Final TBA")} />
      {hasPrize(tournament) && <Detail label="Prize Pool" value={tournament.prizePool} />}
      <Detail label="Approved Participants" value={`${tournament.players} / ${tournament.maxPlayers}`} />
      {tournament.brackets.map((bracket) => (
        <Detail key={bracket.name} label={bracket.name} value={`${bracket.requirement} - active review cohort ${bracket.activeCohortPlayers} / ${bracket.activeCohortSize} - ${bracket.registeredPlayers} approved - ${bracket.waitlistedPlayers} waitlisted`} />
      ))}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className={classNames("p-4", tournamentInsetCardClass)}><p className="text-xs font-black uppercase tracking-wider text-zinc-500">{label}</p><p className="mt-1 break-words font-bold text-zinc-100">{value}</p></div>;
}

function Timeline({ tournament }: { tournament: TournamentCard }) {
  return <div className="space-y-3">{tournament.schedule.map((item, index) => <div key={item} className={classNames("flex items-center gap-3 p-4", tournamentInsetCardClass)}><div className="grid h-8 w-8 shrink-0 place-items-center border border-orange-400/25 bg-orange-500/10 text-xs font-black text-orange-200">{index + 1}</div><span className="break-words font-semibold text-zinc-200">{item}</span></div>)}</div>;
}

function Participants({ tournament }: { tournament: TournamentCard }) {
  const [query, setQuery] = useState("");
  const participantSections = useMemo(
    () =>
      tournament.brackets.map((bracket) => ({
        bracket,
        participants: tournament.participants.filter(
          (participant) => participant.bracketId === bracket.id
        ),
      })).map((section) => ({
        ...section,
        totalCount: section.participants.length,
      })),
    [tournament.brackets, tournament.participants]
  );
  const filteredByBracket = useMemo(() => {
      return participantSections.map((section) => ({
        ...section,
        participants: section.participants.filter((participant) =>
          tournamentParticipantMatchesQuery(participant, query)
        ),
      }));
    },
    [participantSections, query]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-black text-white">{tournament.title} Entries</h2>
          <p className="mt-1 text-sm text-zinc-400">Approved participants separated by their ELO-eligible bracket.</p>
        </div>
        <div className="relative w-full md:w-80">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search entries" className="w-full rounded border border-white/12 bg-black/55 py-2 pl-10 pr-3 text-sm text-white outline-none transition focus:border-orange-400" />
        </div>
      </div>
      {filteredByBracket.map((section) => (
        <ParticipantSection
          key={section.bracket.id}
          title={`${section.bracket.name} Participants`}
          requirement={section.bracket.requirement}
          participants={section.participants}
          totalCount={section.totalCount}
        />
      ))}
    </div>
  );
}

function ParticipantSection({
  title,
  requirement,
  participants,
  totalCount,
}: {
  title: string;
  requirement: string;
  participants: TournamentParticipant[];
  totalCount: number;
}) {
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-black text-white">{title}</h3>
          <p className="mt-1 text-sm text-zinc-500">{requirement}</p>
        </div>
        <StatusPill tone="neutral">
          {totalCount} Approved
        </StatusPill>
      </div>
      <div className={classNames("mt-5", tournamentTableClass)}>
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-black/72 text-xs uppercase tracking-wider text-zinc-500">
            <tr><th className="px-4 py-3">#</th><th className="px-4 py-3">Player</th><th className="px-4 py-3">Country</th><th className="px-4 py-3">ELO</th><th className="px-4 py-3">Status</th></tr>
          </thead>
          <tbody className="divide-y divide-white/10 bg-black/30">
            {participants.map((participant, index) => <tr key={participant.registrationId} className="transition hover:bg-orange-500/12"><td className="px-4 py-3 font-mono text-zinc-400">#{index + 1}</td><td className="px-4 py-3 font-bold text-white">{participant.name}</td><td className="px-4 py-3 text-zinc-300">{formatTournamentParticipantFact(participant.country)}</td><td className="px-4 py-3 text-zinc-300">{formatTournamentParticipantFact(participant.elo)}</td><td className="px-4 py-3"><StatusPill tone="green">Approved</StatusPill></td></tr>)}
            {participants.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-zinc-500">No approved participants in this bracket.</td></tr>}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function AuthenticatedMatchDiceRollOff({
  matchId,
  forceReadOnly = false,
}: {
  matchId: string;
  forceReadOnly?: boolean;
}) {
  const { getToken, isSignedIn } = useAuth();
  const supabase = useMemo(
    () => createAuthenticatedBrowserSupabaseClient(getToken),
    [getToken]
  );
  const loadSnapshot = useCallback(
    async (
      requestedMatchId: string,
      signal?: AbortSignal
    ): Promise<MatchDiceLoadResult> => {
      if (!isSignedIn) {
        return {
          ok: false,
          message: "Sign in to open this private Match workspace.",
        };
      }

      try {
        const request = supabase.rpc("get_match_dice_rolloff", {
          p_match_id: requestedMatchId,
        });
        const { data, error } = await (signal
          ? request.abortSignal(signal)
          : request);

        if (error) {
          return {
            ok: false,
            message: "Dice Roll-Off history is unavailable right now.",
          };
        }

        const snapshot = parseMatchDiceSnapshot(data, requestedMatchId);
        if (!snapshot) {
          return {
            ok: false,
            message: "Dice Roll-Off returned an invalid response.",
          };
        }

        return { ok: true, snapshot };
      } catch {
        return {
          ok: false,
          message: signal?.aborted
            ? "Dice Roll-Off request was cancelled."
            : "Dice Roll-Off history is unavailable right now.",
        };
      }
    },
    [isSignedIn, supabase]
  );

  return (
    <MatchDiceRollOff
      matchId={matchId}
      loadSnapshot={loadSnapshot}
      rollDice={rollMatchDice}
      forceReadOnly={forceReadOnly}
    />
  );
}

function Brackets({
  tournament,
  viewer,
  matchResultSubmissions,
  matchResultReportGroups,
  focusedMatchId,
}: {
  tournament: TournamentCard;
  viewer: TournamentViewer;
  matchResultSubmissions: MatchResultSubmission[];
  matchResultReportGroups: MatchResultReportGroup[];
  focusedMatchId: string | null;
}) {
  const participantsById = new Map(
    tournament.bracketParticipants.map((participant) => [
      participant.registrationId,
      participant,
    ])
  );
  const [selectedAdminMatchId, setSelectedAdminMatchId] =
    useState<string | null>(null);
  const [selectedPlayerMatchId, setSelectedPlayerMatchId] =
    useState<string | null>(null);
  const terminalTournament = isTournamentTerminalStatus(
    tournament.statusValue
  ) || tournament.statusValue === "completed";
  const selectedAdminBracket =
    selectedAdminMatchId === null
      ? null
      : tournament.generatedBrackets.find((generated) =>
          generated.matches.some((match) => match.id === selectedAdminMatchId)
        ) ?? null;
  const selectedAdminMatch =
    selectedAdminBracket === null
      ? null
      : selectedAdminBracket.matches.find(
          (match) => match.id === selectedAdminMatchId
        ) ?? null;

  useEffect(() => {
    if (!focusedMatchId || !window.matchMedia("(min-width: 1024px)").matches) {
      return;
    }

    window.requestAnimationFrame(() => {
      const focusedBracket = tournament.generatedBrackets.find((generated) =>
        generated.matches.some((match) => match.id === focusedMatchId)
      );
      const focusedMatch = focusedBracket?.matches.find(
        (match) => match.id === focusedMatchId
      );
      const viewerOwnsMatch = Boolean(
        focusedMatch &&
          viewer.registrationIds.some(
            (registrationId) =>
              registrationId === focusedMatch.playerOneRegistrationId ||
              registrationId === focusedMatch.playerTwoRegistrationId
          )
      );

      if (
        focusedBracket?.format === "single_elimination" &&
        focusedMatch &&
        focusedMatch.activationVersion > 0 &&
        viewerOwnsMatch
      ) {
        setSelectedPlayerMatchId(focusedMatchId);
      } else if (viewer.isAdmin) {
        setSelectedAdminMatchId(focusedMatchId);
      }
      document
        .getElementById(`match-desktop-${focusedMatchId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [focusedMatchId, tournament.generatedBrackets, viewer]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-black text-white">{tournament.title} Brackets</h2>
          <p className="mt-1 text-sm text-zinc-400">{tournament.brackets.map((bracket) => `${bracket.name}: ${bracket.requirement}`).join(" - ")}</p>
        </div>
        <StatusPill tone={tournament.generatedBrackets.length > 0 ? "green" : "amber"}>
          {tournament.generatedBrackets.length > 0
            ? "Generated"
            : "Awaiting Generation"}
        </StatusPill>
      </div>
      {tournament.brackets.map((bracket) => {
        const generated = tournament.generatedBrackets.find(
          (item) => item.tournamentBracketId === bracket.id
        );
        const approvedCount = tournament.participants.filter(
          (participant) => participant.bracketId === bracket.id
        ).length;
        const champion = generated
          ? getBracketChampion(generated, participantsById)
          : null;
        const completedWithoutChampion = generated
          ? isBracketCompletedWithoutChampion(generated)
          : false;
        const hasVisibleResultHistory = Boolean(
          generated &&
            (matchResultSubmissions.some((submission) =>
              generated.matches.some(
                (match) => match.id === submission.matchId
              )
            ) ||
              matchResultReportGroups.some((reportGroup) =>
                generated.matches.some(
                  (match) => match.id === reportGroup.matchId
                )
              ))
        );
        const hasOwnedMatch = Boolean(
          generated?.matches.some(
            (match) =>
              viewer.registrationIds.includes(
                match.playerOneRegistrationId ?? ""
              ) ||
              viewer.registrationIds.includes(
                match.playerTwoRegistrationId ?? ""
              )
          )
        );
        const canOpenResults = Boolean(
          generated &&
            (hasOwnedMatch || (!viewer.isAdmin && hasVisibleResultHistory))
        );
        return (
          <Card key={bracket.id} className="overflow-visible">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-4">
                  <h3 className="text-lg font-black text-white">
                    {bracket.name}
                  </h3>
                  {generated && canOpenResults && (
                    <BracketMatchResultsWorkspace
                      bracketName={bracket.name}
                      bracketFormat={generated.format}
                      matches={generated.matches}
                      participantsById={participantsById}
                      viewer={viewer}
                      matchResultSubmissions={matchResultSubmissions}
                      matchResultReportGroups={matchResultReportGroups}
                      readOnly={terminalTournament}
                      selectedMatchId={
                        generated.matches.some(
                          (match) => match.id === selectedPlayerMatchId
                        )
                          ? selectedPlayerMatchId
                          : null
                      }
                      onSelectedMatchChange={setSelectedPlayerMatchId}
                    />
                  )}
                </div>
                <p className="mt-1 text-sm text-zinc-400">
                  {generated
                      ? `${formatCompetitionFormat(generated.format)} - ${generated.slotCount} empty player slots`
                      : `${approvedCount} approved - at least 2 required`}
                </p>
              </div>
              {generated && (
                <span className="text-xs uppercase tracking-wider text-zinc-500">
                  Generated {formatDateTime(generated.generatedAt)}
                </span>
              )}
            </div>
            {champion && (
              <ChampionPresentation
                bracketName={bracket.name}
                champion={champion}
              />
            )}
            {completedWithoutChampion && (
              <NoChampionPresentation bracketName={bracket.name} />
            )}
            {!generated ? (
              <p className="mt-6 border border-white/12 p-8 text-center text-zinc-500">
                The empty bracket structure will generate automatically when
                this bracket has at least two approved participants.
              </p>
            ) : generated.format === "round_robin" ? (
              <RoundRobinBracket
                matches={generated.matches}
                standings={generated.standings}
                participantsById={participantsById}
                adminReadOnly={terminalTournament}
                onAdminMatchSelect={
                  viewer.isAdmin
                    ? (match) => setSelectedAdminMatchId(match.id)
                    : undefined
                }
              />
            ) : (
              <SingleEliminationBracket
                matches={generated.matches}
                participantsById={participantsById}
                adminReadOnly={terminalTournament}
                focusedMatchId={focusedMatchId}
                anchorPrefix="match-desktop"
                viewerRegistrationIds={viewer.registrationIds}
                onPlayerMatchSelect={(match) =>
                  setSelectedPlayerMatchId(match.id)
                }
                onAdminMatchSelect={
                  viewer.isAdmin
                    ? (match) => setSelectedAdminMatchId(match.id)
                    : undefined
                }
              />
            )}
          </Card>
        );
      })}
      {viewer.isAdmin && selectedAdminMatch && (
        <AdminMatchManagementModal
          tournament={tournament}
          match={selectedAdminMatch}
          bracketFormat={selectedAdminBracket?.format ?? "single_elimination"}
          participantsById={participantsById}
          viewer={viewer}
          submissions={matchResultSubmissions.filter(
            (submission) => submission.matchId === selectedAdminMatch.id
          )}
          reportGroups={matchResultReportGroups.filter(
            (reportGroup) => reportGroup.matchId === selectedAdminMatch.id
          )}
          readOnly={terminalTournament}
          onClose={() => setSelectedAdminMatchId(null)}
        />
      )}
    </div>
  );
}

export function BracketMatchResultsWorkspace({
  bracketName,
  bracketFormat,
  matches,
  participantsById,
  viewer,
  matchResultSubmissions,
  matchResultReportGroups,
  readOnly = false,
  selectedMatchId = null,
  onSelectedMatchChange,
}: {
  bracketName: string;
  bracketFormat: GeneratedTournamentBracket["format"];
  matches: GeneratedTournamentMatch[];
  participantsById: Map<string, TournamentParticipant>;
  viewer: TournamentViewer;
  matchResultSubmissions: MatchResultSubmission[];
  matchResultReportGroups: MatchResultReportGroup[];
  readOnly?: boolean;
  selectedMatchId?: string | null;
  onSelectedMatchChange?: (matchId: string | null) => void;
}) {
  const [manualOpen, setManualOpen] = useState(false);
  const dialogTitleId = useId();
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  const portalRoot =
    typeof document === "undefined" ? null : document.body;
  const visibleMatches = matches.filter((match) => {
    const canSubmit = viewer.registrationIds.some(
      (registrationId) =>
        registrationId === match.playerOneRegistrationId ||
        registrationId === match.playerTwoRegistrationId
    );
    const hasVisibleSubmission = matchResultSubmissions.some(
      (submission) => submission.matchId === match.id
    );
    const hasVisibleReportGroup = matchResultReportGroups.some(
      (reportGroup) => reportGroup.matchId === match.id
    );
    return (
      canSubmit ||
      hasVisibleSubmission ||
      hasVisibleReportGroup
    );
  });
  const workspaceMatches = selectedMatchId
    ? visibleMatches.filter((match) => match.id === selectedMatchId)
    : visibleMatches;
  const open =
    manualOpen || Boolean(selectedMatchId && workspaceMatches.length === 1);
  const pendingCount = workspaceMatches.reduce(
    (total, match) =>
      total +
      matchResultSubmissions.filter(
        (submission) =>
          submission.matchId === match.id &&
          submission.status === "pending"
      ).length +
      matchResultReportGroups.filter(
        (reportGroup) =>
          reportGroup.matchId === match.id &&
          ["pending_confirmation", "disputed", "under_review"].includes(
            reportGroup.status
          ) &&
          reportGroup.finalizedAt === null
      ).length,
    0
  );

  const closeWorkspace = useCallback(() => {
    setManualOpen(false);
    onSelectedMatchChange?.(null);
  }, [onSelectedMatchChange]);

  useEffect(() => {
    if (!open) return;

    const opener =
      document.activeElement instanceof HTMLElement &&
      document.activeElement !== document.body
        ? document.activeElement
        : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleDialogKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        closeWorkspace();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          "button:not([disabled]), select:not([disabled]), input:not([disabled]), textarea:not([disabled]), a[href], [tabindex]"
        ) ?? []
      ).filter((element) => element.tabIndex >= 0);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleDialogKeyDown);
    closeButtonRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleDialogKeyDown);
      if (opener?.isConnected) opener.focus();
    };
  }, [closeWorkspace, open]);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          onSelectedMatchChange?.(null);
          setManualOpen(true);
        }}
        className="inline-flex items-center gap-2 rounded-xl border border-orange-400/40 bg-orange-500/10 px-4 py-2 text-xs font-black uppercase tracking-wider text-orange-100 transition hover:border-orange-300 hover:bg-orange-500/20 hover:shadow-[0_0_24px_rgba(249,115,22,0.15)]"
      >
        <Swords size={15} />
        Match Results
        {pendingCount > 0 && (
          <span className="grid h-5 min-w-5 place-items-center rounded-full bg-amber-400 px-1 text-[10px] text-black">
            {pendingCount}
          </span>
        )}
      </button>

      {portalRoot &&
        createPortal(
          <AnimatePresence>
            {open && (
              <div className="fixed inset-x-0 top-0 z-[9999] grid h-[100dvh] place-items-center p-2 [padding-bottom:max(0.5rem,env(safe-area-inset-bottom))] [padding-left:max(0.5rem,env(safe-area-inset-left))] [padding-right:max(0.5rem,env(safe-area-inset-right))] [padding-top:max(0.5rem,env(safe-area-inset-top))] sm:p-6">
                <motion.button
                  type="button"
                  aria-label="Close match result workspace"
                  onClick={closeWorkspace}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 h-full w-full cursor-default bg-black/85 backdrop-blur-md"
                />
                <motion.section
                  ref={dialogRef}
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby={dialogTitleId}
                  initial={{ opacity: 0, scale: 0.96, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97, y: 12 }}
                  transition={{ duration: 0.22 }}
                  className="relative flex h-full max-h-full w-full max-w-5xl flex-col overflow-hidden border border-orange-400/30 bg-[radial-gradient(circle_at_top_right,rgba(249,115,22,0.14),transparent_32%),linear-gradient(145deg,rgba(12,12,12,0.98),rgba(0,0,0,0.99))] shadow-[0_0_90px_rgba(0,0,0,0.68)] sm:h-[90dvh]"
                >
                  <header className="relative shrink-0 border-b border-white/10 px-6 py-5 sm:px-8 sm:py-6">
                    <div className="absolute inset-y-0 left-0 w-1 bg-orange-500 shadow-[0_0_24px_rgba(249,115,22,0.9)]" />
                    <div className="flex items-start justify-between gap-5">
                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.3em] text-orange-300">
                          {readOnly
                            ? "Tournament Match History"
                            : "Match Workspace"}
                        </p>
                        <h2
                          id={dialogTitleId}
                          className="mt-2 text-2xl font-black text-white sm:text-3xl"
                        >
                          {bracketName} Match Workspace
                        </h2>
                        <p className="mt-2 text-sm text-zinc-400">
                          {readOnly
                            ? "Review authorized Dice Roll-Off, score, and replay history from this Match record."
                            : bracketFormat === "single_elimination"
                              ? "Complete the private Dice Roll-Off, then use the established Series result and replay controls below."
                              : "Use the established Series result and replay controls below. Dice Roll-Off is unavailable for round-robin Matches."}
                        </p>
                      </div>
                      <button
                        ref={closeButtonRef}
                        type="button"
                        onClick={closeWorkspace}
                        className="shrink-0 rounded-xl border border-white/10 bg-white/5 p-3 text-zinc-300 transition hover:border-orange-400/50 hover:bg-orange-500/10 hover:text-white"
                        aria-label="Close match result workspace"
                      >
                        <X size={20} />
                      </button>
                    </div>
                    <div className="mt-5 flex flex-wrap gap-3 text-xs font-bold uppercase tracking-wider text-zinc-400">
                      <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                        {workspaceMatches.length} matches
                      </span>
                      <span className="rounded-full border border-amber-400/20 bg-amber-500/10 px-3 py-1.5 text-amber-200">
                        {pendingCount} pending reviews
                      </span>
                    </div>
                  </header>

                  <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-8 sm:py-8">
                    <div className="space-y-7">
                      {workspaceMatches.map((match) => {
                        const playerOne = match.playerOneRegistrationId
                          ? participantsById.get(
                              match.playerOneRegistrationId
                            )
                          : null;
                        const playerTwo = match.playerTwoRegistrationId
                          ? participantsById.get(
                              match.playerTwoRegistrationId
                            )
                          : null;
                        return (
                          <article
                            key={match.id}
                            className="border border-white/12 bg-black/45 p-5 shadow-xl shadow-black/20 sm:p-7"
                          >
                            <div className="mb-6 flex flex-col gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <p className="text-xs font-black uppercase tracking-[0.24em] text-orange-300">
                  {match.roundName} - Match{" "}
                                  {match.matchNumber}
                                </p>
                                <h3 className="mt-2 text-xl font-black text-white">
                                  {playerOne?.name ?? "TBD"}{" "}
                                  <span className="px-2 text-orange-300">
                                    vs
                                  </span>{" "}
                                  {playerTwo?.name ?? "TBD"}
                                </h3>
                              </div>
                              <MatchStatus
                                status={
                                  toDisplayMatch(match, participantsById)
                                    .status
                                }
                              />
                            </div>
                            {bracketFormat === "single_elimination" && (
                              <div className="mb-5">
                                <MatchDeadlinePresentation match={match} />
                              </div>
                            )}
                            {bracketFormat === "single_elimination" &&
                              selectedMatchId === match.id &&
                              match.activationVersion > 0 && (
                                <div className="mb-6">
                                  <AuthenticatedMatchDiceRollOff
                                    matchId={match.id}
                                    forceReadOnly={readOnly}
                                  />
                                </div>
                              )}
                            <MatchResultControls
                              match={match}
                              deadlineManaged={
                                bracketFormat === "single_elimination"
                              }
                              participantsById={participantsById}
                              isAdmin={false}
                              canSubmit={
                                !readOnly &&
                                viewer.registrationIds.some(
                                  (registrationId) =>
                                    registrationId ===
                                      match.playerOneRegistrationId ||
                                    registrationId ===
                                      match.playerTwoRegistrationId
                                )
                              }
                              submissions={matchResultSubmissions.filter(
                                (submission) =>
                                  submission.matchId === match.id
                              )}
                              reportGroups={matchResultReportGroups.filter(
                                (reportGroup) =>
                                  reportGroup.matchId === match.id
                              )}
                              presentation="workspace"
                            />
                          </article>
                        );
                      })}
                    </div>
                  </div>
                </motion.section>
              </div>
            )}
          </AnimatePresence>,
          portalRoot
        )}
    </>
  );
}

export function AdminMatchManagementModal({
  tournament,
  match,
  bracketFormat,
  participantsById,
  viewer,
  submissions,
  reportGroups,
  readOnly = false,
  onClose,
}: {
  tournament: TournamentCard;
  match: GeneratedTournamentMatch;
  bracketFormat: GeneratedTournamentBracket["format"];
  participantsById: Map<string, TournamentParticipant>;
  viewer: TournamentViewer;
  submissions: MatchResultSubmission[];
  reportGroups: MatchResultReportGroup[];
  readOnly?: boolean;
  onClose: () => void;
}) {
  const portalRoot =
    typeof document === "undefined" ? null : document.body;
  const displayMatch = toDisplayMatch(match, participantsById);
  const playerOne = match.playerOneRegistrationId
    ? participantsById.get(match.playerOneRegistrationId)
    : null;
  const playerTwo = match.playerTwoRegistrationId
    ? participantsById.get(match.playerTwoRegistrationId)
    : null;
  const activeReportGroup =
    reportGroups.find(
      (reportGroup) =>
        reportGroup.finalizedAt === null &&
        ["pending_confirmation", "disputed", "under_review"].includes(
          reportGroup.status
        )
    ) ?? null;
  const visibleReportGroup = activeReportGroup ?? reportGroups[0] ?? null;
  const hasPendingSubmission = submissions.some(
    (submission) => submission.status === "pending"
  );
  const hasParticipants = Boolean(playerOne && playerTwo);
  const deadlineManaged = bracketFormat === "single_elimination";
  const canEnterOfficialResult =
    !readOnly &&
    hasParticipants &&
    (!deadlineManaged ||
      (match.status === "in_progress" &&
        !(match.holdStartedAt && !match.holdReleasedAt))) &&
    !activeReportGroup &&
    !hasPendingSubmission;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);

  if (!portalRoot) {
    return null;
  }

  return createPortal(
    <AnimatePresence>
      <div className="fixed inset-0 z-[10000] grid place-items-center p-3 sm:p-6">
        <motion.button
          type="button"
          aria-label="Close match management"
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 h-full w-full cursor-default bg-black/85 backdrop-blur-md"
        />
        <motion.section
          role="dialog"
          aria-modal="true"
          aria-labelledby={`admin-match-${match.id}`}
          initial={{ opacity: 0, scale: 0.96, y: 18 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: 12 }}
          transition={{ duration: 0.2 }}
          className="relative flex max-h-[88vh] w-full max-w-5xl min-w-0 flex-col overflow-hidden border border-orange-400/30 bg-[radial-gradient(circle_at_top_right,rgba(249,115,22,0.14),transparent_32%),linear-gradient(145deg,rgba(12,12,12,0.98),rgba(0,0,0,0.99))] shadow-[0_0_90px_rgba(0,0,0,0.68)]"
        >
          <header className="relative shrink-0 border-b border-white/10 px-5 py-5 sm:px-7">
            <div className="absolute inset-y-0 left-0 w-1 bg-orange-500 shadow-[0_0_24px_rgba(249,115,22,0.9)]" />
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-[0.28em] text-orange-300">
                  {readOnly ? "Read-Only Match History" : "Direct Match Management"}
                </p>
                <h2
                  id={`admin-match-${match.id}`}
                  className="mt-2 break-words text-2xl font-black text-white"
                >
                  {tournament.title}
                </h2>
                <p className="mt-2 text-sm text-zinc-400">
                  {match.roundName} - Match {match.matchNumber}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="shrink-0 rounded-xl border border-white/10 bg-white/5 p-3 text-zinc-300 transition hover:border-orange-400/50 hover:bg-orange-500/10 hover:text-white"
                aria-label="Close match management"
              >
                <X size={20} />
              </button>
            </div>
          </header>

          <div
            data-admin-match-scrollport
            className="min-h-0 w-full max-w-full min-w-0 flex-1 overflow-y-auto px-5 py-6 sm:px-7"
          >
            <div
              data-admin-match-overview-grid
              className="grid w-full max-w-full min-w-0 grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_320px]"
            >
              <div className="min-w-0 max-w-full border border-white/12 bg-black/45 p-5 shadow-xl shadow-black/20">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs font-black uppercase tracking-wider text-zinc-400">
                    Match Snapshot
                  </p>
                  <MatchStatus status={displayMatch.status} />
                </div>
                <div className="grid gap-3">
                  <MatchManagementRow
                    label="Player 1"
                    value={playerOne?.name ?? "TBD"}
                    score={match.playerOneScore}
                    winner={
                      match.winnerRegistrationId ===
                      match.playerOneRegistrationId
                    }
                  />
                  <MatchManagementRow
                    label="Player 2"
                    value={playerTwo?.name ?? "TBD"}
                    score={match.playerTwoScore}
                    winner={
                      match.winnerRegistrationId ===
                      match.playerTwoRegistrationId
                    }
                  />
                </div>
              </div>

              <div className="min-w-0 max-w-full border border-white/12 bg-black/45 p-5 text-xs leading-5 text-zinc-300 shadow-xl shadow-black/20">
                <p className="text-xs font-black uppercase tracking-wider text-zinc-400">
                  Review State
                </p>
                <div className="mt-4 space-y-3">
                  <SummaryLine
                    label="Current score"
                    value={
                      match.playerOneScore !== null &&
                      match.playerTwoScore !== null
                        ? `${match.playerOneScore}-${match.playerTwoScore}`
                        : "Not recorded"
                    }
                  />
                  <SummaryLine
                    label="Match status"
                    value={match.status.replaceAll("_", " ")}
                  />
                  <SummaryLine
                    label="Report group"
                    value={
                      visibleReportGroup
                        ? visibleReportGroup.status.replaceAll("_", " ")
                        : "None"
                    }
                  />
                  <SummaryLine
                    label="Replay packages"
                    value={`${reportGroups.reduce(
                      (total, reportGroup) =>
                        total + reportGroup.replayProofs.length,
                      0
                    )} linked`}
                  />
                  <SummaryLine
                    label="Legacy submissions"
                    value={String(submissions.length)}
                  />
                </div>
                <div className="mt-5 space-y-4">
                  {reportGroups.map((reportGroup) => (
                    <ReportGroupReview
                      key={reportGroup.id}
                      reportGroup={reportGroup}
                      match={match}
                      isAdmin={!readOnly && viewer.isAdmin}
                      participantsById={participantsById}
                    />
                  ))}
                  {submissions.length > 0 && (
                    <AdminMatchResultSummaries
                      match={match}
                      submissions={submissions}
                      participantsById={participantsById}
                    />
                  )}
                  {reportGroups.length === 0 && submissions.length === 0 && (
                    <p className="border border-white/12 p-4 text-zinc-500">
                      No player reports or confirmation packages are attached to
                      this match.
                    </p>
                  )}
                </div>
              </div>
            </div>

            {bracketFormat === "single_elimination" &&
              match.activationVersion > 0 && (
                <div className="mt-5 w-full max-w-full min-w-0">
                  <AuthenticatedMatchDiceRollOff
                    matchId={match.id}
                    forceReadOnly
                  />
                </div>
              )}

            {!readOnly && deadlineManaged && (
              <div className="mt-5 w-full max-w-full min-w-0">
                <AdminMatchDeadlineControls match={match} />
              </div>
            )}

            {!readOnly && (
              <div
                data-admin-match-actions-grid
                className="mt-5 grid w-full max-w-full min-w-0 grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2"
              >
              <div className="min-w-0 max-w-full border border-white/12 bg-orange-500/[0.04] p-5 shadow-xl shadow-black/20">
                {canEnterOfficialResult ? (
                  <ResultEntryForm
                    match={match}
                    playerOneName={playerOne?.name ?? "Player 1"}
                    playerTwoName={playerTwo?.name ?? "Player 2"}
                  />
                ) : (
                  <div>
                    <p className="text-xs font-black uppercase tracking-wider text-white">
                      Official Result Entry
                    </p>
                    <p className="mt-3 text-xs leading-5 text-zinc-400">
                      {!hasParticipants
                        ? "Both participants must be assigned before an official result can be entered."
                        : deadlineManaged && match.status !== "in_progress"
                          ? "This match is not currently active for result entry."
                          : deadlineManaged &&
                              match.holdStartedAt &&
                              !match.holdReleasedAt
                            ? "Release the administrative hold before entering an official result."
                        : "Resolve the active review package or pending legacy submission before entering a direct official result."}
                    </p>
                  </div>
                )}
              </div>

              <div className="min-w-0 max-w-full">
                <AdminResetMatchForm match={match} />
              </div>
              </div>
            )}
          </div>
        </motion.section>
      </div>
    </AnimatePresence>,
    portalRoot
  );
}

function MatchManagementRow({
  label,
  value,
  score,
  winner,
}: {
  label: string;
  value: string;
  score: number | null;
  winner: boolean;
}) {
  return (
    <div
      data-admin-match-player-row
      className={classNames(
        "flex w-full max-w-full min-w-0 items-center justify-between gap-4 border px-4 py-3",
        winner
          ? "border-white/12 bg-orange-500/10 text-white"
          : "border-white/12 bg-white/[0.03] text-zinc-300"
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
          {label}
        </p>
        <p
          data-admin-match-player-name
          className="mt-1 whitespace-normal [overflow-wrap:anywhere] text-sm font-black"
        >
          {value}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {winner && <Crown size={16} className="text-orange-300" />}
        <span className="grid h-9 w-10 place-items-center rounded-lg border border-white/10 bg-black/35 font-mono text-sm font-black text-white">
          {score ?? "-"}
        </span>
      </div>
    </div>
  );
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <p className="flex justify-between gap-3">
      <span className="text-zinc-500">{label}</span>
      <span className="text-right font-bold capitalize text-zinc-100">
        {value}
      </span>
    </p>
  );
}

function ChampionPresentation({
  bracketName,
  champion,
}: {
  bracketName: string;
  champion: TournamentParticipant;
}) {
  const sparks = Array.from({ length: 18 }, (_, index) => ({
    left: `${6 + ((index * 17) % 88)}%`,
    delay: (index % 6) * 0.18,
    duration: 2.4 + (index % 4) * 0.35,
  }));

  return (
    <motion.section
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="relative isolate mt-6 overflow-visible border border-white/12 bg-[radial-gradient(circle_at_50%_0%,rgba(251,146,60,0.28),transparent_42%),linear-gradient(135deg,rgba(28,15,8,0.98),rgba(2,6,23,0.98)_62%,rgba(67,20,7,0.92))] px-6 py-9 text-center shadow-[0_0_55px_rgba(249,115,22,0.24),inset_0_1px_0_rgba(255,255,255,0.12)]"
    >
      <div className="pointer-events-none absolute -inset-8 -z-10 bg-[radial-gradient(circle,rgba(249,115,22,0.18),transparent_62%)] blur-xl" />
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {sparks.map((spark, index) => (
          <motion.span
            key={index}
            aria-hidden="true"
            className="absolute bottom-0 h-1.5 w-1.5 rounded-full bg-orange-300 shadow-[0_0_10px_rgba(251,146,60,0.95)]"
            style={{ left: spark.left }}
            animate={{
              y: [10, -150 - (index % 5) * 18],
              x: [0, ((index % 3) - 1) * 34],
              opacity: [0, 1, 0],
              scale: [0.5, 1.2, 0.2],
            }}
            transition={{
              duration: spark.duration,
              delay: spark.delay,
              repeat: Infinity,
              ease: "easeOut",
            }}
          />
        ))}
      </div>

      <motion.div
        animate={{
          filter: [
            "drop-shadow(0 0 8px rgba(251,146,60,0.45))",
            "drop-shadow(0 0 20px rgba(251,146,60,0.9))",
            "drop-shadow(0 0 8px rgba(251,146,60,0.45))",
          ],
        }}
        transition={{ duration: 2.4, repeat: Infinity }}
        className="mx-auto grid h-16 w-16 place-items-center rounded-full border border-orange-300/60 bg-orange-500/15"
      >
        <Crown size={34} className="text-orange-200" />
      </motion.div>

      <p className="mt-5 text-xs font-black uppercase tracking-[0.42em] text-orange-300">
        Tournament Winner
      </p>
      <h3 className="mt-3 break-words text-4xl font-black uppercase tracking-tight text-white drop-shadow-[0_0_18px_rgba(251,146,60,0.5)] sm:text-5xl">
        {champion.name}
      </h3>
      <p className="mt-3 text-sm font-black uppercase tracking-[0.28em] text-orange-100">
        Victorious Commander
      </p>
      <div className="mx-auto mt-5 h-px max-w-md bg-gradient-to-r from-transparent via-orange-300/80 to-transparent" />
      <p className="mt-4 text-xs font-bold uppercase tracking-wider text-zinc-400">
        {bracketName} Champion
      </p>
    </motion.section>
  );
}

function getBracketChampion(
  bracket: GeneratedTournamentBracket,
  participantsById: Map<string, TournamentParticipant>
) {
  if (bracket.matches.length === 0) {
    return null;
  }

  let winnerRegistrationId: string | null = null;

  if (bracket.format === "single_elimination") {
    const finalMatch = bracket.matches
      .slice()
      .sort(
        (left, right) =>
          right.roundNumber - left.roundNumber ||
          right.matchNumber - left.matchNumber
      )[0];

    if (finalMatch?.status !== "completed") {
      return null;
    }

    winnerRegistrationId = finalMatch.winnerRegistrationId;
  } else {
    if (bracket.matches.some((match) => match.status !== "completed")) {
      return null;
    }

    const leader = bracket.standings
      .slice()
      .sort(
        (left, right) =>
          (left.rank ?? Number.MAX_SAFE_INTEGER) -
            (right.rank ?? Number.MAX_SAFE_INTEGER) ||
          right.points - left.points ||
          right.wins - left.wins
      )[0];
    winnerRegistrationId = leader?.registrationId ?? null;
  }

  return winnerRegistrationId
    ? participantsById.get(winnerRegistrationId) ?? null
    : null;
}

function isBracketCompletedWithoutChampion(
  bracket: GeneratedTournamentBracket
) {
  if (bracket.format !== "single_elimination" || bracket.matches.length === 0) {
    return false;
  }

  const finalMatch = bracket.matches
    .slice()
    .sort(
      (left, right) =>
        right.roundNumber - left.roundNumber ||
        right.matchNumber - left.matchNumber
    )[0];

  return (
    finalMatch?.status === "completed" &&
    !finalMatch.winnerRegistrationId &&
    ["deadline_double_forfeit", "empty_feeder"].includes(
      finalMatch.outcomeType ?? ""
    )
  );
}

function NoChampionPresentation({ bracketName }: { bracketName: string }) {
  return (
    <section className="mt-6 border border-zinc-500/30 bg-zinc-500/[0.06] px-5 py-6 text-center">
      <p className="text-xs font-black uppercase tracking-[0.3em] text-zinc-400">
        Division Complete
      </p>
      <h3 className="mt-2 text-xl font-black text-white">
        No champion was awarded
      </h3>
      <p className="mt-2 text-sm leading-6 text-zinc-400">
        {bracketName} ended without an eligible player advancing from the Final.
      </p>
    </section>
  );
}

function SingleEliminationBracket({
  matches,
  participantsById,
  adminReadOnly,
  onAdminMatchSelect,
  onPlayerMatchSelect,
  viewerRegistrationIds,
  focusedMatchId,
  anchorPrefix,
}: {
  matches: GeneratedTournamentMatch[];
  participantsById: Map<string, TournamentParticipant>;
  adminReadOnly: boolean;
  onAdminMatchSelect?: (match: GeneratedTournamentMatch) => void;
  onPlayerMatchSelect?: (match: GeneratedTournamentMatch) => void;
  viewerRegistrationIds: string[];
  focusedMatchId: string | null;
  anchorPrefix: "match-desktop" | "match-mobile";
}) {
  const rounds = Array.from(
    matches.reduce((groups, match) => {
      const group = groups.get(match.roundName) ?? [];
      group.push(match);
      groups.set(match.roundName, group);
      return groups;
    }, new Map<string, GeneratedTournamentMatch[]>())
  )
    .map(([name, roundMatches]) => ({
      name,
      number: roundMatches[0]?.roundNumber ?? 0,
      matches: roundMatches
        .slice()
        .sort((left, right) => left.matchNumber - right.matchNumber),
    }))
    .sort((left, right) => left.number - right.number);
  const liveRound = rounds.find((round) =>
    round.matches.some((match) => match.status === "in_progress")
  );
  const activeRound =
    liveRound ??
    rounds.find((round) =>
      round.matches.some((match) => match.status !== "completed")
    ) ??
    rounds.at(-1);
  const boardHeight = Math.max(
    520,
    (rounds[0]?.matches.length ?? 1) * 150
  );

  return (
    <div className={classNames("relative mt-6 overflow-x-auto p-5", tournamentInsetCardClass)}>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-white/5 pb-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.24em] text-orange-300">
            Live Bracket
          </p>
          <p className="mt-1 text-sm text-zinc-400">
            Winners advance from left to right toward the Grand Final.
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs font-bold uppercase tracking-wider text-zinc-500">
          <span className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-orange-400 shadow-[0_0_10px_rgba(251,146,60,0.8)]" />
            Active Round
          </span>
          <span className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            Completed
          </span>
        </div>
      </div>

      <div
        className="grid min-w-max gap-14"
        style={{
          gridTemplateColumns: `repeat(${rounds.length}, minmax(260px, 280px))`,
        }}
      >
        {rounds.map((round, roundIndex) => {
          const isActive = activeRound?.number === round.number;
          return (
            <motion.section
              key={round.number}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: roundIndex * 0.07 }}
              className="min-w-0"
            >
              <div
                className={classNames(
                  "border px-4 py-3 backdrop-blur",
                  isActive
                    ? "border-white/12 bg-orange-500/10 shadow-xl shadow-black/10"
                    : "border-white/12 bg-black/45 shadow-xl shadow-black/10"
                )}
              >
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-zinc-500">
                  Round {round.number}
                </p>
                <div className="mt-1 flex items-center justify-between gap-3">
                  <h4 className={classNames("font-black", isActive ? "text-orange-200" : "text-white")}>
                    {round.name}
                  </h4>
                  {isActive && <StatusPill tone="amber">Active</StatusPill>}
                </div>
              </div>

              <div
                className="mt-4 flex flex-col justify-around"
                style={{ minHeight: boardHeight }}
              >
                {round.matches.map((match, matchIndex) => (
                  <ModernBracketMatch
                    key={match.id}
                    match={toDisplayMatch(match, participantsById)}
                    deadlineMatch={match}
                    anchorId={`${anchorPrefix}-${match.id}`}
                    focused={focusedMatchId === match.id}
                    isActiveRound={isActive}
                    hasNextRound={roundIndex < rounds.length - 1}
                    connectorDirection={
                      matchIndex % 2 === 0 ? "down" : "up"
                    }
                    adminReadOnly={adminReadOnly}
                    onAdminSelect={
                      onAdminMatchSelect
                        ? () => onAdminMatchSelect(match)
                        : undefined
                    }
                    onPlayerSelect={
                      onPlayerMatchSelect &&
                      match.activationVersion > 0 &&
                      viewerRegistrationIds.some(
                        (registrationId) =>
                          registrationId === match.playerOneRegistrationId ||
                          registrationId === match.playerTwoRegistrationId
                      )
                        ? () => onPlayerMatchSelect(match)
                        : undefined
                    }
                  />
                ))}
              </div>
            </motion.section>
          );
        })}
      </div>
    </div>
  );
}

function ModernBracketMatch({
  match,
  deadlineMatch,
  anchorId,
  focused,
  isActiveRound,
  hasNextRound,
  connectorDirection,
  adminReadOnly,
  onAdminSelect,
  onPlayerSelect,
}: {
  match: Match;
  deadlineMatch: GeneratedTournamentMatch;
  anchorId: string;
  focused: boolean;
  isActiveRound: boolean;
  hasNextRound: boolean;
  connectorDirection: "up" | "down";
  adminReadOnly: boolean;
  onAdminSelect?: () => void;
  onPlayerSelect?: () => void;
}) {
  const card = (
    <div
      id={anchorId}
      className={classNames(
        "overflow-hidden border bg-[linear-gradient(145deg,rgba(255,255,255,0.06),rgba(8,8,8,0.86))] text-left shadow-2xl shadow-black/30 backdrop-blur transition hover:-translate-y-1",
        (onAdminSelect || onPlayerSelect) &&
          "hover:border-orange-300/80",
        focused && "ring-2 ring-orange-300 ring-offset-4 ring-offset-black",
        match.status === "live"
          ? "border-orange-400/80 shadow-[0_0_28px_rgba(249,115,22,0.22)]"
          : match.status === "pending_review"
            ? "border-amber-400/50 shadow-[0_0_22px_rgba(251,191,36,0.12)]"
            : match.status === "complete"
              ? "border-emerald-500/30 shadow-black/30"
              : isActiveRound
                ? "border-orange-500/35 shadow-[0_0_18px_rgba(249,115,22,0.10)]"
                : "border-white/10 shadow-black/30"
      )}
    >
      <div className="flex items-center justify-between border-b border-white/5 bg-white/[0.03] px-3 py-2">
        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">
          Match {match.id}
        </span>
        <div className="flex items-center gap-2">
          {onAdminSelect && (
            <span className="rounded border border-orange-400/25 bg-orange-500/10 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-orange-200">
              {adminReadOnly ? "Inspect" : "Manage"}
            </span>
          )}
          {onPlayerSelect && (
            <span className="rounded border border-orange-300/40 bg-orange-500/15 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-orange-100">
              Your Match
            </span>
          )}
          <MatchStatus status={match.status} />
        </div>
      </div>
      <BroadcastTeamRow team={match.teamA} />
      <BroadcastTeamRow team={match.teamB} />
      <MatchDeadlinePresentation match={deadlineMatch} compact />
    </div>
  );

  return (
    <motion.div
      whileHover={{ y: -4 }}
      transition={{ duration: 0.2 }}
      className="relative my-3"
    >
      {hasNextRound && (
        <>
          <span className="pointer-events-none absolute left-full top-1/2 h-px w-7 bg-gradient-to-r from-orange-400/70 to-slate-600" />
          <span
            className={classNames(
              "pointer-events-none absolute left-[calc(100%+1.75rem)] w-px bg-slate-600",
              connectorDirection === "down"
                ? "top-1/2 h-[calc(50%+2.2rem)]"
                : "bottom-1/2 h-[calc(50%+2.2rem)]"
            )}
          />
          <span className="pointer-events-none absolute left-[calc(100%+1.75rem)] top-1/2 h-px w-7 bg-slate-600" />
        </>
      )}
      {onAdminSelect ? (
        <button
          type="button"
          onClick={onAdminSelect}
          className="block w-full text-left"
        >
          {card}
        </button>
      ) : (
        card
      )}
      {onPlayerSelect && (
        <button
          type="button"
          onClick={onPlayerSelect}
          className="mt-2 flex min-h-12 w-full items-center justify-center gap-2 border border-orange-400/45 bg-orange-500/10 px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-orange-100 transition hover:border-orange-300 hover:bg-orange-500/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300"
        >
          <Swords size={15} aria-hidden="true" />
          Open Match
        </button>
      )}
    </motion.div>
  );
}

function MatchStatus({ status }: { status: Match["status"] }) {
  const styles = {
    upcoming: "text-zinc-400",
    live: "text-orange-300",
    pending_review: "text-amber-300",
    complete: "text-emerald-300",
  };

  return (
    <span className={classNames("flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em]", styles[status])}>
      <span
        className={classNames(
          "h-1.5 w-1.5 rounded-full",
          status === "live"
            ? "animate-pulse bg-orange-400 shadow-[0_0_9px_rgba(251,146,60,0.9)]"
            : status === "pending_review"
              ? "bg-amber-400 shadow-[0_0_9px_rgba(251,191,36,0.7)]"
            : status === "complete"
              ? "bg-emerald-400"
              : "bg-slate-600"
        )}
      />
      {status === "complete"
        ? "Completed"
        : status === "pending_review"
          ? "Pending Review"
          : status}
    </span>
  );
}

export function MatchDeadlinePresentation({
  match,
  compact = false,
}: {
  match: GeneratedTournamentMatch;
  compact?: boolean;
}) {
  const [now, setNow] = useState<number | null>(null);
  const holdActive = Boolean(match.holdStartedAt && !match.holdReleasedAt);
  const extensionAppliesToCurrentActivation = timestampFallsInActivation(
    match.extendedAt,
    match.activatedAt
  );
  const deadlineTimestamp = match.deadlineAt
    ? new Date(match.deadlineAt).getTime()
    : null;
  const overdue =
    match.status === "in_progress" &&
    deadlineTimestamp !== null &&
    Number.isFinite(deadlineTimestamp) &&
    now !== null &&
    now >= deadlineTimestamp;
  let label: ReactNode = null;
  let tone = "border-white/10 bg-black/25 text-zinc-400";

  useEffect(() => {
    if (match.status !== "in_progress" || holdActive) return;

    const updateNow = () => setNow(Date.now());
    const initialTimer = window.setTimeout(updateNow, 0);
    const interval = window.setInterval(updateNow, 30_000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(interval);
    };
  }, [holdActive, match.status]);

  if (match.outcomeType === "deadline_double_forfeit") {
    label = formatDoubleForfeitLabel(match.roundName);
    tone = "border-red-400/25 bg-red-500/10 text-red-200";
  } else if (match.outcomeType === "automatic_bye") {
    label = formatAutomaticAdvanceLabel(match.roundName);
    tone = "border-sky-400/25 bg-sky-500/10 text-sky-200";
  } else if (match.outcomeType === "empty_feeder") {
    label = formatEmptyFeederLabel(match.roundName);
    tone = "border-zinc-400/20 bg-zinc-500/10 text-zinc-300";
  } else if (holdActive) {
    label = "Deadline paused by an administrator";
    tone = "border-amber-400/25 bg-amber-500/10 text-amber-100";
  } else if (match.status === "pending_review") {
    label = "Result or ruling under review — deadline enforcement is paused";
    tone = "border-amber-400/25 bg-amber-500/10 text-amber-100";
  } else if (overdue) {
    label = "Deadline passed — awaiting authoritative ruling";
    tone = "border-red-400/25 bg-red-500/10 text-red-200";
  } else if (match.status === "in_progress" && match.deadlineAt) {
    label = (
      <>
        Deadline{" "}
        <HydrationSafeLocalDateTime
          value={match.deadlineAt}
          fallback="unavailable"
        />
      </>
    );
    tone = "border-orange-400/25 bg-orange-500/10 text-orange-100";
  } else if (
    match.status === "scheduled" &&
    Boolean(match.playerOneRegistrationId) !== Boolean(match.playerTwoRegistrationId)
  ) {
    label = "Waiting for opponent — your deadline has not started";
    tone = "border-sky-400/20 bg-sky-500/[0.08] text-sky-200";
  }

  if (!label) return null;

  return (
    <div
      data-match-deadline-state
      className={classNames(
        "border font-bold leading-5",
        compact ? "mx-3 mb-3 px-3 py-2 text-[10px]" : "p-4 text-xs",
        tone
      )}
    >
      <p>{label}</p>
      {match.extensionMinutes &&
        match.deadlineAt &&
        !holdActive &&
        extensionAppliesToCurrentActivation && (
        <p className="mt-1 opacity-80">
          Includes a {formatMatchDuration(match.extensionMinutes)} extension.
        </p>
      )}
    </div>
  );
}

function formatMatchDuration(minutes: number) {
  if (minutes % 60 !== 0) return `${minutes} minutes`;
  const hours = minutes / 60;
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}

function timestampFallsInActivation(
  eventAt: string | null,
  activatedAt: string | null
) {
  if (!eventAt || !activatedAt) return false;

  const eventTimestamp = new Date(eventAt).getTime();
  const activationTimestamp = new Date(activatedAt).getTime();
  return (
    Number.isFinite(eventTimestamp) &&
    Number.isFinite(activationTimestamp) &&
    eventTimestamp >= activationTimestamp
  );
}

function formatDoubleForfeitLabel(roundName: string) {
  const normalized = roundName.trim().toLowerCase();
  if (normalized === "final" || normalized === "grand final") {
    return "Final double forfeit — division completed without a champion";
  }
  if (normalized.includes("semi")) {
    return "Semifinal double forfeit — no player advances from this matchup";
  }
  return "Quarterfinal double forfeit — no player advances from this feeder";
}

function formatAutomaticAdvanceLabel(roundName: string) {
  const normalized = roundName.trim().toLowerCase();
  if (normalized === "final" || normalized === "grand final") {
    return "Final walkover — champion advanced without a played match";
  }
  if (normalized.includes("semi")) {
    return "Semifinal automatic bye — sole eligible player advances to the Final";
  }
  return "Automatic bye — sole eligible player advances without a played match";
}

function formatEmptyFeederLabel(roundName: string) {
  const normalized = roundName.trim().toLowerCase();
  if (normalized === "final" || normalized === "grand final") {
    return "Final closed — division completed without a champion";
  }
  if (normalized.includes("semi")) {
    return "Semifinal closed — no eligible player advances";
  }
  return "Match closed — no eligible player advances";
}

function BroadcastTeamRow({ team }: { team: MatchTeam }) {
  return (
    <div
      className={classNames(
        "flex items-center gap-3 border-b border-white/5 px-3 py-3 last:border-b-0",
        team.winner
          ? "bg-gradient-to-r from-orange-500/15 to-transparent"
          : "bg-transparent"
      )}
    >
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-white/10 bg-black/40 font-mono text-[10px] text-zinc-500">
        {team.seed > 0 ? team.seed : "—"}
      </span>
      <span
        className={classNames(
          "min-w-0 flex-1 truncate text-sm",
          team.winner ? "font-black text-white" : "font-bold text-zinc-300"
        )}
      >
        {team.name}
      </span>
      {team.winner && (
        <Crown size={14} className="shrink-0 text-orange-300" />
      )}
      <span
        className={classNames(
          "grid h-8 w-8 place-items-center rounded-md border font-mono text-sm font-black",
          team.winner
            ? "border-orange-400/40 bg-orange-500/15 text-orange-200"
            : "border-white/10 bg-black/40 text-white"
        )}
      >
        {team.score ?? "-"}
      </span>
    </div>
  );
}

function RoundRobinBracket({
  matches,
  standings,
  participantsById,
  adminReadOnly,
  onAdminMatchSelect,
}: {
  matches: GeneratedTournamentMatch[];
  standings: TournamentCard["generatedBrackets"][number]["standings"];
  participantsById: Map<string, TournamentParticipant>;
  adminReadOnly: boolean;
  onAdminMatchSelect?: (match: GeneratedTournamentMatch) => void;
}) {
  return (
    <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_340px]">
      <div className="grid gap-4 md:grid-cols-2">
        {matches.map((match) => (
          <MatchCard
            key={match.id}
            match={toDisplayMatch(match, participantsById)}
            adminReadOnly={adminReadOnly}
            onAdminSelect={
              onAdminMatchSelect ? () => onAdminMatchSelect(match) : undefined
            }
          />
        ))}
      </div>
      <div className={classNames("p-4", tournamentInsetCardClass)}>
        <h4 className="font-black text-white">Standings</h4>
        <div className="mt-4 space-y-2">
          {standings
            .slice()
            .sort(
              (left, right) =>
                (left.rank ?? Number.MAX_SAFE_INTEGER) -
                (right.rank ?? Number.MAX_SAFE_INTEGER)
            )
            .map((standing, index) => (
              <div
                key={standing.registrationId}
                className={classNames("grid grid-cols-[32px_1fr_auto] gap-3 p-3 text-sm", tournamentInsetCardClass)}
              >
                <span className="font-mono text-zinc-500">
                  {standing.rank ?? index + 1}
                </span>
                <span className="font-bold text-white">
                  {participantsById.get(standing.registrationId)?.name ??
                    "Participant"}
                </span>
                <span className="text-zinc-400">
                      {standing.wins}W {standing.losses}L - {standing.points} pts
                </span>
              </div>
            ))}
          {standings.length === 0 && (
            <p className="border border-white/12 p-4 text-sm text-zinc-500">
              Standings will appear after admins assign players and results are recorded.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function toDisplayMatch(
  match: GeneratedTournamentMatch,
  participantsById: Map<string, TournamentParticipant>
): Match {
  return {
    id: String(match.matchNumber),
    round: match.roundName,
    status:
      match.status === "completed"
        ? "complete"
        : match.status === "pending_review"
          ? "pending_review"
        : match.status === "in_progress"
          ? "live"
          : "upcoming",
    teamA: toMatchTeam(
      match.playerOneRegistrationId,
      match.playerOneSlot,
      match.playerOneScore,
      match.winnerRegistrationId,
      participantsById
    ),
    teamB: toMatchTeam(
      match.playerTwoRegistrationId,
      match.playerTwoSlot,
      match.playerTwoScore,
      match.winnerRegistrationId,
      participantsById
    ),
  };
}

function toMatchTeam(
  registrationId: string | null,
  slotNumber: number | null,
  score: number | null,
  winnerRegistrationId: string | null,
  participantsById: Map<string, TournamentParticipant>
): MatchTeam {
  const participant = registrationId
    ? participantsById.get(registrationId)
    : null;

  return {
    seed: slotNumber ?? 0,
    name: participant?.name ?? (slotNumber ? `Slot ${slotNumber}` : "TBD"),
    score: score ?? undefined,
    winner: Boolean(
      registrationId && registrationId === winnerRegistrationId
    ),
  };
}

function formatCompetitionFormat(
  value: "single_elimination" | "round_robin"
) {
  return value === "single_elimination"
    ? "Single Elimination"
    : "Round Robin";
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

function formatOptionalDateTime(
  value: string | null | undefined,
  fallback: string
) {
  if (!value) return fallback;

  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? formatDateTime(value) : fallback;
}

function hasPrize(tournament: TournamentCard) {
  return tournament.prizePool.trim().length > 0;
}

function MatchCard({
  match,
  adminReadOnly,
  onAdminSelect,
}: {
  match: Match;
  adminReadOnly: boolean;
  onAdminSelect?: () => void;
}) {
  const card = (
    <div
      className={classNames(
        "overflow-hidden border bg-[linear-gradient(145deg,rgba(255,255,255,0.06),rgba(8,8,8,0.86))] text-left shadow-2xl shadow-black/30 backdrop-blur transition hover:-translate-y-1",
        onAdminSelect && "cursor-pointer transition hover:border-orange-300/80",
        match.status === "live"
          ? "border-orange-400/70 shadow-[0_0_24px_rgba(249,115,22,0.18)]"
          : match.status === "complete"
            ? "border-emerald-500/25"
            : "border-white/10"
      )}
    >
      <div className="flex items-center justify-between border-b border-white/5 bg-white/[0.03] px-3 py-2">
        <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-500">Match {match.id}</span>
        <div className="flex items-center gap-2">
          {onAdminSelect && (
            <span className="rounded border border-orange-400/25 bg-orange-500/10 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-orange-200">
              {adminReadOnly ? "Inspect" : "Manage"}
            </span>
          )}
          <MatchStatus status={match.status} />
        </div>
      </div>
      <TeamRow team={match.teamA} />
      <TeamRow team={match.teamB} />
    </div>
  );

  return (
    <motion.div
      whileHover={{ y: -4 }}
      className=""
    >
      {onAdminSelect ? (
        <button
          type="button"
          onClick={onAdminSelect}
          className="block w-full text-left"
        >
          {card}
        </button>
      ) : (
        card
      )}
    </motion.div>
  );
}

function TeamRow({ team }: { team: MatchTeam }) {
  return <div className={classNames("flex items-center gap-2 border-b border-white/5 px-3 py-3 text-sm last:border-0", team.winner ? "bg-orange-500/10 text-white" : "text-zinc-300")}><span className="w-7 font-mono text-xs text-zinc-500">{team.seed > 0 ? `#${team.seed}` : "—"}</span><span className={classNames("min-w-0 flex-1 truncate", team.winner && "font-bold text-orange-100")}>{team.name}</span><span className="grid h-7 w-8 place-items-center rounded border border-white/10 bg-black/40 font-mono text-xs text-white">{team.score ?? "-"}</span></div>;
}

function Media({ tournament }: { tournament: TournamentCard }) {
  const links = [
    tournament.rulesUrl
      ? { label: "Official Rules", url: tournament.rulesUrl }
      : null,
    tournament.battlefyUrl
      ? { label: "Battlefy Event", url: tournament.battlefyUrl }
      : null,
  ].filter((link) => link !== null);

  return <Card><h2 className="text-xl font-black text-white">{tournament.title} Resources</h2>{links.length > 0 ? <div className="mt-5 grid gap-4 md:grid-cols-2">{links.map((link) => <a key={link.label} href={link.url} target="_blank" rel="noreferrer" className="group relative aspect-video overflow-hidden border border-white/12 bg-cover bg-center p-4 shadow-2xl shadow-black/30 backdrop-blur transition hover:-translate-y-1 hover:border-orange-400/35 before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-orange-300/55 before:opacity-0 before:transition before:content-[''] hover:before:opacity-100" style={{ backgroundImage: `linear-gradient(145deg,rgba(255,255,255,0.06),rgba(8,8,8,0.86)),linear-gradient(135deg,rgba(0,0,0,0.96),rgba(0,0,0,0.9)),url(${tournament.image})` }}><PlayCircle className="text-white opacity-90" /><p className="mt-20 text-sm font-bold text-white">{link.label}</p><p className="text-xs text-zinc-300">Open tournament resource</p></a>)}</div> : <p className="mt-5 border border-white/12 p-8 text-center text-zinc-500">No tournament resources have been published.</p>}</Card>;
}

function Announcements({ tournament }: { tournament: TournamentCard }) {
  const messages = [
    `${tournament.title} is currently ${tournament.status.toLowerCase()}.`,
    `Grand Final: ${formatOptionalDateTime(tournament.grandFinalAt, "TBA")}.`,
    `${tournament.players} approved participants are currently listed across ${tournament.brackets.length} bracket${tournament.brackets.length === 1 ? "" : "s"}. Full brackets and brackets with an existing queue accept waitlist registrations while registration remains open.`,
  ];
  return <div className="space-y-4">{messages.map((text, index) => <Card key={text}><div className="flex gap-3"><Radio size={18} className="mt-1 text-orange-300" /><div><p className="text-xs font-black uppercase tracking-wider text-zinc-500">IronClad Update {index + 1}</p><p className="mt-1 text-zinc-200">{text}</p></div></div></Card>)}</div>;
}

function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={classNames("p-5", tournamentCardClass, className)}>{children}</section>;
}

type RegistrationStep =
  | "tournament"
  | "profile"
  | "agreements"
  | "submitted";

export type RelicVerifiedDivision =
  | "Academy"
  | "Challenge"
  | "Main / Pro";

const MISSING_VERIFIED_DIVISION_MESSAGE =
  "Verify your ELO from the Profile page before registering.";

export function getVerifiedDivisionBracketName(
  verifiedDivision: RelicVerifiedDivision | null
) {
  if (!verifiedDivision) {
    return "";
  }

  return getTournamentBracketDisplayName(
    verifiedDivision === "Main / Pro" ? "Main" : verifiedDivision
  );
}

export function isVerifiedDivisionBracket(
  bracketName: string,
  verifiedDivision: RelicVerifiedDivision | null
) {
  const verifiedBracketName =
    getVerifiedDivisionBracketName(verifiedDivision);
  return verifiedBracketName.length > 0 && bracketName === verifiedBracketName;
}

export function isRegistrationWaitlistOnlyForDivision(
  tournament: TournamentCard,
  verifiedDivision: RelicVerifiedDivision | null
) {
  const verifiedBracketName = getVerifiedDivisionBracketName(verifiedDivision);
  const verifiedBracket = tournament.brackets.find(
    (bracket) => bracket.name === verifiedBracketName
  );

  return (
    verifiedBracket?.isWaitlistOnly ??
    tournament.brackets.every((bracket) => bracket.isWaitlistOnly)
  );
}

export type RegistrationDivisionAvailability =
  | "open"
  | "waitlist"
  | "launched"
  | "closed";

export function getRegistrationDivisionAvailability(
  tournament: TournamentCard,
  verifiedDivision: RelicVerifiedDivision | null,
  now = Date.now()
): RegistrationDivisionAvailability {
  const verifiedBracketName = getVerifiedDivisionBracketName(verifiedDivision);
  const verifiedBracket = tournament.brackets.find(
    (bracket) => bracket.name === verifiedBracketName
  );

  if (verifiedBracket?.launchedAt) {
    return "launched";
  }

  if (
    !verifiedDivision &&
    tournament.brackets.length > 0 &&
    tournament.brackets.every((bracket) => bracket.launchedAt !== null)
  ) {
    return "launched";
  }

  if (
    !isTournamentRegistrationOpen(tournament, now) ||
    (verifiedDivision !== null && !verifiedBracket)
  ) {
    return "closed";
  }

  return isRegistrationWaitlistOnlyForDivision(tournament, verifiedDivision)
    ? "waitlist"
    : "open";
}

type RegistrationFormState = {
  tournamentTitle: string;
  bracketName: string;
  rulebookAgreement: boolean;
  playerParticipationAgreement: boolean;
  adminFinalDecisionAgreement: boolean;
  ownershipConfirmation: boolean;
};

type RegistrationErrors = Partial<
  Record<keyof RegistrationFormState | "agreements", string>
>;

type RegistrationPlayerProfile = Pick<
  PlayerProfile,
  | "display_name"
  | "in_game_name"
  | "discord_username"
  | "steam_username"
  | "country"
  | "region"
  | "timezone"
  | "profile_completed"
>;

export function RegisterModal({
  onClose,
  profile,
  tournaments,
  initialTournamentId,
  verifiedDivision,
}: {
  onClose: () => void;
  profile: RegistrationPlayerProfile;
  tournaments: TournamentCard[];
  initialTournamentId: string;
  verifiedDivision: RelicVerifiedDivision | null;
}) {
  const router = useRouter();
  const initialTournament =
    tournaments.find((tournament) => tournament.id === initialTournamentId) ??
    tournaments[0];
  const getVerifiedBracket = (tournament: TournamentCard) => {
    const verifiedBracketName =
      getVerifiedDivisionBracketName(verifiedDivision);
    return tournament.brackets.some(
      (bracket) => bracket.name === verifiedBracketName
    )
      ? verifiedBracketName
      : "";
  };
  const [step, setStep] = useState<RegistrationStep>("tournament");
  const [errors, setErrors] = useState<RegistrationErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState("");
  const [waitlistConfirmationRequired, setWaitlistConfirmationRequired] =
    useState(false);
  const [successMessage, setSuccessMessage] = useState("Registration submitted.");
  const [selectedTournament, setSelectedTournament] =
    useState<TournamentCard>(initialTournament);
  const [form, setForm] = useState<RegistrationFormState>({
    tournamentTitle: initialTournament.title,
    bracketName: getVerifiedBracket(initialTournament),
    rulebookAgreement: false,
    playerParticipationAgreement: false,
    adminFinalDecisionAgreement: false,
    ownershipConfirmation: false,
  });

  const updateField = <K extends keyof RegistrationFormState>(field: K, value: RegistrationFormState[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const selectBracket = (bracketName: string) => {
    const bracket = selectedTournament.brackets.find(
      (candidate) => candidate.name === bracketName
    );

    if (
      !isVerifiedDivisionBracket(bracketName, verifiedDivision) ||
      !bracket ||
      bracket.launchedAt !== null
    ) {
      return;
    }

    updateField("bracketName", bracketName);
  };

  const selectTournament = (event: TournamentCard) => {
    setSelectedTournament(event);
    setWaitlistConfirmationRequired(false);
    setSubmissionError("");
    setForm((current) => ({
      ...current,
      tournamentTitle: event.title,
      bracketName: getVerifiedBracket(event),
    }));
    setErrors((current) => ({ ...current, tournamentTitle: undefined, bracketName: undefined }));
  };

  const validateStep = (targetStep: RegistrationStep) => {
    const nextErrors: RegistrationErrors = {};

    if (targetStep === "tournament") {
      const availability = getRegistrationDivisionAvailability(
        selectedTournament,
        verifiedDivision
      );

      if (availability === "launched") {
        nextErrors.tournamentTitle =
          "Registration closed — this division has started.";
      } else if (availability === "closed") {
        nextErrors.tournamentTitle =
          "Registration is not currently available for this division.";
      } else if (!form.tournamentTitle.trim()) {
        nextErrors.tournamentTitle = "Please select a tournament.";
      }

      const selectedBracket = selectedTournament.brackets.find(
        (bracket) => bracket.name === form.bracketName
      );

      if (!verifiedDivision) {
        nextErrors.bracketName = MISSING_VERIFIED_DIVISION_MESSAGE;
      } else if (
        !form.bracketName.trim() ||
        !selectedBracket ||
        !isVerifiedDivisionBracket(form.bracketName, verifiedDivision)
      ) {
        nextErrors.bracketName =
          "Your verified division is not available for this tournament.";
      }
    }

    if (targetStep === "agreements") {
      if (!form.rulebookAgreement) {
        nextErrors.rulebookAgreement = "You must agree to the Rulebook.";
      }

      if (!form.playerParticipationAgreement) {
        nextErrors.playerParticipationAgreement = "You must agree to the Player Participation Agreement.";
      }

      if (!form.adminFinalDecisionAgreement) {
        nextErrors.adminFinalDecisionAgreement = "You must agree that admin decisions are final.";
      }

      if (!form.ownershipConfirmation) {
        nextErrors.ownershipConfirmation = "You must confirm account/profile ownership.";
      }
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const goToProfileStep = () => {
    if (validateStep("tournament")) {
      setStep("profile");
    }
  };

  const goToAgreementsStep = () => {
    if (validateStep("profile")) {
      setStep("agreements");
    }
  };

  const submitRegistration = async () => {
    const registrationAvailability = getRegistrationDivisionAvailability(
      selectedTournament,
      verifiedDivision
    );

    if (
      registrationAvailability === "closed" ||
      registrationAvailability === "launched"
    ) {
      setSubmissionError(
        registrationAvailability === "launched"
          ? "Registration closed — this division has started."
          : "Registration is not currently available for this division."
      );
      setStep("tournament");
      return;
    }

    if (!validateStep("tournament")) {
      setStep("tournament");
      return;
    }

    if (!validateStep("profile")) {
      setStep("profile");
      return;
    }

    if (!validateStep("agreements")) {
      return;
    }

    setIsSubmitting(true);
    setSubmissionError("");

    const result = await submitTournamentRegistration({
      tournamentId: selectedTournament.id,
      bracketId:
        selectedTournament.brackets.find(
          (bracket) => bracket.name === form.bracketName
        )?.id ?? "",
      tournamentTitle: form.tournamentTitle,
      bracketName: form.bracketName,
      rulebookAgreement: form.rulebookAgreement,
      playerParticipationAgreement: form.playerParticipationAgreement,
      adminFinalDecisionAgreement: form.adminFinalDecisionAgreement,
      ownershipConfirmation: form.ownershipConfirmation,
      waitlistConfirmed:
        registrationAvailability === "waitlist" ||
        waitlistConfirmationRequired,
    });

    setIsSubmitting(false);

    if (!result.success) {
      setSubmissionError(result.message);
      if (result.requiresWaitlistConfirmation) {
        setWaitlistConfirmationRequired(true);
      }
      return;
    }

    router.refresh();
    setStep("submitted");
    setSuccessMessage(result.message);
  };

  const steps: RegistrationStep[] = [
    "tournament",
    "profile",
    "agreements",
    "submitted",
  ];
  const currentStepNumber = Math.max(1, steps.indexOf(step) + 1);
  const verifiedBracketAvailable = selectedTournament.brackets.some((bracket) =>
    isVerifiedDivisionBracket(bracket.name, verifiedDivision)
  );
  const registrationAvailability = getRegistrationDivisionAvailability(
    selectedTournament,
    verifiedDivision
  );
  const waitlistSubmission =
    registrationAvailability === "waitlist" || waitlistConfirmationRequired;

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/85 px-4 py-6">
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto border border-orange-500/25 bg-[linear-gradient(145deg,rgba(12,12,12,0.98),rgba(0,0,0,0.99))] shadow-2xl shadow-black/50">
        <div className="sticky top-0 z-10 border-b border-white/10 bg-black/90 p-5 backdrop-blur">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-orange-300">IronClad Registration</p>
              <h3 className="mt-1 break-words text-2xl font-black text-white">Esports Player Registration</h3>
            </div>
            <button onClick={onClose} className="shrink-0 rounded bg-slate-800 p-2 text-zinc-200 transition hover:bg-slate-700">
              <X size={18} />
            </button>
          </div>

          <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-orange-500 transition-all duration-300" style={{ width: `${Math.min((currentStepNumber / steps.length) * 100, 100)}%` }} />
          </div>
        </div>

        <div className="p-5">
          {step === "tournament" && (
            <div className="space-y-5">
              <div>
                <h4 className="text-xl font-black text-white">Tournament Selection</h4>
                <p className="mt-2 text-sm leading-6 text-zinc-300">Select the tournament and bracket/event type you want to join.</p>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {tournaments.map((event) => {
                  const selected = selectedTournament.title === event.title;
                  const registrationAvailable =
                    getRegistrationDivisionAvailability(
                      event,
                      verifiedDivision
                    ) === "open" ||
                    getRegistrationDivisionAvailability(
                      event,
                      verifiedDivision
                    ) === "waitlist";
                  return (
                    <button
                      key={event.title}
                      disabled={!registrationAvailable}
                      onClick={() => selectTournament(event)}
                      className={classNames("relative overflow-hidden border bg-cover bg-center p-4 text-left shadow-2xl shadow-black/30 backdrop-blur transition hover:-translate-y-1 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0 before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-orange-300/55 before:opacity-0 before:transition before:content-[''] hover:before:opacity-100", selected ? "border-orange-500 shadow-[0_0_24px_rgba(249,115,22,0.24)]" : "border-white/12 hover:border-orange-400/35")}
                      style={{ backgroundImage: `linear-gradient(145deg,rgba(255,255,255,0.06),rgba(8,8,8,0.86)),linear-gradient(135deg,rgba(0,0,0,0.96),rgba(0,0,0,0.9)),url(${event.image})` }}
                    >
                      <p className="break-words text-lg font-black text-white">{event.title}</p>
                      <p className="mt-2 text-xs font-bold uppercase tracking-wider text-orange-300">{event.month} - {event.format} - {event.status}</p>
                      <p className="mt-3 break-words text-sm leading-6 text-zinc-300">{event.description}</p>
                      {!registrationAvailable && (
                        <p className="mt-3 text-xs font-black uppercase tracking-wider text-red-300">
                          Registration unavailable
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
              {errors.tournamentTitle && <FieldError message={errors.tournamentTitle} />}

              <div className={classNames("p-4", tournamentInsetCardClass)}>
                <div className="grid gap-4 md:grid-cols-[180px_1fr]">
                  <div className="h-32 bg-cover bg-center" style={{ backgroundImage: `linear-gradient(135deg,rgba(0,0,0,0.25),rgba(0,0,0,0.55)),url(${selectedTournament.image})` }} />
                  <div className="min-w-0">
                    <h5 className="break-words text-lg font-black text-white">{selectedTournament.title}</h5>
                    <div className="mt-3 grid gap-2 text-sm text-zinc-300 sm:grid-cols-2">
                      <p><span className="font-bold text-zinc-500">Format:</span> {selectedTournament.format}</p>
                      <p><span className="font-bold text-zinc-500">Rule Format:</span> {selectedTournament.ruleFormatLabel}</p>
                      <p><span className="font-bold text-zinc-500">Status:</span> {selectedTournament.status}</p>
                      {hasPrize(selectedTournament) && (
                        <p><span className="font-bold text-zinc-500">Prize Pool:</span> {selectedTournament.prizePool}</p>
                      )}
                      <p><span className="font-bold text-zinc-500">Grand Final:</span> {formatOptionalDateTime(selectedTournament.grandFinalAt, "TBA")}</p>
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {selectedTournament.brackets.map((bracket) => {
                    const selectable = isVerifiedDivisionBracket(
                      bracket.name,
                      verifiedDivision
                    ) && bracket.launchedAt === null;
                    const selected = form.bracketName === bracket.name;
                    return (
                      <button
                        type="button"
                        key={bracket.name}
                        disabled={!selectable}
                        aria-disabled={!selectable}
                        aria-pressed={selected}
                        onClick={() => selectBracket(bracket.name)}
                        className={classNames(
                          "border p-4 text-left shadow-xl shadow-black/20 transition-all duration-300 hover:scale-[1.02]",
                          !selectable
                            ? "cursor-not-allowed border-zinc-800 bg-zinc-950/70 opacity-45 grayscale hover:scale-100"
                            : selected
                            ? "border-orange-500 bg-orange-500/10"
                            : "border-white/12 bg-black/45 hover:border-orange-500/70"
                        )}
                      >
                        <p
                          className={classNames(
                            "break-words font-black",
                            selectable ? "text-white" : "text-zinc-500"
                          )}
                        >
                          {bracket.name}
                        </p>
                        <p className="mt-1 break-words text-xs text-zinc-400">
                          {bracket.requirement} - active review cohort {bracket.activeCohortPlayers}/{bracket.activeCohortSize} - {bracket.waitlistedPlayers} waitlisted
                        </p>
                        <p
                          className={classNames(
                            "mt-2 break-words text-sm font-bold",
                            selectable ? "text-orange-300" : "text-zinc-600"
                          )}
                        >
                          {bracket.isWaitlistOnly
                            ? bracket.isFull
                              ? "Active review cohort full - waitlist only"
                              : "Waitlist active - queued registrations first"
                            : bracket.prize}
                        </p>
                        {bracket.isWaitlistOnly && (
                          <p className="mt-2 text-xs font-black uppercase tracking-wider text-amber-300">
                            Waitlist Only
                          </p>
                        )}
                        {bracket.launchedAt && (
                          <p className="mt-2 text-xs font-black uppercase tracking-wider text-zinc-400">
                            Registration closed — this division has started.
                          </p>
                        )}
                        <p
                          className={classNames(
                            "mt-2 text-xs font-black uppercase tracking-wider",
                            selectable ? "text-emerald-300" : "text-zinc-600"
                          )}
                        >
                          {selectable
                            ? "Your verified division"
                            : "Unavailable for your verified division"}
                        </p>
                      </button>
                    );
                  })}
                </div>
                {!verifiedDivision && (
                  <div
                    role="alert"
                    className="mt-4 border border-orange-500/40 bg-orange-500/10 p-4"
                  >
                    <p className="text-sm font-bold text-orange-200">
                      {MISSING_VERIFIED_DIVISION_MESSAGE}
                    </p>
                    <Link
                      href="/profile"
                      className="mt-3 inline-flex text-sm font-bold text-orange-300 transition hover:text-orange-200"
                    >
                      Open Profile
                    </Link>
                  </div>
                )}
                <p className="mt-3 text-sm leading-6 text-zinc-400">
                  Your verified profile division determines the selectable
                  bracket. On submission, IronClad still performs one fresh
                  Relic 1v1 ELO lookup, and the server accepts only the division
                  that matches that fresh result.
                </p>
                {errors.bracketName && <FieldError message={errors.bracketName} />}
              </div>

              <ModalButtons
                onClose={onClose}
                onNext={goToProfileStep}
                isDisabled={
                  !verifiedBracketAvailable ||
                  registrationAvailability === "closed" ||
                  registrationAvailability === "launched"
                }
              />
            </div>
          )}

          {step === "profile" && (
            <div className="space-y-5">
              <div>
                <h4 className="text-xl font-black text-white">Player Profile Confirmation</h4>
                <p className="mt-2 text-sm leading-6 text-zinc-300">Registration uses your saved IronClad player profile. Update your profile before continuing if any information is outdated.</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <RegistrationProfileValue label="Display Name" value={profile.display_name} />
                <RegistrationProfileValue label="IGN" value={profile.in_game_name} />
                <RegistrationProfileValue label="Discord" value={profile.discord_username} />
                <RegistrationProfileValue label="Steam" value={profile.steam_username} />
                <RegistrationProfileValue label="Country" value={profile.country} />
                <RegistrationProfileValue label="Region" value={profile.region} />
                <RegistrationProfileValue label="Timezone" value={profile.timezone} />
                <RegistrationProfileValue
                  label="Intended Division"
                  value={form.bracketName || "Not selected"}
                />
              </div>

              <div className="border border-emerald-500/40 bg-emerald-950/25 p-4">
                <p className="text-sm font-black uppercase tracking-wider text-emerald-300">Fresh Relic 1v1 Verification</p>
                <p className="mt-2 text-sm leading-6 text-zinc-200">
                  Submitting securely loads your connected Steam identity and
                  checks your current Relic 1v1 ELO. The server calculates your
                  division, verifies it matches your intended division, and
                  saves the tournament ELO snapshot. Saved profile ELO and
                  earlier profile checks are not used for eligibility.
                </p>
              </div>

              <Link href="/profile" className="inline-flex text-sm font-bold text-orange-300 transition hover:text-orange-200">Update Player Profile</Link>

              <ModalButtons onBack={() => setStep("tournament")} onNext={goToAgreementsStep} />
            </div>
          )}

          {step === "agreements" && (
            <div className="space-y-5">
              <div>
                <h4 className="text-xl font-black text-white">Rules & Agreements</h4>
                <p className="mt-2 text-sm leading-6 text-zinc-300">Confirm all required agreements before submitting your registration.</p>
              </div>

              <div className="space-y-3">
                <AgreementCheckbox label="Rulebook Agreement" checked={form.rulebookAgreement} onChange={(checked) => updateField("rulebookAgreement", checked)} error={errors.rulebookAgreement} />
                <AgreementCheckbox label="Player Participation Agreement" checked={form.playerParticipationAgreement} onChange={(checked) => updateField("playerParticipationAgreement", checked)} error={errors.playerParticipationAgreement} />
                <AgreementCheckbox label="Admin Final Decision Agreement" checked={form.adminFinalDecisionAgreement} onChange={(checked) => updateField("adminFinalDecisionAgreement", checked)} error={errors.adminFinalDecisionAgreement} />
                <AgreementCheckbox label="Ownership Confirmation" checked={form.ownershipConfirmation} onChange={(checked) => updateField("ownershipConfirmation", checked)} error={errors.ownershipConfirmation} />
              </div>

              {waitlistSubmission && (
                <div
                  role="alert"
                  className="border border-amber-400/45 bg-amber-500/10 p-4"
                >
                  <p className="text-sm font-black uppercase tracking-wider text-amber-200">
                    Join Waitlist
                  </p>
                  <p className="mt-2 text-sm leading-6 text-amber-100">
                    {WAITLIST_DISCLOSURE_MESSAGE}
                  </p>
                </div>
              )}

              {submissionError && (
                <div className="whitespace-pre-line border border-orange-500/50 bg-orange-500/10 p-4 text-sm font-bold text-orange-200">
                  {submissionError}
                </div>
              )}

              <ModalButtons onBack={() => setStep("profile")} onNext={submitRegistration} nextLabel={waitlistSubmission ? "Join Waitlist" : "Submit Registration"} isLoading={isSubmitting} />
            </div>
          )}

          {step === "submitted" && (
            <div className="grid place-items-center py-10 text-center">
              <div className="grid h-16 w-16 place-items-center rounded-full border border-emerald-400/70 bg-emerald-950/40 shadow-[0_0_32px_rgba(16,185,129,0.35)]">
                <CheckCircle2 className="text-emerald-300" size={30} />
              </div>
              <h4 className="mt-5 text-2xl font-black text-white">Registration Submitted</h4>
              <p className="mt-2 text-sm font-bold uppercase tracking-wider text-emerald-300">{successMessage}</p>
              <p className="mt-3 max-w-md text-sm leading-6 text-zinc-300">Registrations are reviewed within 24 hours.</p>
              <button onClick={onClose} className="mt-6 rounded bg-orange-500 px-5 py-3 text-xs font-black uppercase tracking-wide text-white transition hover:bg-orange-400">Close</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;

  return <p className="mt-2 break-words text-xs font-bold text-orange-300">{message}</p>;
}

function RegistrationProfileValue({
  label,
  value,
  className,
}: {
  label: string;
  value: string | null;
  className?: string;
}) {
  return (
    <div className={classNames("min-w-0 p-4", tournamentInsetCardClass, className)}>
      <p className="text-xs font-black uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="mt-2 break-words text-sm font-bold text-white">{value || "N/A"}</p>
    </div>
  );
}

function AgreementCheckbox({ label, checked, onChange, error }: { label: string; checked: boolean; onChange: (checked: boolean) => void; error?: string }) {
  return (
    <div>
      <label className={classNames("flex cursor-pointer items-start gap-3 border bg-black/45 p-4 transition hover:border-orange-500/70 hover:bg-orange-500/10", error ? "border-orange-400/80" : "border-white/12")}>
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          className="mt-1 h-4 w-4 shrink-0 accent-orange-500"
          aria-invalid={Boolean(error)}
        />
        <span className="break-words text-sm font-bold text-zinc-200">{label}</span>
      </label>
      <FieldError message={error} />
    </div>
  );
}

function ModalButtons({ onClose, onBack, onNext, nextLabel = "Continue", isLoading = false, isDisabled = false }: { onClose?: () => void; onBack?: () => void; onNext: () => void | Promise<void>; nextLabel?: string; isLoading?: boolean; isDisabled?: boolean }) {
  return (
    <div className="flex flex-col-reverse gap-3 border-t border-slate-800 pt-5 sm:flex-row sm:justify-between">
      <div>
        {onBack && <button onClick={onBack} className="w-full rounded border border-slate-700 px-5 py-3 text-xs font-black uppercase tracking-wide text-zinc-300 transition hover:border-slate-500 hover:text-white sm:w-auto">Back</button>}
        {onClose && <button onClick={onClose} className="w-full rounded border border-slate-700 px-5 py-3 text-xs font-black uppercase tracking-wide text-zinc-300 transition hover:border-slate-500 hover:text-white sm:w-auto">Cancel</button>}
      </div>
      <button disabled={isLoading || isDisabled} onClick={onNext} className="w-full rounded bg-orange-500 px-5 py-3 text-xs font-black uppercase tracking-wide text-white transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto">{isLoading ? "Submitting..." : nextLabel}</button>
    </div>
  );
}

function MobileCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={classNames(
        "w-full max-w-full min-w-0 p-4",
        tournamentCardClass,
        className
      )}
    >
      {children}
    </section>
  );
}

function MobileHero({
  tournament,
  viewerRegistration,
  verifiedDivision,
  onRegisterClick,
}: {
  tournament: TournamentCard;
  viewerRegistration: TournamentViewerRegistration | null;
  verifiedDivision: RelicVerifiedDivision | null;
  onRegisterClick: () => void;
}) {
  const registrationAvailability = getRegistrationDivisionAvailability(
    tournament,
    verifiedDivision
  );
  const registrationOpen =
    registrationAvailability === "open" ||
    registrationAvailability === "waitlist";
  const divisionLaunched = registrationAvailability === "launched";
  const publicStatus = getPublicTournamentStatus(tournament);
  const registrationIsWaitlistOnly = registrationAvailability === "waitlist";
  const actionLabel = divisionLaunched
    ? "Registration closed — this division has started."
    : registrationOpen
      ? registrationIsWaitlistOnly
      ? "Join Waitlist"
      : "Register"
    : publicStatus;
  const registrationState = viewerRegistration
    ? getViewerRegistrationDisplay(tournament, viewerRegistration)
    : null;
  const terminalTournament = isTournamentTerminalStatus(
    tournament.statusValue
  ) || tournament.statusValue === "completed";
  const metadata = [
    {
      icon: null,
      label: tournament.game,
    },
    {
      icon: CalendarDays,
      label: `${tournament.month} Tournament`,
    },
    {
      icon: Clock3,
      label: tournament.time,
    },
    {
      icon: Users,
      label: `${tournament.players}/${tournament.maxPlayers} approved slots`,
    },
  ];

  return (
    <section className="relative isolate w-full max-w-full min-w-0 overflow-hidden border-b border-orange-500/20 bg-black px-4 pb-6 pt-6 sm:px-5">
      <motion.div
        className="absolute inset-0 -z-10 bg-cover bg-center bg-no-repeat opacity-45"
        style={{
          backgroundImage: `url(${tournament.image})`,
        }}
        animate={{ backgroundPositionY: ["0%", "100%", "0%"] }}
        transition={{ duration: 36, repeat: Infinity, ease: "easeInOut" }}
      />
      <div className="absolute inset-0 -z-10 bg-black/72" />
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(0,0,0,0.28),rgba(0,0,0,0.94)),linear-gradient(128deg,rgba(0,0,0,0.92),rgba(0,0,0,0.64),rgba(249,115,22,0.18))]" />

      <div className="space-y-5">
        <TournamentTerminalBanner tournament={tournament} />
        <div className="flex max-w-full flex-wrap items-center gap-2">
          <StatusPill
            tone={
              publicStatus === "Open" || publicStatus === "In Progress"
                ? "green"
                : "gray"
            }
          >
            {publicStatus}
          </StatusPill>
          <StatusPill tone="neutral">{tournament.format}</StatusPill>
          <StatusPill tone="amber">{tournament.ruleFormatLabel}</StatusPill>
          <StatusPill tone="gray">{tournament.region}</StatusPill>
        </div>

        <div>
          <h1 className="max-w-full break-words text-3xl font-black leading-tight tracking-tight text-white">
            {tournament.title}
          </h1>
          <div className="mt-4 grid gap-3 text-sm text-zinc-300">
            {metadata.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.label}
                  className="flex min-w-0 items-start gap-2"
                >
                  {Icon ? (
                    <Icon size={16} className="mt-0.5 shrink-0 text-orange-300" />
                  ) : (
                    <svg
                      aria-hidden="true"
                      className="mt-0.5 shrink-0 text-orange-300"
                      fill="none"
                      height={16}
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.8}
                      viewBox="0 0 24 24"
                      width={16}
                    >
                      <rect x="2.5" y="4.5" width="11.5" height="8.5" />
                      <circle cx="11.9" cy="10.8" r="0.55" />
                      <path d="M8.25 13v2.15" />
                      <path d="M5.9 15.15h4.7" />
                      <path d="M3.25 18.1h11.2l1.05 2.1H2.2z" />
                      <path d="M5.9 18.7v0.8" />
                      <path d="M8.75 18.55v1.05" />
                      <path d="M11.6 18.7v0.8" />
                      <rect x="17" y="4.5" width="4.4" height="15.7" />
                      <path d="M18.15 6.7h2.1" />
                      <path d="M18.15 8.45h2.1" />
                      <circle cx="19.2" cy="12" r="1.05" />
                      <circle cx="19.2" cy="15" r="0.45" />
                      <path d="M18.05 17.65h0.9" />
                      <path d="M19.75 17.65h0.9" />
                    </svg>
                  )}
                  <span className="min-w-0 break-words">{item.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="w-full max-w-full min-w-0">
          {terminalTournament ? (
            <TournamentReadOnlyCard />
          ) : registrationState ? (
            <RegistrationStateCard state={registrationState} />
          ) : (
            <ActionCard
              label={actionLabel}
              description={
                divisionLaunched
                  ? "Division in progress"
                  : registrationOpen
                  ? registrationIsWaitlistOnly
                    ? "Waitlist open"
                    : "Open events"
                  : "Check the tournament schedule"
              }
              icon={registrationOpen ? CheckCircle2 : Clock3}
              onClick={onRegisterClick}
              disabled={divisionLaunched}
            />
          )}
        </div>
      </div>
    </section>
  );
}

function MobileTournamentMenuButton({ onClick }: { onClick: () => void }) {
  return (
    <div className="w-full max-w-full min-w-0 px-4 py-4 sm:px-5">
      <button
        type="button"
        onClick={onClick}
        className="flex min-h-11 w-full max-w-full min-w-0 items-center justify-between gap-3 rounded-xl border border-orange-300/35 bg-black/70 px-4 py-3 text-left text-sm font-black uppercase tracking-wide text-orange-100 shadow-[0_14px_40px_rgba(0,0,0,0.38),0_0_22px_rgba(249,115,22,0.18)] backdrop-blur-xl transition hover:border-orange-200/70 hover:bg-orange-500/20 hover:text-white"
      >
        <span className="flex min-w-0 items-center gap-3">
          <CalendarDays size={18} className="shrink-0 text-orange-300" />
          <span className="min-w-0 break-words">Tournament Menu</span>
        </span>
        <ChevronDown size={17} className="-rotate-90 shrink-0 text-orange-300" />
      </button>
    </div>
  );
}

function MobileTabs({
  activeTab,
  setActiveTab,
}: {
  activeTab: TabKey;
  setActiveTab: (tab: TabKey) => void;
}) {
  return (
    <nav
      aria-label="Tournament sections"
      className="w-full max-w-full min-w-0 border-y border-orange-500/20 bg-black/72 px-4 py-3 shadow-xl shadow-black/20 backdrop-blur-xl sm:px-5"
    >
      <div className="grid w-full max-w-full min-w-0 grid-cols-3 gap-2">
        {tabs.map((tab) => {
          const selected = activeTab === tab.key;
          const Icon = tab.icon;
          const spanClass = "col-span-1";
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={classNames(
                spanClass,
                "flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-lg border px-1.5 py-2 text-center text-[10px] font-black uppercase leading-tight tracking-[0.04em] transition",
                selected
                  ? "border-orange-400/70 bg-orange-500/15 text-white"
                  : "border-white/12 bg-black/45 text-zinc-400 hover:border-orange-400/45 hover:text-white"
              )}
            >
              <Icon size={15} className="shrink-0 text-orange-300" />
              <span className="min-w-0 max-w-full break-words">
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function MobileOverview({
  tournament,
  tournaments,
  activePanel,
  setActivePanel,
}: {
  tournament: TournamentCard;
  tournaments: TournamentCard[];
  activePanel: OverviewPanelKey;
  setActivePanel: (panel: OverviewPanelKey) => void;
}) {
  const panels = overviewPanels.filter(
    (item) => item.key !== "prizes" || hasPrize(tournament)
  );
  const visiblePanel =
    activePanel === "prizes" && !hasPrize(tournament)
      ? "details"
      : activePanel;
  const panelGridClass =
    panels.length === 5
      ? "grid-cols-6"
      : panels.length === 4
        ? "grid-cols-2"
        : "grid-cols-3";

  return (
    <div className="space-y-5">
      <MobileCard>
        <div className="flex min-w-0 items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center border border-orange-400/25 bg-orange-500/10 text-orange-300">
            <Info size={20} />
          </div>
          <div className="min-w-0">
            <h2 className="break-words text-xl font-black text-white">
              IronClad Company of Heroes 3 Tournaments
            </h2>
            <p className="mt-2 break-words leading-7 text-zinc-300">
              {tournament.details}
            </p>
          </div>
        </div>
      </MobileCard>

      {tournament.mapPools.length > 0 ? (
        <TournamentMapPools pools={tournament.mapPools} />
      ) : null}

      <MobileCard>
        <div
          className={classNames(
            "grid w-full max-w-full min-w-0 gap-2 border-b border-slate-800 pb-3",
            panelGridClass
          )}
        >
          {panels.map((item, index) => {
            const spanClass =
              panels.length === 5
                ? index < 3
                  ? "col-span-2"
                  : "col-span-3"
                : "";
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setActivePanel(item.key)}
                className={classNames(
                  spanClass,
                  "min-h-11 min-w-0 rounded border px-2 py-2 text-center text-[11px] font-black uppercase leading-tight tracking-wide transition",
                  visiblePanel === item.key
                    ? "border-orange-500 bg-orange-500/10 text-white"
                    : "border-slate-700 text-zinc-400 hover:text-white"
                )}
              >
                <span className="block min-w-0 break-words">
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-5">{renderMobileOverviewPanel(visiblePanel, tournament)}</div>
      </MobileCard>

      <MobileCard>
        <h3 className="text-sm font-black uppercase tracking-wider text-white">
          Published Tournaments
        </h3>
        <div className="mt-4 space-y-3">
          {tournaments.map((item) => (
            <MobileTournamentLinkCard key={item.title} item={item} />
          ))}
        </div>
      </MobileCard>

      <MobileCard>
        <h3 className="text-sm font-black uppercase tracking-wider text-white">
          Tournament Archive
        </h3>
        <p className="mt-2 break-words text-xs leading-5 text-zinc-400">
          Battlefy remains the historical reference for events held before the
          new IronClad platform launch.
        </p>
        <div className="mt-4 space-y-3">
          {archiveEvents.map((item) => (
            <a
              key={item.title}
              href={item.battlefy}
              target="_blank"
              rel="noreferrer"
              className="group relative block w-full max-w-full overflow-hidden border border-white/12 bg-cover bg-center p-4 shadow-2xl shadow-black/30 backdrop-blur transition hover:border-orange-400/35"
              style={{
                backgroundImage: `linear-gradient(145deg,rgba(255,255,255,0.06),rgba(8,8,8,0.86)),linear-gradient(135deg,rgba(0,0,0,0.96),rgba(0,0,0,0.9)),url(${item.image})`,
              }}
            >
              <div className="flex min-w-0 items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="break-words font-bold text-white">{item.title}</p>
                  {item.description && (
                    <p className="mt-1 break-words text-xs leading-5 text-zinc-300">
                      {item.description}
                    </p>
                  )}
                  <p className="mt-3 text-xs font-black uppercase tracking-wider text-orange-300">
                    View on Battlefy
                  </p>
                </div>
                <MessageCircle size={16} className="mt-1 shrink-0 text-orange-300" />
              </div>
            </a>
          ))}
        </div>
      </MobileCard>
    </div>
  );
}

function MobileTournamentLinkCard({ item }: { item: TournamentCard }) {
  return (
    <div className={classNames("w-full max-w-full min-w-0 p-3", tournamentInsetCardClass)}>
      <div className="flex min-w-0 items-center gap-3">
        <div
          className="h-12 w-16 shrink-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${item.image})` }}
        />
        <div className="min-w-0 flex-1">
          <p className="break-words font-bold text-white">{item.title}</p>
          <p className="break-words text-xs text-zinc-500">
            {item.month} - {item.format} - {item.status}
          </p>
        </div>
      </div>
      <p className="mt-3 break-words text-xs leading-5 text-zinc-400">
        {item.description}
      </p>
    </div>
  );
}

function renderMobileOverviewPanel(
  panel: OverviewPanelKey,
  tournament: TournamentCard
) {
  const shared = "break-words leading-7 text-zinc-300";

  if (panel === "rules") {
    return (
      <div className="space-y-4">
        <MobileDetail
          label="Tournament Rule Format"
          value={tournament.ruleFormatLabel}
        />
        <p className={shared}>{tournament.rules}</p>
      </div>
    );
  }

  if (panel === "prizes") {
    return (
      <div className={classNames("w-full max-w-full min-w-0 p-5", tournamentInsetCardClass)}>
        <Trophy className="text-amber-300" size={24} />
        <p className="mt-4 text-sm font-black uppercase tracking-wider text-amber-200">
          Prizes
        </p>
        <p className="mt-3 whitespace-pre-line break-words text-lg font-bold leading-8 text-white">
          {tournament.prizePool}
        </p>
      </div>
    );
  }

  if (panel === "schedule") {
    return (
      <div className="space-y-3">
        {tournament.schedule.map((item, index) => (
          <div
            key={item}
            className={classNames("flex min-w-0 items-start gap-3 p-4", tournamentInsetCardClass)}
          >
            <div className="grid h-8 w-8 shrink-0 place-items-center border border-orange-400/25 bg-orange-500/10 text-xs font-black text-orange-200">
              {index + 1}
            </div>
            <span className="min-w-0 break-words font-semibold text-zinc-200">
              {item}
            </span>
          </div>
        ))}
      </div>
    );
  }

  if (panel === "contact") {
    return <div className={shared}>{tournament.contact}</div>;
  }

  return (
    <div className="grid gap-3">
      <MobileDetail label="Event" value={tournament.title} />
      <MobileDetail label="Format" value={tournament.format} />
      <MobileDetail label="Rule Format" value={tournament.ruleFormatLabel} />
      <MobileDetail
        label="Registration Status"
        value={getPublicTournamentStatus(tournament)}
      />
      <MobileDetail
        label="Registration Opens"
        value={formatOptionalDateTime(
          tournament.registrationOpenAt,
          "When status is Open"
        )}
      />
      <MobileDetail
        label="Registration Closes"
        value={formatOptionalDateTime(
          tournament.registrationCloseAt,
          "Until closed by an administrator"
        )}
      />
      <MobileDetail
        label="Grand Final"
        value={formatOptionalDateTime(
          tournament.grandFinalAt,
          "Grand Final TBA"
        )}
      />
      {hasPrize(tournament) && (
        <MobileDetail label="Prize Pool" value={tournament.prizePool} />
      )}
      <MobileDetail
        label="Approved Participants"
        value={`${tournament.players} / ${tournament.maxPlayers}`}
      />
      {tournament.brackets.map((bracket) => (
        <MobileDetail
          key={bracket.name}
          label={bracket.name}
          value={`${bracket.requirement} - active review cohort ${bracket.activeCohortPlayers} / ${bracket.activeCohortSize} - ${bracket.registeredPlayers} approved - ${bracket.waitlistedPlayers} waitlisted`}
        />
      ))}
    </div>
  );
}

function MobileDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className={classNames("w-full max-w-full min-w-0 p-4", tournamentInsetCardClass)}>
      <p className="break-words text-xs font-black uppercase tracking-wider text-zinc-500">
        {label}
      </p>
      <p className="mt-1 break-words font-bold text-zinc-100">{value}</p>
    </div>
  );
}

function MobileParticipants({ tournament }: { tournament: TournamentCard }) {
  const [query, setQuery] = useState("");
  const participantSections = useMemo(
    () =>
      tournament.brackets
        .map((bracket) => ({
          bracket,
          participants: tournament.participants.filter(
            (participant) => participant.bracketId === bracket.id
          ),
        }))
        .map((section) => ({
          ...section,
          totalCount: section.participants.length,
        })),
    [tournament.brackets, tournament.participants]
  );
  const filteredByBracket = useMemo(() => {
    return participantSections.map((section) => ({
      ...section,
      participants: section.participants.filter((participant) =>
        tournamentParticipantMatchesQuery(participant, query)
      ),
    }));
  }, [participantSections, query]);

  return (
    <div className="space-y-5">
      <div className="space-y-4">
        <div>
          <h2 className="break-words text-xl font-black text-white">
            {tournament.title} Entries
          </h2>
          <p className="mt-1 break-words text-sm text-zinc-400">
            Approved participants separated by their ELO-eligible bracket.
          </p>
        </div>
        <div className="relative w-full max-w-full">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search entries"
            className="min-h-11 w-full rounded border border-white/12 bg-black/55 py-2.5 pl-10 pr-3 text-sm text-white outline-none transition focus:border-orange-400"
          />
        </div>
      </div>

      {filteredByBracket.map((section) => (
        <MobileParticipantSection
          key={section.bracket.id}
          title={`${section.bracket.name} Participants`}
          requirement={section.bracket.requirement}
          participants={section.participants}
          totalCount={section.totalCount}
        />
      ))}
    </div>
  );
}

function MobileParticipantSection({
  title,
  requirement,
  participants,
  totalCount,
}: {
  title: string;
  requirement: string;
  participants: TournamentParticipant[];
  totalCount: number;
}) {
  return (
    <MobileCard>
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="break-words text-lg font-black text-white">{title}</h3>
          <p className="mt-1 break-words text-sm text-zinc-500">{requirement}</p>
        </div>
        <StatusPill tone="neutral">{totalCount} Approved</StatusPill>
      </div>

      <div className="mt-5 space-y-3">
        {participants.map((participant, index) => (
          <article
            key={participant.registrationId}
            className={classNames("w-full max-w-full min-w-0 p-4", tournamentInsetCardClass)}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-mono text-xs text-zinc-500">#{index + 1}</p>
                <h4 className="mt-1 break-words text-base font-black text-white">
                  {participant.name}
                </h4>
              </div>
              <StatusPill tone="green">Approved</StatusPill>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-wider text-zinc-500">
                  Country
                </p>
                <p className="mt-1 break-words font-bold text-zinc-200">
                  {formatTournamentParticipantFact(participant.country)}
                </p>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-wider text-zinc-500">
                  ELO
                </p>
                <p className="mt-1 break-words font-bold text-zinc-200">
                  {formatTournamentParticipantFact(participant.elo)}
                </p>
              </div>
            </div>
          </article>
        ))}
        {participants.length === 0 && (
          <p className="border border-white/12 bg-black/30 p-6 text-center text-sm text-zinc-500">
            No approved participants in this bracket.
          </p>
        )}
      </div>
    </MobileCard>
  );
}

function MobileBrackets({
  tournament,
  viewer,
  matchResultSubmissions,
  matchResultReportGroups,
  focusedMatchId,
}: {
  tournament: TournamentCard;
  viewer: TournamentViewer;
  matchResultSubmissions: MatchResultSubmission[];
  matchResultReportGroups: MatchResultReportGroup[];
  focusedMatchId: string | null;
}) {
  const participantsById = new Map(
    tournament.bracketParticipants.map((participant) => [
      participant.registrationId,
      participant,
    ])
  );
  const [selectedAdminMatchId, setSelectedAdminMatchId] =
    useState<string | null>(null);
  const [selectedPlayerMatchId, setSelectedPlayerMatchId] =
    useState<string | null>(null);
  const terminalTournament = isTournamentTerminalStatus(
    tournament.statusValue
  ) || tournament.statusValue === "completed";
  const selectedAdminBracket =
    selectedAdminMatchId === null
      ? null
      : tournament.generatedBrackets.find((generated) =>
          generated.matches.some((match) => match.id === selectedAdminMatchId)
        ) ?? null;
  const selectedAdminMatch =
    selectedAdminBracket === null
      ? null
      : selectedAdminBracket.matches.find(
          (match) => match.id === selectedAdminMatchId
        ) ?? null;

  useEffect(() => {
    if (!focusedMatchId || window.matchMedia("(min-width: 1024px)").matches) {
      return;
    }

    window.requestAnimationFrame(() => {
      const focusedBracket = tournament.generatedBrackets.find((generated) =>
        generated.matches.some((match) => match.id === focusedMatchId)
      );
      const focusedMatch = focusedBracket?.matches.find(
        (match) => match.id === focusedMatchId
      );
      const viewerOwnsMatch = Boolean(
        focusedMatch &&
          viewer.registrationIds.some(
            (registrationId) =>
              registrationId === focusedMatch.playerOneRegistrationId ||
              registrationId === focusedMatch.playerTwoRegistrationId
          )
      );

      if (
        focusedBracket?.format === "single_elimination" &&
        focusedMatch &&
        focusedMatch.activationVersion > 0 &&
        viewerOwnsMatch
      ) {
        setSelectedPlayerMatchId(focusedMatchId);
      } else if (viewer.isAdmin) {
        setSelectedAdminMatchId(focusedMatchId);
      }
      document
        .getElementById(`match-mobile-${focusedMatchId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [focusedMatchId, tournament.generatedBrackets, viewer]);

  return (
    <div className="w-full max-w-full min-w-0 space-y-5">
      <div className="min-w-0">
        <h2 className="break-words text-2xl font-black text-white">
          {tournament.title} Brackets
        </h2>
        <p className="mt-1 break-words text-sm text-zinc-400">
          {tournament.brackets
            .map((bracket) => `${bracket.name}: ${bracket.requirement}`)
            .join(" - ")}
        </p>
      </div>

      {tournament.brackets.map((bracket) => {
        const generated = tournament.generatedBrackets.find(
          (item) => item.tournamentBracketId === bracket.id
        );
        const approvedCount = tournament.participants.filter(
          (participant) => participant.bracketId === bracket.id
        ).length;
        const champion = generated
          ? getBracketChampion(generated, participantsById)
          : null;
        const completedWithoutChampion = generated
          ? isBracketCompletedWithoutChampion(generated)
          : false;
        const hasVisibleResultHistory = Boolean(
          generated &&
            (matchResultSubmissions.some((submission) =>
              generated.matches.some(
                (match) => match.id === submission.matchId
              )
            ) ||
              matchResultReportGroups.some((reportGroup) =>
                generated.matches.some(
                  (match) => match.id === reportGroup.matchId
                )
              ))
        );
        const hasOwnedMatch = Boolean(
          generated?.matches.some(
            (match) =>
              viewer.registrationIds.includes(
                match.playerOneRegistrationId ?? ""
              ) ||
              viewer.registrationIds.includes(
                match.playerTwoRegistrationId ?? ""
              )
          )
        );
        const canOpenResults = Boolean(
          generated &&
            (hasOwnedMatch || (!viewer.isAdmin && hasVisibleResultHistory))
        );

        return (
          <MobileCard key={bracket.id} className="overflow-visible">
            <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex min-w-0 flex-wrap items-center gap-3">
                  <h3 className="break-words text-lg font-black text-white">
                    {bracket.name}
                  </h3>
                  {generated && canOpenResults && (
                    <BracketMatchResultsWorkspace
                      bracketName={bracket.name}
                      bracketFormat={generated.format}
                      matches={generated.matches}
                      participantsById={participantsById}
                      viewer={viewer}
                      matchResultSubmissions={matchResultSubmissions}
                      matchResultReportGroups={matchResultReportGroups}
                      readOnly={terminalTournament}
                      selectedMatchId={
                        generated.matches.some(
                          (match) => match.id === selectedPlayerMatchId
                        )
                          ? selectedPlayerMatchId
                          : null
                      }
                      onSelectedMatchChange={setSelectedPlayerMatchId}
                    />
                  )}
                </div>
                <p className="mt-1 break-words text-sm text-zinc-400">
                  {generated
                    ? `${formatCompetitionFormat(generated.format)} - ${generated.slotCount} empty player slots`
                    : `${approvedCount} approved - at least 2 required`}
                </p>
              </div>
              {generated && (
                <span className="break-words text-xs uppercase tracking-wider text-zinc-500">
                  Generated {formatDateTime(generated.generatedAt)}
                </span>
              )}
            </div>

            {champion && (
              <ChampionPresentation
                bracketName={bracket.name}
                champion={champion}
              />
            )}
            {completedWithoutChampion && (
              <NoChampionPresentation bracketName={bracket.name} />
            )}

            {!generated ? (
              <p className="mt-6 border border-white/12 p-6 text-center text-zinc-500">
                The empty bracket structure will generate automatically when
                this bracket has at least two approved participants.
              </p>
            ) : generated.format === "round_robin" ? (
              <MobileRoundRobinBracket
                matches={generated.matches}
                standings={generated.standings}
                participantsById={participantsById}
                adminReadOnly={terminalTournament}
                onAdminMatchSelect={
                  viewer.isAdmin
                    ? (match) => setSelectedAdminMatchId(match.id)
                    : undefined
                }
              />
            ) : (
              <div className="w-full max-w-full overflow-x-auto overscroll-x-contain">
                <SingleEliminationBracket
                  matches={generated.matches}
                  participantsById={participantsById}
                  adminReadOnly={terminalTournament}
                  focusedMatchId={focusedMatchId}
                  anchorPrefix="match-mobile"
                  viewerRegistrationIds={viewer.registrationIds}
                  onPlayerMatchSelect={(match) =>
                    setSelectedPlayerMatchId(match.id)
                  }
                  onAdminMatchSelect={
                    viewer.isAdmin
                      ? (match) => setSelectedAdminMatchId(match.id)
                      : undefined
                  }
                />
              </div>
            )}
          </MobileCard>
        );
      })}

      {viewer.isAdmin && selectedAdminMatch && (
        <AdminMatchManagementModal
          tournament={tournament}
          match={selectedAdminMatch}
          bracketFormat={selectedAdminBracket?.format ?? "single_elimination"}
          participantsById={participantsById}
          viewer={viewer}
          submissions={matchResultSubmissions.filter(
            (submission) => submission.matchId === selectedAdminMatch.id
          )}
          reportGroups={matchResultReportGroups.filter(
            (reportGroup) => reportGroup.matchId === selectedAdminMatch.id
          )}
          readOnly={terminalTournament}
          onClose={() => setSelectedAdminMatchId(null)}
        />
      )}
    </div>
  );
}

function MobileRoundRobinBracket({
  matches,
  standings,
  participantsById,
  adminReadOnly,
  onAdminMatchSelect,
}: {
  matches: GeneratedTournamentMatch[];
  standings: TournamentCard["generatedBrackets"][number]["standings"];
  participantsById: Map<string, TournamentParticipant>;
  adminReadOnly: boolean;
  onAdminMatchSelect?: (match: GeneratedTournamentMatch) => void;
}) {
  return (
    <div className="mt-6 grid w-full max-w-full min-w-0 gap-5">
      <div className="grid gap-4">
        {matches.map((match) => (
          <MatchCard
            key={match.id}
            match={toDisplayMatch(match, participantsById)}
            adminReadOnly={adminReadOnly}
            onAdminSelect={
              onAdminMatchSelect ? () => onAdminMatchSelect(match) : undefined
            }
          />
        ))}
      </div>
      <div className={classNames("w-full max-w-full min-w-0 p-4", tournamentInsetCardClass)}>
        <h4 className="font-black text-white">Standings</h4>
        <div className="mt-4 space-y-2">
          {standings
            .slice()
            .sort(
              (left, right) =>
                (left.rank ?? Number.MAX_SAFE_INTEGER) -
                  (right.rank ?? Number.MAX_SAFE_INTEGER) ||
                right.points - left.points ||
                right.wins - left.wins
            )
            .map((standing, index) => (
              <div
                key={standing.registrationId}
                className={classNames("grid grid-cols-[32px_minmax(0,1fr)] gap-3 p-3 text-sm", tournamentInsetCardClass)}
              >
                <span className="font-mono text-zinc-500">
                  {standing.rank ?? index + 1}
                </span>
                <span className="min-w-0 break-words font-bold text-white">
                  {participantsById.get(standing.registrationId)?.name ??
                    "Participant"}
                </span>
                <span className="col-start-2 text-zinc-400">
                  {standing.wins}W {standing.losses}L - {standing.points} pts
                </span>
              </div>
            ))}
          {standings.length === 0 && (
            <p className="border border-white/12 p-4 text-sm text-zinc-500">
              Standings will appear after admins assign players and results are recorded.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function MobileMedia({ tournament }: { tournament: TournamentCard }) {
  const links = [
    tournament.rulesUrl
      ? { label: "Official Rules", url: tournament.rulesUrl }
      : null,
    tournament.battlefyUrl
      ? { label: "Battlefy Event", url: tournament.battlefyUrl }
      : null,
  ].filter((link) => link !== null);

  return (
    <MobileCard>
      <h2 className="break-words text-xl font-black text-white">
        {tournament.title} Resources
      </h2>
      {links.length > 0 ? (
        <div className="mt-5 grid w-full max-w-full min-w-0 gap-4">
          {links.map((link) => (
            <a
              key={link.label}
              href={link.url}
              target="_blank"
              rel="noreferrer"
              className="group relative aspect-video w-full max-w-full overflow-hidden border border-white/12 bg-cover bg-center p-4 shadow-2xl shadow-black/30 backdrop-blur transition hover:border-orange-400/35"
              style={{
                backgroundImage: `linear-gradient(145deg,rgba(255,255,255,0.06),rgba(8,8,8,0.86)),linear-gradient(135deg,rgba(0,0,0,0.96),rgba(0,0,0,0.9)),url(${tournament.image})`,
              }}
            >
              <PlayCircle className="text-white opacity-90" />
              <p className="mt-20 break-words text-sm font-bold text-white">
                {link.label}
              </p>
              <p className="break-words text-xs text-zinc-300">
                Open tournament resource
              </p>
            </a>
          ))}
        </div>
      ) : (
        <p className="mt-5 border border-white/12 p-8 text-center text-zinc-500">
          No tournament resources have been published.
        </p>
      )}
    </MobileCard>
  );
}

function MobileAnnouncements({ tournament }: { tournament: TournamentCard }) {
  const messages = [
    `${tournament.title} is currently ${tournament.status.toLowerCase()}.`,
    `Grand Final: ${formatOptionalDateTime(tournament.grandFinalAt, "TBA")}.`,
    `${tournament.players} approved participants are currently listed across ${tournament.brackets.length} bracket${tournament.brackets.length === 1 ? "" : "s"}. Full brackets and brackets with an existing queue accept waitlist registrations while registration remains open.`,
  ];

  return (
    <div className="space-y-4">
      {messages.map((text, index) => (
        <MobileCard key={text}>
          <div className="flex min-w-0 gap-3">
            <Radio size={18} className="mt-1 shrink-0 text-orange-300" />
            <div className="min-w-0">
              <p className="break-words text-xs font-black uppercase tracking-wider text-zinc-500">
                IronClad Update {index + 1}
              </p>
              <p className="mt-1 break-words text-zinc-200">{text}</p>
            </div>
          </div>
        </MobileCard>
      ))}
    </div>
  );
}

function MobileMainContent({
  activeTab,
  activeOverviewPanel,
  setActiveOverviewPanel,
  tournament,
  tournaments,
  viewer,
  matchResultSubmissions,
  matchResultReportGroups,
  focusedMatchId,
  tournamentPollsByTournament,
  pollLoadError,
  highlightedPollId,
}: {
  activeTab: TabKey;
  activeOverviewPanel: OverviewPanelKey;
  setActiveOverviewPanel: (panel: OverviewPanelKey) => void;
  tournament: TournamentCard;
  tournaments: TournamentCard[];
  viewer: TournamentViewer;
  matchResultSubmissions: MatchResultSubmission[];
  matchResultReportGroups: MatchResultReportGroup[];
  focusedMatchId: string | null;
  tournamentPollsByTournament: Record<string, PollViewerProjection[]>;
  pollLoadError: string | null;
  highlightedPollId: string | null;
}) {
  return (
    <main className="relative z-10 w-full max-w-full min-w-0 px-4 py-5 sm:px-5">
      {activeTab === "overview" && (
        <MobileOverview
          tournament={tournament}
          tournaments={tournaments}
          activePanel={activeOverviewPanel}
          setActivePanel={setActiveOverviewPanel}
        />
      )}
      {activeTab === "participants" && <MobileParticipants tournament={tournament} />}
      {activeTab === "brackets" && (
        <MobileBrackets
          tournament={tournament}
          viewer={viewer}
          matchResultSubmissions={matchResultSubmissions}
          matchResultReportGroups={matchResultReportGroups}
          focusedMatchId={focusedMatchId}
        />
      )}
      {activeTab === "decisions" && (
        <PollsAndDecisions
          key={tournament.id}
          surface="tournament"
          tournamentId={tournament.id}
          initialPolls={tournamentPollsByTournament[tournament.id] ?? []}
          initialError={pollLoadError}
          highlightedPollId={highlightedPollId}
          presentation="mobile"
        />
      )}
      {activeTab === "media" && <MobileMedia tournament={tournament} />}
      {activeTab === "announcements" && (
        <MobileAnnouncements tournament={tournament} />
      )}
    </main>
  );
}

function MainContent({
  activeTab,
  activeOverviewPanel,
  setActiveOverviewPanel,
  tournament,
  tournaments,
  viewer,
  matchResultSubmissions,
  matchResultReportGroups,
  focusedMatchId,
  tournamentPollsByTournament,
  pollLoadError,
  highlightedPollId,
}: {
  activeTab: TabKey;
  activeOverviewPanel: OverviewPanelKey;
  setActiveOverviewPanel: (panel: OverviewPanelKey) => void;
  tournament: TournamentCard;
  tournaments: TournamentCard[];
  viewer: TournamentViewer;
  matchResultSubmissions: MatchResultSubmission[];
  matchResultReportGroups: MatchResultReportGroup[];
  focusedMatchId: string | null;
  tournamentPollsByTournament: Record<string, PollViewerProjection[]>;
  pollLoadError: string | null;
  highlightedPollId: string | null;
}) {
  return (
    <main className="relative z-10 px-5 py-6 lg:px-8">
      {activeTab === "overview" && (
        <Overview
          tournament={tournament}
          tournaments={tournaments}
          activePanel={activeOverviewPanel}
          setActivePanel={setActiveOverviewPanel}
        />
      )}
      {activeTab === "participants" && <Participants tournament={tournament} />}
      {activeTab === "brackets" && (
        <Brackets
          tournament={tournament}
          viewer={viewer}
          matchResultSubmissions={matchResultSubmissions}
          matchResultReportGroups={matchResultReportGroups}
          focusedMatchId={focusedMatchId}
        />
      )}
      {activeTab === "decisions" && (
        <PollsAndDecisions
          key={tournament.id}
          surface="tournament"
          tournamentId={tournament.id}
          initialPolls={tournamentPollsByTournament[tournament.id] ?? []}
          initialError={pollLoadError}
          highlightedPollId={highlightedPollId}
          presentation="desktop"
        />
      )}
      {activeTab === "media" && <Media tournament={tournament} />}
      {activeTab === "announcements" && <Announcements tournament={tournament} />}
    </main>
  );
}

type RegistrationGate = "account" | "profile" | "closed" | "error";

function RegistrationGatePrompt({
  type,
  onClose,
}: {
  type: RegistrationGate;
  onClose: () => void;
}) {
  const content = {
    account: {
      eyebrow: "IronClad Account Required",
      title: "Do you already have an IronClad account?",
      description:
        "Sign in to continue, or create an account and complete your player profile before registering.",
    },
    profile: {
      eyebrow: "Player Profile Required",
      title: "Please complete your player profile before registering.",
      description:
        "IronClad uses your saved IGN, region, ELO, and verification details for tournament participation.",
    },
    closed: {
      eyebrow: "Registration Unavailable",
      title: "This tournament is full or already in progress.",
      description:
        "We hope to see you in the next one.",
    },
    error: {
      eyebrow: "Profile Check Unavailable",
      title: "IronClad could not verify your player profile.",
      description:
        "Close this message and try again. If the problem continues, open your profile to confirm your account details.",
    },
  }[type];

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/85 px-4 py-6 backdrop-blur">
      <div className="w-full max-w-lg border border-orange-500/30 bg-[linear-gradient(145deg,rgba(12,12,12,0.98),rgba(0,0,0,0.99))] p-6 shadow-2xl shadow-black/50">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.25em] text-orange-300">
              {content.eyebrow}
            </p>
            <h2 className="mt-3 text-2xl font-black text-white">
              {content.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg bg-slate-800 p-2 text-zinc-300 transition hover:bg-slate-700 hover:text-white"
            aria-label="Close registration prompt"
          >
            <X size={18} />
          </button>
        </div>

        <p className="mt-4 leading-7 text-zinc-300">{content.description}</p>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {type === "account" && (
            <>
              <Link
                href="/sign-in"
                className="rounded-xl border border-white/12 bg-black/45 px-4 py-3 text-center text-sm font-black uppercase tracking-wide text-white transition hover:border-orange-500"
              >
                Sign In
              </Link>
              <Link
                href="/sign-up"
                className="rounded-xl bg-orange-500 px-4 py-3 text-center text-sm font-black uppercase tracking-wide text-white transition hover:bg-orange-400"
              >
                Create Account
              </Link>
            </>
          )}

          {(type === "profile" || type === "error") && (
            <Link
              href="/profile"
              className="rounded-xl bg-orange-500 px-4 py-3 text-center text-sm font-black uppercase tracking-wide text-white transition hover:bg-orange-400 sm:col-span-2"
            >
              {type === "profile" ? "Complete Profile" : "Open Profile"}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

type TournamentViewer = {
  isAdmin: boolean;
  relicVerifiedDivision: RelicVerifiedDivision | null;
  registrationIds: string[];
  registrations: TournamentViewerRegistration[];
};

export type TournamentViewerRegistration = {
  id: string;
  tournamentId: string;
  tournamentBracketId: string;
  bracketName: string;
  status:
    | "pending"
    | "manual_review"
    | "approved"
    | "rejected"
    | "waitlisted"
    | "withdrawn";
  createdAt: string | null;
  waitlistPosition: number | null;
  waitlistOfferStatus:
    | "offered"
    | "accepted"
    | "declined"
    | "expired"
    | "cancelled"
    | null;
};

export default function TournamentsExperience({
  tournaments,
  tournamentPollsByTournament,
  pollLoadError = null,
  viewer,
  matchResultSubmissions,
  matchResultReportGroups,
}: {
  tournaments: TournamentCard[];
  tournamentPollsByTournament?: Record<string, PollViewerProjection[]>;
  pollLoadError?: string | null;
  viewer: TournamentViewer;
  matchResultSubmissions: MatchResultSubmission[];
  matchResultReportGroups: MatchResultReportGroup[];
  eloVerificationEnabled: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamString = searchParams.toString();
  const rawTournamentParam = searchParams.get("tournament");
  const rawTabParam = searchParams.get("tab");
  const rawPanelParam = searchParams.get("panel");
  const rawMatchParam = searchParams.get("match");
  const rawPollParam = searchParams.get("poll");
  const activeTab = getValidTab(rawTabParam);
  const publicTournaments = useMemo(
    () => getPublicTournamentNavigation(tournaments),
    [tournaments]
  );
  const urlTournament = findTournamentFromUrl(tournaments, rawTournamentParam);
  const selectedTournament = urlTournament ?? publicTournaments[0];
  const focusedMatchId = selectedTournament.generatedBrackets
    .flatMap((bracket) => bracket.matches)
    .some((match) => match.id === rawMatchParam)
    ? rawMatchParam
    : null;
  const focusedPollId =
    activeTab === "decisions" &&
    (tournamentPollsByTournament?.[selectedTournament.id] ?? []).some(
      (poll) => poll.id === rawPollParam
    )
      ? rawPollParam
      : null;
  const requestedOverviewPanel = getValidOverviewPanel(rawPanelParam);
  const activeOverviewPanel =
    activeTab === "overview" &&
    requestedOverviewPanel === "prizes" &&
    !hasPrize(selectedTournament)
      ? "details"
      : requestedOverviewPanel;
  const selectedViewerRegistration =
    viewer.registrations.find(
      (registration) => registration.tournamentId === selectedTournament.id
    ) ?? null;
  const [showMobilePanel, setShowMobilePanel] = useState(false);
  const mobileHeroStartRef = useRef<HTMLDivElement | null>(null);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [registrationProfile, setRegistrationProfile] =
    useState<RegistrationPlayerProfile | null>(null);
  const [registrationGate, setRegistrationGate] =
    useState<RegistrationGate | null>(null);
  const [isCheckingProfile, setIsCheckingProfile] = useState(false);
  const { getToken, isSignedIn, userId } = useAuth();
  const authenticatedSupabase = useMemo(() => {
    if (typeof window === "undefined") {
      return null;
    }

    return createAuthenticatedBrowserSupabaseClient(getToken);
  }, [getToken]);

  const updateTournamentUrl = useCallback(
    ({
      tournament,
      tab,
      panel,
    }: {
      tournament: TournamentCard;
      tab: TabKey;
      panel: OverviewPanelKey;
    },
    mode: "push" | "replace" = "push") => {
      const params = new URLSearchParams(searchParamString);
      params.set("tournament", getTournamentUrlValue(tournament));
      params.set("tab", tab);

      if (tab === "overview") {
        params.set("panel", panel);
      } else {
        params.delete("panel");
      }
      params.delete("match");
      if (
        tab !== "decisions" ||
        (rawPollParam !== null && focusedPollId === null)
      ) {
        params.delete("poll");
      }

      const nextQuery = params.toString();
      const nextPath = nextQuery ? `${pathname}?${nextQuery}` : pathname;
      const currentPath = searchParamString
        ? `${pathname}?${searchParamString}`
        : pathname;

      if (nextPath !== currentPath) {
        if (mode === "replace") {
          router.replace(nextPath, { scroll: false });
        } else {
          router.push(nextPath, { scroll: false });
        }
      }
    },
    [focusedPollId, pathname, rawPollParam, router, searchParamString]
  );

  const scrollMobileHeroIntoView = useCallback(() => {
    if (typeof window === "undefined") return;

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        mobileHeroStartRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
    });
  }, []);

  useEffect(() => {
    const hasTournamentStateParam =
      rawTournamentParam !== null ||
      rawTabParam !== null ||
      rawPanelParam !== null ||
      rawMatchParam !== null ||
      rawPollParam !== null;

    if (!hasTournamentStateParam) {
      return;
    }

    const missingTournamentParam = rawTournamentParam === null;
    const invalidTournamentParam =
      rawTournamentParam !== null && urlTournament === null;
    const invalidTabParam = rawTabParam !== null && rawTabParam !== activeTab;
    const invalidPanelParam =
      rawPanelParam !== null &&
      (activeTab !== "overview" || rawPanelParam !== activeOverviewPanel);
    const invalidMatchParam =
      rawMatchParam !== null &&
      (activeTab !== "brackets" || focusedMatchId === null);
    const invalidPollParam =
      rawPollParam !== null &&
      (activeTab !== "decisions" || focusedPollId === null);

    if (
      !missingTournamentParam &&
      !invalidTournamentParam &&
      !invalidTabParam &&
      !invalidPanelParam &&
      !invalidMatchParam &&
      !invalidPollParam
    ) {
      return;
    }

    updateTournamentUrl(
      {
        tournament: selectedTournament,
        tab: activeTab,
        panel: activeOverviewPanel,
      },
      "replace"
    );
  }, [
    activeOverviewPanel,
    activeTab,
    rawPanelParam,
    rawMatchParam,
    rawPollParam,
    rawTabParam,
    rawTournamentParam,
    selectedTournament,
    focusedMatchId,
    focusedPollId,
    updateTournamentUrl,
    urlTournament,
  ]);

  const handleSelectTournament = (tournament: TournamentCard) => {
    updateTournamentUrl({
      tournament,
      tab: "overview",
      panel: "details",
    });
  };

  const handleMobileSelectTournament = (tournament: TournamentCard) => {
    handleSelectTournament(tournament);
    scrollMobileHeroIntoView();
  };

  const handleSetActiveTab = (tab: TabKey) => {
    updateTournamentUrl({
      tournament: selectedTournament,
      tab,
      panel: activeOverviewPanel,
    });
  };

  const handleSetActiveOverviewPanel = (panel: OverviewPanelKey) => {
    updateTournamentUrl({
      tournament: selectedTournament,
      tab: "overview",
      panel,
    });
  };

  const handleRegisterClick = async () => {
    if (selectedViewerRegistration) {
      return;
    }

    const registrationAvailability = getRegistrationDivisionAvailability(
      selectedTournament,
      viewer.relicVerifiedDivision
    );

    if (
      registrationAvailability === "closed" ||
      registrationAvailability === "launched"
    ) {
      setRegistrationGate("closed");
      return;
    }

    if (!isSignedIn || !userId) {
      setRegistrationGate("account");
      return;
    }

    setIsCheckingProfile(true);

    if (!authenticatedSupabase) {
      setIsCheckingProfile(false);
      setRegistrationGate("error");
      return;
    }

    try {
      const { data, error } = await authenticatedSupabase
        .from("players")
        .select(
          "display_name, in_game_name, discord_username, steam_username, country, region, timezone, profile_completed"
        )
        .eq("clerk_user_id", userId)
        .maybeSingle();

      setIsCheckingProfile(false);

      if (error) {
        console.error("Tournament profile eligibility check failed.");
        setRegistrationGate("error");
        return;
      }

      const profile = (data ?? null) as RegistrationPlayerProfile | null;

      if (!profile || profile.profile_completed !== true) {
        setRegistrationGate("profile");
        return;
      }

      setRegistrationProfile(profile);
      setShowRegisterModal(true);
    } catch {
      setIsCheckingProfile(false);
      console.error("Tournament profile eligibility check failed unexpectedly.");
      setRegistrationGate("error");
    }
  };

  return (
    <>
      <div
        className="hidden min-h-screen bg-black bg-cover bg-center bg-fixed pt-20 text-zinc-100 lg:block"
        style={{
          backgroundImage:
            "linear-gradient(180deg,rgba(0,0,0,0.9),rgba(0,0,0,0.76) 44%,rgba(0,0,0,0.94)),linear-gradient(110deg,rgba(0,0,0,0.94),rgba(0,0,0,0.62),rgba(249,115,22,0.12),rgba(0,0,0,0.92)),url('/images/sfondi/4.jpg')",
          backgroundAttachment: "fixed",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          backgroundSize: "cover",
        }}
      >
        <div className="mx-auto flex max-w-[1600px]">
          <Sidebar
            selectedTournament={selectedTournament}
            tournaments={publicTournaments}
            onSelectTournament={handleSelectTournament}
          />
          <div className="min-w-0 flex-1">
            <Hero
              tournament={selectedTournament}
              viewerRegistration={selectedViewerRegistration}
              verifiedDivision={viewer.relicVerifiedDivision}
              onRegisterClick={handleRegisterClick}
            />
            <TopTabs activeTab={activeTab} setActiveTab={handleSetActiveTab} />
            <MainContent
              activeTab={activeTab}
              activeOverviewPanel={activeOverviewPanel}
              setActiveOverviewPanel={handleSetActiveOverviewPanel}
              tournament={selectedTournament}
              tournaments={publicTournaments}
              viewer={viewer}
              matchResultSubmissions={matchResultSubmissions}
              matchResultReportGroups={matchResultReportGroups}
              focusedMatchId={focusedMatchId}
              tournamentPollsByTournament={tournamentPollsByTournament ?? {}}
              pollLoadError={pollLoadError}
              highlightedPollId={focusedPollId}
            />
          </div>
        </div>
      </div>

      <div
        className="min-h-screen w-full max-w-full min-w-0 bg-black bg-cover bg-center pt-20 text-zinc-100 lg:hidden"
        style={{
          backgroundImage:
            "linear-gradient(180deg,rgba(0,0,0,0.92),rgba(0,0,0,0.78) 44%,rgba(0,0,0,0.96)),linear-gradient(110deg,rgba(0,0,0,0.94),rgba(0,0,0,0.66),rgba(249,115,22,0.12),rgba(0,0,0,0.92)),url('/images/sfondi/4.jpg')",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          backgroundSize: "cover",
        }}
      >
        <div
          ref={mobileHeroStartRef}
          className="scroll-mt-24"
          style={{ scrollMarginTop: "calc(5rem + env(safe-area-inset-top))" }}
        />
        <MobileHero
          tournament={selectedTournament}
          viewerRegistration={selectedViewerRegistration}
          verifiedDivision={viewer.relicVerifiedDivision}
          onRegisterClick={handleRegisterClick}
        />
        <MobileTournamentMenuButton
          onClick={() => setShowMobilePanel(true)}
        />
        <MobileTabs activeTab={activeTab} setActiveTab={handleSetActiveTab} />
        <MobileMainContent
          activeTab={activeTab}
          activeOverviewPanel={activeOverviewPanel}
          setActiveOverviewPanel={handleSetActiveOverviewPanel}
          tournament={selectedTournament}
          tournaments={publicTournaments}
          viewer={viewer}
          matchResultSubmissions={matchResultSubmissions}
          matchResultReportGroups={matchResultReportGroups}
          focusedMatchId={focusedMatchId}
          tournamentPollsByTournament={tournamentPollsByTournament ?? {}}
          pollLoadError={pollLoadError}
          highlightedPollId={focusedPollId}
        />
      </div>

      {showRegisterModal && registrationProfile && (
        <RegisterModal
          profile={registrationProfile}
          tournaments={publicTournaments}
          initialTournamentId={selectedTournament.id}
          verifiedDivision={viewer.relicVerifiedDivision}
          onClose={() => setShowRegisterModal(false)}
        />
      )}
      {registrationGate && (
        <RegistrationGatePrompt
          type={registrationGate}
          onClose={() => setRegistrationGate(null)}
        />
      )}

      {isCheckingProfile && (
        <div className="fixed inset-x-0 bottom-5 z-[65] mx-auto w-fit rounded-full border border-orange-500/30 bg-black/90 px-5 py-3 text-xs font-black uppercase tracking-wider text-orange-300 shadow-2xl">
          Checking Player Profile
        </div>
      )}

      <MobileTournamentDrawer
        open={showMobilePanel}
        selectedTournament={selectedTournament}
        tournaments={publicTournaments}
        onClose={() => setShowMobilePanel(false)}
        onSelectTournament={handleMobileSelectTournament}
      />
    </>
  );
}

function getPublicTournamentStatus(tournament: TournamentCard) {
  if (
    tournament.statusValue === "registration_open" &&
    !isTournamentRegistrationOpen(tournament)
  ) {
    return "Closed";
  }

  return tournament.status;
}
