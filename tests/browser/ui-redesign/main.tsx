import { createRoot } from "react-dom/client";
import TournamentsExperience from "@/components/TournamentsExperience";
import LocaleProvider from "@/components/i18n/LocaleProvider";
import { loadDictionaries } from "@/lib/i18n/loaders";
import { parameters, tournamentFixtures } from "./fixtures";
import "./runtime";
import "@/app/globals.css";

async function start() {
  const locale = parameters().get("locale") === "ru" ? "ru" : "en";
  document.documentElement.lang = locale;
  const dictionaries = await loadDictionaries(locale, ["competition", "account-dashboard", "notifications", "badges", "common"] as const);
  const surface = parameters().get("surface") ?? "tournament";
  const events = tournamentFixtures();
  if (parameters().has("historical") && !parameters().has("tournament")) {
    const query = parameters();
    query.set("tournament", events.at(-1)!.slug);
    history.replaceState(null, "", `/tests/browser/ui-redesign/?${query}`);
  }
  const content = surface === "dashboard"
    ? await (await import("@/app/dashboard/page")).default()
    : <TournamentsExperience tournaments={events} viewer={{ isAdmin: false, relicVerifiedDivision: null, registrationIds: [], registrations: [] }} matchResultSubmissions={[]} matchResultReportGroups={[]} eloVerificationEnabled />;
  createRoot(document.getElementById("root")!).render(
    <LocaleProvider locale={locale} dictionaries={dictionaries}>{content}</LocaleProvider>
  );
  document.documentElement.dataset.uiFixtureReady = surface;
}

void start().catch((error: unknown) => {
  document.getElementById("root")!.textContent = error instanceof Error ? error.message : "Fixture failed";
  console.error(error);
});
