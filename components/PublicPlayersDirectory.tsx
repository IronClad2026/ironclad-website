"use client";

import { Search, UsersRound } from "lucide-react";
import { useMemo, useState } from "react";
import PublicPlayerCard from "@/components/PublicPlayerCard";
import SearchableProfileSelect from "@/components/SearchableProfileSelect";
import {
  allCountriesFilterOption,
  countryFilterOptions,
} from "@/lib/countries";
import {
  allEloFilterOption,
  eloFilterOptions,
  isEloInRange,
} from "@/lib/elo-options";
import type { PublicPlayerProfile } from "@/lib/public-players";

type PublicPlayersDirectoryProps = {
  players: PublicPlayerProfile[];
};

export default function PublicPlayersDirectory({
  players,
}: PublicPlayersDirectoryProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [countryFilter, setCountryFilter] = useState(
    allCountriesFilterOption.value
  );
  const [countryFilterLabel, setCountryFilterLabel] = useState(
    allCountriesFilterOption.label
  );
  const [eloFilter, setEloFilter] = useState(allEloFilterOption.value);
  const [eloFilterLabel, setEloFilterLabel] = useState(
    allEloFilterOption.label
  );

  const filteredPlayers = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return players.filter((player) => {
      const matchesSearch =
        normalizedSearch.length === 0 ||
        player.playerName.toLowerCase().includes(normalizedSearch) ||
        player.displayName.toLowerCase().includes(normalizedSearch);
      const matchesCountry =
        countryFilter === allCountriesFilterOption.value ||
        player.country === countryFilter;
      const matchesElo = isEloInRange(player.currentElo, eloFilter);

      return matchesSearch && matchesCountry && matchesElo;
    });
  }, [countryFilter, eloFilter, players, searchTerm]);

  return (
    <section className="mx-auto max-w-7xl px-6 py-12 sm:py-16">
      <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 shadow-2xl shadow-black/20 backdrop-blur md:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.28em] text-orange-400">
              <UsersRound size={16} />
              Public Commanders
            </p>
            <h2 className="mt-3 text-3xl font-black text-white">
              {players.length} {players.length === 1 ? "Player" : "Players"}
            </h2>
            <p className="mt-2 text-sm text-zinc-400">
              Directory data is limited to public-safe player profile fields.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-3 xl:min-w-[780px]">
            <label className="relative block min-w-0">
              <span className="text-sm font-bold text-white">
                Search Player
              </span>
              <Search
                size={18}
                className="pointer-events-none absolute bottom-3.5 left-4 text-zinc-500"
              />
              <input
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search by player name"
                className="mt-3 h-12 w-full rounded-xl border border-white/10 bg-black/40 pr-4 pl-11 text-sm font-bold text-white outline-none transition placeholder:text-zinc-600 focus:border-orange-400"
              />
            </label>

            <SearchableProfileSelect
              label="ELO"
              value={eloFilterLabel}
              submittedValue={eloFilter}
              options={eloFilterOptions}
              onSelect={(option) => {
                setEloFilter(option.value);
                setEloFilterLabel(option.label);
              }}
              placeholder="Filter by ELO"
              showSavedValueHint={false}
            />

            <SearchableProfileSelect
              label="Country"
              value={countryFilterLabel}
              submittedValue={countryFilter}
              options={countryFilterOptions}
              onSelect={(option) => {
                setCountryFilter(option.value);
                setCountryFilterLabel(option.label);
              }}
              placeholder="Search countries"
              showSavedValueHint={false}
            />
          </div>
        </div>
      </div>

      {players.length === 0 ? (
        <EmptyState message="No public players available yet." />
      ) : filteredPlayers.length === 0 ? (
        <EmptyState message="No public players match those filters." />
      ) : (
        <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filteredPlayers.map((player) => (
            <PublicPlayerCard key={player.id} player={player} />
          ))}
        </div>
      )}
    </section>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="mt-8 rounded-3xl border border-dashed border-orange-400/25 bg-orange-500/[0.04] p-10 text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-orange-400/25 bg-orange-500/10 text-orange-300">
        <UsersRound size={24} />
      </div>
      <h2 className="mt-5 text-2xl font-black text-white">{message}</h2>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-zinc-500">
        Public player cards will appear here once eligible IronClad profiles are
        available through the public profile boundary.
      </p>
    </div>
  );
}
