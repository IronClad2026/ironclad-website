import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { SingleEliminationBracket, RoundRobinBracket, MobileRoundRobinBracket } from "@/components/TournamentsExperience";
import LocaleProvider from "@/components/i18n/LocaleProvider";
import english from "@/lib/i18n/dictionaries/en/competition";
import russian from "@/lib/i18n/dictionaries/ru/competition";
import italian from "@/lib/i18n/dictionaries/it/competition";
import chinese from "@/lib/i18n/dictionaries/zh-CN/competition";
import spanish from "@/lib/i18n/dictionaries/es/competition";
import portuguese from "@/lib/i18n/dictionaries/pt-BR/competition";
import korean from "@/lib/i18n/dictionaries/ko/competition";
import french from "@/lib/i18n/dictionaries/fr/competition";
import { resolveLocale } from "@/lib/i18n/config";
import type { MatchRoomUnreadItem } from "@/lib/match-room-unread";
import { bracketFixture, FIXTURE_ACTIVATION, FIXTURE_DEADLINE, type BracketMode } from "./fixtures";
import "../ui-redesign/runtime";
import "@/app/globals.css";

declare global {
  interface Window {
    __bracketFixture: {
      selections: string[];
      setExpandedFooters?: (expanded: boolean) => void;
      setUnread?: (source: MatchRoomUnreadItem["unreadSource"] | null) => void;
    };
  }
}
window.__bracketFixture = { selections: [] };
const params = new URLSearchParams(location.search);
const size = params.get("size") === "16" ? 16 : 8;
const mode: BracketMode = params.get("mode") === "admin" ? "admin" : params.get("mode") === "player" ? "player" : "public";
const locale = resolveLocale(params.get("locale"));
const dictionaries = { en: english, it: italian, "zh-CN": chinese, ru: russian, es: spanish, "pt-BR": portuguese, ko: korean, fr: french };
const fixture = bracketFixture(size);
document.documentElement.lang = locale;
if (params.has("largeText")) document.documentElement.style.fontSize = "20px";

function Fixture() {
  const [expanded, setExpanded] = useState(false);
  const [unread, setUnread] = useState<MatchRoomUnreadItem["unreadSource"] | null>(params.has("unread") ? "opponent" : null);
  useEffect(() => {
    window.__bracketFixture.setExpandedFooters = setExpanded;
    window.__bracketFixture.setUnread = setUnread;
    document.documentElement.dataset.bracketFixtureReady = "true";
    return () => { delete window.__bracketFixture.setExpandedFooters; delete window.__bracketFixture.setUnread; };
  }, []);
  const matches = fixture.matches.map((match, index) => {
    if (!expanded || index % 2 !== 0) return match;
    return {
      ...match, status: "in_progress" as const, outcomeType: null, activationVersion: 1,
      activatedAt: FIXTURE_ACTIVATION, deadlineAt: FIXTURE_DEADLINE,
      extensionMinutes: 720, extendedAt: FIXTURE_ACTIVATION, holdStartedAt: null, holdReleasedAt: null,
    };
  });
  // Deliberately include a stale completed-card row: the product presentation
  // must suppress it even if a response races with a lifecycle refresh.
  const unreadByMatchId = new Map<string, MatchRoomUnreadItem>(unread ? [0, 1, 4]
    .filter((index) => matches[index])
    .map((index) => [matches[index].id, { matchId: matches[index].id, roomId: "fixture-room-" + index, unreadSource: unread }]) : []);
  const shared = {
    matches, participantsById: fixture.participantsById, unreadByMatchId,
    adminReadOnly: params.has("readOnly"),
    onAdminMatchSelect: mode === "admin" ? (match: typeof matches[number]) => { window.__bracketFixture.selections.push("admin:" + match.id); } : undefined,
    onPlayerMatchSelect: mode === "player" ? (match: typeof matches[number]) => { window.__bracketFixture.selections.push("player:" + match.id); } : undefined,
    viewerRegistrationIds: mode === "player" ? params.has("outsider") ? ["unrelated-registration"] : fixture.registrationIds : [],
  };
  const RoundRobin = innerWidth < 768 ? MobileRoundRobinBracket : RoundRobinBracket;
  return <LocaleProvider locale={locale} dictionaries={{ competition: dictionaries[locale] }}>
    <main className="mx-auto w-full min-w-0 max-w-[2320px] px-3 py-6 sm:px-6">
      <h1 className="text-xl font-bold">{size}-player bracket · {mode} fixture</h1>
      <p className="mt-2 text-sm text-zinc-400">Synthetic match presentation only. No authentication, database, or match mutations.</p>
      <button className="mt-3 min-h-11 border border-zinc-700 px-4 text-sm" onClick={() => setExpanded((value) => !value)}>{expanded ? "Restore mixed footers" : "Expand match footers"}</button>
      {params.get("format") === "round_robin" ? <RoundRobin {...shared} standings={[]} /> : <SingleEliminationBracket
        {...shared}
        focusedMatchId={params.has("focused") ? matches[1].id : null}
        anchorPrefix={innerWidth < 768 ? "match-mobile" : "match-desktop"}
      />}
    </main>
  </LocaleProvider>;
}

createRoot(document.getElementById("root")!).render(<Fixture />);
