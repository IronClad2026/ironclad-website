"use client";

import { useId, useState } from "react";
import { ArrowUpRight, MapPinned } from "lucide-react";
import ReferenceDialog from "@/components/ui/ReferenceDialog";
import TournamentMapPools from "@/components/TournamentMapPools";
import { useOptionalLocale, useOptionalTranslations } from "@/components/i18n/LocaleProvider";
import competitionEnglish from "@/lib/i18n/dictionaries/en/competition";
import { formatNumber } from "@/lib/i18n/format";
import type { PublishedTournamentMapPool } from "@/lib/tournament-map-pools";

export default function TournamentMapPoolViewer({ tournamentTitle, pools }: {
  tournamentTitle: string; pools: PublishedTournamentMapPool[];
}) {
  const t = useOptionalTranslations("competition", competitionEnglish);
  const locale = useOptionalLocale();
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(pools[0]?.bracketId ?? "");
  const selectId = useId();
  const selected = pools.find((pool) => pool.bracketId === selectedId) ?? pools[0];
  if (!pools.length) return null;
  return <>
    <section data-map-pool-entry className="flex flex-wrap items-center gap-3 border border-white/12 bg-zinc-950/80 px-4 py-3 sm:px-5">
      <MapPinned size={22} className="shrink-0 text-orange-300" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-bold text-white">{t("mapPools.eyebrow")}</h2>
        <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs leading-5 text-zinc-400">
          {pools.map((pool) => <li key={pool.bracketId}>{pool.divisionName}: <span className="font-semibold text-zinc-200">{formatNumber(pool.maps.length, locale)}</span> · {t(pool.launchedAt ? "mapPools.frozen" : "mapPools.published")}</li>)}
        </ul>
      </div>
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-orange-300 hover:text-orange-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300">{t("tournaments.redesign.viewMaps")}<ArrowUpRight size={16} aria-hidden="true" /></button>
    </section>
    {open ? <ReferenceDialog title={t("mapPools.eyebrow")} context={tournamentTitle} closeLabel={t("tournaments.actions.close")} onClose={() => setOpen(false)}>
      <p className="mb-5 text-sm leading-6 text-zinc-400">{t("mapPools.description")}</p>
      <div className="grid items-start gap-5 md:grid-cols-[180px_minmax(0,1fr)]">
        <div>
          <label htmlFor={selectId} className="mb-2 block text-xs font-bold text-zinc-300">{t("tournaments.redesign.mapDivision")}</label>
          <select id={selectId} value={selected.bracketId} onChange={(event) => setSelectedId(event.target.value)} className="min-h-11 w-full min-w-0 border border-white/20 bg-zinc-900 px-3 text-sm text-white focus-visible:outline-2 focus-visible:outline-orange-300 md:hidden">{pools.map((pool) => <option key={pool.bracketId} value={pool.bracketId}>{pool.divisionName} · {formatNumber(pool.maps.length, locale)}</option>)}</select>
          <div className="hidden space-y-2 md:block">{pools.map((pool) => <button key={pool.bracketId} type="button" aria-pressed={pool.bracketId === selected.bracketId} onClick={() => setSelectedId(pool.bracketId)} className={`min-h-11 w-full border px-3 py-3 text-left text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300 ${pool.bracketId === selected.bracketId ? "border-orange-400/50 bg-orange-500/10 text-white" : "border-white/10 text-zinc-400 hover:text-white"}`}><span className="block break-words">{pool.divisionName}</span><span className="mt-1 block text-xs text-zinc-400">{formatNumber(pool.maps.length, locale)} · {t(pool.launchedAt ? "mapPools.frozen" : "mapPools.published")}</span></button>)}</div>
        </div>
        <TournamentMapPools pools={[selected]} embedded />
      </div>
    </ReferenceDialog> : null}
  </>;
}
