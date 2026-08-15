import Image from "next/image";
import { ImageIcon, LockKeyhole, MapPinned } from "lucide-react";
import type { PublishedTournamentMapPool } from "@/lib/tournament-map-pools";

type TournamentMapPoolsProps = {
  pools: PublishedTournamentMapPool[];
};

const sourceTypeLabels = {
  official: "Official",
  community: "Community",
} as const;

const statusLabels = {
  active: "Active",
  retired: "Retired",
  temporarily_disabled: "Temporarily disabled",
} as const;

export default function TournamentMapPools({ pools }: TournamentMapPoolsProps) {
  return (
    <section
      aria-label="Published division map pools"
      className="overflow-hidden border border-white/12 bg-[linear-gradient(145deg,rgba(255,255,255,0.06),rgba(8,8,8,0.9))] p-5 shadow-2xl shadow-black/30 backdrop-blur sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-orange-400/30 bg-orange-500/10 text-orange-300">
            <MapPinned size={21} aria-hidden="true" />
          </span>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-orange-300">
              Competitive Map Pools
            </p>
            <h2 className="mt-1 text-xl font-black text-white sm:text-2xl">
              Published by Division
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
              Only the published 1v1 maps listed for a Division are eligible for
              its tournament Series.
            </p>
          </div>
        </div>
      </div>

      {pools.length === 0 ? (
        <div className="mt-5 grid min-h-32 place-items-center border border-dashed border-white/12 bg-black/25 p-6 text-center">
          <div>
            <ImageIcon
              size={24}
              aria-hidden="true"
              className="mx-auto text-zinc-600"
            />
            <p className="mt-3 text-sm font-bold text-zinc-400">
              No Division map pools have been published yet.
            </p>
          </div>
        </div>
      ) : (
        <div className="mt-6 grid items-start gap-5 lg:grid-cols-3">
          {pools.map((pool) => (
            <article
              key={pool.bracketId}
              className="overflow-hidden rounded-3xl border border-white/12 bg-black/35 shadow-xl shadow-black/20"
            >
              <header className="border-b border-white/10 bg-[linear-gradient(135deg,rgba(249,115,22,0.13),rgba(255,255,255,0.025))] p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-orange-300">
                      Division Pool
                    </p>
                    <h3 className="mt-1 break-words text-xl font-black text-white">
                      {pool.divisionName}
                    </h3>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-200">
                    {pool.launchedAt ? (
                      <LockKeyhole size={12} aria-hidden="true" />
                    ) : null}
                    {pool.launchedAt ? "Frozen" : "Published"}
                  </span>
                </div>
                <p className="mt-3 text-xs font-bold text-zinc-400">
                  {pool.maps.length} {pool.maps.length === 1 ? "map" : "maps"}
                </p>
              </header>

              <ul className="grid gap-3 p-3 sm:grid-cols-2 sm:p-4 lg:grid-cols-1 2xl:grid-cols-2">
                {pool.maps.map((map) => (
                  <li
                    key={map.id}
                    className="overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/80"
                  >
                    <div className="relative grid aspect-[16/7] place-items-center overflow-hidden border-b border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(249,115,22,0.16),transparent_42%),linear-gradient(145deg,#18181b,#09090b)]">
                      {map.thumbnailPath ? (
                        <Image
                          src={map.thumbnailPath}
                          alt={`${map.displayName} map thumbnail`}
                          fill
                          sizes="(min-width: 1536px) 14rem, (min-width: 1024px) 22rem, (min-width: 640px) 45vw, 90vw"
                          className="object-cover"
                        />
                      ) : (
                        <span
                          role="img"
                          aria-label={`${map.displayName} thumbnail unavailable`}
                          className="grid h-12 w-12 place-items-center rounded-2xl border border-white/10 bg-black/35 text-zinc-600"
                        >
                          <MapPinned size={24} aria-hidden="true" />
                        </span>
                      )}
                    </div>

                    <div className="p-3">
                      <div className="flex flex-wrap gap-1.5">
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${
                            map.sourceType === "official"
                              ? "border-orange-400/25 bg-orange-500/10 text-orange-200"
                              : "border-sky-400/25 bg-sky-500/10 text-sky-200"
                          }`}
                        >
                          {sourceTypeLabels[map.sourceType]}
                        </span>
                        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-zinc-300">
                          {map.gameMode}
                        </span>
                        {map.status !== "active" ? (
                          <span className="rounded-full border border-amber-400/25 bg-amber-500/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-amber-200">
                            {statusLabels[map.status]}
                          </span>
                        ) : null}
                      </div>

                      <p className="mt-2 break-words text-sm font-black text-white">
                        {map.displayName}
                      </p>
                      {map.creatorName ? (
                        <p className="mt-1 break-words text-xs text-zinc-500">
                          Created by {map.creatorName}
                        </p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
