import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { SingleEliminationBracket } from "@/components/TournamentsExperience";
import LocaleProvider from "@/components/i18n/LocaleProvider";
import english from "@/lib/i18n/dictionaries/en/competition";
import russian from "@/lib/i18n/dictionaries/ru/competition";
import { bracketFixture, FIXTURE_ACTIVATION, FIXTURE_DEADLINE, type BracketMode } from "./fixtures";
import "../ui-redesign/runtime";
import "@/app/globals.css";

declare global {
  interface Window {
    __bracketFixture: {
      selections: string[];
      setExpandedFooters?: (expanded: boolean) => void;
    };
  }
}
window.__bracketFixture = { selections: [] };
const params = new URLSearchParams(location.search);
const size = params.get("size") === "16" ? 16 : 8;
const mode: BracketMode = params.get("mode") === "admin" ? "admin" : params.get("mode") === "player" ? "player" : "public";
const locale = params.get("locale") === "ru" ? "ru" : "en";
const fixture = bracketFixture(size);
document.documentElement.lang = locale;
if (params.has("largeText")) document.documentElement.style.fontSize = "20px";

function Fixture() {
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    window.__bracketFixture.setExpandedFooters = setExpanded;
    document.documentElement.dataset.bracketFixtureReady = "true";
    return () => { delete window.__bracketFixture.setExpandedFooters; };
  }, []);
  const matches = fixture.matches.map((match, index) => {
    if (!expanded || index % 2 !== 0) return match;
    return {
      ...match, status: "in_progress" as const, outcomeType: null, activationVersion: 1,
      activatedAt: FIXTURE_ACTIVATION, deadlineAt: FIXTURE_DEADLINE,
      extensionMinutes: 720, extendedAt: FIXTURE_ACTIVATION, holdStartedAt: null, holdReleasedAt: null,
    };
  });
  return <LocaleProvider locale={locale} dictionaries={{ competition: locale === "ru" ? russian : english }}>
    <main className="mx-auto w-full min-w-0 max-w-[2320px] px-3 py-6 sm:px-6">
      <h1 className="text-xl font-bold">{size}-player bracket · {mode} fixture</h1>
      <p className="mt-2 text-sm text-zinc-400">Synthetic match presentation only. No authentication, database, or match mutations.</p>
      <button className="mt-3 min-h-11 border border-zinc-700 px-4 text-sm" onClick={() => setExpanded((value) => !value)}>{expanded ? "Restore mixed footers" : "Expand match footers"}</button>
      <SingleEliminationBracket
        matches={matches}
        participantsById={fixture.participantsById}
        adminReadOnly={params.has("readOnly")}
        onAdminMatchSelect={mode === "admin" ? (match) => { window.__bracketFixture.selections.push("admin:" + match.id); } : undefined}
        onPlayerMatchSelect={mode === "player" ? (match) => { window.__bracketFixture.selections.push("player:" + match.id); } : undefined}
        viewerRegistrationIds={mode === "player" ? fixture.registrationIds : []}
        focusedMatchId={params.has("focused") ? matches[1].id : null}
        anchorPrefix={innerWidth < 768 ? "match-mobile" : "match-desktop"}
      />
    </main>
  </LocaleProvider>;
}

createRoot(document.getElementById("root")!).render(<Fixture />);