"use client";

import { useMemo, useState } from "react";
import {
  correctTournamentMapPool,
  publishTournamentMapPools,
} from "@/app/admin/tournaments/map-pool-actions";
import {
  isEligibleOneVersusOnePoolMap,
  type Coh3MapRow,
} from "@/lib/coh3-maps";
import { getTournamentBracketDisplayName } from "@/lib/tournaments";

export type AdminTournamentMapPoolBracket = {
  id: string;
  name: string;
  launchedAt: string | null;
  notHeldAt: string | null;
  mapPoolPublishedAt: string | null;
  currentMapIds: string[];
};

export default function AdminTournamentMapPools({
  tournamentId,
  tournamentTitle,
  terminal,
  brackets,
  catalogue,
}: {
  tournamentId: string;
  tournamentTitle: string;
  terminal: boolean;
  brackets: AdminTournamentMapPoolBracket[];
  catalogue: Coh3MapRow[];
}) {
  const [activeBracketId, setActiveBracketId] = useState(
    brackets[0]?.id ?? ""
  );
  const [search, setSearch] = useState("");
  const [selectionByBracket, setSelectionByBracket] = useState<
    Record<string, string[]>
  >(() =>
    Object.fromEntries(
      brackets.map((bracket) => [bracket.id, [...bracket.currentMapIds]])
    )
  );
  const activeBracket =
    brackets.find((bracket) => bracket.id === activeBracketId) ?? brackets[0];
  const activeSelection = activeBracket
    ? selectionByBracket[activeBracket.id] ?? []
    : [];
  const activeSelectionSet = new Set(activeSelection);
  const normalizedSearch = search.trim().toLocaleLowerCase("en");
  const catalogueById = useMemo(
    () => new Map(catalogue.map((map) => [map.id, map])),
    [catalogue]
  );
  const visibleMaps = useMemo(
    () =>
      catalogue.filter((map) => {
        if (!normalizedSearch) return true;
        return [map.displayName, map.slug, map.creatorName, map.sourceType, map.status]
          .filter(Boolean)
          .some((value) =>
            String(value).toLocaleLowerCase("en").includes(normalizedSearch)
          );
      }),
    [catalogue, normalizedSearch]
  );
  const allDivisionsEditable = brackets.every(
    (bracket) => bracket.launchedAt === null && bracket.notHeldAt === null
  );
  const activeSelectionIsPublishable =
    activeSelection.length >= 5 &&
    activeSelection.every((mapId) => {
      const map = catalogueById.get(mapId);
      return map ? isEligibleOneVersusOnePoolMap(map) : false;
    });

  if (!activeBracket) {
    return null;
  }

  function toggleMap(mapId: string) {
    if (terminal || activeBracket.notHeldAt) {
      return;
    }

    setSelectionByBracket((current) => {
      const currentSelection = current[activeBracket.id] ?? [];
      return {
        ...current,
        [activeBracket.id]: currentSelection.includes(mapId)
          ? currentSelection.filter((id) => id !== mapId)
          : [...currentSelection, mapId],
      };
    });
  }

  return (
    <section className="mt-8 min-w-0 rounded-3xl border border-orange-500/20 bg-white/[0.04] p-4 sm:p-6 md:p-8">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.3em] text-orange-400">
            Division Map Pools
          </p>
          <h2 className="mt-3 break-words text-2xl font-black text-white">
            {tournamentTitle}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
            Publish at least five distinct active 1v1 maps for each Division.
            Publication remains editable until launch; launched pools require an
            exceptional correction.
          </p>
        </div>
        {terminal && (
          <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-200">
            This tournament is read-only. Its published map pools remain as
            factual tournament context.
          </p>
        )}
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-3">
        {brackets.map((bracket) => {
          const count = (selectionByBracket[bracket.id] ?? []).length;
          const selected = bracket.id === activeBracket.id;
          return (
            <button
              key={bracket.id}
              type="button"
              aria-pressed={selected}
              onClick={() => setActiveBracketId(bracket.id)}
              className={`rounded-2xl border p-4 text-left transition ${
                selected
                  ? "border-orange-400 bg-orange-500/15"
                  : "border-white/10 bg-black/30 hover:border-orange-500/40"
              }`}
            >
              <span className="block font-black text-white">
                {getTournamentBracketDisplayName(bracket.name)}
              </span>
              <span className="mt-2 block text-xs font-bold uppercase tracking-wider text-zinc-400">
                {bracket.mapPoolPublishedAt ? "Published" : "Unpublished"} / {count}{" "}
                map{count === 1 ? "" : "s"}
              </span>
              <span
                className={`mt-2 block text-xs font-black uppercase tracking-wider ${
                  bracket.notHeldAt
                    ? "text-zinc-300"
                    : bracket.launchedAt
                      ? "text-sky-300"
                      : "text-emerald-300"
                }`}
              >
                {bracket.notHeldAt
                  ? "Not Held / Frozen"
                  : bracket.launchedAt
                    ? "Launched / Frozen"
                    : "Pre-launch / Editable"}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-6 rounded-2xl border border-white/10 bg-black/30 p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="text-xl font-black text-white">
              {getTournamentBracketDisplayName(activeBracket.name)}
            </h3>
            <p className="mt-1 text-sm text-zinc-400">
              {activeSelection.length} selected / five required
            </p>
          </div>
          <label className="w-full sm:max-w-sm">
            <span className="text-xs font-black uppercase tracking-wider text-zinc-400">
              Search catalogue
            </span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Map or creator"
              className="mt-2 w-full rounded-xl border border-white/10 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-orange-400"
            />
          </label>
        </div>

        <div className="mt-5 grid max-h-[34rem] gap-3 overflow-y-auto pr-1 lg:grid-cols-2">
          {visibleMaps.map((map) => {
            const checked = activeSelectionSet.has(map.id);
            const eligible = isEligibleOneVersusOnePoolMap(map);
            return (
              <label
                key={map.id}
                className={`flex min-h-20 items-start gap-3 rounded-xl border p-4 ${
                  checked
                    ? "border-orange-400/70 bg-orange-500/10"
                    : "border-white/10 bg-zinc-950/70"
                } ${terminal || activeBracket.notHeldAt ? "cursor-default" : "cursor-pointer"}`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={
                    terminal ||
                    Boolean(activeBracket.notHeldAt) ||
                    (!eligible && !checked)
                  }
                  onChange={() => toggleMap(map.id)}
                  className="mt-1 h-5 w-5 shrink-0 accent-orange-500"
                />
                <span className="min-w-0">
                  <span className="block break-words font-black text-white">
                    {map.displayName}
                  </span>
                  <span className="mt-2 flex flex-wrap gap-2 text-[11px] font-black uppercase tracking-wider">
                    <span className="rounded-full border border-orange-400/30 px-2 py-1 text-orange-200">
                      {formatLabel(map.sourceType)}
                    </span>
                    <span
                      className={`rounded-full border px-2 py-1 ${
                        map.status === "active"
                          ? "border-emerald-400/30 text-emerald-200"
                          : "border-amber-400/30 text-amber-200"
                      }`}
                    >
                      {formatLabel(map.status)}
                    </span>
                    <span className="rounded-full border border-white/15 px-2 py-1 text-zinc-300">
                      {map.gameMode}
                    </span>
                  </span>
                  {map.creatorName && (
                    <span className="mt-2 block text-xs text-zinc-500">
                      Creator: {map.creatorName}
                    </span>
                  )}
                  {!eligible && checked && (
                    <span className="mt-2 block text-xs font-bold text-amber-300">
                      Remove this ineligible historical selection before publishing.
                    </span>
                  )}
                </span>
              </label>
            );
          })}
          {visibleMaps.length === 0 && (
            <p className="rounded-xl border border-dashed border-white/15 p-5 text-sm text-zinc-500 lg:col-span-2">
              No catalogue maps match this search.
            </p>
          )}
        </div>

        {!terminal && !activeBracket.launchedAt && !activeBracket.notHeldAt && (
          <div className="mt-6 grid gap-3 lg:grid-cols-2">
            <MapPoolPublicationForm
              tournamentId={tournamentId}
              bracketIds={[activeBracket.id]}
              mapIds={activeSelection}
              canSubmit={activeSelectionIsPublishable}
              label={
                activeBracket.mapPoolPublishedAt
                  ? "Republish This Division"
                  : "Publish This Division"
              }
            />
            {brackets.length > 1 && allDivisionsEditable && (
              <MapPoolPublicationForm
                tournamentId={tournamentId}
                bracketIds={brackets.map((bracket) => bracket.id)}
                mapIds={activeSelection}
                canSubmit={activeSelectionIsPublishable}
                label="Use This Pool For All Divisions"
                secondary
              />
            )}
          </div>
        )}

        {!terminal && activeBracket.notHeldAt && (
          <p className="mt-6 rounded-xl border border-zinc-500/30 bg-zinc-900/70 p-4 text-sm leading-6 text-zinc-300">
            This Division is Not Held because the minimum roster requirement was
            not reached. Its Map Pool is retained as read-only history.
          </p>
        )}

        {!terminal &&
          activeBracket.launchedAt &&
          activeBracket.mapPoolPublishedAt && (
          <form action={correctTournamentMapPool} className="mt-6 space-y-4">
            <input type="hidden" name="tournamentId" value={tournamentId} />
            <input type="hidden" name="bracketId" value={activeBracket.id} />
            {activeSelection.map((mapId) => (
              <input key={mapId} type="hidden" name="mapIds" value={mapId} />
            ))}
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm leading-6 text-amber-100">
              This Division is launched. A correction must be limited to a
              serious technical, exploit, game-update, or competitive-integrity
              issue and will be permanently audited.
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <label>
                <span className="text-sm font-bold text-white">Reason</span>
                <select
                  name="reason"
                  required
                  defaultValue=""
                  className="mt-2 w-full rounded-xl border border-white/10 bg-zinc-950 px-4 py-3 text-white outline-none focus:border-orange-400"
                >
                  <option value="" disabled>
                    Select a locked reason
                  </option>
                  <option value="technical_issue">Technical issue</option>
                  <option value="exploit">Exploit</option>
                  <option value="game_update">Game update</option>
                  <option value="competitive_integrity">
                    Competitive integrity
                  </option>
                </select>
              </label>
              <label>
                <span className="text-sm font-bold text-white">
                  Short explanation
                </span>
                <textarea
                  name="explanation"
                  required
                  maxLength={500}
                  rows={3}
                  className="mt-2 w-full rounded-xl border border-white/10 bg-zinc-950 px-4 py-3 text-white outline-none focus:border-orange-400"
                />
              </label>
            </div>
            <button
              type="submit"
              disabled={!activeSelectionIsPublishable}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-amber-500 px-5 py-3 font-black text-black transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
            >
              Apply Audited Post-Launch Correction
            </button>
          </form>
        )}

        {!terminal &&
          activeBracket.launchedAt &&
          !activeBracket.mapPoolPublishedAt && (
            <p className="mt-6 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm leading-6 text-amber-100">
              This legacy Division launched before map-pool publication was
              available. It cannot create a post-launch correction without a
              pool that was published and frozen at launch.
            </p>
          )}
      </div>
    </section>
  );
}

function MapPoolPublicationForm({
  tournamentId,
  bracketIds,
  mapIds,
  canSubmit,
  label,
  secondary = false,
}: {
  tournamentId: string;
  bracketIds: string[];
  mapIds: string[];
  canSubmit: boolean;
  label: string;
  secondary?: boolean;
}) {
  return (
    <form action={publishTournamentMapPools}>
      <input type="hidden" name="tournamentId" value={tournamentId} />
      {bracketIds.map((bracketId) => (
        <input
          key={bracketId}
          type="hidden"
          name="bracketIds"
          value={bracketId}
        />
      ))}
      {mapIds.map((mapId) => (
        <input key={mapId} type="hidden" name="mapIds" value={mapId} />
      ))}
      <button
        type="submit"
        disabled={!canSubmit}
        className={`inline-flex min-h-11 w-full items-center justify-center rounded-xl border px-5 py-3 font-black transition disabled:cursor-not-allowed disabled:border-zinc-700 disabled:bg-zinc-800 disabled:text-zinc-500 ${
          secondary
            ? "border-orange-400/50 bg-orange-500/10 text-orange-100 hover:bg-orange-500/20"
            : "border-orange-500 bg-orange-500 text-white hover:bg-orange-400"
        }`}
      >
        {label}
      </button>
    </form>
  );
}

function formatLabel(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
