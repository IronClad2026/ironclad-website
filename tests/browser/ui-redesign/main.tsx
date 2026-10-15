import { createRoot } from "react-dom/client";
import TournamentsExperience from "@/components/TournamentsExperience";
import LocaleProvider from "@/components/i18n/LocaleProvider";
import { loadDictionaries } from "@/lib/i18n/loaders";
import { isLocale } from "@/lib/i18n/config";
import { parameters, pollFixture, tournamentFixtures } from "./fixtures";
import { rankingsFixture } from "./rankings-fixture";
import "./runtime";
import "@/app/globals.css";

async function start() {
  const requestedLocale = parameters().get("locale");
  const locale = isLocale(requestedLocale) ? requestedLocale : "en";
  document.documentElement.lang = locale;
  const dictionaries = await loadDictionaries(locale, ["competition", "account-dashboard", "notifications", "badges", "common", "public"] as const);
  const surface = parameters().get("surface") ?? "tournament";
  let events = tournamentFixtures();
  if (parameters().has("historical") && !parameters().has("tournament")) {
    const query = parameters();
    query.set("tournament", events.at(-1)!.slug);
    history.replaceState(null, "", `/tests/browser/ui-redesign/?${query}`);
  }
  const root = createRoot(document.getElementById("root")!);
  const render = async () => {
    const RankingsExperience = surface === "rankings" ? (await import("@/components/LeaderboardExperience")).default : null;
    const AboutPage = surface === "about" ? (await import("@/app/about/page")).default : null;
    const content = surface === "dashboard"
      ? await (await import("@/app/dashboard/page")).default()
      : AboutPage
        ? <AboutPage />
        : RankingsExperience
          ? <RankingsExperience data={rankingsFixture(!parameters().has("noTransition"))} />
          : <TournamentsExperience tournaments={events} tournamentPollsByTournament={parameters().has("pollRefresh") ? { [events[0].id]: [pollFixture()] } : {}} viewer={{ isAdmin: false, relicVerifiedDivision: null, registrationIds: [], registrations: [] }} matchResultSubmissions={[]} matchResultReportGroups={[]} eloVerificationEnabled />;
    root.render(<LocaleProvider locale={locale} dictionaries={dictionaries}>{content}</LocaleProvider>);
  };
  // A synthetic loader refresh preserves real child component state. This lets
  // tests deliver an earned badge while the actual match viewer is already open.
  window.__uiFixture.showPendingBadgeReveal = async () => {
    window.__uiFixture.pendingBadgeReveal = true;
    await render();
  };
  window.__uiFixture.deliverTournamentRefresh = async (description: string) => {
    events = events.map((event, index) => index === 0 ? { ...event, description } : event);
    await render();
  };
  await render();
  document.documentElement.dataset.uiFixtureReady = surface;
}

void start().catch((error: unknown) => {
  document.getElementById("root")!.textContent = error instanceof Error ? error.message : "Fixture failed";
  console.error(error);
});
