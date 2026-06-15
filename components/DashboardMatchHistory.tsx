"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, FileCheck2, Swords, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { MatchHistoryEntry } from "@/lib/player-dashboard";

export default function DashboardMatchHistory({
  matches,
}: {
  matches: MatchHistoryEntry[];
}) {
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<MatchHistoryEntry | null>(null);

  useEffect(() => {
    if (!selected) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [selected]);

  return (
    <section className="relative mt-10 max-w-xl">
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-4 rounded-2xl border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.05),rgba(249,115,22,0.05))] p-5 text-left shadow-xl shadow-black/20 transition hover:border-orange-400/35"
      >
        <span className="flex min-w-0 items-center gap-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-orange-400/25 bg-orange-500/10 text-orange-300">
            <Swords size={20} />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-black uppercase tracking-[0.18em] text-white">
              Match History
            </span>
            <span className="mt-1 block truncate text-xs text-zinc-400">
              {matches.length === 0
                ? "No completed matches"
                : `${matches.length} completed ${
                    matches.length === 1 ? "match" : "matches"
                  }`}
            </span>
          </span>
        </span>
        <ChevronDown
          size={19}
          className={`shrink-0 text-zinc-400 transition ${
            expanded ? "rotate-180" : ""
          }`}
        />
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0, y: -8 }}
            animate={{ opacity: 1, height: "auto", y: 0 }}
            exit={{ opacity: 0, height: 0, y: -8 }}
            className="relative z-10 mt-2 overflow-hidden rounded-2xl border border-white/10 bg-[#0b0d12]/95 shadow-2xl shadow-black/50 backdrop-blur-xl"
          >
            {matches.length === 0 ? (
              <p className="p-5 text-sm text-zinc-500">
                Completed tournament matches will appear here.
              </p>
            ) : (
              <div className="max-h-80 overflow-y-auto p-2">
                {matches.map((match) => (
                  <button
                    key={match.id}
                    type="button"
                    onClick={() => setSelected(match)}
                    className="grid w-full grid-cols-[1fr_auto] gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-white/5"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold text-white">
                        {match.tournamentName}
                      </span>
                      <span className="mt-1 block truncate text-xs text-zinc-500">
                        vs {match.opponentName} · {match.roundName}
                      </span>
                    </span>
                    <span className="flex items-center gap-3">
                      <span
                        className={
                          match.result === "Win"
                            ? "text-xs font-black text-emerald-300"
                            : "text-xs font-black text-red-300"
                        }
                      >
                        {match.result}
                      </span>
                      <span className="min-w-10 text-right font-black text-white">
                        {match.score}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selected && (
          <MatchHistoryModal
            match={selected}
            onClose={() => setSelected(null)}
          />
        )}
      </AnimatePresence>
    </section>
  );
}

function MatchHistoryModal({
  match,
  onClose,
}: {
  match: MatchHistoryEntry;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[10000] grid place-items-center p-4 sm:p-6">
      <motion.button
        type="button"
        aria-label="Close match history details"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 h-full w-full cursor-default bg-black/85 backdrop-blur-md"
      />
      <motion.article
        role="dialog"
        aria-modal="true"
        aria-labelledby={`match-history-${match.id}`}
        initial={{ opacity: 0, scale: 0.96, y: 18 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 12 }}
        className="relative w-full max-w-2xl overflow-hidden rounded-3xl border border-orange-400/30 bg-[radial-gradient(circle_at_top_right,rgba(249,115,22,0.16),transparent_35%),linear-gradient(145deg,#111827,#030712)] shadow-[0_0_80px_rgba(249,115,22,0.16)]"
      >
        <header className="flex items-start justify-between gap-5 border-b border-white/10 p-6 sm:p-8">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.25em] text-orange-300">
              Competitive Match Record
            </p>
            <h2
              id={`match-history-${match.id}`}
              className="mt-2 text-2xl font-black text-white"
            >
              {match.tournamentName}
            </h2>
            <p className="mt-2 text-sm text-zinc-400">
              {match.bracketName} Bracket · {match.roundName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close match history details"
            className="shrink-0 rounded-xl border border-white/10 bg-white/5 p-2.5 text-zinc-400 transition hover:border-orange-400/40 hover:text-white"
          >
            <X size={19} />
          </button>
        </header>

        <div className="grid gap-3 p-6 sm:grid-cols-2 sm:p-8">
          <Detail label="Opponent" value={match.opponentName} />
          <Detail label="Round" value={match.roundName} />
          <Detail label="Match Number" value={String(match.matchNumber)} />
          <Detail label="Format" value={`BO${match.seriesBestOf}`} />
          <Detail label="Result" value={match.result} />
          <Detail label="Final Score" value={match.score} />
          <Detail label="Match Date" value={formatDate(match.playedAt)} />
          <Detail
            label="Replay Proof"
            value={match.replayAvailable ? "Available" : "Not attached"}
          />
          <Detail
            label="Screenshot Proof"
            value={match.screenshotAvailable ? "Available" : "Not attached"}
          />
        </div>

        {(match.replayAvailable || match.screenshotAvailable) && (
          <div className="mx-6 mb-6 flex items-center gap-3 rounded-2xl border border-sky-400/20 bg-sky-500/5 p-4 text-sm text-sky-200 sm:mx-8 sm:mb-8">
            <FileCheck2 size={18} className="shrink-0" />
            Official proof is retained with the match result audit record.
          </div>
        )}
      </motion.article>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/25 p-4">
      <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
        {label}
      </p>
      <p className="mt-2 text-sm font-bold text-white">{value}</p>
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
