"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, ArrowUpRight } from "lucide-react";
import TournamentArtwork from "@/components/tournaments/TournamentArtwork";
import { useOptionalTranslations } from "@/components/i18n/LocaleProvider";
import competitionEnglish from "@/lib/i18n/dictionaries/en/competition";
import type { TournamentCard } from "@/lib/tournaments";

type EventPresentation = { tournament: TournamentCard; status: string; section: string };

export default function PublishedTournamentGallery({ entries, selectedId, selectedContext, onSelect }: {
  entries: EventPresentation[]; selectedId: string; selectedContext: ReactNode; onSelect: (event: TournamentCard) => void;
}) {
  const t = useOptionalTranslations("competition", competitionEnglish);
  const [showAll, setShowAll] = useState(false);
  const selectedIndex = entries.findIndex(({ tournament }) => tournament.id === selectedId);
  const initialIds = new Set(entries.slice(0, 3).map(({ tournament }) => tournament.id));
  if (selectedIndex >= 3) {
    initialIds.delete(entries[2].tournament.id);
    initialIds.add(selectedId);
  }
  const visible = showAll ? entries : entries.filter(({ tournament }) => initialIds.has(tournament.id));
  const otherEvents = entries.filter(({ tournament }) => tournament.id !== selectedId);
  return (
    <section aria-label={t("tournaments.overview.published")}>
      <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.15em] text-zinc-400">{t("tournaments.overview.published")}</h2>
      <div className={`grid items-start gap-4 ${entries.length > 1 ? "md:grid-cols-2" : ""} ${entries.length > 2 ? "xl:grid-cols-3" : ""}`}>
        {visible.map(({ tournament: item, status, section }) => {
          const selected = item.id === selectedId;
          return <article key={item.id} data-published-tournament-card data-selected-event={selected || undefined} className={`min-w-0 overflow-hidden border bg-zinc-950/90 ${selected ? "border-orange-400/40" : "hidden border-white/12 md:block"}`}>
            <div className={`min-w-0 ${entries.length === 1 ? "lg:grid lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]" : ""}`}>
              <div className="min-w-0 self-start"><TournamentArtwork src={item.image} title={item.title} prominent={selected} viewLabel={t("tournaments.redesign.viewArtwork")} closeLabel={t("tournaments.actions.close")} /></div>
              <div className="min-w-0 p-4 sm:p-5">
                {selected ? selectedContext : <><p className="text-xs font-semibold text-orange-300">{section} · {item.format} · {status}</p><h3 className="mt-2 break-words text-xl font-bold text-white">{item.title}</h3></>}
                <EventDescription description={item.description} />
                {!selected ? <button type="button" onClick={() => onSelect(item)} className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-orange-300 hover:text-orange-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300">{t("tournaments.redesign.viewEvent")}<ArrowUpRight size={16} aria-hidden="true" /></button> : null}
              </div>
            </div>
          </article>;
        })}
      </div>
      {entries.length > 3 ? <button type="button" aria-expanded={showAll} onClick={() => setShowAll((value) => !value)} className="mt-3 hidden min-h-11 items-center gap-2 text-sm font-bold text-zinc-300 hover:text-white focus-visible:outline-2 focus-visible:outline-orange-300 md:inline-flex">{t(showAll ? "tournaments.redesign.showFewer" : "tournaments.redesign.browseAll", { count: entries.length })}<ChevronDown size={16} className={showAll ? "rotate-180" : ""} aria-hidden="true" /></button> : null}
      {otherEvents.length ? <details className="group mt-3 border-b border-white/10 md:hidden"><summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 py-2 text-sm font-bold text-zinc-200 focus-visible:outline-2 focus-visible:outline-orange-300">{t("tournaments.redesign.otherEvents", { count: otherEvents.length })}<ChevronDown size={16} className="shrink-0 group-open:rotate-180" aria-hidden="true" /></summary><div className="divide-y divide-white/10">{otherEvents.map(({ tournament: item, status }) => <button key={item.id} type="button" onClick={() => onSelect(item)} className="flex min-h-14 w-full items-center justify-between gap-3 py-3 text-left focus-visible:outline-2 focus-visible:outline-orange-300"><span className="min-w-0"><span className="block break-words text-sm font-bold text-white">{item.title}</span><span className="text-xs text-zinc-400">{item.format} · {status}</span></span><ArrowUpRight size={16} className="shrink-0 text-orange-300" aria-hidden="true" /></button>)}</div></details> : null}
    </section>
  );
}

function EventDescription({ description }: { description: string }) {
  const t = useOptionalTranslations("competition", competitionEnglish);
  const [expanded, setExpanded] = useState(false);
  if (!description) return null;
  return <div className="mt-4 border-t border-white/10 pt-3"><p className={`whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-sm leading-6 text-zinc-300 ${expanded ? "" : "line-clamp-3"}`}>{description}</p><button type="button" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)} className="mt-1 inline-flex min-h-11 items-center gap-2 text-xs font-bold text-zinc-300 hover:text-white focus-visible:outline-2 focus-visible:outline-orange-300">{t(expanded ? "tournaments.redesign.showLess" : "tournaments.redesign.readDescription")}<ChevronDown size={14} className={expanded ? "rotate-180" : ""} aria-hidden="true" /></button></div>;
}
