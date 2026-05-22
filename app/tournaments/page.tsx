"use client";

import { useMemo, useState } from "react";
import type { ReactNode, ElementType } from "react";
import { motion } from "framer-motion";
import { Show, UserButton, useUser } from "@clerk/nextjs";
import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Crown,
  Flame,
  Gamepad2,
  Info,
  LayoutDashboard,
  Medal,
  Menu,
  MessageCircle,
  PlayCircle,
  Radio,
  Search,
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

type BracketInfo = {
  name: string;
  requirement: string;
  maxPlayers: string;
  prize: string;
};

type TournamentCard = {
  title: string;
  month: string;
  format: string;
  status: "Ongoing" | "Completed";
  image: string;
  battlefy: string;
  description: string;
  organizer: string;
  game: string;
  region: string;
  time: string;
  checkIn: string;
  prizePool: string;
  players: number;
  maxPlayers: number;
  brackets: BracketInfo[];
  details: string;
  rules: string;
  schedule: string[];
  contact: string;
};

type Participant = {
  seed: number;
  name: string;
  tag: string;
  status: "registered" | "captain" | "archive";
  wins: number;
  losses: number;
  region: string;
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
  status: "complete" | "live" | "upcoming";
  teamA: MatchTeam;
  teamB: MatchTeam;
};

const currentTournaments: TournamentCard[] = [
  {
    title: "Operation Skyfall",
    month: "May",
    format: "1v1",
    status: "Ongoing",
    image: "/images/tournaments/1v1-operation-skyfall.jpeg",
    battlefy: "https://battlefy.com/ironclad-tournaments/operation-skyfall/69ebc7641259b1002120aeb0/info?infoTab=details",
    description: "Monthly Company of Heroes 3 1v1 tournament with Main and Challenge brackets.",
    organizer: "IronClad Tournaments",
    game: "Company of Heroes 3",
    region: "Global",
    time: "Finals at 22:00 UTC",
    checkIn: "UNION CODE",
    prizePool: "$130 Steam Cards",
    players: 16,
    maxPlayers: 16,
    brackets: [
      { name: "Main Bracket", requirement: "ELO 1300+", maxPlayers: "Max 8 players", prize: "$100 Steam Card" },
      { name: "Challenge Bracket", requirement: "Under 1300 ELO", maxPlayers: "Max 8 players", prize: "$30 Steam Card" },
    ],
    details: "Operation Skyfall is the current May IronClad 1v1 tournament for Company of Heroes 3. Monthly 1v1 events use two brackets: Main Bracket for players with ELO 1300+ and Challenge Bracket for players under 1300 ELO.",
    rules: "Rules are listed directly on the official Battlefy tournament page. Players register using a UNION CODE provided by IronClad. Once both brackets reach 8 players, the tournament officially starts.",
    schedule: ["Register with IronClad UNION CODE", "Both 1v1 brackets fill to 8 players", "Challenge Bracket Finals · Last Saturday · 22:00 UTC", "Main Bracket Finals · Last Sunday · 22:00 UTC"],
    contact: "Use the official IronClad Battlefy page for registration, rules, match details, and tournament updates.",
  },
  {
    title: "4v4 Beta Tournament",
    month: "May",
    format: "4v4",
    status: "Ongoing",
    image: "/images/tournaments/4v4-beta-tournament.jpeg",
    battlefy: "https://battlefy.com/ironclad-tournaments/4-vs-4-beta-tournament/69fba46252cae7002ffb6701/info?infoTab=details",
    description: "Company of Heroes 3 team tournament for teams of 4 players with captains and unique team names.",
    organizer: "IronClad Tournaments",
    game: "Company of Heroes 3",
    region: "Global",
    time: "May Beta Event",
    checkIn: "Team Captain",
    prizePool: "Team Event",
    players: 8,
    maxPlayers: 8,
    brackets: [
      { name: "4v4 Team Bracket", requirement: "8 teams total", maxPlayers: "4 players per team", prize: "Beta Tournament" },
      { name: "Team Identity", requirement: "Team Captain required", maxPlayers: "Unique team name", prize: "Community Event" },
    ],
    details: "The 4v4 Beta Tournament is a current May IronClad Company of Heroes 3 event. The format supports 8 teams total, with 4 players per team. Each team must include one Team Captain and a unique team name.",
    rules: "Rules are listed directly on the official Battlefy tournament page. Each team must register with a Team Captain and maintain a complete 4-player roster. The event is designed for 8 teams total.",
    schedule: ["Create a unique team name", "Select one Team Captain", "Register the full 4-player roster", "Follow match instructions on Battlefy"],
    contact: "Use the official IronClad Battlefy page for registration, rules, match details, and tournament updates.",
  },
];

