import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import PlayerShowcaseEditor from "@/components/showcase/PlayerShowcaseEditor";
import { loadDictionaries } from "@/lib/i18n/loaders";
import { getRequestLocale } from "@/lib/i18n/request";
import { translate } from "@/lib/i18n/translate";
import { getMyPlayerShowcase } from "@/lib/player-showcase/read";
import { saveCurrentThought, saveFeaturedBadge } from "./actions";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const dictionaries = await loadDictionaries(await getRequestLocale(), ["account-dashboard"] as const);
  return { title: `${translate(dictionaries["account-dashboard"], "showcase.title")} | IronClad` };
}

export default async function PlayerShowcasePage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const locale = await getRequestLocale();
  const [dictionaries, result] = await Promise.all([
    loadDictionaries(locale, ["account-dashboard", "badges"] as const),
    getMyPlayerShowcase(),
  ]);
  const t = (key: string) => translate(dictionaries["account-dashboard"], `showcase.${key}`);
  return (
    <main className="min-h-screen bg-black px-4 pb-20 pt-28 text-white sm:px-6 sm:pt-32">
      {result.status === "success" ? (
        <PlayerShowcaseEditor
          initialState={result.state}
          saveThought={saveCurrentThought}
          saveBadge={saveFeaturedBadge}
          badgeDictionary={dictionaries.badges}
        />
      ) : (
        <section className="mx-auto max-w-3xl border border-zinc-800 bg-zinc-950 p-6">
          <h1 className="text-3xl font-black">{t("title")}</h1>
          <p role="status" className="mt-4 text-zinc-300">{t(result.code)}</p>
          <Link href="/dashboard" className="mt-6 inline-flex min-h-11 items-center text-orange-300 underline underline-offset-4">{t("backToDashboard")}</Link>
        </section>
      )}
    </main>
  );
}
