import { createRoot } from "react-dom/client";
import { useState } from "react";
import LocaleProvider from "@/components/i18n/LocaleProvider";
import ShowcaseProfileHeader from "@/components/showcase/ShowcaseProfileHeader";
import PlayerShowcaseEditor from "@/components/showcase/PlayerShowcaseEditor";
import type { DictionaryTree } from "@/lib/i18n/types";
import { isLocale } from "@/lib/i18n/config";
import type { BadgesDictionary } from "@/lib/i18n/badges";
import type { ActionResult, ShowcaseEditorState } from "@/lib/player-showcase/types";
import type { PublicPlayerProfile } from "@/lib/public-players";
import "../../../app/globals.css";

const query = new URLSearchParams(location.search);
const player: PublicPlayerProfile = {
  id: "fixture-public-player", playerName: query.has("long") ? "SteelVanguard".repeat(8) : "Steel Vanguard",
  displayName: "Steel Vanguard", country: "Australia", region: "Oceania", currentElo: 1400,
  publicProfileEnabled: true, discordPublicEnabled: query.has("discord"), discordUsername: query.has("discord") ? "steelvanguard" : null,
  avatarUrl: null, hasAvatar: false, createdAt: "2026-08-01T00:00:00Z",
};
const initialState: ShowcaseEditorState = {
  playerId: player.id, currentThought: "Training Wehrmacht this week. Next goal: first Challenge final.",
  featuredBadgeAwardId: "earned-1", thoughtHidden: query.has("hidden"), revision: 1,
  publicProfileEnabled: !query.has("private"),
  awards: query.has("empty") ? [] : [
    { awardId: "earned-1", slug: "first-victory", unlockedAt: "2026-08-01T00:00:00Z" },
    { awardId: "earned-2", slug: "elite-champion", unlockedAt: null },
  ],
};

function Editor({ dictionary }: { dictionary: BadgesDictionary }) {
  const [saved, setSaved] = useState(initialState);
  async function saveThought(input: { currentThought: string | null; revision: number }): Promise<ActionResult> {
    setSaved({ ...saved, currentThought: input.currentThought, revision: input.revision + 1 });
    return { status: "success", code: "thoughtSaved", currentThought: input.currentThought, revision: input.revision + 1 };
  }
  async function saveBadge(input: { awardId: string | null; revision: number }): Promise<ActionResult> {
    setSaved({ ...saved, featuredBadgeAwardId: input.awardId, revision: input.revision + 1 });
    return { status: "success", code: "badgeSaved", featuredBadgeAwardId: input.awardId, revision: input.revision + 1 };
  }
  return <main className="min-h-screen bg-black px-4 py-12 sm:px-6"><PlayerShowcaseEditor initialState={initialState} saveThought={saveThought} saveBadge={saveBadge} badgeDictionary={dictionary} /><output data-fixture-saved className="sr-only">{JSON.stringify(saved)}</output></main>;
}

async function start() {
  const localeParam = query.get("locale");
  const locale = isLocale(localeParam) ? localeParam : "en";
  document.documentElement.lang = locale;
  const modules = import.meta.glob("../../../lib/i18n/dictionaries/*/*.ts") as Record<string, () => Promise<{ default: DictionaryTree }>>;
  const [account, badges, publicCopy] = await Promise.all(["account-dashboard", "badges", "public"].map((name) => modules[`../../../lib/i18n/dictionaries/${locale}/${name}.ts`]()));
  const dictionaries = { "account-dashboard": account.default, badges: badges.default as unknown as BadgesDictionary, public: publicCopy.default };
  if (query.has("largeText")) document.documentElement.style.fontSize = "24px";
  const surface = query.get("surface") ?? "public";
  createRoot(document.getElementById("root")!).render(
    <LocaleProvider locale={locale} dictionaries={dictionaries}>
      {surface === "editor" ? <Editor dictionary={dictionaries.badges} /> : (
        <main className="min-h-screen bg-black text-white">
          <ShowcaseProfileHeader player={player} badgeDictionary={dictionaries.badges} showcase={{
            currentThought: query.has("empty") ? null : query.has("long") ? "界".repeat(160) : initialState.currentThought,
            featuredBadge: query.has("empty") ? null : { slug: "first-victory", unlockedAt: "2026-08-01T00:00:00Z" },
          }} />
        </main>
      )}
    </LocaleProvider>
  );
  document.documentElement.dataset.showcaseFixtureReady = surface;
}

void start().catch((error: unknown) => {
  document.getElementById("root")!.textContent = error instanceof Error ? error.message : "Fixture failed";
  console.error(error);
});