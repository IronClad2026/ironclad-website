"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode, ElementType } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { createPortal } from "react-dom";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { submitTournamentRegistration } from "@/app/tournaments/actions";
import MatchResultControls from "@/components/MatchResultControls";
import { createAuthenticatedBrowserSupabaseClient } from "@/lib/supabase-browser";
import {
  getEligibleBracketNames,
  isEligibleForBracket,
} from "@/lib/tournaments";
import {
  isPlayerProfileComplete,
  type PlayerProfile,
} from "@/lib/player-profile";
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
  Gamepad2,
  Info,
  LayoutDashboard,
  Menu,
  MessageCircle,
  PlayCircle,
  Radio,
  Search,
  Settings2,
  Swords,
  Trophy,
  Users,
  X,
} from "lucide-react";

/**
 * app/tournaments/page.tsx
 * ------------------------------------------------------------
 * IronClad tournament page built as a single editable TSX page.
 * The visual structure is preserved: sidebar, hero, tabs, overview,
 * participants, brackets, media, announcements, and mobile menu.
 */

type TabKey = "overview" | "participants" | "brackets" | "media" | "announcements";
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

function classNames(...classes: Array<string | false | undefined | null>) {
  return classes.filter(Boolean).join(" ");
}

const interactiveHover = "transform-gpu transition-all duration-300 ease-out hover:scale-[1.03] hover:border-orange-500/70 hover:shadow-lg hover:shadow-orange-950/20 active:scale-[0.99]";