const archiveTournaments: TournamentCard[] = [
  {
    title: "The Art of War",
    month: "April",
    format: "1v1",
    status: "Completed",
    image: "/images/tournaments/1v1-the-art-of-war.jpeg",
    battlefy: "https://battlefy.com/ironclad-tournaments/the-art-of-war/69cbf56ac45e5100728854a9/info?infoTab=details",
    description: "Archived IronClad Company of Heroes 3 monthly 1v1 tournament.",
    organizer: "IronClad Tournaments",
    game: "Company of Heroes 3",
    region: "Global",
    time: "April Tournament",
    checkIn: "UNION CODE",
    prizePool: "Archived Event",
    players: 16,
    maxPlayers: 16,
    brackets: [
      { name: "Main Bracket", requirement: "ELO 1300+", maxPlayers: "Max 8 players", prize: "Archived prize" },
      { name: "Challenge Bracket", requirement: "Under 1300 ELO", maxPlayers: "Max 8 players", prize: "Archived prize" },
    ],
    details: "The Art of War was the April IronClad Company of Heroes 3 monthly 1v1 tournament.",
    rules: "Rules are listed directly on the official Battlefy tournament page.",
    schedule: ["April monthly 1v1 event", "Main and Challenge brackets", "Finals completed", "Archived on Battlefy"],
    contact: "Use the archived Battlefy page for event history and tournament details.",
  },
  {
    title: "Shadow War",
    month: "March",
    format: "1v1",
    status: "Completed",
    image: "/images/tournaments/1v1-shadow-war.jpeg",
    battlefy: "https://battlefy.com/ironclad-tournaments/shadow-war/69a8514962c9f7002f97d606/info?infoTab=details",
    description: "Archived IronClad Company of Heroes 3 monthly 1v1 tournament.",
    organizer: "IronClad Tournaments",
    game: "Company of Heroes 3",
    region: "Global",
    time: "March Tournament",
    checkIn: "UNION CODE",
    prizePool: "Archived Event",
    players: 16,
    maxPlayers: 16,
    brackets: [
      { name: "Main Bracket", requirement: "ELO 1300+", maxPlayers: "Max 8 players", prize: "Archived prize" },
      { name: "Challenge Bracket", requirement: "Under 1300 ELO", maxPlayers: "Max 8 players", prize: "Archived prize" },
    ],
    details: "Shadow War was the March IronClad Company of Heroes 3 monthly 1v1 tournament.",
    rules: "Rules are listed directly on the official Battlefy tournament page.",
    schedule: ["March monthly 1v1 event", "Main and Challenge brackets", "Finals completed", "Archived on Battlefy"],
    contact: "Use the archived Battlefy page for event history and tournament details.",
  },
  {
    title: "Council of War",
    month: "February",
    format: "1v1",
    status: "Completed",
    image: "/images/tournaments/1v1-council-of-war.jpeg",
    battlefy: "https://battlefy.com/ironclad-tournaments/council-of-war/69839d804b1a19002fe7533f/info?infoTab=details",
    description: "Archived IronClad Company of Heroes 3 monthly 1v1 tournament.",
    organizer: "IronClad Tournaments",
    game: "Company of Heroes 3",
    region: "Global",
    time: "February Tournament",
    checkIn: "UNION CODE",
    prizePool: "Archived Event",
    players: 16,
    maxPlayers: 16,
    brackets: [
      { name: "Main Bracket", requirement: "ELO 1300+", maxPlayers: "Max 8 players", prize: "Archived prize" },
      { name: "Challenge Bracket", requirement: "Under 1300 ELO", maxPlayers: "Max 8 players", prize: "Archived prize" },
    ],
    details: "Council of War was the February IronClad Company of Heroes 3 monthly 1v1 tournament.",
    rules: "Rules are listed directly on the official Battlefy tournament page.",
    schedule: ["February monthly 1v1 event", "Main and Challenge brackets", "Finals completed", "Archived on Battlefy"],
    contact: "Use the archived Battlefy page for event history and tournament details.",
  },
  {
    title: "Beta Blitz Tournament",
    month: "January",
    format: "1v1",
    status: "Completed",
    image: "/images/tournaments/1v1-beta-blitz-tournament.png",
    battlefy: "https://battlefy.com/ironclad-tournaments/beta-blitz-tournament/695bc9ee265bc4002fd64e4d/info?infoTab=details",
    description: "Archived IronClad Company of Heroes 3 monthly 1v1 tournament.",
    organizer: "IronClad Tournaments",
    game: "Company of Heroes 3",
    region: "Global",
    time: "January Tournament",
    checkIn: "UNION CODE",
    prizePool: "Archived Event",
    players: 16,
    maxPlayers: 16,
    brackets: [
      { name: "Main Bracket", requirement: "ELO 1300+", maxPlayers: "Max 8 players", prize: "Archived prize" },
      { name: "Challenge Bracket", requirement: "Under 1300 ELO", maxPlayers: "Max 8 players", prize: "Archived prize" },
    ],
    details: "Beta Blitz Tournament was the January IronClad Company of Heroes 3 monthly 1v1 tournament.",
    rules: "Rules are listed directly on the official Battlefy tournament page.",
    schedule: ["January monthly 1v1 event", "Main and Challenge brackets", "Finals completed", "Archived on Battlefy"],
    contact: "Use the archived Battlefy page for event history and tournament details.",
  },
];

const allTournaments = [...currentTournaments, ...archiveTournaments];

