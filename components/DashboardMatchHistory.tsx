"use client";

import { FileCheck2, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import HydrationSafeLocalDateTime from "@/components/HydrationSafeLocalDateTime";
import { useOptionalLocale, useOptionalTranslations } from "@/components/i18n/LocaleProvider";
import type { Locale } from "@/lib/i18n/config";
import accountDashboardEnglish from "@/lib/i18n/dictionaries/en/account-dashboard";
import competitionEnglish from "@/lib/i18n/dictionaries/en/competition";
import { formatNumber, selectPlural } from "@/lib/i18n/format";
import { localizeBracketRoundName } from "@/lib/i18n/round-display";
import type { MessageValues } from "@/lib/i18n/types";
import type { MatchHistoryEntry } from "@/lib/player-dashboard";

type DashboardTranslator = (path: string, values?: MessageValues) => string;

export default function DashboardMatchHistory({ matches }: { matches: MatchHistoryEntry[] }) {
  const [selected, setSelected] = useState<MatchHistoryEntry | null>(null);
  const locale = useOptionalLocale();
  const t = useOptionalTranslations("account-dashboard", accountDashboardEnglish);
  const roundT = useOptionalTranslations("competition", competitionEnglish);

  return (
    <section aria-label={t("dashboard.matchHistory.title")}>
      <p className="border-b border-white/10 px-4 py-3 text-xs text-zinc-400 sm:px-5">
        {matches.length === 0
          ? t("dashboard.matchHistory.noCompleted")
          : completedMatchSummary(matches.length, locale, t)}
      </p>
      {matches.length === 0 ? (
        <p className="px-4 py-6 text-sm leading-6 text-zinc-400">
          {t("dashboard.matchHistory.empty")}
        </p>
      ) : (
        <div className="max-h-[34rem] overflow-y-auto overscroll-contain divide-y divide-white/10" data-lenis-prevent>
          {matches.map((match) => (
            <button
              key={match.id}
              type="button"
              aria-haspopup="dialog"
              onClick={() => setSelected(match)}
              className="grid min-h-16 w-full grid-cols-[minmax(0,1fr)_auto] gap-3 px-4 py-4 text-left transition hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-orange-300 sm:px-5"
            >
              <span className="min-w-0">
                <span className="block break-words text-sm font-bold text-white">{match.tournamentName}</span>
                <span className="mt-1 block break-words text-xs leading-5 text-zinc-300">
                  {t("dashboard.matchHistory.versus", {
                    opponent: match.opponentName,
                    round: localizeBracketRoundName(match.roundName, roundT),
                  })}
                </span>
                <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-400">
                  <span>{match.bracketName}</span>
                  <HydrationSafeLocalDateTime value={match.playedAt} fallback={t("dashboard.notAvailable")} options={{ dateStyle: "medium" }} />
                </span>
              </span>
              <span className="flex flex-col items-end justify-center gap-1 sm:flex-row sm:items-center sm:gap-3">
                <span className={match.result === "win" ? "text-xs font-bold text-emerald-300" : "text-xs font-bold text-red-300"}>
                  {t(`dashboard.matchHistory.${match.result}`)}
                </span>
                <span className="text-right font-bold tabular-nums text-white">{match.score}</span>
              </span>
            </button>
          ))}
        </div>
      )}
      {selected ? (
        <MatchHistoryModal match={selected} locale={locale} t={t} roundT={roundT} onClose={() => setSelected(null)} />
      ) : null}
    </section>
  );
}

function MatchHistoryModal({
  match, locale, t, roundT, onClose,
}: {
  match: MatchHistoryEntry;
  locale: Locale;
  t: DashboardTranslator;
  roundT: DashboardTranslator;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const onCloseRef = useRef(onClose);
  const localizedRoundName = localizeBracketRoundName(match.roundName, roundT);

  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // Badge reveals own the body lock; keep this read-only viewer's lock separate
    // so handing focus to a newly mounted reveal cannot leave scrolling locked.
    const previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    dialog.showModal();
    titleRef.current?.focus();
    const dismissForBadgeReveal = () => {
      if (getActiveBadgeReveal()) onCloseRef.current();
    };
    const observer = new MutationObserver(dismissForBadgeReveal);
    observer.observe(document.body, { childList: true, subtree: true });
    dismissForBadgeReveal();
    return () => {
      observer.disconnect();
      dialog.close();
      document.documentElement.style.overflow = previousOverflow;
      const badgeReveal = getActiveBadgeReveal();
      if (badgeReveal) {
        // Native dialogs occupy the browser top layer, above the existing Badge
        // portal. Yield this viewer without changing the reveal or its queue.
        badgeReveal.focus({ preventScroll: true });
      } else if (opener?.isConnected) {
        opener.focus({ preventScroll: true });
      }
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-modal="true"
      aria-labelledby={`match-history-${match.id}`}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
      className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-2xl overflow-hidden border border-white/20 bg-zinc-950 p-0 text-white shadow-2xl backdrop:bg-black/80 open:flex open:flex-col"
    >
      <header className="flex shrink-0 items-start justify-between gap-4 border-b border-white/10 p-4 sm:p-5">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-wide text-orange-300">
            {t("dashboard.matchHistory.detailEyebrow")}
          </p>
          <h2 ref={titleRef} tabIndex={-1} id={`match-history-${match.id}`} className="mt-1 break-words text-xl font-bold text-white focus:outline-none">
            {match.tournamentName}
          </h2>
          <p className="mt-1 break-words text-sm text-zinc-400">
            {t("dashboard.matchHistory.bracketRound", { bracket: match.bracketName, round: localizedRoundName })}
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label={t("dashboard.matchHistory.close")} className="grid min-h-11 min-w-11 shrink-0 place-items-center border border-white/15 bg-white/5 text-zinc-300 transition hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-300">
          <X size={20} aria-hidden="true" />
        </button>
      </header>
      <div className="min-h-0 overflow-y-auto overscroll-contain" data-lenis-prevent>
        <dl className="grid gap-x-5 gap-y-4 p-4 sm:grid-cols-2 sm:p-5">
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
        </dl>
        {(match.replayAvailable || match.screenshotAvailable) && (
          <div className="mx-4 mb-4 flex items-center gap-3 border border-sky-400/20 bg-sky-500/5 p-4 text-sm text-sky-200 sm:mx-5 sm:mb-5">
            <FileCheck2 size={18} className="shrink-0" />
            {t("dashboard.matchHistory.proofRetained")}
          </div>
        )}

      </div>
    </dialog>
  );
}

function getActiveBadgeReveal() {
  return document.querySelector<HTMLElement>(
    '[data-reveal-phase]:not([data-reveal-phase="complete"]) [role="dialog"][aria-labelledby^="badge-reveal-"]'
  );
}

function Detail({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-zinc-400">{label}</dt>
      <dd className="mt-1 break-words text-sm font-semibold text-white">{value}</dd>
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
