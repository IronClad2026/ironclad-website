import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import LocaleProvider from "@/components/i18n/LocaleProvider";
import { loadDictionary } from "@/lib/i18n/loaders";
import { getRequestLocale } from "@/lib/i18n/request";
import { translate } from "@/lib/i18n/translate";
import { getShowcaseForModeration } from "@/lib/player-showcase/moderation";
import ModerationForm from "./ModerationForm";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const dictionary = await loadDictionary(await getRequestLocale(), "account-dashboard");
  return { title: `${translate(dictionary, "showcase.adminTitle")} | IronClad` };
}

export default async function PlayerShowcaseModerationPage({
  searchParams,
}: { searchParams: Promise<{ playerId?: string | string[] }> }) {
  const { userId, sessionClaims } = await auth();
  if (!userId || (sessionClaims as { metadata?: { role?: string } } | null)?.metadata?.role !== "admin") redirect("/");
  const locale = await getRequestLocale();
  const dictionary = await loadDictionary(locale, "account-dashboard");
  const t = (key: string) => translate(dictionary, `showcase.${key}`);
  const { playerId } = await searchParams;
  const result = playerId === undefined ? null : await getShowcaseForModeration(playerId);
  return (
    <LocaleProvider locale={locale} dictionaries={{ "account-dashboard": dictionary }}>
      <main className="min-h-screen bg-black px-4 pb-20 pt-28 text-white sm:px-6">
        <section className="mx-auto max-w-3xl">
          <h1 className="text-3xl font-black">{t("adminTitle")}</h1>
          <p className="mt-3 text-zinc-300">{t("adminDescription")}</p>
          <form className="mt-6 flex flex-wrap items-end gap-3" action="/admin/player-showcase">
            <label className="min-w-0 flex-1 text-sm font-bold">
              {t("playerId")}
              <input name="playerId" required defaultValue={typeof playerId === "string" ? playerId : ""} className="mt-2 min-h-11 w-full border border-zinc-700 bg-zinc-950 px-3 text-base" />
            </label>
            <button className="min-h-11 border border-zinc-600 px-4 py-2 font-bold hover:border-orange-400">{t("retry")}</button>
          </form>
          {result && ("row" in result ? <ModerationForm key={result.row.playerId} row={result.row} /> : <p role="status" className="mt-5 text-zinc-300">{t(result.code)}</p>)}
        </section>
      </main>
    </LocaleProvider>
  );
}