function StatusPill({ children, tone = "blue" }: { children: ReactNode; tone?: "blue" | "green" | "red" | "amber" | "gray" }) {
  const tones = {
    blue: "border-sky-400/40 bg-sky-500/10 text-sky-200",
    green: "border-emerald-400/40 bg-emerald-500/10 text-emerald-200",
    red: "border-orange-400/40 bg-orange-500/10 text-orange-200",
    amber: "border-amber-400/40 bg-amber-500/10 text-amber-200",
    gray: "border-slate-500/50 bg-slate-700/30 text-slate-300",
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
    <aside className="hidden w-72 shrink-0 border-r border-slate-800 bg-[#111827] lg:block">
      <div className="sticky top-20 h-[calc(100vh-5rem)] overflow-y-auto">
        <div className="border-b border-slate-800 p-5">
          <div className="h-32 rounded-xl border border-slate-700 bg-center bg-no-repeat" style={{ backgroundImage: "linear-gradient(135deg,rgba(15,23,42,0.42),rgba(2,6,23,0.84)),url(/images/ironclad-background.jpg)", backgroundSize: "100% auto" }} />
          <div className="mt-4">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Organizer</p>
            <h2 className="mt-1 text-lg font-black text-white">IronClad Tournaments</h2>
            <p className="mt-1 text-sm text-slate-400">Company of Heroes 3 Events</p>
          </div>
        </div>

        <nav className="p-3">
          <button
            onClick={() => setEventsOpen((current) => !current)}
            className={classNames("group mb-1 flex w-full items-center justify-between rounded-lg px-3 py-3 text-left text-sm font-semibold text-slate-400 hover:bg-slate-800/80 hover:text-white", interactiveHover)}
          >
            <span className="flex items-center gap-3">
              <CalendarDays size={17} className="text-orange-400" />
              Events
            </span>
            <ChevronDown size={14} className={classNames("text-slate-500 transition", eventsOpen && "rotate-180")} />
          </button>

          {eventsOpen && (
            <div className="mt-2 space-y-4 rounded-xl border border-slate-800 bg-slate-950/40 p-3">
              {eventsByMonth.map((group) => (
                <div key={group.month}>
                  <p className="mb-2 text-xs font-black uppercase tracking-wider text-slate-500">{group.month}</p>
                  <div className="space-y-2">
                    {group.events.map((event) => {
                      const selected = selectedTournament.title === event.title;
                      return (
                        <button
                          key={event.title}
                          onClick={() => onSelectTournament(event)}
                          className={classNames("block w-full rounded-lg bg-cover bg-center p-3 text-left transform-gpu transition-all duration-300 ease-out hover:scale-[1.03] hover:brightness-110 active:scale-[0.99]", selected && "ring-2 ring-orange-500")}
                          style={{ backgroundImage: `linear-gradient(135deg,rgba(15,23,42,0.94),rgba(2,6,23,0.74)),url(${event.image})` }}
                        >
                          <p className="break-words text-sm font-black text-white">{event.title}</p>
                          <p className="mt-1 text-xs text-slate-300">{event.format} - {event.status}</p>
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

function Hero({
  tournament,
  onRegisterClick,
}: {
  tournament: TournamentCard;
  onRegisterClick: () => void;
}) {
  const registrationOpen = isTournamentRegistrationOpen(tournament);
  const publicStatus = getPublicTournamentStatus(tournament);
  const allBracketsWaitlistOnly = tournament.brackets.every(
    (bracket) => bracket.isWaitlistOnly
  );
  const actionLabel = registrationOpen
    ? allBracketsWaitlistOnly
      ? "Join Waitlist"
      : "Register"
    : publicStatus;

  return (
    <section className="relative overflow-hidden border-b border-slate-800 bg-black">
      <motion.div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-75"
        style={{
          backgroundImage: `url(${tournament.image})`,
        }}
        animate={{ backgroundPositionY: ["0%", "100%", "0%"] }}
        transition={{ duration: 36, repeat: Infinity, ease: "easeInOut" }}
      />
      <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/45 to-black/20" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/20" />
      <div className="absolute inset-0 opacity-35">
        <div className="absolute left-1/3 top-0 h-72 w-72 rounded-full bg-sky-500/20 blur-3xl" />
        <div className="absolute right-10 top-16 h-72 w-72 rounded-full bg-orange-500/20 blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(15,23,42,0.3),rgba(2,6,23,0.96)),repeating-linear-gradient(90deg,rgba(148,163,184,0.04)_0,rgba(148,163,184,0.04)_1px,transparent_1px,transparent_80px)]" />
      </div>
      <div className="relative px-5 py-8 lg:px-8 lg:py-10">
        <div className="flex flex-col gap-8 xl:flex-row xl:items-start xl:justify-between">
          <div>
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
              <StatusPill tone="blue">{tournament.format}</StatusPill>
              <StatusPill tone="amber">{tournament.ruleFormatLabel}</StatusPill>
              <StatusPill tone="gray">{tournament.region}</StatusPill>
            </div>
            <h1 className="mt-5 max-w-4xl text-3xl font-black tracking-tight text-white sm:text-5xl">{tournament.title}</h1>
            <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-slate-300">
              <span className="flex items-center gap-2"><Gamepad2 size={16} className="text-sky-300" /> {tournament.game}</span>
              <span className="flex items-center gap-2"><CalendarDays size={16} className="text-sky-300" /> {tournament.month} Tournament</span>
              <span className="flex items-center gap-2"><Clock3 size={16} className="text-sky-300" /> {tournament.time}</span>
              <span className="flex items-center gap-2"><Users size={16} className="text-sky-300" /> {tournament.players}/{tournament.maxPlayers} approved slots</span>
            </div>
          </div>
          <div className="w-full max-w-full sm:max-w-sm xl:w-80 xl:flex-none">
            <ActionCard
              label={actionLabel}
              description={
                registrationOpen
                  ? allBracketsWaitlistOnly
                    ? "Waitlist open"
                    : "Open events"
                  : "Check the tournament schedule"
              }
              icon={registrationOpen ? CheckCircle2 : Clock3}
              onClick={onRegisterClick}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function ActionCard({ label, description, icon: Icon, onClick }: { label: string; description: string; icon: ElementType; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={classNames("flex min-h-[104px] w-full min-w-0 flex-col justify-start overflow-hidden rounded-xl border border-slate-700/80 bg-slate-950/50 p-4 text-left shadow-xl shadow-black/10 backdrop-blur hover:bg-orange-500/10", interactiveHover)}>
      <Icon size={18} className="shrink-0 text-orange-300" />
      <p className="mt-3 break-words text-sm font-black uppercase leading-5 tracking-wider text-white">{label}</p>
      <p className="mt-1 break-words text-xs font-semibold leading-5 text-slate-400">{description}</p>
    </button>
  );
}

function TopTabs({ activeTab, setActiveTab }: { activeTab: TabKey; setActiveTab: (tab: TabKey) => void }) {
  return (
    <div className="overflow-visible border-b border-slate-800 bg-[#0f1724] px-5 py-2 lg:px-8">
      <div className="flex gap-8 overflow-x-auto overflow-y-visible px-1 py-2">
        {tabs.map((tab) => {
          const selected = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={classNames(
                "relative shrink-0 transform-gpu rounded-md px-1 py-4 text-xs font-black uppercase tracking-wider transition-all duration-300 ease-out hover:scale-[1.04] active:scale-[0.99]",
                selected ? "text-white" : "text-slate-500 hover:text-slate-200"
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
}: {
  tournament: TournamentCard;
  tournaments: TournamentCard[];
}) {
  const [panel, setPanel] = useState<OverviewPanelKey>("details");
  const panels = overviewPanels.filter(
    (item) => item.key !== "prizes" || hasPrize(tournament)
  );
  const visiblePanel =
    panel === "prizes" && !hasPrize(tournament) ? "details" : panel;

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
      <div className="space-y-6">
        <Card>
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-sky-500/15 text-sky-300"><Info size={20} /></div>
            <div>
              <h2 className="text-xl font-black text-white">IronClad Company of Heroes 3 Tournaments</h2>
              <p className="mt-2 leading-7 text-slate-300">{tournament.details}</p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex gap-3 overflow-x-auto overflow-y-visible border-b border-slate-800 px-1 py-3">
            {panels.map((item) => (
              <button
                key={item.key}
                onClick={() => setPanel(item.key)}
                className={classNames("shrink-0 rounded border px-4 py-2 text-xs font-black uppercase tracking-wide", interactiveHover, visiblePanel === item.key ? "border-orange-500 bg-orange-500/10 text-white" : "border-slate-700 text-slate-400 hover:text-white")}
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
          <h3 className="text-sm font-black uppercase tracking-wider text-white">Live Tournament</h3>
          <div className="mt-4 space-y-3">
            {tournaments.map((item) => (
              <TournamentLinkCard key={item.title} item={item} />
            ))}
          </div>
        </Card>
        <Card>
          <h3 className="text-sm font-black uppercase tracking-wider text-white">Tournament Archive</h3>
          <p className="mt-2 text-xs leading-5 text-slate-400">
            Battlefy remains the historical reference for events held before the new IronClad platform launch.
          </p>
          <div className="mt-4 space-y-3">
            {archiveEvents.map((item) => (
              <a key={item.title} href={item.battlefy} target="_blank" rel="noreferrer" className="block rounded-lg bg-cover bg-center p-4 transition hover:brightness-110" style={{ backgroundImage: `linear-gradient(135deg,rgba(15,23,42,0.94),rgba(2,6,23,0.76)),url(${item.image})` }}>
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-white">{item.title}</p>
                    {item.description && <p className="mt-1 text-xs leading-5 text-slate-300">{item.description}</p>}
                    <p className="mt-3 text-xs font-black uppercase tracking-wider text-sky-300">View on Battlefy</p>
                  </div>
                  <MessageCircle size={16} className="mt-1 shrink-0 text-sky-300" />
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
    <div className="block rounded-lg bg-slate-900/80 p-3">
      <div className="flex items-center gap-3">
        <div className="h-12 w-16 shrink-0 rounded bg-cover bg-center" style={{ backgroundImage: `url(${item.image})` }} />
        <div className="min-w-0 flex-1">
          <p className="font-bold text-white">{item.title}</p>
                  <p className="text-xs text-slate-500">{item.month} - {item.format} - {item.status}</p>
        </div>
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-400">{item.description}</p>
    </div>
  );
}

function renderOverviewPanel(panel: OverviewPanelKey, tournament: TournamentCard) {
  const shared = "leading-7 text-slate-300";
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
      <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-5">
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
      <Detail label="Grand Final" value={formatOptionalDateTime(tournament.grandFinalAt, "Grand Final TBA")} />
      {hasPrize(tournament) && <Detail label="Prize Pool" value={tournament.prizePool} />}
      <Detail label="Approved Participants" value={`${tournament.players} / ${tournament.maxPlayers}`} />
      {tournament.brackets.map((bracket) => (
        <Detail key={bracket.name} label={bracket.name} value={`${bracket.requirement} - ${bracket.registeredPlayers} / ${bracket.maxPlayers.replace("Max ", "")} approved${bracket.isWaitlistOnly ? " - waitlist only" : ""}`} />
      ))}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-4"><p className="text-xs font-black uppercase tracking-wider text-slate-500">{label}</p><p className="mt-1 break-words font-bold text-slate-100">{value}</p></div>;
}

function Timeline({ tournament }: { tournament: TournamentCard }) {
  return <div className="space-y-3">{tournament.schedule.map((item, index) => <div key={item} className="flex items-center gap-3 rounded-lg bg-slate-950/40 p-4"><div className="grid h-8 w-8 shrink-0 place-items-center rounded bg-sky-500/15 text-xs font-black text-sky-200">{index + 1}</div><span className="break-words font-semibold text-slate-200">{item}</span></div>)}</div>;
}

function Participants({ tournament }: { tournament: TournamentCard }) {
  const [query, setQuery] = useState("");
  const mainRequirement =
    tournament.brackets.find((bracket) =>
      bracket.name.startsWith("Main")
    )?.requirement ?? "Configured ELO rules";
  const challengeRequirement =
    tournament.brackets.find((bracket) =>
      bracket.name.startsWith("Challenge")
    )?.requirement ?? "Configured ELO rules";
  const participantsByBracket = useMemo(
    () => ({
      main: tournament.participants.filter((participant) =>
        participant.bracketName.startsWith("Main")
      ),
      challenge: tournament.participants.filter((participant) =>
        participant.bracketName.startsWith("Challenge")
      ),
    }),
    [tournament.participants]
  );
  const filteredByBracket = useMemo(() => {
      const matchesQuery = (participant: TournamentParticipant) =>
        `${participant.name} ${participant.country} ${participant.elo}`
          .toLowerCase()
          .includes(query.toLowerCase());

      return {
        main: participantsByBracket.main.filter(matchesQuery),
        challenge: participantsByBracket.challenge.filter(matchesQuery),
      };
    },
    [participantsByBracket, query]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-black text-white">{tournament.title} Entries</h2>
          <p className="mt-1 text-sm text-slate-400">Approved participants separated by their ELO-eligible bracket.</p>
        </div>
        <div className="relative w-full md:w-80">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search entries" className="w-full rounded border border-slate-700 bg-slate-950 py-2 pl-10 pr-3 text-sm text-white outline-none focus:border-sky-500" />
        </div>
      </div>
      <ParticipantSection
        title="Main Bracket Participants"
        requirement={mainRequirement}
        participants={filteredByBracket.main}
        totalCount={participantsByBracket.main.length}
      />
      <ParticipantSection
        title="Challenger Bracket Participants"
        requirement={challengeRequirement}
        participants={filteredByBracket.challenge}
        totalCount={participantsByBracket.challenge.length}
      />
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
          <p className="mt-1 text-sm text-slate-500">{requirement}</p>
        </div>
        <StatusPill tone="blue">
          {totalCount} Approved
        </StatusPill>
      </div>
      <div className="mt-5 overflow-hidden rounded-xl border border-slate-800">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-slate-950 text-xs uppercase tracking-wider text-slate-500">
            <tr><th className="px-4 py-3">#</th><th className="px-4 py-3">Player</th><th className="px-4 py-3">Country</th><th className="px-4 py-3">ELO</th><th className="px-4 py-3">Status</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {participants.map((participant, index) => <tr key={participant.registrationId} className="bg-slate-900/40 hover:bg-slate-800/60"><td className="px-4 py-3 font-mono text-slate-400">#{index + 1}</td><td className="px-4 py-3 font-bold text-white">{participant.name}</td><td className="px-4 py-3 text-slate-300">{participant.country}</td><td className="px-4 py-3 text-slate-300">{participant.elo}</td><td className="px-4 py-3"><StatusPill tone="green">Approved</StatusPill></td></tr>)}
            {participants.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-500">No approved participants in this bracket.</td></tr>}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Brackets({
  tournament,
  viewer,
  matchResultSubmissions,
  matchResultReportGroups,
}: {
  tournament: TournamentCard;
  viewer: TournamentViewer;
  matchResultSubmissions: MatchResultSubmission[];
  matchResultReportGroups: MatchResultReportGroup[];
}) {
  const participantsById = new Map(
    tournament.bracketParticipants.map((participant) => [
      participant.registrationId,
      participant,
    ])
  );
  const [selectedAdminMatchId, setSelectedAdminMatchId] =
    useState<string | null>(null);
  const selectedAdminMatch =
    selectedAdminMatchId === null
      ? null
      : tournament.generatedBrackets
          .flatMap((generated) => generated.matches)
          .find((match) => match.id === selectedAdminMatchId) ?? null;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-black text-white">{tournament.title} Brackets</h2>
          <p className="mt-1 text-sm text-slate-400">{tournament.brackets.map((bracket) => `${bracket.name}: ${bracket.requirement}`).join(" - ")}</p>
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
        const canOpenResults = Boolean(
          generated &&
            (viewer.isAdmin ||
              generated.matches.some(
                (match) =>
                  viewer.registrationIds.includes(
                    match.playerOneRegistrationId ?? ""
                  ) ||
                  viewer.registrationIds.includes(
                    match.playerTwoRegistrationId ?? ""
                  )
              ) ||
              matchResultSubmissions.some((submission) =>
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
                      matches={generated.matches}
                      participantsById={participantsById}
                      viewer={viewer}
                      matchResultSubmissions={matchResultSubmissions}
                      matchResultReportGroups={matchResultReportGroups}
                    />
                  )}
                </div>
                <p className="mt-1 text-sm text-slate-400">
                  {generated
                      ? `${formatCompetitionFormat(generated.format)} - ${generated.slotCount} empty player slots`
                      : `${approvedCount} approved - at least 2 required`}
                </p>
              </div>
              {generated && (
                <span className="text-xs uppercase tracking-wider text-slate-500">
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
            {!generated ? (
              <p className="mt-6 rounded-xl border border-dashed border-slate-700 p-8 text-center text-slate-500">
                The empty bracket structure will generate automatically when
                this bracket has at least two approved participants.
              </p>
            ) : generated.format === "round_robin" ? (
              <RoundRobinBracket
                matches={generated.matches}
                standings={generated.standings}
                participantsById={participantsById}
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
          participantsById={participantsById}
          viewer={viewer}
          submissions={matchResultSubmissions.filter(
            (submission) => submission.matchId === selectedAdminMatch.id
          )}
          reportGroups={matchResultReportGroups.filter(
            (reportGroup) => reportGroup.matchId === selectedAdminMatch.id
          )}
          onClose={() => setSelectedAdminMatchId(null)}
        />
      )}
    </div>
  );
}

function BracketMatchResultsWorkspace({
  bracketName,
  matches,
  participantsById,
  viewer,
  matchResultSubmissions,
  matchResultReportGroups,
}: {
  bracketName: string;
  matches: GeneratedTournamentMatch[];
  participantsById: Map<string, TournamentParticipant>;
  viewer: TournamentViewer;
  matchResultSubmissions: MatchResultSubmission[];
  matchResultReportGroups: MatchResultReportGroup[];
}) {
  const [open, setOpen] = useState(false);
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
    return viewer.isAdmin || canSubmit || hasVisibleSubmission || hasVisibleReportGroup;
  });
  const pendingCount = visibleMatches.reduce(
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

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-xl border border-orange-400/40 bg-orange-500/10 px-4 py-2 text-xs font-black uppercase tracking-wider text-orange-100 transition hover:border-orange-300 hover:bg-orange-500/20 hover:shadow-[0_0_24px_rgba(249,115,22,0.15)]"
      >
        <Settings2 size={15} />
        {viewer.isAdmin ? "Manage Match Results" : "Match Results"}
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
              <div className="fixed inset-0 z-[9999] grid place-items-center p-3 sm:p-6">
                <motion.button
                  type="button"
                  aria-label="Close match result workspace"
                  onClick={() => setOpen(false)}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 h-full w-full cursor-default bg-black/85 backdrop-blur-md"
                />
                <motion.section
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby={`match-results-${bracketName}`}
                  initial={{ opacity: 0, scale: 0.96, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97, y: 12 }}
                  transition={{ duration: 0.22 }}
                  className="relative flex h-[78vh] w-[94vw] flex-col overflow-hidden rounded-3xl border border-orange-400/30 bg-[radial-gradient(circle_at_top_right,rgba(249,115,22,0.14),transparent_32%),linear-gradient(145deg,rgba(15,23,42,0.98),rgba(3,7,18,0.99))] shadow-[0_0_90px_rgba(249,115,22,0.18)] lg:w-[70vw] xl:w-[66vw]"
                >
                  <header className="relative shrink-0 border-b border-white/10 px-6 py-5 sm:px-8 sm:py-6">
                    <div className="absolute inset-y-0 left-0 w-1 bg-orange-500 shadow-[0_0_24px_rgba(249,115,22,0.9)]" />
                    <div className="flex items-start justify-between gap-5">
                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.3em] text-orange-300">
                          Tournament Administration Workspace
                        </p>
                        <h2
                          id={`match-results-${bracketName}`}
                          className="mt-2 text-2xl font-black text-white sm:text-3xl"
                        >
                          {bracketName} Match Results
                        </h2>
                        <p className="mt-2 text-sm text-slate-400">
                          Review scores, proof files, player notes, and official
                          decisions without crowding the public bracket.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setOpen(false)}
                        className="shrink-0 rounded-xl border border-white/10 bg-white/5 p-3 text-slate-300 transition hover:border-orange-400/50 hover:bg-orange-500/10 hover:text-white"
                        aria-label="Close match result workspace"
                      >
                        <X size={20} />
                      </button>
                    </div>
                    <div className="mt-5 flex flex-wrap gap-3 text-xs font-bold uppercase tracking-wider text-slate-400">
                      <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                        {visibleMatches.length} matches
                      </span>
                      <span className="rounded-full border border-amber-400/20 bg-amber-500/10 px-3 py-1.5 text-amber-200">
                        {pendingCount} pending reviews
                      </span>
                    </div>
                  </header>

                  <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-8 sm:py-8">
                    <div className="space-y-7">
                      {visibleMatches.map((match) => {
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
                            className="rounded-3xl border border-white/10 bg-black/30 p-5 shadow-xl shadow-black/20 sm:p-7"
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
                            <MatchResultControls
                              match={match}
                              participantsById={participantsById}
                              isAdmin={viewer.isAdmin}
                              viewerClerkUserId={viewer.clerkUserId}
                              canSubmit={viewer.registrationIds.some(
                                (registrationId) =>
                                  registrationId ===
                                    match.playerOneRegistrationId ||
                                  registrationId ===
                                    match.playerTwoRegistrationId
                              )}
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

function AdminMatchManagementModal({
  tournament,
  match,
  participantsById,
  viewer,
  submissions,
  reportGroups,
  onClose,
}: {
  tournament: TournamentCard;
  match: GeneratedTournamentMatch;
  participantsById: Map<string, TournamentParticipant>;
  viewer: TournamentViewer;
  submissions: MatchResultSubmission[];
  reportGroups: MatchResultReportGroup[];
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
    ) ?? reportGroups[0];

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
          className="relative flex max-h-[88vh] w-[94vw] max-w-5xl flex-col overflow-hidden rounded-3xl border border-orange-400/30 bg-[radial-gradient(circle_at_top_right,rgba(249,115,22,0.14),transparent_32%),linear-gradient(145deg,rgba(15,23,42,0.98),rgba(3,7,18,0.99))] shadow-[0_0_90px_rgba(249,115,22,0.18)]"
        >
          <header className="relative shrink-0 border-b border-white/10 px-5 py-5 sm:px-7">
            <div className="absolute inset-y-0 left-0 w-1 bg-orange-500 shadow-[0_0_24px_rgba(249,115,22,0.9)]" />
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-[0.28em] text-orange-300">
                  Direct Match Management
                </p>
                <h2
                  id={`admin-match-${match.id}`}
                  className="mt-2 break-words text-2xl font-black text-white"
                >
                  {tournament.title}
                </h2>
                <p className="mt-2 text-sm text-slate-400">
                  {match.roundName} - Match {match.matchNumber}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="shrink-0 rounded-xl border border-white/10 bg-white/5 p-3 text-slate-300 transition hover:border-orange-400/50 hover:bg-orange-500/10 hover:text-white"
                aria-label="Close match management"
              >
                <X size={20} />
              </button>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-7">
            <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
              <div className="rounded-2xl border border-white/10 bg-black/30 p-5">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs font-black uppercase tracking-wider text-slate-400">
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

              <div className="rounded-2xl border border-white/10 bg-black/25 p-5 text-xs leading-5 text-slate-300">
                <p className="text-xs font-black uppercase tracking-wider text-slate-400">
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
                      activeReportGroup
                        ? activeReportGroup.status.replaceAll("_", " ")
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
              </div>
            </div>

            <div className="mt-5 rounded-3xl border border-white/10 bg-black/25 p-4 sm:p-5">
              <MatchResultControls
                match={match}
                participantsById={participantsById}
                isAdmin={viewer.isAdmin}
                viewerClerkUserId={viewer.clerkUserId}
                canSubmit={viewer.registrationIds.some(
                  (registrationId) =>
                    registrationId === match.playerOneRegistrationId ||
                    registrationId === match.playerTwoRegistrationId
                )}
                submissions={submissions}
                reportGroups={reportGroups}
                participantOptions={tournament.bracketParticipants}
                showDirectAdminControls
                presentation="workspace"
              />
            </div>
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
      className={classNames(
        "flex items-center justify-between gap-4 rounded-xl border px-4 py-3",
        winner
          ? "border-orange-400/35 bg-orange-500/10 text-white"
          : "border-white/10 bg-white/[0.03] text-slate-300"
      )}
    >
      <div className="min-w-0">
        <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">
          {label}
        </p>
        <p className="mt-1 truncate text-sm font-black">{value}</p>
      </div>
      <div className="flex items-center gap-3">
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
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-bold capitalize text-slate-100">
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
      className="relative isolate mt-6 overflow-visible rounded-2xl border border-orange-300/50 bg-[radial-gradient(circle_at_50%_0%,rgba(251,146,60,0.28),transparent_42%),linear-gradient(135deg,rgba(28,15,8,0.98),rgba(2,6,23,0.98)_62%,rgba(67,20,7,0.92))] px-6 py-9 text-center shadow-[0_0_55px_rgba(249,115,22,0.24),inset_0_1px_0_rgba(255,255,255,0.12)]"
    >
      <div className="pointer-events-none absolute -inset-8 -z-10 bg-[radial-gradient(circle,rgba(249,115,22,0.18),transparent_62%)] blur-xl" />
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
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
      <p className="mt-4 text-xs font-bold uppercase tracking-wider text-slate-400">
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

function SingleEliminationBracket({
  matches,
  participantsById,
  onAdminMatchSelect,
}: {
  matches: GeneratedTournamentMatch[];
  participantsById: Map<string, TournamentParticipant>;
  onAdminMatchSelect?: (match: GeneratedTournamentMatch) => void;
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
    <div className="relative mt-6 overflow-x-auto rounded-2xl border border-orange-500/15 bg-[radial-gradient(circle_at_top,rgba(249,115,22,0.10),transparent_32%),linear-gradient(180deg,rgba(15,23,42,0.92),rgba(2,6,23,0.96))] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-white/5 pb-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.24em] text-orange-300">
            Live Bracket
          </p>
          <p className="mt-1 text-sm text-slate-400">
            Winners advance from left to right toward the Grand Final.
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs font-bold uppercase tracking-wider text-slate-500">
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
                  "rounded-xl border px-4 py-3 backdrop-blur",
                  isActive
                    ? "border-orange-400/50 bg-orange-500/10 shadow-[0_0_24px_rgba(249,115,22,0.12)]"
                    : "border-white/10 bg-white/[0.03]"
                )}
              >
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-500">
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
                    isActiveRound={isActive}
                    hasNextRound={roundIndex < rounds.length - 1}
                    connectorDirection={
                      matchIndex % 2 === 0 ? "down" : "up"
                    }
                    onAdminSelect={
                      onAdminMatchSelect
                        ? () => onAdminMatchSelect(match)
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
  isActiveRound,
  hasNextRound,
  connectorDirection,
  onAdminSelect,
}: {
  match: Match;
  isActiveRound: boolean;
  hasNextRound: boolean;
  connectorDirection: "up" | "down";
  onAdminSelect?: () => void;
}) {
  const completed = match.status === "complete";
  const live = match.status === "live";
  const pendingReview = match.status === "pending_review";
  const card = (
    <div
      className={classNames(
        "overflow-hidden rounded-xl border bg-slate-950/70 text-left shadow-2xl backdrop-blur-xl transition",
        onAdminSelect && "cursor-pointer hover:border-orange-300/80",
        live
          ? "border-orange-400/80 shadow-[0_0_28px_rgba(249,115,22,0.22)]"
          : pendingReview
            ? "border-amber-400/50 shadow-[0_0_22px_rgba(251,191,36,0.12)]"
          : completed
            ? "border-emerald-500/30 shadow-black/30"
            : isActiveRound
              ? "border-orange-500/35 shadow-[0_0_18px_rgba(249,115,22,0.10)]"
              : "border-white/10 shadow-black/30"
      )}
    >
      <div className="flex items-center justify-between border-b border-white/5 bg-white/[0.03] px-3 py-2">
        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
          Match {match.id}
        </span>
        <div className="flex items-center gap-2">
          {onAdminSelect && (
            <span className="rounded border border-orange-400/25 bg-orange-500/10 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-orange-200">
              Manage
            </span>
          )}
          <MatchStatus status={match.status} />
        </div>
      </div>
      <BroadcastTeamRow team={match.teamA} />
      <BroadcastTeamRow team={match.teamB} />
    </div>
  );

  return (
    <motion.div
      whileHover={{ y: -3, scale: 1.015 }}
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
    </motion.div>
  );
}

function MatchStatus({ status }: { status: Match["status"] }) {
  const styles = {
    upcoming: "text-slate-400",
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
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-white/10 bg-black/40 font-mono text-[10px] text-slate-500">
        {team.seed > 0 ? team.seed : "—"}
      </span>
      <span
        className={classNames(
          "min-w-0 flex-1 truncate text-sm",
          team.winner ? "font-black text-white" : "font-bold text-slate-300"
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
  onAdminMatchSelect,
}: {
  matches: GeneratedTournamentMatch[];
  standings: TournamentCard["generatedBrackets"][number]["standings"];
  participantsById: Map<string, TournamentParticipant>;
  onAdminMatchSelect?: (match: GeneratedTournamentMatch) => void;
}) {
  return (
    <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_340px]">
      <div className="grid gap-4 md:grid-cols-2">
        {matches.map((match) => (
          <MatchCard
            key={match.id}
            match={toDisplayMatch(match, participantsById)}
            onAdminSelect={
              onAdminMatchSelect ? () => onAdminMatchSelect(match) : undefined
            }
          />
        ))}
      </div>
      <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
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
                className="grid grid-cols-[32px_1fr_auto] gap-3 rounded-lg bg-slate-900 p-3 text-sm"
              >
                <span className="font-mono text-slate-500">
                  {standing.rank ?? index + 1}
                </span>
                <span className="font-bold text-white">
                  {participantsById.get(standing.registrationId)?.name ??
                    "Participant"}
                </span>
                <span className="text-slate-400">
                      {standing.wins}W {standing.losses}L - {standing.points} pts
                </span>
              </div>
            ))}
          {standings.length === 0 && (
            <p className="rounded-lg border border-dashed border-slate-800 p-4 text-sm text-slate-500">
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
  onAdminSelect,
}: {
  match: Match;
  onAdminSelect?: () => void;
}) {
  const card = (
    <div
      className={classNames(
        "overflow-hidden rounded-xl border bg-slate-950/70 text-left shadow-xl backdrop-blur",
        onAdminSelect && "cursor-pointer transition hover:border-orange-300/80",
        match.status === "live"
          ? "border-orange-400/70 shadow-[0_0_24px_rgba(249,115,22,0.18)]"
          : match.status === "complete"
            ? "border-emerald-500/25"
            : "border-white/10"
      )}
    >
      <div className="flex items-center justify-between border-b border-white/5 bg-white/[0.03] px-3 py-2">
        <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-slate-500">Match {match.id}</span>
        <div className="flex items-center gap-2">
          {onAdminSelect && (
            <span className="rounded border border-orange-400/25 bg-orange-500/10 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-orange-200">
              Manage
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
      whileHover={{ y: -2 }}
      className="rounded-xl"
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
  return <div className={classNames("flex items-center gap-2 border-b border-white/5 px-3 py-3 text-sm last:border-0", team.winner ? "bg-orange-500/10 text-white" : "text-slate-300")}><span className="w-7 font-mono text-xs text-slate-500">{team.seed > 0 ? `#${team.seed}` : "—"}</span><span className={classNames("min-w-0 flex-1 truncate", team.winner && "font-bold text-orange-100")}>{team.name}</span><span className="grid h-7 w-8 place-items-center rounded border border-white/10 bg-black/40 font-mono text-xs text-white">{team.score ?? "-"}</span></div>;
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

  return <Card><h2 className="text-xl font-black text-white">{tournament.title} Resources</h2>{links.length > 0 ? <div className="mt-5 grid gap-4 md:grid-cols-2">{links.map((link) => <a key={link.label} href={link.url} target="_blank" rel="noreferrer" className="group aspect-video rounded-xl border border-slate-700 bg-cover bg-center p-4 transition hover:border-orange-500" style={{ backgroundImage: `linear-gradient(135deg,rgba(15,23,42,0.88),rgba(2,6,23,0.45)),url(${tournament.image})` }}><PlayCircle className="text-white opacity-90" /><p className="mt-20 text-sm font-bold text-white">{link.label}</p><p className="text-xs text-slate-300">Open tournament resource</p></a>)}</div> : <p className="mt-5 rounded-xl border border-dashed border-slate-700 p-8 text-center text-slate-500">No tournament resources have been published.</p>}</Card>;
}

function Announcements({ tournament }: { tournament: TournamentCard }) {
  const messages = [
    `${tournament.title} is currently ${tournament.status.toLowerCase()}.`,
    `Grand Final: ${formatOptionalDateTime(tournament.grandFinalAt, "TBA")}.`,
    `${tournament.players} approved participants are currently listed across ${tournament.brackets.length} bracket${tournament.brackets.length === 1 ? "" : "s"}. Full brackets and brackets with an existing queue accept waitlist registrations while registration remains open.`,
  ];
  return <div className="space-y-4">{messages.map((text, index) => <Card key={text}><div className="flex gap-3"><Radio size={18} className="mt-1 text-orange-300" /><div><p className="text-xs font-black uppercase tracking-wider text-slate-500">IronClad Update {index + 1}</p><p className="mt-1 text-slate-200">{text}</p></div></div></Card>)}</div>;
}

function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={classNames("rounded-2xl border border-slate-800 bg-[#111827]/90 p-5 shadow-2xl shadow-black/20", className)}>{children}</section>;
}

type RegistrationStep =
  | "tournament"
  | "profile"
  | "agreements"
  | "submitted";

type RegistrationFormState = {
  tournamentTitle: string;
  bracketName: string;
  rulebookAgreement: boolean;
  playerParticipationAgreement: boolean;
  adminFinalDecisionAgreement: boolean;
  ownershipConfirmation: boolean;
};

type RegistrationErrors = Partial<Record<keyof RegistrationFormState | "agreements", string>>;

function RegisterModal({
  onClose,
  profile,
  tournaments,
  initialTournamentId,
}: {
  onClose: () => void;
  profile: PlayerProfile;
  tournaments: TournamentCard[];
  initialTournamentId: string;
}) {
  const initialTournament =
    tournaments.find((tournament) => tournament.id === initialTournamentId) ??
    tournaments[0];
  const currentElo = Number(profile.current_elo);
  const getDefaultBracket = (tournament: TournamentCard) =>
    tournament.brackets.find(
      (bracket) =>
        !bracket.isWaitlistOnly &&
        isEligibleForBracket(currentElo, bracket.requirement)
    )?.name ??
    tournament.brackets.find((bracket) =>
      isEligibleForBracket(currentElo, bracket.requirement)
    )?.name ??
    "";
  const [step, setStep] = useState<RegistrationStep>("tournament");
  const [errors, setErrors] = useState<RegistrationErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState("");
  const [successMessage, setSuccessMessage] = useState("Registration submitted.");
  const [selectedTournament, setSelectedTournament] =
    useState<TournamentCard>(initialTournament);
  const eligibleBracketNames = getEligibleBracketNames(
    currentElo,
    selectedTournament.brackets
  );
  const [form, setForm] = useState<RegistrationFormState>({
    tournamentTitle: initialTournament.title,
    bracketName: getDefaultBracket(initialTournament),
    rulebookAgreement: false,
    playerParticipationAgreement: false,
    adminFinalDecisionAgreement: false,
    ownershipConfirmation: false,
  });

  const updateField = <K extends keyof RegistrationFormState>(field: K, value: RegistrationFormState[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const selectTournament = (event: TournamentCard) => {
    setSelectedTournament(event);
    setForm((current) => ({
      ...current,
      tournamentTitle: event.title,
      bracketName: getDefaultBracket(event),
    }));
    setErrors((current) => ({ ...current, tournamentTitle: undefined, bracketName: undefined }));
  };

  const validateStep = (targetStep: RegistrationStep) => {
    const nextErrors: RegistrationErrors = {};

    if (targetStep === "tournament") {
      if (!isTournamentRegistrationOpen(selectedTournament)) {
        nextErrors.tournamentTitle =
          "This tournament is full or already in progress. We hope to see you in the next one.";
      } else if (!form.tournamentTitle.trim()) {
        nextErrors.tournamentTitle = "Please select a tournament.";
      }

      const selectedBracket = selectedTournament.brackets.find(
        (bracket) => bracket.name === form.bracketName
      );

      if (!form.bracketName.trim() || !selectedBracket) {
        nextErrors.bracketName = "Please select a bracket or event type.";
      } else if (
        !isEligibleForBracket(currentElo, selectedBracket.requirement)
      ) {
        nextErrors.bracketName = `Your saved ELO of ${currentElo} does not satisfy this bracket requirement: ${selectedBracket.requirement}.`;
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

  const submitRegistration = async () => {
    if (!isTournamentRegistrationOpen(selectedTournament)) {
      setSubmissionError(
        "This tournament is full or already in progress. We hope to see you in the next one."
      );
      setStep("tournament");
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
    });

    setIsSubmitting(false);

    if (!result.success) {
      setSubmissionError(result.message);
      return;
    }

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

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/85 px-4 py-6">
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-700 bg-[#111827] shadow-2xl shadow-black/50">
        <div className="sticky top-0 z-10 border-b border-slate-800 bg-[#111827]/95 p-5 backdrop-blur">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-orange-300">IronClad Registration</p>
              <h3 className="mt-1 break-words text-2xl font-black text-white">Esports Player Registration</h3>
            </div>
            <button onClick={onClose} className="shrink-0 rounded bg-slate-800 p-2 text-slate-200 transition hover:bg-slate-700">
              <X size={18} />
            </button>
          </div>

          <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-800">
            <div className="h-full rounded-full bg-orange-500 transition-all duration-300" style={{ width: `${Math.min((currentStepNumber / steps.length) * 100, 100)}%` }} />
          </div>
        </div>

        <div className="p-5">
          {step === "tournament" && (
            <div className="space-y-5">
              <div>
                <h4 className="text-xl font-black text-white">Tournament Selection</h4>
                <p className="mt-2 text-sm leading-6 text-slate-300">Select the tournament and bracket/event type you want to join.</p>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {tournaments.map((event) => {
                  const selected = selectedTournament.title === event.title;
                  const registrationAvailable =
                    isTournamentRegistrationOpen(event);
                  return (
                    <button
                      key={event.title}
                      disabled={!registrationAvailable}
                      onClick={() => selectTournament(event)}
                      className={classNames("overflow-hidden rounded-xl border bg-cover bg-center p-4 text-left transition-all duration-300 hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:scale-100", selected ? "border-orange-500 shadow-[0_0_24px_rgba(249,115,22,0.24)]" : "border-slate-700 hover:border-orange-500/70")}
                      style={{ backgroundImage: `linear-gradient(135deg,rgba(15,23,42,0.94),rgba(2,6,23,0.68)),url(${event.image})` }}
                    >
                      <p className="break-words text-lg font-black text-white">{event.title}</p>
                      <p className="mt-2 text-xs font-bold uppercase tracking-wider text-orange-300">{event.month} - {event.format} - {event.status}</p>
                      <p className="mt-3 break-words text-sm leading-6 text-slate-300">{event.description}</p>
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

              <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-4">
                <div className="grid gap-4 md:grid-cols-[180px_1fr]">
                  <div className="h-32 rounded-lg bg-cover bg-center" style={{ backgroundImage: `linear-gradient(135deg,rgba(15,23,42,0.25),rgba(2,6,23,0.55)),url(${selectedTournament.image})` }} />
                  <div className="min-w-0">
                    <h5 className="break-words text-lg font-black text-white">{selectedTournament.title}</h5>
                    <div className="mt-3 grid gap-2 text-sm text-slate-300 sm:grid-cols-2">
                      <p><span className="font-bold text-slate-500">Format:</span> {selectedTournament.format}</p>
                      <p><span className="font-bold text-slate-500">Rule Format:</span> {selectedTournament.ruleFormatLabel}</p>
                      <p><span className="font-bold text-slate-500">Status:</span> {selectedTournament.status}</p>
                      {hasPrize(selectedTournament) && (
                        <p><span className="font-bold text-slate-500">Prize Pool:</span> {selectedTournament.prizePool}</p>
                      )}
                      <p><span className="font-bold text-slate-500">Grand Final:</span> {formatOptionalDateTime(selectedTournament.grandFinalAt, "TBA")}</p>
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {selectedTournament.brackets.map((bracket) => {
                    const selected = form.bracketName === bracket.name;
                    const eligible = isEligibleForBracket(
                      currentElo,
                      bracket.requirement
                    );
                    return (
                      <button
                        key={bracket.name}
                        disabled={!eligible}
                        onClick={() => updateField("bracketName", bracket.name)}
                        className={classNames(
                          "rounded-lg border p-4 text-left transition-all duration-300 hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:scale-100",
                          selected
                            ? "border-orange-500 bg-orange-500/10"
                            : "border-slate-700 bg-slate-950/40 hover:border-orange-500/70"
                        )}
                      >
                        <p className="break-words font-black text-white">{bracket.name}</p>
                        <p className="mt-1 break-words text-xs text-slate-400">
                          {bracket.requirement} - {bracket.registeredPlayers} approved - {bracket.maxPlayers}
                        </p>
                        <p className="mt-2 break-words text-sm font-bold text-orange-300">
                          {bracket.isWaitlistOnly
                            ? bracket.isFull
                              ? "Approved roster full - waitlist only"
                              : "Waitlist active - queued registrations first"
                            : bracket.prize}
                        </p>
                        {bracket.isWaitlistOnly && (
                          <p className="mt-2 text-xs font-black uppercase tracking-wider text-amber-300">
                            Waitlist Only
                          </p>
                        )}
                        {!eligible && (
                          <p className="mt-2 text-xs font-black uppercase tracking-wider text-amber-300">
                            Requires {bracket.requirement}
                          </p>
                        )}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-3 text-sm text-slate-400">
                  Your saved ELO is {currentElo}. You are eligible for the{" "}
                  <span className="font-bold text-orange-300">
                    {eligibleBracketNames.length > 0
                      ? eligibleBracketNames.join(" or ")
                      : "no configured bracket"}
                  </span>
                  .
                </p>
                {errors.bracketName && <FieldError message={errors.bracketName} />}
              </div>

              <ModalButtons onClose={onClose} onNext={goToProfileStep} />
            </div>
          )}

          {step === "profile" && (
            <div className="space-y-5">
              <div>
                <h4 className="text-xl font-black text-white">Player Profile Confirmation</h4>
                <p className="mt-2 text-sm leading-6 text-slate-300">Registration uses your saved IronClad player profile. Update your profile before continuing if any information is outdated.</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <RegistrationProfileValue label="Display Name" value={profile.display_name} />
                <RegistrationProfileValue label="IGN" value={profile.in_game_name} />
                <RegistrationProfileValue label="Discord" value={profile.discord_username} />
                <RegistrationProfileValue label="Steam" value={profile.steam_username} />
                <RegistrationProfileValue label="Country" value={profile.country} />
                <RegistrationProfileValue label="Region" value={profile.region} />
                <RegistrationProfileValue label="Timezone" value={profile.timezone} />
                <RegistrationProfileValue label="Current ELO" value={String(profile.current_elo)} />
                <RegistrationProfileValue label="CoH3 Player Card" value={profile.coh3_player_card_url} className="sm:col-span-2" />
              </div>

              <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/25 p-4">
                <p className="text-sm font-black uppercase tracking-wider text-emerald-300">Profile Complete</p>
                <p className="mt-2 text-sm leading-6 text-slate-200">Your saved profile identity will be attached to this registration. Final bracket placement and ELO verification remain subject to admin review.</p>
              </div>

              <Link href="/profile" className="inline-flex text-sm font-bold text-orange-300 transition hover:text-orange-200">Update Player Profile</Link>

              <ModalButtons onBack={() => setStep("tournament")} onNext={() => setStep("agreements")} />
            </div>
          )}

          {step === "agreements" && (
            <div className="space-y-5">
              <div>
                <h4 className="text-xl font-black text-white">Rules & Agreements</h4>
                <p className="mt-2 text-sm leading-6 text-slate-300">Confirm all required agreements before submitting your registration.</p>
              </div>

              <div className="space-y-3">
                <AgreementCheckbox label="Rulebook Agreement" checked={form.rulebookAgreement} onChange={(checked) => updateField("rulebookAgreement", checked)} error={errors.rulebookAgreement} />
                <AgreementCheckbox label="Player Participation Agreement" checked={form.playerParticipationAgreement} onChange={(checked) => updateField("playerParticipationAgreement", checked)} error={errors.playerParticipationAgreement} />
                <AgreementCheckbox label="Admin Final Decision Agreement" checked={form.adminFinalDecisionAgreement} onChange={(checked) => updateField("adminFinalDecisionAgreement", checked)} error={errors.adminFinalDecisionAgreement} />
                <AgreementCheckbox label="Ownership Confirmation" checked={form.ownershipConfirmation} onChange={(checked) => updateField("ownershipConfirmation", checked)} error={errors.ownershipConfirmation} />
              </div>

              {submissionError && (
                <div className="rounded-xl border border-orange-500/50 bg-orange-500/10 p-4 text-sm font-bold text-orange-200">
                  {submissionError}
                </div>
              )}

              <ModalButtons onBack={() => setStep("profile")} onNext={submitRegistration} nextLabel="Submit Registration" isLoading={isSubmitting} />
            </div>
          )}

          {step === "submitted" && (
            <div className="grid place-items-center py-10 text-center">
              <div className="grid h-16 w-16 place-items-center rounded-full border border-emerald-400/70 bg-emerald-950/40 shadow-[0_0_32px_rgba(16,185,129,0.35)]">
                <CheckCircle2 className="text-emerald-300" size={30} />
              </div>
              <h4 className="mt-5 text-2xl font-black text-white">Registration Submitted</h4>
              <p className="mt-2 text-sm font-bold uppercase tracking-wider text-emerald-300">{successMessage}</p>
              <p className="mt-3 max-w-md text-sm leading-6 text-slate-300">Registrations are reviewed within 24 hours.</p>
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
    <div className={classNames("min-w-0 rounded-xl border border-slate-700 bg-slate-950/50 p-4", className)}>
      <p className="text-xs font-black uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-2 break-words text-sm font-bold text-white">{value || "N/A"}</p>
    </div>
  );
}

function AgreementCheckbox({ label, checked, onChange, error }: { label: string; checked: boolean; onChange: (checked: boolean) => void; error?: string }) {
  return (
    <div>
      <label className={classNames("flex cursor-pointer items-start gap-3 rounded-xl border bg-slate-950/40 p-4 transition hover:border-orange-500/70 hover:bg-orange-500/10", error ? "border-orange-400/80" : "border-slate-700")}>
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          className="mt-1 h-4 w-4 shrink-0 accent-orange-500"
          aria-invalid={Boolean(error)}
        />
        <span className="break-words text-sm font-bold text-slate-200">{label}</span>
      </label>
      <FieldError message={error} />
    </div>
  );
}

function ModalButtons({ onClose, onBack, onNext, nextLabel = "Continue", isLoading = false }: { onClose?: () => void; onBack?: () => void; onNext: () => void | Promise<void>; nextLabel?: string; isLoading?: boolean }) {
  return (
    <div className="flex flex-col-reverse gap-3 border-t border-slate-800 pt-5 sm:flex-row sm:justify-between">
      <div>
        {onBack && <button onClick={onBack} className="w-full rounded border border-slate-700 px-5 py-3 text-xs font-black uppercase tracking-wide text-slate-300 transition hover:border-slate-500 hover:text-white sm:w-auto">Back</button>}
        {onClose && <button onClick={onClose} className="w-full rounded border border-slate-700 px-5 py-3 text-xs font-black uppercase tracking-wide text-slate-300 transition hover:border-slate-500 hover:text-white sm:w-auto">Cancel</button>}
      </div>
      <button disabled={isLoading} onClick={onNext} className="w-full rounded bg-orange-500 px-5 py-3 text-xs font-black uppercase tracking-wide text-white transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto">{isLoading ? "Submitting..." : nextLabel}</button>
    </div>
  );
}

function MainContent({
  activeTab,
  tournament,
  tournaments,
  viewer,
  matchResultSubmissions,
  matchResultReportGroups,
}: {
  activeTab: TabKey;
  tournament: TournamentCard;
  tournaments: TournamentCard[];
  viewer: TournamentViewer;
  matchResultSubmissions: MatchResultSubmission[];
  matchResultReportGroups: MatchResultReportGroup[];
}) {
  return (
    <main className="px-5 py-6 lg:px-8">
      {activeTab === "overview" && (
        <Overview tournament={tournament} tournaments={tournaments} />
      )}
      {activeTab === "participants" && <Participants tournament={tournament} />}
      {activeTab === "brackets" && (
        <Brackets
          tournament={tournament}
          viewer={viewer}
          matchResultSubmissions={matchResultSubmissions}
          matchResultReportGroups={matchResultReportGroups}
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
      <div className="w-full max-w-lg rounded-3xl border border-orange-500/30 bg-[#111827] p-6 shadow-2xl shadow-orange-950/40">
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
            className="shrink-0 rounded-lg bg-slate-800 p-2 text-slate-300 transition hover:bg-slate-700 hover:text-white"
            aria-label="Close registration prompt"
          >
            <X size={18} />
          </button>
        </div>

        <p className="mt-4 leading-7 text-slate-300">{content.description}</p>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {type === "account" && (
            <>
              <Link
                href="/sign-in"
                className="rounded-xl border border-slate-700 bg-slate-950/50 px-4 py-3 text-center text-sm font-black uppercase tracking-wide text-white transition hover:border-orange-500"
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
  clerkUserId: string | null;
  registrationIds: string[];
};

export default function TournamentsExperience({
  tournaments,
  viewer,
  matchResultSubmissions,
  matchResultReportGroups,
}: {
  tournaments: TournamentCard[];
  viewer: TournamentViewer;
  matchResultSubmissions: MatchResultSubmission[];
  matchResultReportGroups: MatchResultReportGroup[];
}) {
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [selectedTournamentId, setSelectedTournamentId] = useState(
    tournaments[0].id
  );
  const selectedTournament =
    tournaments.find(
      (tournament) => tournament.id === selectedTournamentId
    ) ?? tournaments[0];
  const [showMobilePanel, setShowMobilePanel] = useState(false);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [registrationProfile, setRegistrationProfile] =
    useState<PlayerProfile | null>(null);
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

  const handleSelectTournament = (tournament: TournamentCard) => {
    setSelectedTournamentId(tournament.id);
    setActiveTab("overview");
  };

  const handleRegisterClick = async () => {
    if (!isTournamentRegistrationOpen(selectedTournament)) {
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

    const { data, error } = await authenticatedSupabase
      .from("players")
      .select(
        "id, clerk_user_id, display_name, in_game_name, discord_username, steam_username, coh3_player_card_url, country, region, timezone, current_elo, avatar_url, bio, profile_completed, created_at, updated_at"
      )
      .eq("clerk_user_id", userId)
      .maybeSingle();

    setIsCheckingProfile(false);

    if (error) {
      console.error("Tournament profile eligibility check failed:", error);
      setRegistrationGate("error");
      return;
    }

    const profile = (data ?? null) as PlayerProfile | null;

    if (!isPlayerProfileComplete(profile)) {
      setRegistrationGate("profile");
      return;
    }

    setRegistrationProfile(profile);
    setShowRegisterModal(true);
  };

  return (
    <div className="min-h-screen bg-black pt-20 text-slate-100">
      <div className="mx-auto flex max-w-[1600px]">
        <Sidebar
          selectedTournament={selectedTournament}
          tournaments={tournaments}
          onSelectTournament={handleSelectTournament}
        />
        <div className="min-w-0 flex-1">
          <Hero
            tournament={selectedTournament}
            onRegisterClick={handleRegisterClick}
          />
          <TopTabs activeTab={activeTab} setActiveTab={setActiveTab} />
          <MainContent
            activeTab={activeTab}
            tournament={selectedTournament}
            tournaments={tournaments}
            viewer={viewer}
            matchResultSubmissions={matchResultSubmissions}
            matchResultReportGroups={matchResultReportGroups}
          />
        </div>
      </div>

      {showRegisterModal && registrationProfile && (
        <RegisterModal
          profile={registrationProfile}
          tournaments={tournaments}
          initialTournamentId={selectedTournament.id}
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

      <button onClick={() => setShowMobilePanel(true)} className="fixed bottom-5 right-5 z-40 rounded-full bg-orange-500 p-4 text-white shadow-2xl shadow-orange-950/40 lg:hidden"><Menu size={22} /></button>
      {showMobilePanel && (
        <div className="fixed inset-0 z-50 bg-black/70 lg:hidden">
          <motion.div initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} className="ml-auto h-full w-80 bg-[#111827] p-4">
            <div className="flex items-center justify-between"><h3 className="font-black text-white">Tournament Menu</h3><button onClick={() => setShowMobilePanel(false)} className="rounded bg-slate-800 p-2"><X size={18} /></button></div>
            <div className="mt-5 space-y-2">{tabs.map((tab) => { const Icon = tab.icon; return <button key={tab.key} onClick={() => { setActiveTab(tab.key); setShowMobilePanel(false); }} className="flex w-full items-center gap-3 rounded-lg bg-slate-950/40 px-3 py-3 text-left font-semibold text-slate-200"><Icon size={17} />{tab.label}</button>; })}</div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

function isTournamentRegistrationOpen(tournament: TournamentCard) {
  const now = Date.now();
  const registrationOpens = getOptionalTimestamp(
    tournament.registrationOpenAt
  );

  return (
    tournament.statusValue === "registration_open" &&
    registrationOpens !== "invalid" &&
    (registrationOpens === null || now >= registrationOpens)
  );
}

function getOptionalTimestamp(value: string) {
  if (!value) return null;

  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : "invalid";
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