const participants: Participant[] = [
  { seed: 1, name: "Main Bracket", tag: "ELO 1300+", status: "registered", wins: 0, losses: 0, region: "Max 8 Players" },
  { seed: 2, name: "Challenge Bracket", tag: "Under 1300 ELO", status: "registered", wins: 0, losses: 0, region: "Max 8 Players" },
  { seed: 3, name: "4v4 Team Captains", tag: "Teams of 4", status: "captain", wins: 0, losses: 0, region: "Team Captains" },
  { seed: 4, name: "Unique Team Names", tag: "4v4", status: "captain", wins: 0, losses: 0, region: "Company of Heroes 3" },
  { seed: 5, name: "Battlefy Registration", tag: "UNION CODE", status: "registered", wins: 0, losses: 0, region: "IronClad" },
  { seed: 6, name: "Rules Page", tag: "Battlefy", status: "archive", wins: 0, losses: 0, region: "Official" },
  { seed: 7, name: "Monthly Finals", tag: "22:00 UTC", status: "registered", wins: 0, losses: 0, region: "Weekend" },
  { seed: 8, name: "Archive", tag: "Completed", status: "archive", wins: 0, losses: 0, region: "History" },
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

function Sidebar({ selectedTournament, onSelectTournament }: { selectedTournament: TournamentCard; onSelectTournament: (tournament: TournamentCard) => void }) {
  const [eventsOpen, setEventsOpen] = useState(true);
  const eventsByMonth = [
    { month: "May", events: currentTournaments },
    { month: "April", events: archiveTournaments.filter((event) => event.month === "April") },
    { month: "March", events: archiveTournaments.filter((event) => event.month === "March") },
    { month: "February", events: archiveTournaments.filter((event) => event.month === "February") },
    { month: "January", events: archiveTournaments.filter((event) => event.month === "January") },
  ];

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
                          <p className="mt-1 text-xs text-slate-300">{event.format} · {event.status}</p>
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

function Hero({ tournament, onRegisterClick }: { tournament: TournamentCard; onRegisterClick: () => void }) {
  return (
    <section className="relative overflow-hidden border-b border-slate-800 bg-black">
      <motion.div
        className="absolute inset-0 bg-center bg-repeat-y opacity-75"
        style={{
          backgroundImage: `url(${tournament.image})`,
          backgroundSize: "100% auto",
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
              <StatusPill tone={tournament.status === "Ongoing" ? "green" : "gray"}>{tournament.status}</StatusPill>
              <StatusPill tone="blue">{tournament.format}</StatusPill>
              <StatusPill tone="gray">{tournament.region}</StatusPill>
            </div>
            <h1 className="mt-5 max-w-4xl text-3xl font-black tracking-tight text-white sm:text-5xl">{tournament.title}</h1>
            <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-slate-300">
              <span className="flex items-center gap-2"><Gamepad2 size={16} className="text-sky-300" /> {tournament.game}</span>
              <span className="flex items-center gap-2"><CalendarDays size={16} className="text-sky-300" /> {tournament.month} Tournament</span>
              <span className="flex items-center gap-2"><Clock3 size={16} className="text-sky-300" /> {tournament.time}</span>
              <span className="flex items-center gap-2"><Users size={16} className="text-sky-300" /> {tournament.players}/{tournament.maxPlayers} slots</span>
            </div>
          </div>
          <div className="grid w-full max-w-full grid-cols-2 items-stretch gap-3 sm:max-w-sm xl:w-80 xl:flex-none">
            <Show when="signed-out">
              <ActionCard
                label="Sign In"
                description="Account access"
                href="/sign-in"
                icon={Users}
              />
            </Show>

            <Show when="signed-in">
              <AccountCard />
            </Show>
            <ActionCard label="Register" description="Open events" icon={CheckCircle2} onClick={onRegisterClick} />
          </div>
        </div>
      </div>
    </section>
  );
}

function ActionCard({ label, description, icon: Icon, href, onClick }: { label: string; description: string; icon: ElementType; href?: string; onClick?: () => void }) {
  const content = (
    <>
      <Icon size={18} className="shrink-0 text-orange-300" />
      <p className="mt-3 break-words text-sm font-black uppercase leading-5 tracking-wider text-white">{label}</p>
      <p className="mt-1 break-words text-xs font-semibold leading-5 text-slate-400">{description}</p>
    </>
  );

  if (href) {
    return (
      <a href={href} className={classNames("flex min-h-[104px] w-full min-w-0 flex-col justify-start overflow-hidden rounded-xl border border-slate-700/80 bg-slate-950/50 p-4 text-left shadow-xl shadow-black/10 backdrop-blur hover:bg-orange-500/10", interactiveHover)}>
        {content}
      </a>
    );
  }

  return (
    <button onClick={onClick} className={classNames("flex min-h-[104px] w-full min-w-0 flex-col justify-start overflow-hidden rounded-xl border border-slate-700/80 bg-slate-950/50 p-4 text-left shadow-xl shadow-black/10 backdrop-blur hover:bg-orange-500/10", interactiveHover)}>
      {content}
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

function Overview({ tournament }: { tournament: TournamentCard }) {
  const [panel, setPanel] = useState<OverviewPanelKey>("details");
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
            {overviewPanels.map((item) => (
              <button
                key={item.key}
                onClick={() => setPanel(item.key)}
                className={classNames("shrink-0 rounded border px-4 py-2 text-xs font-black uppercase tracking-wide", interactiveHover, panel === item.key ? "border-orange-500 bg-orange-500/10 text-white" : "border-slate-700 text-slate-400 hover:text-white")}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="mt-5">{renderOverviewPanel(panel, tournament)}</div>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <h3 className="text-sm font-black uppercase tracking-wider text-white">Current Tournaments</h3>
          <div className="mt-4 space-y-3">
            {currentTournaments.map((item) => (
              <TournamentLinkCard key={item.title} item={item} />
            ))}
          </div>
        </Card>
        <Card>
          <h3 className="text-sm font-black uppercase tracking-wider text-white">Tournament Archive</h3>
          <div className="mt-4 space-y-3">
            {archiveTournaments.map((item) => (
              <a key={item.title} href={item.battlefy} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-lg bg-cover bg-center p-3 transition hover:brightness-110" style={{ backgroundImage: `linear-gradient(135deg,rgba(15,23,42,0.92),rgba(2,6,23,0.72)),url(${item.image})` }}>
                <div className="grid h-9 w-9 place-items-center rounded bg-slate-950/70 text-xs font-black text-white">{item.month.slice(0, 3)}</div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-white">{item.title}</p>
                  <p className="text-xs text-slate-300">{item.month} · {item.format} · {item.status}</p>
                </div>
                <MessageCircle size={16} className="text-sky-300" />
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
    <a href={item.battlefy} target="_blank" rel="noreferrer" className="block rounded-lg bg-slate-900/80 p-3 transition hover:bg-slate-800">
      <div className="flex items-center gap-3">
        <div className="h-12 w-16 shrink-0 rounded bg-cover bg-center" style={{ backgroundImage: `url(${item.image})` }} />
        <div className="min-w-0 flex-1">
          <p className="font-bold text-white">{item.title}</p>
          <p className="text-xs text-slate-500">{item.month} · {item.format} · {item.status}</p>
        </div>
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-400">{item.description}</p>
    </a>
  );
}

function renderOverviewPanel(panel: OverviewPanelKey, tournament: TournamentCard) {
  const shared = "leading-7 text-slate-300";
  if (panel === "rules") {
    return <div className={shared}>{tournament.rules}</div>;
  }
  if (panel === "prizes") {
    return (
      <div className="grid gap-3 sm:grid-cols-3">
        {tournament.brackets.map((bracket, index) => (
          <Prize key={bracket.name} rank={bracket.name} amount={bracket.prize} icon={index === 0 ? Crown : index === 1 ? Medal : Trophy} />
        ))}
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
      <Detail label="Event" value={`${tournament.title} · ${tournament.month} · ${tournament.status}`} />
      <Detail label="Game" value={tournament.game} />
      <Detail label="Organizer" value={tournament.organizer} />
      <Detail label="Format" value={tournament.format} />
      {tournament.brackets.map((bracket) => (
        <Detail key={bracket.name} label={bracket.name} value={`${bracket.requirement} · ${bracket.maxPlayers} · ${bracket.prize}`} />
      ))}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-4"><p className="text-xs font-black uppercase tracking-wider text-slate-500">{label}</p><p className="mt-1 break-words font-bold text-slate-100">{value}</p></div>;
}

function Prize({ rank, amount, icon: Icon }: { rank: string; amount: string; icon: ElementType }) {
  return <div className="rounded-xl border border-slate-700 bg-slate-950/40 p-5"><Icon className="text-amber-300" size={24} /><p className="mt-4 text-sm font-black uppercase tracking-wider text-slate-500">{rank}</p><p className="mt-1 break-words text-2xl font-black text-white">{amount}</p></div>;
}

function Timeline({ tournament }: { tournament: TournamentCard }) {
  return <div className="space-y-3">{tournament.schedule.map((item, index) => <div key={item} className="flex items-center gap-3 rounded-lg bg-slate-950/40 p-4"><div className="grid h-8 w-8 shrink-0 place-items-center rounded bg-sky-500/15 text-xs font-black text-sky-200">{index + 1}</div><span className="break-words font-semibold text-slate-200">{item}</span></div>)}</div>;
}

function Participants({ tournament }: { tournament: TournamentCard }) {
  const [query, setQuery] = useState("");
  const tournamentParticipants = useMemo(() => {
    if (tournament.format === "4v4") {
      return participants.filter((p) => p.status === "captain" || p.name.includes("Battlefy"));
    }
    return participants.filter((p) => p.status !== "captain");
  }, [tournament.format]);
  const filtered = useMemo(() => tournamentParticipants.filter((p) => `${p.name} ${p.tag} ${p.region}`.toLowerCase().includes(query.toLowerCase())), [query, tournamentParticipants]);
  return (
    <Card>
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-black text-white">{tournament.title} Entries</h2>
          <p className="mt-1 text-sm text-slate-400">Tournament-specific brackets, entry requirements, and registration information.</p>
        </div>
        <div className="relative w-full md:w-80">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search entries" className="w-full rounded border border-slate-700 bg-slate-950 py-2 pl-10 pr-3 text-sm text-white outline-none focus:border-sky-500" />
        </div>
      </div>
      <div className="mt-5 overflow-hidden rounded-xl border border-slate-800">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-slate-950 text-xs uppercase tracking-wider text-slate-500">
            <tr><th className="px-4 py-3">#</th><th className="px-4 py-3">Entry</th><th className="px-4 py-3">Details</th><th className="px-4 py-3">Record</th><th className="px-4 py-3">Status</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {filtered.map((p) => <tr key={p.seed} className="bg-slate-900/40 hover:bg-slate-800/60"><td className="px-4 py-3 font-mono text-slate-400">#{p.seed}</td><td className="px-4 py-3"><span className="font-bold text-white">{p.name}</span><span className="ml-2 text-xs text-slate-500">{p.tag}</span></td><td className="px-4 py-3 text-slate-300">{p.region}</td><td className="px-4 py-3 text-slate-300">{p.wins}-{p.losses}</td><td className="px-4 py-3"><StatusPill tone={p.status === "registered" ? "green" : p.status === "captain" ? "amber" : "blue"}>{p.status}</StatusPill></td></tr>)}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function getMatches(tournament: TournamentCard): Match[] {
  if (tournament.format === "4v4") {
    return [
      { id: "m1", round: `${tournament.title} · Team Round`, status: "upcoming", teamA: { seed: 1, name: "Team Captain Squad" }, teamB: { seed: 4, name: "Team Captain Squad" } },
      { id: "m2", round: `${tournament.title} · Team Round`, status: "upcoming", teamA: { seed: 2, name: "Team Captain Squad" }, teamB: { seed: 3, name: "Team Captain Squad" } },
      { id: "m3", round: `${tournament.title} · Team Final`, status: "upcoming", teamA: { seed: 1, name: "Team Finalist" }, teamB: { seed: 2, name: "Team Finalist" } },
    ];
  }

  return [
    { id: "m1", round: `${tournament.title} · Main Bracket`, status: tournament.status === "Completed" ? "complete" : "upcoming", teamA: { seed: 1, name: "ELO 1300+ Player Slot" }, teamB: { seed: 8, name: "ELO 1300+ Player Slot" } },
    { id: "m2", round: `${tournament.title} · Main Bracket`, status: tournament.status === "Completed" ? "complete" : "upcoming", teamA: { seed: 4, name: "ELO 1300+ Player Slot" }, teamB: { seed: 5, name: "ELO 1300+ Player Slot" } },
    { id: "m3", round: `${tournament.title} · Challenge Bracket`, status: tournament.status === "Completed" ? "complete" : "upcoming", teamA: { seed: 2, name: "Under 1300 ELO Player Slot" }, teamB: { seed: 7, name: "Under 1300 ELO Player Slot" } },
    { id: "m4", round: `${tournament.title} · Challenge Bracket`, status: tournament.status === "Completed" ? "complete" : "upcoming", teamA: { seed: 3, name: "Under 1300 ELO Player Slot" }, teamB: { seed: 6, name: "Under 1300 ELO Player Slot" } },
    { id: "m5", round: "Challenge Bracket Finals", status: tournament.status === "Completed" ? "complete" : "upcoming", teamA: { seed: 1, name: "Challenge Finalist" }, teamB: { seed: 2, name: "Challenge Finalist" } },
    { id: "m6", round: "Main Bracket Finals", status: tournament.status === "Completed" ? "complete" : "upcoming", teamA: { seed: 1, name: "Main Finalist" }, teamB: { seed: 2, name: "Main Finalist" } },
  ];
}

function Brackets({ tournament }: { tournament: TournamentCard }) {
  const matches = getMatches(tournament);
  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-black text-white">{tournament.title} Brackets</h2>
          <p className="mt-1 text-sm text-slate-400">{tournament.brackets.map((bracket) => `${bracket.name}: ${bracket.requirement}`).join(" · ")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={tournament.battlefy} target="_blank" rel="noreferrer" className="rounded border border-slate-700 px-4 py-2 text-xs font-black uppercase tracking-wide text-slate-300 hover:border-sky-500 hover:text-white">Battlefy Details</a>
          <a href={tournament.battlefy} target="_blank" rel="noreferrer" className="rounded bg-sky-500 px-4 py-2 text-xs font-black uppercase tracking-wide text-white hover:bg-sky-400">Open Event</a>
        </div>
      </div>
      <Card className="overflow-x-auto">
        <div className="min-w-[1050px] pb-4">
          <div className="grid grid-cols-3 gap-20">
            <BracketRound title={tournament.format === "4v4" ? "Team Opening Round" : "Opening Slots"} items={matches.slice(0, tournament.format === "4v4" ? 2 : 4)} />
            <BracketRound title={tournament.format === "4v4" ? "Team Final" : "Monthly Finals"} items={matches.slice(tournament.format === "4v4" ? 2 : 4, tournament.format === "4v4" ? 3 : 6)} spaced />
            <BracketRound title="Official Battlefy Page" items={[{ id: "bfy", round: "External Event Page", status: tournament.status === "Completed" ? "complete" : "upcoming", teamA: { seed: 1, name: tournament.title }, teamB: { seed: 2, name: "IronClad Battlefy" } }]} finalRound />
          </div>
        </div>
      </Card>
    </div>
  );
}

function BracketRound({ title, items, spaced, finalRound }: { title: string; items: Match[]; spaced?: boolean; finalRound?: boolean }) {
  return (
    <div>
      <div className={classNames("mb-4 rounded bg-slate-800/80 px-3 py-2 text-xs font-black uppercase tracking-wide", finalRound ? "text-amber-200" : "text-slate-300")}>{title}</div>
      <div className={classNames("space-y-5", spaced && "pt-14 space-y-24", finalRound && "pt-40")}>{items.map((match) => <MatchCard key={match.id} match={match} />)}</div>
    </div>
  );
}

function MatchCard({ match }: { match: Match }) {
  return (
    <div className="relative rounded border border-slate-700 bg-slate-900 shadow-lg shadow-black/20 before:absolute before:left-full before:top-1/2 before:hidden before:h-px before:w-20 before:bg-slate-700 md:before:block">
      <div className="flex items-center justify-between border-b border-slate-800 px-3 py-1.5">
        <span className="font-mono text-[11px] text-slate-500">#{match.id.toUpperCase()}</span>
        <StatusPill tone={match.status === "complete" ? "green" : match.status === "live" ? "red" : "gray"}>{match.status}</StatusPill>
      </div>
      <TeamRow team={match.teamA} />
      <TeamRow team={match.teamB} />
    </div>
  );
}

function TeamRow({ team }: { team: MatchTeam }) {
  return <div className={classNames("flex items-center gap-2 px-3 py-2 text-sm", team.winner ? "bg-sky-500/10 text-white" : "text-slate-300")}><span className="w-7 font-mono text-xs text-slate-500">#{team.seed}</span><span className={classNames("min-w-0 flex-1 truncate", team.winner && "font-bold text-sky-100")}>{team.name}</span><span className="grid h-6 w-7 place-items-center rounded bg-slate-950 font-mono text-xs text-white">{team.score ?? "-"}</span></div>;
}

function Media({ tournament }: { tournament: TournamentCard }) {
  return <Card><h2 className="text-xl font-black text-white">{tournament.title} Media</h2><div className="mt-5 grid gap-4 md:grid-cols-3">{[tournament, ...allTournaments.filter((item) => item.title !== tournament.title).slice(0, 2)].map((item) => <a href={item.battlefy} target="_blank" rel="noreferrer" key={item.title} className="group aspect-video rounded-xl border border-slate-700 bg-cover bg-center p-4" style={{ backgroundImage: `linear-gradient(135deg,rgba(15,23,42,0.88),rgba(2,6,23,0.45)),url(${item.image})` }}><PlayCircle className="text-white opacity-90" /><p className="mt-20 text-sm font-bold text-white">{item.title}</p><p className="text-xs text-slate-300">{item.month} · {item.format}</p></a>)}</div></Card>;
}

function Announcements({ tournament }: { tournament: TournamentCard }) {
  const messages = [
    `${tournament.title} is a ${tournament.month} IronClad ${tournament.format} tournament for Company of Heroes 3.`,
    tournament.format === "4v4" ? "4v4 Beta Tournament teams must have 4 players, one Team Captain, and a unique team name." : "Monthly 1v1 events use Main and Challenge brackets based on ELO.",
    tournament.status === "Ongoing" ? "Use the official Battlefy page for current registration, rules, and match updates." : "This tournament is completed and available in the IronClad archive.",
  ];
  return <div className="space-y-4">{messages.map((text, index) => <Card key={text}><div className="flex gap-3"><Radio size={18} className="mt-1 text-orange-300" /><div><p className="text-xs font-black uppercase tracking-wider text-slate-500">IronClad Update {index + 1}</p><p className="mt-1 text-slate-200">{text}</p></div></div></Card>)}</div>;
}

function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={classNames("rounded-2xl border border-slate-800 bg-[#111827]/90 p-5 shadow-2xl shadow-black/20", className)}>{children}</section>;
}

function AccountCard() {
  const { user } = useUser();
  const displayName = user?.username || user?.fullName || user?.primaryEmailAddress?.emailAddress || "Account";

  return (
    <div className="flex min-h-[104px] w-full min-w-0 transform-gpu flex-col justify-center rounded-xl border border-emerald-500/45 bg-slate-950/50 p-4 shadow-xl shadow-black/10 backdrop-blur transition-all duration-300 ease-out hover:scale-[1.03] hover:border-emerald-400 hover:bg-emerald-950/35 hover:shadow-[0_0_32px_rgba(16,185,129,0.38)] active:scale-[0.99]">
      <p className="mb-3 text-xs font-black uppercase tracking-wider text-slate-400">
        Account
      </p>

      <div className="flex min-w-0 items-center gap-3">
        <div className="shrink-0">
          <UserButton />
        </div>

        <div className="min-w-0 flex-1 overflow-hidden">
          <div className="whitespace-nowrap text-sm font-black uppercase tracking-wide text-white">
            <span className="inline-block min-w-full animate-[account-marquee_16s_linear_infinite] pr-8">
              {displayName}
            </span>
            <span className="inline-block min-w-full animate-[account-marquee_16s_linear_infinite] pr-8" aria-hidden="true">
              {displayName}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function AccountMarqueeStyles() {
  return (
    <style jsx global>{`
      @keyframes account-marquee {
        0% {
          transform: translateX(0);
        }
        100% {
          transform: translateX(-100%);
        }
      }
    `}</style>
  );
}

type RegistrationStep = "tournament" | "identity" | "competitive" | "union" | "agreements" | "submitted";

type RegistrationFormState = {
  tournamentTitle: string;
  bracketName: string;
  inGameName: string;
  discordUsername: string;
  steamUsername: string;
  coh3PlayerCardLink: string;
  region: string;
  timezone: string;
  country: string;
  unionCode: string;
  rulebookAgreement: boolean;
  playerParticipationAgreement: boolean;
  adminFinalDecisionAgreement: boolean;
  ownershipConfirmation: boolean;
};

type RegistrationErrors = Partial<Record<keyof RegistrationFormState | "agreements", string>>;

const regionOptions = [
  "Europe",
  "North America",
  "South America",
  "Oceania",
  "Asia",
  "Middle East",
  "Africa",
  "Global",
];

const timezoneOptions = [
  "UTC",
  "UTC-08:00 Pacific Time",
  "UTC-05:00 Eastern Time",
  "UTC+00:00 London / GMT",
  "UTC+01:00 Central European Time",
  "UTC+02:00 Eastern European Time",
  "UTC+05:30 India Standard Time",
  "UTC+08:00 Singapore / China",
  "UTC+09:00 Japan / Korea",
  "UTC+10:00 Australian Eastern Time",
  "UTC+11:00 Sydney Daylight Time",
  "UTC+12:00 New Zealand Time",
];

const countryOptions = [
  "Australia",
  "Austria",
  "Belgium",
  "Brazil",
  "Canada",
  "China",
  "Denmark",
  "Finland",
  "France",
  "Germany",
  "Greece",
  "India",
  "Ireland",
  "Italy",
  "Japan",
  "Netherlands",
  "New Zealand",
  "Norway",
  "Poland",
  "Portugal",
  "Singapore",
  "South Korea",
  "Spain",
  "Sweden",
  "Switzerland",
  "United Kingdom",
  "United States",
];

function isValidUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function RegisterModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<RegistrationStep>("tournament");
  const [errors, setErrors] = useState<RegistrationErrors>({});
  const [selectedTournament, setSelectedTournament] = useState<TournamentCard>(currentTournaments[0]);
  const [form, setForm] = useState<RegistrationFormState>({
    tournamentTitle: currentTournaments[0].title,
    bracketName: currentTournaments[0].brackets[0]?.name ?? "",
    inGameName: "",
    discordUsername: "",
    steamUsername: "",
    coh3PlayerCardLink: "",
    region: "",
    timezone: "",
    country: "",
    unionCode: "",
    rulebookAgreement: false,
    playerParticipationAgreement: false,
    adminFinalDecisionAgreement: false,
    ownershipConfirmation: false,
  });

  const selectedBracket = selectedTournament.brackets.find((bracket) => bracket.name === form.bracketName) ?? selectedTournament.brackets[0];

  const updateField = <K extends keyof RegistrationFormState>(field: K, value: RegistrationFormState[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const selectTournament = (event: TournamentCard) => {
    setSelectedTournament(event);
    setForm((current) => ({
      ...current,
      tournamentTitle: event.title,
      bracketName: event.brackets[0]?.name ?? "",
    }));
    setErrors((current) => ({ ...current, tournamentTitle: undefined, bracketName: undefined }));
  };

  const validateStep = (targetStep: RegistrationStep) => {
    const nextErrors: RegistrationErrors = {};

    if (targetStep === "tournament") {
      if (!form.tournamentTitle.trim()) {
        nextErrors.tournamentTitle = "Please select a tournament.";
      }

      if (!form.bracketName.trim()) {
        nextErrors.bracketName = "Please select a bracket or event type.";
      }
    }

    if (targetStep === "identity") {
      if (!form.inGameName.trim()) {
        nextErrors.inGameName = "In-Game Name is required.";
      }

      if (!form.discordUsername.trim()) {
        nextErrors.discordUsername = "Discord Username is required.";
      }

      if (!form.steamUsername.trim()) {
        nextErrors.steamUsername = "Steam Name is required.";
      }

      if (!form.coh3PlayerCardLink.trim()) {
        nextErrors.coh3PlayerCardLink = "CoH3 Player Card Link is required.";
      } else if (!isValidUrl(form.coh3PlayerCardLink)) {
        nextErrors.coh3PlayerCardLink = "Enter a valid CoH3 Player Card URL.";
      }
    }

    if (targetStep === "competitive") {
      if (!form.region.trim()) {
        nextErrors.region = "Region is required.";
      }

      if (!form.timezone.trim()) {
        nextErrors.timezone = "Timezone is required.";
      }

      if (!form.country.trim()) {
        nextErrors.country = "Country is required.";
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

  const goToIdentityStep = () => {
    if (validateStep("tournament")) {
      setStep("identity");
    }
  };

  const goToCompetitiveStep = () => {
    if (validateStep("identity")) {
      setStep("competitive");
    }
  };

  const goToUnionStep = () => {
    if (validateStep("competitive")) {
      setStep("union");
    }
  };

  const submitRegistration = () => {
    if (!validateStep("agreements")) {
      return;
    }

    const registration = {
      ...form,
      selectedTournament,
      selectedBracket,
      status: "Pending Review",
      submittedAt: new Date().toISOString(),
    };

    console.log("IronClad registration submitted:", registration);
    setStep("submitted");
  };

  const steps: RegistrationStep[] = ["tournament", "identity", "competitive", "union", "agreements", "submitted"];
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
                {currentTournaments.map((event) => {
                  const selected = selectedTournament.title === event.title;
                  return (
                    <button
                      key={event.title}
                      onClick={() => selectTournament(event)}
                      className={classNames("overflow-hidden rounded-xl border bg-cover bg-center p-4 text-left transition-all duration-300 hover:scale-[1.02]", selected ? "border-orange-500 shadow-[0_0_24px_rgba(249,115,22,0.24)]" : "border-slate-700 hover:border-orange-500/70")}
                      style={{ backgroundImage: `linear-gradient(135deg,rgba(15,23,42,0.94),rgba(2,6,23,0.68)),url(${event.image})` }}
                    >
                      <p className="break-words text-lg font-black text-white">{event.title}</p>
                      <p className="mt-2 text-xs font-bold uppercase tracking-wider text-orange-300">{event.month} · {event.format} · {event.status}</p>
                      <p className="mt-3 break-words text-sm leading-6 text-slate-300">{event.description}</p>
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
                      <p><span className="font-bold text-slate-500">Status:</span> {selectedTournament.status}</p>
                      <p><span className="font-bold text-slate-500">Prize Pool:</span> {selectedTournament.prizePool}</p>
                      <p><span className="font-bold text-slate-500">Deadline:</span> Coming soon</p>
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {selectedTournament.brackets.map((bracket) => {
                    const selected = form.bracketName === bracket.name;
                    return (
                      <button
                        key={bracket.name}
                        onClick={() => updateField("bracketName", bracket.name)}
                        className={classNames("rounded-lg border p-4 text-left transition-all duration-300 hover:scale-[1.02]", selected ? "border-orange-500 bg-orange-500/10" : "border-slate-700 bg-slate-950/40 hover:border-orange-500/70")}
                      >
                        <p className="break-words font-black text-white">{bracket.name}</p>
                        <p className="mt-1 break-words text-xs text-slate-400">{bracket.requirement} · {bracket.maxPlayers}</p>
                        <p className="mt-2 break-words text-sm font-bold text-orange-300">{bracket.prize}</p>
                      </button>
                    );
                  })}
                </div>
                {errors.bracketName && <FieldError message={errors.bracketName} />}
              </div>

              <ModalButtons onClose={onClose} onNext={goToIdentityStep} />
            </div>
          )}

          {step === "identity" && (
            <div className="space-y-5">
              <div>
                <h4 className="text-xl font-black text-white">Player Identity & Verification</h4>
                <p className="mt-2 text-sm leading-6 text-slate-300">This information is used for player verification, ELO validation, anti-smurf checks, and admin review.</p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <RegistrationInput label="In-Game Name" value={form.inGameName} onChange={(value) => updateField("inGameName", value)} error={errors.inGameName} required />
                <RegistrationInput label="Discord Username" value={form.discordUsername} onChange={(value) => updateField("discordUsername", value)} error={errors.discordUsername} required />
                <RegistrationInput label="Steam Name / Username" value={form.steamUsername} onChange={(value) => updateField("steamUsername", value)} error={errors.steamUsername} required />
                <RegistrationInput label="CoH3 Player Card Link" value={form.coh3PlayerCardLink} onChange={(value) => updateField("coh3PlayerCardLink", value)} error={errors.coh3PlayerCardLink} required />
              </div>

              <ModalButtons onBack={() => setStep("tournament")} onNext={goToCompetitiveStep} />
            </div>
          )}

          {step === "competitive" && (
            <div className="space-y-5">
              <div>
                <h4 className="text-xl font-black text-white">Competitive Information</h4>
                <p className="mt-2 text-sm leading-6 text-slate-300">Provide the basic competitive details required for admin review.</p>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <SearchableCombobox label="Region" value={form.region} options={regionOptions} onChange={(value) => updateField("region", value)} error={errors.region} required />
                <SearchableCombobox label="Timezone" value={form.timezone} options={timezoneOptions} onChange={(value) => updateField("timezone", value)} error={errors.timezone} required />
                <SearchableCombobox label="Country" value={form.country} options={countryOptions} onChange={(value) => updateField("country", value)} error={errors.country} required />
              </div>

              <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/25 p-4">
                <p className="text-sm font-black uppercase tracking-wider text-emerald-300">Frontend ELO Verification Placeholder</p>
                <div className="mt-3 space-y-2 text-sm leading-6 text-slate-200">
                  <p>CoH3 Player Card detected</p>
                  <p>ELO will be checked automatically later</p>
                  <p>1300+ ELO → Main Bracket</p>
                  <p>Under 1300 ELO → Challenge Bracket</p>
                  <p>Final approval remains under admin review</p>
                </div>
              </div>

              <ModalButtons onBack={() => setStep("identity")} onNext={goToUnionStep} />
            </div>
          )}

          {step === "union" && (
            <div className="space-y-5">
              <div>
                <h4 className="text-xl font-black text-white">UNION CODE Verification</h4>
                <p className="mt-2 text-sm leading-6 text-slate-300">Enter your UNION CODE if you already have one.</p>
              </div>

              <RegistrationInput label="UNION CODE" value={form.unionCode} onChange={(value) => updateField("unionCode", value)} />

              <div className="rounded-xl border border-orange-500/40 bg-orange-500/10 p-4">
                <p className="break-words text-sm leading-6 text-slate-200">You must obtain an official IronClad UNION CODE through Discord verification.</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <a href="#" className="rounded-lg border border-slate-700 bg-slate-950/50 px-4 py-3 text-center text-xs font-black uppercase tracking-wide text-white transition hover:scale-[1.02] hover:border-orange-500">Join Discord</a>
                  <a href="#" className="rounded-lg bg-orange-500 px-4 py-3 text-center text-xs font-black uppercase tracking-wide text-white transition hover:scale-[1.02] hover:bg-orange-400">Open Verification Ticket</a>
                </div>
              </div>

              <ModalButtons onBack={() => setStep("competitive")} onNext={() => setStep("agreements")} />
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

              <ModalButtons onBack={() => setStep("union")} onNext={submitRegistration} nextLabel="Submit Registration" />
            </div>
          )}

          {step === "submitted" && (
            <div className="grid place-items-center py-10 text-center">
              <div className="grid h-16 w-16 place-items-center rounded-full border border-emerald-400/70 bg-emerald-950/40 shadow-[0_0_32px_rgba(16,185,129,0.35)]">
                <CheckCircle2 className="text-emerald-300" size={30} />
              </div>
              <h4 className="mt-5 text-2xl font-black text-white">Registration Submitted</h4>
              <p className="mt-2 text-sm font-bold uppercase tracking-wider text-emerald-300">Status: Pending Review</p>
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

function RegistrationInput({ label, value, onChange, error, required = false }: { label: string; value: string; onChange: (value: string) => void; error?: string; required?: boolean }) {
  return (
    <label className="block min-w-0">
      <span className="text-xs font-black uppercase tracking-wider text-slate-400">{label}{required && <span className="text-orange-300"> *</span>}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={classNames("mt-2 w-full rounded-lg border bg-slate-950 px-3 py-3 text-sm text-white outline-none transition focus:border-orange-500", error ? "border-orange-400/80" : "border-slate-700")}
        aria-invalid={Boolean(error)}
      />
      <FieldError message={error} />
    </label>
  );
}

function SearchableCombobox({ label, value, options, onChange, error, required = false }: { label: string; value: string; options: string[]; onChange: (value: string) => void; error?: string; required?: boolean }) {
  const [open, setOpen] = useState(false);
  const filteredOptions = options.filter((option) => option.toLowerCase().includes(value.toLowerCase())).slice(0, 8);

  return (
    <label className="relative block min-w-0">
      <span className="text-xs font-black uppercase tracking-wider text-slate-400">{label}{required && <span className="text-orange-300"> *</span>}</span>
      <input
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        className={classNames("mt-2 w-full rounded-lg border bg-slate-950 px-3 py-3 text-sm text-white outline-none transition focus:border-orange-500", error ? "border-orange-400/80" : "border-slate-700")}
        aria-invalid={Boolean(error)}
      />

      {open && filteredOptions.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-30 mt-2 max-h-52 overflow-y-auto rounded-xl border border-slate-700 bg-[#0f1724] p-2 shadow-2xl shadow-black/40">
          {filteredOptions.map((option) => (
            <button
              key={option}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange(option);
                setOpen(false);
              }}
              className="w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-slate-200 transition hover:bg-orange-500/10 hover:text-white"
            >
              <span className="block truncate">{option}</span>
            </button>
          ))}
        </div>
      )}

      <FieldError message={error} />
    </label>
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

function ModalButtons({ onClose, onBack, onNext, nextLabel = "Continue" }: { onClose?: () => void; onBack?: () => void; onNext: () => void; nextLabel?: string }) {
  return (
    <div className="flex flex-col-reverse gap-3 border-t border-slate-800 pt-5 sm:flex-row sm:justify-between">
      <div>
        {onBack && <button onClick={onBack} className="w-full rounded border border-slate-700 px-5 py-3 text-xs font-black uppercase tracking-wide text-slate-300 transition hover:border-slate-500 hover:text-white sm:w-auto">Back</button>}
        {onClose && <button onClick={onClose} className="w-full rounded border border-slate-700 px-5 py-3 text-xs font-black uppercase tracking-wide text-slate-300 transition hover:border-slate-500 hover:text-white sm:w-auto">Cancel</button>}
      </div>
      <button onClick={onNext} className="w-full rounded bg-orange-500 px-5 py-3 text-xs font-black uppercase tracking-wide text-white transition hover:bg-orange-400 sm:w-auto">{nextLabel}</button>
    </div>
  );
}

function MainContent({ activeTab, tournament }: { activeTab: TabKey; tournament: TournamentCard }) {
  return (
    <main className="px-5 py-6 lg:px-8">
      {activeTab === "overview" && <Overview tournament={tournament} />}
      {activeTab === "participants" && <Participants tournament={tournament} />}
      {activeTab === "brackets" && <Brackets tournament={tournament} />}
      {activeTab === "media" && <Media tournament={tournament} />}
      {activeTab === "announcements" && <Announcements tournament={tournament} />}
    </main>
  );
}

export default function TournamentsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [selectedTournament, setSelectedTournament] = useState<TournamentCard>(currentTournaments[0]);
  const [showMobilePanel, setShowMobilePanel] = useState(false);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const { isSignedIn } = useUser();

  const handleSelectTournament = (tournament: TournamentCard) => {
    setSelectedTournament(tournament);
    setActiveTab("overview");
  };

  return (
    <div className="min-h-screen bg-black pt-20 text-slate-100">
      <AccountMarqueeStyles />
      <div className="mx-auto flex max-w-[1600px]">
        <Sidebar selectedTournament={selectedTournament} onSelectTournament={handleSelectTournament} />
        <div className="min-w-0 flex-1">
          <Hero
            tournament={selectedTournament}
            onRegisterClick={() => {
              if (!isSignedIn) {
                window.location.href = "/sign-in";
                return;
              }

              setShowRegisterModal(true);
            }}
          />
          <TopTabs activeTab={activeTab} setActiveTab={setActiveTab} />
          <MainContent activeTab={activeTab} tournament={selectedTournament} />
        </div>
      </div>

      {showRegisterModal && <RegisterModal onClose={() => setShowRegisterModal(false)} />}

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
