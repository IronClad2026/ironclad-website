"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, FileCheck2, Swords, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import HydrationSafeLocalDateTime from "@/components/HydrationSafeLocalDateTime";
import {
  useOptionalLocale,
  useOptionalTranslations,
} from "@/components/i18n/LocaleProvider";
import type { Locale } from "@/lib/i18n/config";
import accountDashboardEnglish from "@/lib/i18n/dictionaries/en/account-dashboard";
import competitionEnglish from "@/lib/i18n/dictionaries/en/competition";
import { formatNumber, selectPlural } from "@/lib/i18n/format";
import { localizeBracketRoundName } from "@/lib/i18n/round-display";
import type { MessageValues } from "@/lib/i18n/types";
import type { MatchHistoryEntry } from "@/lib/player-dashboard";

type DashboardTranslator = (
  path: string,
  values?: MessageValues
) => string;

export default function DashboardMatchHistory({
  matches,
}: {
  matches: MatchHistoryEntry[];
}) {
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<MatchHistoryEntry | null>(null);
  const locale = useOptionalLocale();
  const t = useOptionalTranslations(
    "account-dashboard",
    accountDashboardEnglish
  );
  const roundT = useOptionalTranslations("competition", competitionEnglish);

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
        className="flex w-full items-center justify-between gap-4 border border-orange-500/20 bg-black/65 p-5 text-left shadow-xl shadow-black/25 backdrop-blur transition hover:border-orange-400/45 hover:bg-black/75 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300"
      >
        <span className="flex min-w-0 items-center gap-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center border border-orange-400/30 bg-orange-500/10 text-orange-300">
            <Swords size={20} />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-black uppercase tracking-[0.18em] text-white">
              {t("dashboard.matchHistory.title")}
            </span>
            <span className="mt-1 block truncate text-xs text-zinc-400">
              {matches.length === 0
                ? t("dashboard.matchHistory.noCompleted")
                : completedMatchSummary(matches.length, locale, t)}
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
            className="relative z-10 mt-2 overflow-hidden border border-orange-500/20 bg-[#07090d]/95 shadow-2xl shadow-black/50 backdrop-blur-xl"
          >
            {matches.length === 0 ? (
              <p className="p-5 text-sm text-zinc-500">
                {t("dashboard.matchHistory.empty")}
              </p>
            ) : (
              <div className="max-h-80 overflow-y-auto p-2">
                {matches.map((match) => (
                  <button
                    key={match.id}
                    type="button"
                    onClick={() => setSelected(match)}
                    className="grid w-full grid-cols-[1fr_auto] gap-3 px-3 py-3 text-left transition hover:bg-orange-500/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold text-white">
                        {match.tournamentName}
                      </span>
                      <span className="mt-1 block truncate text-xs text-zinc-500">
                        {t("dashboard.matchHistory.versus", {
                          opponent: match.opponentName,
                          round: localizeBracketRoundName(
                            match.roundName,
                            roundT
                          ),
                        })}
                      </span>
                    </span>
                    <span className="flex items-center gap-3">
                      <span
                        className={
                          match.result === "win"
                            ? "text-xs font-black text-emerald-300"
                            : "text-xs font-black text-red-300"
                        }
                      >
                        {t(`dashboard.matchHistory.${match.result}`)}
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
            locale={locale}
            t={t}
            roundT={roundT}
            onClose={() => setSelected(null)}
          />
        )}
      </AnimatePresence>
    </section>
  );
}

function MatchHistoryModal({
  match,
  locale,
  t,
  roundT,
  onClose,
}: {
  match: MatchHistoryEntry;
  locale: Locale;
  t: DashboardTranslator;
  roundT: DashboardTranslator;
  onClose: () => void;
}) {
  const localizedRoundName = localizeBracketRoundName(match.roundName, roundT);

  return (
    <div className="fixed inset-0 z-[10000] grid place-items-center p-4 sm:p-6">
      <motion.button
        type="button"
        aria-label={t("dashboard.matchHistory.close")}
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
        className="relative w-full max-w-2xl overflow-hidden border border-orange-400/30 bg-[radial-gradient(circle_at_top_right,rgba(249,115,22,0.16),transparent_35%),linear-gradient(145deg,#111827,#030712)] shadow-[0_0_80px_rgba(249,115,22,0.16)]"
      >
        <header className="flex items-start justify-between gap-5 border-b border-white/10 p-6 sm:p-8">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.25em] text-orange-300">
              {t("dashboard.matchHistory.detailEyebrow")}
            </p>
            <h2
              id={`match-history-${match.id}`}
              className="mt-2 text-2xl font-black text-white"
            >
              {match.tournamentName}
            </h2>
            <p className="mt-2 text-sm text-zinc-400">
              {t("dashboard.matchHistory.bracketRound", {
                bracket: match.bracketName,
                round: localizedRoundName,
              })}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("dashboard.matchHistory.close")}
            className="shrink-0 border border-white/10 bg-white/5 p-2.5 text-zinc-400 transition hover:border-orange-400/40 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300"
          >
            <X size={19} />
          </button>
        </header>

        <div className="grid gap-3 p-6 sm:grid-cols-2 sm:p-8">
          <Detail
            label={t("dashboard.matchHistory.opponent")}
            value={match.opponentName}
          />
          <Detail
            label={t("dashboard.matchHistory.round")}
            value={localizedRoundName}
          />
          <Detail
            label={t("dashboard.matchHistory.matchNumber")}
            value={formatNumber(match.matchNumber, locale)}
          />
          <Detail
            label={t("dashboard.matchHistory.format")}
            value={`BO${match.seriesBestOf}`}
          />
          <Detail
            label={t("dashboard.matchHistory.result")}
            value={t(`dashboard.matchHistory.${match.result}`)}
          />
          <Detail
            label={t("dashboard.matchHistory.finalScore")}
            value={match.score}
          />
          <Detail
            label={t("dashboard.matchHistory.matchDate")}
            value={
              <HydrationSafeLocalDateTime
                value={match.playedAt}
                fallback={t("dashboard.notAvailable")}
              />
            }
          />
          <Detail
            label={t("dashboard.matchHistory.replayProof")}
            value={
              match.replayAvailable
                ? t("dashboard.matchHistory.available")
                : t("dashboard.matchHistory.notAttached")
            }
          />
          <Detail
            label={t("dashboard.matchHistory.screenshotProof")}
            value={
              match.screenshotAvailable
                ? t("dashboard.matchHistory.available")
                : t("dashboard.matchHistory.notAttached")
            }
          />
        </div>

        {(match.replayAvailable || match.screenshotAvailable) && (
          <div className="mx-6 mb-6 flex items-center gap-3 border border-sky-400/20 bg-sky-500/5 p-4 text-sm text-sky-200 sm:mx-8 sm:mb-8">
            <FileCheck2 size={18} className="shrink-0" />
            {t("dashboard.matchHistory.proofRetained")}
          </div>
        )}
      </motion.article>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="border border-white/10 bg-black/30 p-4">
      <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
        {label}
      </p>
      <p className="mt-2 text-sm font-bold text-white">{value}</p>
    </div>
  );
}

function completedMatchSummary(
  count: number,
  locale: Locale,
  t: DashboardTranslator
) {
  const category = selectPlural(count, locale);
  const suffix =
    category === "one" || category === "few" || category === "many"
      ? `${category[0].toUpperCase()}${category.slice(1)}`
      : "Other";

  return t(`dashboard.matchHistory.count${suffix}`, {
    count: formatNumber(count, locale),
  });
}
