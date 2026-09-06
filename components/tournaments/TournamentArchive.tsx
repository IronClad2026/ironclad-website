"use client";

import Image from "next/image";
import { Archive, ArrowUpRight } from "lucide-react";
import { useState } from "react";
import ReferenceDialog from "@/components/ui/ReferenceDialog";
import { useOptionalTranslations } from "@/components/i18n/LocaleProvider";
import competitionEnglish from "@/lib/i18n/dictionaries/en/competition";

export type ArchiveEvent = { title: string; image: string; descriptionKey: string; battlefy: string };

export default function TournamentArchive({ events }: { events: ArchiveEvent[] }) {
  const t = useOptionalTranslations("competition", competitionEnglish);
  const [open, setOpen] = useState(false);
  return <>
    <section data-tournament-archive className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-white/10 py-3 text-zinc-400">
      <div className="flex min-w-0 items-center gap-3"><Archive size={18} className="shrink-0" aria-hidden="true" /><div><h2 className="text-sm font-semibold text-zinc-300">{t("tournaments.overview.archive")}</h2><p className="mt-0.5 text-xs">{t("tournaments.redesign.historicalCount", { count: events.length })}</p></div></div>
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" className="min-h-11 text-sm font-semibold hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300">{t("tournaments.redesign.openArchive")}</button>
    </section>
    {open ? <ReferenceDialog title={t("tournaments.overview.archive")} closeLabel={t("tournaments.actions.close")} onClose={() => setOpen(false)} size="compact"><p className="mb-4 text-sm leading-6 text-zinc-400">{t("tournaments.overview.archiveDescription")}</p><ul className="divide-y divide-white/10">{events.map((event) => <li key={event.battlefy}><a href={event.battlefy} target="_blank" rel="noreferrer" className="flex min-w-0 items-start gap-3 py-4 hover:bg-white/[0.03] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300"><Image src={event.image} width={96} height={54} alt="" className="h-12 w-20 shrink-0 object-contain sm:h-14 sm:w-24" /><span className="min-w-0 flex-1"><span className="block break-words text-sm font-bold text-white sm:text-base">{event.title}</span><span className="mt-1 block break-words text-xs leading-5 text-zinc-400">{t(event.descriptionKey)}</span><span className="mt-2 block text-xs font-bold text-orange-300">{t("tournaments.actions.viewBattlefy")} · {t("tournaments.rulesSummary.opensNewTab")}</span></span><ArrowUpRight size={16} className="mt-1 shrink-0 text-zinc-500" aria-hidden="true" /></a></li>)}</ul></ReferenceDialog> : null}
  </>;
}
